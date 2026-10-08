// Small inline icon set (stroke icons, currentColor). Decorative: aria-hidden.
const P = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
export const IconHome = () => <svg {...P}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>;
export const IconToday = () => <svg {...P}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="m9 15 2 2 4-4" /></svg>;
export const IconWeek = () => <svg {...P}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M7.5 13v4M12 13v4M16.5 13v4" /></svg>;
export const IconCalendar = () => <svg {...P}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></svg>;
export const IconPlus = () => <svg {...P} strokeWidth={2.6}><path d="M12 5v14M5 12h14" /></svg>;
export const IconMore = () => <svg {...P}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>;
export const IconKids = () => <svg {...P}><circle cx="9" cy="8" r="3.2" /><circle cx="17" cy="9.5" r="2.4" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2.2.9-4 3-4.6 1.9.5 3 2.3 3 4.6" /></svg>;
export const IconCheck = () => <svg {...P} width={16} height={16} strokeWidth={3}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
export const IconDone = () => <svg {...P}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></svg>;
export const IconAlert = () => <svg {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>;
export const IconSettings = () => <svg {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
export const IconCard = () => <svg {...P}><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19M6.5 15h4" /></svg>;
export const IconBell = () => <svg {...P}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>;
export const IconChart = () => <svg {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
export const IconOut = () => <svg {...P}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>;
export const IconChevL = () => <svg {...P}><path d="m15 18-6-6 6-6" /></svg>;
export const IconChevR = () => <svg {...P}><path d="m9 18 6-6-6-6" /></svg>;

export const BrandMark = () => (
  <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="var(--accent)" /><rect x="8" y="8" width="16" height="17" rx="3" fill="var(--bg)" /><rect x="12" y="6" width="8" height="4" rx="1.5" fill="var(--accent-soft)" /><path d="M11.5 17l3 3 6-6.5" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
