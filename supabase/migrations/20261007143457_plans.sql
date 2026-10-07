-- Plan catalogue. Limits are enforced by triggers in the database.
-- Prices live in Hotmart; changing a limit here is a data change, not a code change.
insert into public.plans (code, name, max_warehouses, max_employees, max_users, features, sort_order) values
  ('starter',      'Starter',      1,  50,  2, '{"advanced_reports": false}', 1),
  ('professional', 'Professional', 1, 200,  5, '{"advanced_reports": true}',  2),
  ('business',     'Business',     3, 500, 15, '{"advanced_reports": true, "multi_admin": true}', 3)
on conflict (code) do update
  set name = excluded.name, max_warehouses = excluded.max_warehouses,
      max_employees = excluded.max_employees, max_users = excluded.max_users,
      features = excluded.features, sort_order = excluded.sort_order;
