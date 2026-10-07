-- Employees import and attendance capture.
-- Both functions are SECURITY INVOKER: they run as the caller, so every row they touch
-- still passes the same grants and row-level security as a direct request. They exist
-- only to make many-row work atomic (all or nothing) and fast (one round trip).

-- ---------------------------------------------------------------------------
-- import_employees: add or update employees of one warehouse from a parsed file.
-- rows: [{ "employee_code", "first_name", "last_name", "shift", "department",
--          "hire_date" (YYYY-MM-DD), "status" ("active"|"inactive") }]
-- Matching is by employee_code (badge) only, never by name.
-- Shift and department are matched by name inside the warehouse; unknown departments
-- are created, unknown shifts are reported as errors.
-- ---------------------------------------------------------------------------
create function public.import_employees(org uuid, wh uuid, file_name text, rows jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  r          jsonb;
  i          int := 0;
  code       text;
  fname      text;
  lname      text;
  shift_name text;
  dept_name  text;
  v_shift    uuid;
  v_dept     uuid;
  v_hire     date;
  v_status   public.employee_status;
  existing   public.employees;
  batch_id   uuid;
  n_new int := 0; n_upd int := 0; n_same int := 0;
  errors     jsonb := '[]'::jsonb;
  seen       text[] := '{}';
begin
  if not app.license_ok(org) or not app.has_role(org, '{owner,admin}') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.warehouses w where w.id = wh and w.organization_id = org) then
    raise exception 'warehouse_not_found' using errcode = '23503';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'import_empty' using errcode = '22023';
  end if;
  if jsonb_array_length(rows) > 5000 then
    raise exception 'import_too_large' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(rows) loop
    i := i + 1;
    code  := nullif(btrim(r->>'employee_code'), '');
    fname := nullif(btrim(r->>'first_name'), '');
    lname := nullif(btrim(r->>'last_name'), '');
    shift_name := nullif(btrim(r->>'shift'), '');
    dept_name  := nullif(btrim(r->>'department'), '');

    if code is null then
      errors := errors || jsonb_build_object('row', i, 'error', 'missing_badge'); continue;
    end if;
    if code = any (seen) then
      errors := errors || jsonb_build_object('row', i, 'badge', code, 'error', 'duplicate_in_file'); continue;
    end if;
    seen := seen || code;
    if fname is null or lname is null then
      errors := errors || jsonb_build_object('row', i, 'badge', code, 'error', 'missing_name'); continue;
    end if;
    if char_length(code) > 40 or char_length(fname) > 80 or char_length(lname) > 80 then
      errors := errors || jsonb_build_object('row', i, 'badge', code, 'error', 'too_long'); continue;
    end if;

    v_shift := null;
    if shift_name is not null then
      select s.id into v_shift from public.shifts s
       where s.warehouse_id = wh and lower(s.name) = lower(shift_name) limit 1;
      if v_shift is null then
        errors := errors || jsonb_build_object('row', i, 'badge', code, 'error', 'unknown_shift', 'value', shift_name); continue;
      end if;
    end if;

    v_dept := null;
    if dept_name is not null then
      if char_length(dept_name) > 80 then
        errors := errors || jsonb_build_object('row', i, 'badge', code, 'error', 'too_long'); continue;
      end if;
      select d.id into v_dept from public.departments d
       where d.warehouse_id = wh and lower(d.name) = lower(dept_name) limit 1;
      if v_dept is null then
        insert into public.departments (organization_id, warehouse_id, name)
        values (org, wh, dept_name) returning id into v_dept;
      end if;
    end if;

    begin
      v_hire := nullif(btrim(r->>'hire_date'), '')::date;
    exception when others then
      errors := errors || jsonb_build_object('row', i, 'badge', code, 'error', 'bad_date', 'value', r->>'hire_date'); continue;
    end;

    v_status := case lower(coalesce(nullif(btrim(r->>'status'), ''), 'active'))
                  when 'inactive' then 'inactive'::public.employee_status
                  else 'active'::public.employee_status end;

    select * into existing from public.employees e
     where e.organization_id = org and e.employee_code = code;

    if not found then
      insert into public.employees (organization_id, warehouse_id, employee_code, first_name, last_name,
                                    shift_id, department_id, hire_date, status)
      values (org, wh, code, fname, lname, v_shift, v_dept, v_hire, v_status);
      n_new := n_new + 1;
    elsif existing.warehouse_id <> wh then
      errors := errors || jsonb_build_object('row', i, 'badge', code, 'error', 'other_warehouse');
    elsif existing.first_name = fname and existing.last_name = lname
          and existing.shift_id is not distinct from coalesce(v_shift, existing.shift_id)
          and existing.department_id is not distinct from coalesce(v_dept, existing.department_id)
          and existing.hire_date is not distinct from coalesce(v_hire, existing.hire_date)
          and existing.status = v_status then
      n_same := n_same + 1;
    else
      -- Blank shift/department/hire date in the file keep what is already saved.
      update public.employees e
         set first_name = fname, last_name = lname,
             shift_id = coalesce(v_shift, e.shift_id),
             department_id = coalesce(v_dept, e.department_id),
             hire_date = coalesce(v_hire, e.hire_date),
             status = v_status
       where e.id = existing.id;
      n_upd := n_upd + 1;
    end if;
  end loop;

  -- One history row per import, written at the end when the counts are known.
  insert into public.import_batches (organization_id, warehouse_id, kind, file_name, rows_total,
                                     rows_new, rows_updated, rows_duplicate, rows_error, created_by)
  values (org, wh, 'employees', left(file_name, 255), i, n_new, n_upd, n_same,
          jsonb_array_length(errors), auth.uid())
  returning id into batch_id;

  return jsonb_build_object('batch_id', batch_id, 'total', i, 'new', n_new, 'updated', n_upd,
                            'unchanged', n_same, 'errors', errors);
end $$;

revoke execute on function public.import_employees(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.import_employees(uuid, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- record_attendance: set the status of one or more employees on one work date.
-- entries: [{ "employee_id", "status" (present|late|absent|excused),
--             "reason_code" (optional, absent/excused only), "note" (optional) }]
-- Re-sending an employee replaces their status for that date (no duplicates).
-- Clearing a status ("No Record") is a plain DELETE of the row.
-- ---------------------------------------------------------------------------
create function public.record_attendance(for_date date, entries jsonb)
returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n int;
begin
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) = 0 then
    raise exception 'nothing_to_save' using errcode = '22023';
  end if;
  if jsonb_array_length(entries) > 2000 then
    raise exception 'too_many_entries' using errcode = '22023';
  end if;
  -- No attendance for dates more than a day ahead (any time zone) or older than a year.
  if for_date > current_date + 1 or for_date < current_date - 366 then
    raise exception 'work_date_out_of_range' using errcode = '22023';
  end if;

  insert into public.attendance_records as a (employee_id, work_date, status, reason_code, note, source)
  select (e->>'employee_id')::uuid,
         for_date,
         (e->>'status')::public.attendance_status,
         case when e->>'status' in ('absent', 'excused') then nullif(e->>'reason_code', '') end,
         nullif(left(btrim(coalesce(e->>'note', '')), 200), ''),
         'manual'
    from jsonb_array_elements(entries) e
  on conflict (employee_id, work_date) do update
     set status = excluded.status,
         reason_code = excluded.reason_code,
         note = coalesce(excluded.note, a.note),
         source = 'manual';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.record_attendance(date, jsonb) from public, anon;
grant execute on function public.record_attendance(date, jsonb) to authenticated;
