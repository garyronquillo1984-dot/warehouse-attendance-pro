// Public settings (safe to ship to the browser). Secrets never live here.
const env = import.meta.env;

export const APP_NAME = (env.VITE_APP_NAME as string | undefined) || 'Tareas en Casa';
export const SUPPORT_EMAIL = (env.VITE_SUPPORT_EMAIL as string | undefined) || 'support@example.com';
// Days of recent homework a parent can browse; older homework lives in the archive.
export const HISTORY_DAYS = 14;
// "Last updated" turns into a warning when the data is older than this.
export const STALE_AFTER_HOURS = 2;
