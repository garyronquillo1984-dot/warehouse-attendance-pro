-- Subscription state machine driven by verified Hotmart events.
-- Only the service role (Edge Functions) can call these; the browser never can.

-- Applies one event to one user. Returns the outcome label stored on the event.
create function billing.apply_to_user(
  p_user uuid, p_event_type text, p_event_time timestamptz, p_subscriber_code text,
  p_transaction text, p_period_end timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s        public.subscriptions;
  outcome  text;
begin
  select * into s from public.subscriptions where user_id = p_user for update;
  if not found then
    insert into public.subscriptions (user_id, status) values (p_user, 'TRIAL') returning * into s;
  end if;

  -- Hotmart can deliver events out of order: never let an older event overwrite a newer one.
  if p_event_time is not null and s.last_event_at is not null and p_event_time < s.last_event_at then
    return 'stale';
  end if;

  case
    when p_event_type in ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE') then
      update public.subscriptions set
        status = 'ACTIVE',
        -- next charge date from Hotmart; if it is missing, one month from now
        current_period_end = coalesce(p_period_end, greatest(now(), coalesce(s.current_period_end, now())) + interval '1 month'),
        provider_subscriber_code = coalesce(p_subscriber_code, s.provider_subscriber_code),
        last_transaction = coalesce(p_transaction, s.last_transaction),
        cancelled_at = null
      where user_id = p_user;
      if s.status <> 'ACTIVE' then
        insert into public.analytics_events (user_id, event) values (p_user, 'subscription_activated');
      end if;
      outcome := 'activated';

    when p_event_type in ('PURCHASE_BILLET_PRINTED', 'WAITING_PAYMENT') then
      -- money not received yet: record it, keep whatever access the parent already has
      if s.status in ('TRIAL', 'EXPIRED', 'CANCELLED', 'PAYMENT_FAILED') then
        update public.subscriptions set status = 'PAYMENT_PENDING',
          provider_subscriber_code = coalesce(p_subscriber_code, s.provider_subscriber_code)
        where user_id = p_user;
      end if;
      outcome := 'pending';

    when p_event_type = 'PURCHASE_DELAYED' then
      update public.subscriptions set status = 'PAYMENT_FAILED' where user_id = p_user;
      insert into public.analytics_events (user_id, event) values (p_user, 'payment_failed');
      outcome := 'payment_failed';

    when p_event_type = 'SUBSCRIPTION_CANCELLATION' then
      -- access continues until the end of the period already paid
      update public.subscriptions set status = 'CANCELLED', cancelled_at = now(),
        current_period_end = coalesce(s.current_period_end, p_period_end)
      where user_id = p_user;
      insert into public.analytics_events (user_id, event) values (p_user, 'subscription_cancelled');
      outcome := 'cancelled';

    when p_event_type in ('PURCHASE_CANCELED', 'PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'PURCHASE_PROTEST') then
      -- money returned: paid access ends now (a running free trial is unaffected)
      update public.subscriptions set status = 'CANCELLED', cancelled_at = now(),
        current_period_end = least(coalesce(s.current_period_end, now()), now())
      where user_id = p_user;
      insert into public.analytics_events (user_id, event) values (p_user, 'subscription_cancelled');
      outcome := 'revoked';

    when p_event_type = 'PURCHASE_EXPIRED' then
      update public.subscriptions set status = 'EXPIRED',
        current_period_end = least(coalesce(s.current_period_end, now()), now())
      where user_id = p_user;
      insert into public.analytics_events (user_id, event) values (p_user, 'subscription_expired');
      outcome := 'expired';

    when p_event_type = 'UPDATE_SUBSCRIPTION_CHARGE_DATE' then
      if p_period_end is not null and s.status in ('ACTIVE', 'PAYMENT_FAILED', 'PAYMENT_PENDING') then
        update public.subscriptions set current_period_end = p_period_end where user_id = p_user;
      end if;
      outcome := 'charge_date_updated';

    else
      return 'ignored';
  end case;

  update public.subscriptions set last_event_at = coalesce(p_event_time, now()), updated_at = now()
  where user_id = p_user;
  insert into public.audit_logs (user_id, action, detail)
  values (p_user, 'billing_' || outcome, jsonb_build_object('event', p_event_type, 'from', s.status));
  return outcome;
end $$;

-- Entry point for the webhook. Idempotent by (provider, event_id).
create function billing.apply_hotmart_event(
  p_event_id text, p_event_type text, p_event_time timestamptz, p_checkout_token text,
  p_subscriber_code text, p_transaction text, p_buyer_email text, p_period_end timestamptz,
  p_amount numeric, p_currency text, p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  ev_id    bigint;
  uid      uuid;
  res      text;
  hash     text := case when p_buyer_email is not null then app.email_hash(p_buyer_email) end;
begin
  insert into public.billing_events (provider, event_id, event_type, event_time, buyer_email_hash,
    subscriber_code, transaction, checkout_token, period_end, amount, currency, payload)
  values ('hotmart', p_event_id, p_event_type, p_event_time, hash, p_subscriber_code, p_transaction,
    p_checkout_token, p_period_end, p_amount, p_currency, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_id) do nothing
  returning id into ev_id;
  if ev_id is null then
    return 'duplicate';
  end if;

  -- Who paid? 1) our checkout token, 2) the Hotmart subscriber code, 3) the buyer e-mail.
  if p_checkout_token is not null then
    select user_id into uid from public.checkout_sessions where token = p_checkout_token;
    if uid is not null then
      update public.checkout_sessions set used_at = coalesce(used_at, now()) where token = p_checkout_token;
    end if;
  end if;
  if uid is null and p_subscriber_code is not null then
    select user_id into uid from public.subscriptions where provider_subscriber_code = p_subscriber_code;
  end if;
  if uid is null and hash is not null then
    select id into uid from auth.users where lower(email) = lower(btrim(p_buyer_email)) limit 1;
  end if;

  if uid is null then
    update public.billing_events set outcome = 'unmatched' where id = ev_id;
    return 'unmatched';
  end if;

  res := billing.apply_to_user(uid, p_event_type, p_event_time, p_subscriber_code, p_transaction, p_period_end);
  update public.billing_events set user_id = uid, outcome = res where id = ev_id;
  return res;
end $$;

-- Events that arrived before the parent had an account (matched later by e-mail hash).
create function billing.claim_unmatched(p_user uuid, p_hash text) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.billing_events; n integer := 0; res text;
begin
  for e in select * from public.billing_events
           where user_id is null and buyer_email_hash = p_hash and outcome = 'unmatched'
           order by coalesce(event_time, received_at), id loop
    res := billing.apply_to_user(p_user, e.event_type, e.event_time, e.subscriber_code, e.transaction, e.period_end);
    update public.billing_events set user_id = p_user, outcome = res || ' (claimed)' where id = e.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Daily: paid periods that are over become EXPIRED; trials that ended are counted.
create function billing.expire_subscriptions() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with ended as (
    update public.subscriptions s set status = 'EXPIRED', updated_at = now()
    where (s.status in ('CANCELLED', 'PAYMENT_PENDING') and s.current_period_end <= now())
       or (s.status in ('ACTIVE', 'PAYMENT_FAILED')
           and s.current_period_end + make_interval(days => app.grace_days()) <= now())
    returning s.user_id
  )
  insert into public.analytics_events (user_id, event) select user_id, 'subscription_expired' from ended;
  get diagnostics n = row_count;

  insert into public.analytics_events (user_id, event)
  select t.user_id, 'trial_expired'
  from public.trial_periods t join public.subscriptions s using (user_id)
  where t.ends_at <= now() and s.status in ('TRIAL', 'PAYMENT_PENDING', 'EXPIRED')
  on conflict do nothing;
  return n;
end $$;

-- Called by the billing Edge Function after it has verified the user's session.
create function billing.create_checkout_session(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  insert into public.checkout_sessions (token, user_id) values (tok, p_user);
  insert into public.analytics_events (user_id, event) values (p_user, 'checkout_clicked');
  return tok;
end $$;

-- ---------------------------------------------------------------------------
-- Service-role entry points (the API only exposes "public")
-- ---------------------------------------------------------------------------
create function public.svc_apply_hotmart_event(
  p_event_id text, p_event_type text, p_event_time timestamptz, p_checkout_token text,
  p_subscriber_code text, p_transaction text, p_buyer_email text, p_period_end timestamptz,
  p_amount numeric, p_currency text, p_payload jsonb
) returns text
language sql security definer set search_path = '' as $$
  select billing.apply_hotmart_event(p_event_id, p_event_type, p_event_time, p_checkout_token,
    p_subscriber_code, p_transaction, p_buyer_email, p_period_end, p_amount, p_currency, p_payload);
$$;

create function public.svc_create_checkout_session(p_user uuid) returns text
language sql security definer set search_path = '' as $$
  select billing.create_checkout_session(p_user);
$$;

-- What the billing function needs to talk to Hotmart about this user.
create function public.svc_billing_profile(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', u.email, 'full_name', p.full_name,
    'status', s.status, 'subscriber_code', s.provider_subscriber_code,
    'current_period_end', s.current_period_end, 'access', app.access_state(p_user))
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.subscriptions s on s.user_id = u.id
  where u.id = p_user;
$$;

revoke all on all functions in schema billing from public;
revoke all on function public.svc_apply_hotmart_event(text, text, timestamptz, text, text, text, text, timestamptz, numeric, text, jsonb),
                       public.svc_create_checkout_session(uuid), public.svc_billing_profile(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_apply_hotmart_event(text, text, timestamptz, text, text, text, text, timestamptz, numeric, text, jsonb),
                          public.svc_create_checkout_session(uuid), public.svc_billing_profile(uuid)
  to service_role;
grant usage on schema billing to service_role;
