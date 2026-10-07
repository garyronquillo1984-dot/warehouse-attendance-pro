// Turns server and auth errors into plain sentences that say what to do next.
const MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, 'That email and password don’t match. Check both, or reset your password.'],
  [/email not confirmed/i, 'Confirm your email first. Open the link we sent you, then sign in.'],
  [/user already registered|already been registered/i, 'An account with this email already exists. Sign in instead.'],
  [/password should be at least|weak password/i, 'Use a longer password: at least 10 characters.'],
  [/rate limit|too many requests|security purposes/i, 'Too many attempts. Wait a minute and try again.'],
  [/no_license_for_this_email/, 'NO_LICENSE'],
  [/email_not_confirmed/, 'Confirm your email first. Open the link we sent you, then come back.'],
  [/license_already_claimed/, 'This purchase was just activated by another session. Refresh the page.'],
  [/plan_limit_warehouses/, 'Your plan doesn’t include another warehouse. Upgrade your plan to add one.'],
  [/plan_limit_employees/, 'You’ve reached your plan’s limit of active employees.'],
  [/plan_limit_users/, 'You’ve reached your plan’s limit of users.'],
  [/invitation_invalid_or_expired/, 'This invitation has expired or was already used. Ask your admin for a new one.'],
  [/invitation_for_another_email/, 'This invitation was sent to a different email. Sign in with that email to accept it.'],
  [/license_inactive/, 'This company’s subscription is inactive, so new members can’t join right now.'],
  [/import_too_large/, 'That file has more than 5,000 rows. Split it into smaller files.'],
  [/import_empty/, 'That file has no employee rows.'],
  [/warehouse_not_found/, 'That warehouse no longer exists. Refresh the page.'],
  [/work_date_out_of_range/, 'Attendance can only be taken for today or past dates within the last year.'],
  [/employees_organization_id_employee_code_key|duplicate key.*employee_code/, 'Another employee already has this badge ID.'],
  [/only_owner_can_manage_admins|only_owner_can_invite_admins/, 'Only the owner can add, change or remove admins.'],
  [/owner_cannot_be_removed|use_transfer_ownership/, 'The owner can’t be changed here. Use “Make owner” on an admin to transfer the company.'],
  [/only_owner/, 'Only the owner can do that.'],
  [/warehouse_not_in_organization/, 'One of the chosen warehouses doesn’t belong to this company. Refresh the page.'],
  [/cannot_invite_owner/, 'Invite people as admin or supervisor. Ownership is transferred from the Team list.'],
  [/invalid totp code|invalid code|mfa_verification_failed|code is invalid/i, 'That code didn’t work. Use the newest 6-digit code from your authenticator app.'],
  [/row-level security|permission denied|not_allowed|42501/i, 'You don’t have permission to do that.'],
  [/failed to fetch|network/i, 'Can’t reach the server. Check your connection and try again.'],
];

export function friendlyError(err: unknown): string {
  const raw = typeof err === 'string' ? err
    : err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message)
    : 'Something went wrong.';
  for (const [re, msg] of MESSAGES) if (re.test(raw)) return msg;
  return raw || 'Something went wrong. Try again.';
}
