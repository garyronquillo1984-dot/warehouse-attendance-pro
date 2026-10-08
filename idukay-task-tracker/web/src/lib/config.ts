// Public settings (safe to ship to the browser). Secrets never live here.
const env = import.meta.env;

export const APP_NAME = (env.VITE_APP_NAME as string | undefined) || 'Idukay Task Tracker';
export const SUPPORT_EMAIL = (env.VITE_SUPPORT_EMAIL as string | undefined) || 'support@example.com';
export const PRICE_LABEL = (env.VITE_PRICE_LABEL as string | undefined) || '$2.99';
export const TRIAL_DAYS = 7;
