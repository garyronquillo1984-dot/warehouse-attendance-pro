-- No Record starts on the later of the hire date and the day the employee was added to the
-- app (in the company's time zone). Before that the app couldn't have been used for them, so
-- counting those days as "No Record" would only add noise for companies joining mid-month.
create or replace function public.report_grid(org uuid, wh uuid, d_from date, d_to date)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  org_today date;
  org_tz text;
  result jsonb;
begin
  if d_from is null or d_to is null or d_to < d_from then
    raise exception 'bad_range' using errcode = '22023';
  end if;
  if d_to - d_from > 92 then
    raise exception 'range_too_long' using errcode = '22023';
  end if;

  select (now() at time zone o.timezone)::date, o.timezone into org_today, org_tz
    from public.organizations o where o.id = org;
  if org_today is null then
    return '[]'::jsonb;                        -- not a member (or no such company): nothing visible
  end if;

  with emp as (
    select e.id, e.shift_id, e.status, greatest(e.hire_date, (e.created_at at time zone org_tz)::date) as since
      from public.employees e
     where e.organization_id = org and (wh is null or e.warehouse_id = wh)
  ),
  rec as (
    select a.work_date, a.employee_id, a.shift_id, a.status::text as status, a.reason_code
      from public.attendance_records a
     where a.organization_id = org and (wh is null or a.warehouse_id = wh)
       and a.work_date between d_from and d_to
  ),
  expected as (
    select d::date as work_date, e.id as employee_id, e.shift_id
      from generate_series(d_from, least(d_to, org_today), interval '1 day') d
      join emp e on e.status = 'active' and e.shift_id is not null and d::date >= e.since
      join public.shifts s on s.id = e.shift_id and s.is_active
                          and extract(isodow from d)::smallint = any (s.days)
  ),
  grid as (
    select work_date, employee_id, shift_id, status, reason_code from rec
    union all
    select x.work_date, x.employee_id, x.shift_id, 'none', null
      from expected x
     where not exists (select 1 from rec r where r.employee_id = x.employee_id and r.work_date = x.work_date)
  )
  select coalesce(jsonb_agg(jsonb_build_array(work_date, employee_id, shift_id, status, reason_code)
                            order by work_date, employee_id), '[]'::jsonb)
    into result from grid;
  return result;
end $$;

