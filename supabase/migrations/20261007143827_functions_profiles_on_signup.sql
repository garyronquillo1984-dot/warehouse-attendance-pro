-- Warehouse Attendance Pro — server functions (RPC). See README for the security model.

-- Profiles: created automatically on sign up
create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''))
  on conflict (user_id) do nothing;
  return new;
end $$;

revoke execute on function app.handle_new_user() from public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();
