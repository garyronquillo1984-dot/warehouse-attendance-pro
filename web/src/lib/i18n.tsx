// English / Spanish for the recruiting screens and the public pre-registration form.
// Strings live next to each other where they are used: t('Candidates', 'Candidatos').
import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'es';
export interface Labelled { en: string; es: string }

const KEY = 'wap.lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* private mode */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

interface LangState { lang: Lang; setLang: (l: Lang) => void; t: (en: string, es: string) => string; l: (x: Labelled) => string }
const LangContext = createContext<LangState | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>(initial);
  const setLang = (l: Lang) => { set(l); try { localStorage.setItem(KEY, l); } catch { /* private mode */ } };
  const t = (en: string, es: string) => (lang === 'es' ? es : en);
  const l = (x: Labelled) => x[lang];
  return <LangContext.Provider value={{ lang, setLang, t, l }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-toggle" role="group" aria-label="Language / Idioma">
      <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
      <button type="button" aria-pressed={lang === 'es'} onClick={() => setLang('es')}>ES</button>
    </div>
  );
}
