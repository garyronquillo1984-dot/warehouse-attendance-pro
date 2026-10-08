// Server-side browser automation for Idukay (Playwright + Chromium).
//
// Strategy, from most to least robust:
//   1. Listen to the JSON the Idukay web app downloads for itself (its own API calls) and
//      pick out task-like objects. Independent of the page layout.
//   2. Read the rendered page: repeated items that contain dates, parsed by labels/text.
// Navigation uses visible texts, roles and attributes — never screen coordinates.
// CAPTCHA / MFA are detected and reported; they are never bypassed.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { config } from '../config.js';
import { redact } from '../log.js';
import { loadSession, saveSession, clearSession } from '../session-store.js';
import { tasksFromJson, tasksFromDomItems, mergeTasks, domItemToTask } from './extract.js';

export class IdukayError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const THIRD_PARTY = /(google|gstatic|googleapis|facebook|doubleclick|analytics|sentry|hotjar|intercom|clarity|cloudflareinsights|onesignal|firebase|newrelic|segment|mixpanel|zendesk|tawk|crisp)\./i;
const TASK_SECTION = /^\s*(tareas|deberes|mis tareas|tareas y deberes|tareas\s*\/\s*deberes|actividades|homework|tasks|assignments)\s*$/i;
const TAB_NAMES = ['Vigentes', 'Próximas', 'Pendientes', 'Anteriores', 'Entregadas', 'Vencidas'];
const AUTH_ERROR = /(incorrect|inv[aá]lid|no coincide|err[oó]ne|no existe|bloquead|no es v[aá]lid|fall[oó]|wrong|denegad|no autorizad|no encontrad|credenciales|not found|unauthori)/i;
const MFA_TEXT = /(c[oó]digo de verificaci[oó]n|c[oó]digo de seguridad|verification code|autenticaci[oó]n de dos|two[- ]factor|2fa|one[- ]time|c[oó]digo enviado|ingrese el c[oó]digo)/i;
const PWCHANGE_TEXT = /(cambiar (su |tu |la )?contrase[ñn]a|actualizar (su |tu |la )?contrase[ñn]a|nueva contrase[ñn]a|contrase[ñn]a (ha )?expirad|change (your )?password|password expired)/i;
const CAPTCHA_FRAMES = 'iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha/enterprise/anchor"], iframe[src*="hcaptcha.com"], iframe[src*="challenges.cloudflare.com"]';

const USER_SELECTORS = [
  'input[type=email]', 'input[autocomplete=username]', 'input[name*=user i]', 'input[name*=usuario i]',
  'input[id*=user i]', 'input[id*=usuario i]', 'input[placeholder*=usuario i]', 'input[placeholder*=correo i]',
  'input[placeholder*=email i]', 'input[placeholder*=user i]', 'input[ng-model*=user i]', 'input[ng-model*=usuario i]',
  'input[formcontrolname*=user i]', 'input[name*=login i]', 'input[type=text]',
];

export async function scrapeIdukay(opts = {}) {
  const r = await scrapeOnce(opts);
  // A stale saved session can look "logged in" on a public page. Retry once with a fresh login.
  if (r.usedSavedSession && !Object.values(r.students).some((x) => x.section)) {
    opts.log?.warn('La sesión guardada no permitió ver las tareas; se inicia sesión de nuevo');
    clearSession();
    return scrapeOnce(opts);
  }
  return r;
}

async function scrapeOnce({ log, discoveryDir = null } = {}) {
  const { username, password, students, selectors: sel } = config.idukay;
  if (!username || !password) throw new IdukayError('config_missing', 'Faltan las credenciales de Idukay (IDUKAY_USERNAME / IDUKAY_PASSWORD).');

  const timeout = config.idukay.navTimeoutMs;
  let browser;
  try {
    browser = await chromium.launch({
      headless: config.idukay.headless,
      executablePath: config.idukay.chromiumPath,
      args: ['--disable-dev-shm-usage'],
    });
  } catch (e) {
    throw new IdukayError('browser_error', 'No se pudo iniciar el navegador automatizado: ' + redact(e.message).slice(0, 200));
  }

  const saved = loadSession();
  const context = await browser.newContext({
    storageState: saved,
    locale: 'es-EC',
    timezoneId: config.timezone,
    viewport: { width: 1366, height: 900 },
  });
  context.setDefaultTimeout(timeout);
  const page = await context.newPage();

  // ---- capture the app's own JSON ----
  const ctx = { student: null, tab: null };
  const captured = [];
  page.on('response', async (resp) => {
    try {
      const url = resp.url();
      if (THIRD_PARTY.test(new URL(url).hostname)) return;
      const ct = resp.headers()['content-type'] || '';
      if (!/json/i.test(ct) || resp.status() >= 400) return;
      const len = Number(resp.headers()['content-length'] || 0);
      if (len > 5e6) return;
      const data = await resp.json();
      captured.push({ url: url.split('?')[0], data, student: ctx.student, tab: ctx.tab });
    } catch { /* bodies of redirects / aborted requests are not available */ }
  });

  let step = 0;
  const snap = async (name) => {
    if (!discoveryDir) return;
    step++;
    const base = path.join(discoveryDir, `${String(step).padStart(2, '0')}-${name}`);
    await page.screenshot({ path: base + '.png', fullPage: true }).catch(() => {});
    const outline = await page.evaluate(domOutline).catch(() => '');
    fs.writeFileSync(base + '.outline.txt', redact(`URL: ${page.url().split('?')[0]}\n\n${outline}`));
  };

  const settle = async (ms = 700) => {
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(ms);
  };

  const result = { students: {}, warnings: [], relogins: 0, usedSavedSession: false };
  try {
    log.info('Abriendo Idukay');
    // With a saved session, open the app itself first: a login route would show the form anyway.
    const startUrl = saved ? config.idukay.loginUrl.split('#')[0] + (config.idukay.tasksPath || '#/') : config.idukay.loginUrl;
    try {
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout });
    } catch (e) {
      throw new IdukayError('network_error', 'No se pudo conectar con Idukay (' + shortNetError(e) + ').');
    }
    await settle(1200);
    await snap('inicio');

    const login = async () => {
      let state = await detectState(page);
      for (let i = 0; state === 'loading' && i < 15; i++) { await page.waitForTimeout(700); state = await detectState(page); }
      if (state === 'app') { result.usedSavedSession = Boolean(saved); log.info(saved ? 'Sesión guardada todavía válida' : 'Ya había una sesión abierta'); return; }
      await throwIfBlocked(page, state);
      log.info(saved ? 'La sesión expiró; iniciando sesión de nuevo' : 'Iniciando sesión');
      if (state !== 'login') {
        await page.goto(config.idukay.loginUrl, { waitUntil: 'domcontentloaded', timeout });
        await settle(1000);
        await throwIfBlocked(page, await detectState(page));
      }
      await doLogin(page, { username, password, sel, timeout, settle });
      await snap('despues-login');
      log.info('Login exitoso');
      saveSession(await context.storageState());
    };
    await login();

    // ---- per student ----
    for (const student of students) {
      ctx.student = student; ctx.tab = null;
      const before = captured.length;
      let selected = await selectStudent(page, student, sel, settle);
      if (await detectState(page) === 'login') {
        // session dropped mid-run → log in once more
        if (result.relogins++ > 0) throw new IdukayError('session_expired', 'La sesión de Idukay se cerró repetidamente durante la sincronización.');
        await login();
        selected = await selectStudent(page, student, sel, settle);
      }
      const inTasks = await gotoTasks(page, sel, settle);
      if (!selected) selected = await selectStudent(page, student, sel, settle); // some layouts pick the child inside the section
      await snap(`tareas-${student}`);
      if (!inTasks) {
        result.students[student] = { found: selected, tasks: [], section: false };
        continue;
      }

      const pageItems = [];
      const tabs = await findTabs(page);
      const tabList = tabs.length ? tabs : [null];
      for (const tab of tabList) {
        ctx.tab = tab;
        if (tab) {
          await clickTab(page, tab);
          await settle();
          await snap(`tareas-${student}-${tab}`);
        }
        const items = await readItems(page, sel, settle, tab);
        pageItems.push(...tasksFromDomItems(items, { ctxStudent: student, students, tab }));
      }

      const apiItems = captured.slice(before)
        .flatMap((c) => tasksFromJson(c.data, { url: c.url, ctxStudent: c.student, students }).map((t) => ({ ...t, extra: { ...t.extra, ...(c.tab ? { pestana: c.tab } : {}) } })))
        .filter((t) => t.student === student);
      const tasks = mergeTasks(apiItems, pageItems.filter((t) => t.student === student));
      result.students[student] = { found: selected, tasks, section: true, fromApi: apiItems.length, fromPage: pageItems.length, tabs: tabs };
    }

    // Tasks of any student that arrived in a combined list (e.g. a family overview).
    if (discoveryDir) fs.writeFileSync(path.join(discoveryDir, 'api-endpoints.txt'), describeCaptured(captured));

    if (config.idukay.logoutAfter) {
      await logout(page, settle);
      clearSession();
    }
    return result;
  } catch (e) {
    await snap('error');
    if (e instanceof IdukayError) throw e;
    if (/net::|ERR_|ECONN|ENOTFOUND|ETIMEDOUT/i.test(e.message)) throw new IdukayError('network_error', 'Se perdió la conexión con Idukay (' + shortNetError(e) + ').');
    if (/Timeout/i.test(e.message)) throw new IdukayError('structure_changed', 'Idukay tardó demasiado o la página no tiene la estructura esperada.');
    throw new IdukayError('unexpected', 'Error inesperado: ' + redact(e.message).slice(0, 200));
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function shortNetError(e) {
  const m = String(e.message).match(/net::[A-Z_]+|E[A-Z]{4,}/);
  return m ? m[0] : 'error de red';
}

// ---------- state detection ----------

async function visibleText(page) {
  return page.evaluate(() => document.body ? document.body.innerText.slice(0, 20000) : '').catch(() => '');
}

export async function detectState(page) {
  if (await page.locator(CAPTCHA_FRAMES).filter({ visible: true }).count().catch(() => 0)) return 'captcha';
  const text = await visibleText(page);
  if (/no soy un robot|i'm not a robot|verifica que eres humano|verify you are human/i.test(text)) return 'captcha';
  const pw = await page.locator('input[type=password]').filter({ visible: true }).count().catch(() => 0);
  if (pw && PWCHANGE_TEXT.test(text) && pw >= 2) return 'password_change';
  if (pw) return 'login';
  if (MFA_TEXT.test(text) && await page.locator('input').filter({ visible: true }).count() <= 6) return 'mfa';
  if (PWCHANGE_TEXT.test(text)) return 'password_change';
  if (/#\/login|\/login\b/i.test(page.url())) return 'loading';
  return 'app';
}

async function throwIfBlocked(page, state) {
  if (state === 'captcha') throw new IdukayError('captcha_required', 'Idukay está pidiendo un CAPTCHA. Se requiere volver a autenticar Idukay manualmente.');
  if (state === 'mfa') throw new IdukayError('mfa_required', 'Idukay pide un código de verificación (MFA). Se requiere volver a autenticar Idukay.');
  if (state === 'password_change') throw new IdukayError('password_change_required', 'Idukay pide cambiar la contraseña. Cámbiala en Idukay y actualiza IDUKAY_PASSWORD.');
}

async function firstVisible(page, selectors) {
  for (const s of selectors.filter(Boolean)) {
    const loc = page.locator(s).filter({ visible: true }).first();
    if (await loc.count().catch(() => 0)) return loc;
  }
  return null;
}

async function doLogin(page, { username, password, sel, timeout, settle }) {
  const pass = await firstVisible(page, [sel.password, 'input[type=password]']);
  if (!pass) throw new IdukayError('structure_changed', 'No se encontró el formulario de inicio de sesión de Idukay.');
  // the username field is the closest text-like input before the password field
  let user = sel.username ? await firstVisible(page, [sel.username]) : null;
  if (!user) {
    const handle = await pass.evaluateHandle((pw, selectors) => {
      const all = Array.from(document.querySelectorAll('input')).filter((i) => i.offsetParent !== null && !['hidden', 'password', 'checkbox', 'radio', 'submit', 'button'].includes(i.type));
      const before = all.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
      for (const s of selectors) { const m = before.filter((i) => i.matches(s)); if (m.length) return m[m.length - 1]; }
      return before[before.length - 1] || all[0] || null;
    }, USER_SELECTORS);
    user = handle.asElement();
  }
  if (!user) throw new IdukayError('structure_changed', 'No se encontró el campo de usuario en el login de Idukay.');

  await user.fill('');
  await user.fill(username);
  await pass.fill(password);

  const submit = await firstVisible(page, [
    sel.submit,
    'button:text-matches("ingresar|iniciar sesi[oó]n|entrar|acceder|login|log in|sign in|continuar", "i")',
    'input[type=submit]', 'button[type=submit]',
  ]);
  if (submit) await submit.click();
  else await pass.press('Enter');

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await page.waitForTimeout(700);
    const state = await detectState(page);
    if (state === 'app') { await settle(); return; }
    await throwIfBlocked(page, state);
    const err = await loginErrorText(page);
    if (err) throw new IdukayError('auth_failed', 'Idukay rechazó el inicio de sesión' + (err ? `: "${redact(err).slice(0, 140)}"` : '') + '. Revisa usuario/contraseña (¿la cambiaste?).');
  }
  throw new IdukayError('structure_changed', 'No se pudo confirmar el inicio de sesión (la página de Idukay no respondió como se esperaba).');
}

async function loginErrorText(page) {
  return page.evaluate((reSrc) => {
    const re = new RegExp(reSrc, 'i');
    const nodes = document.querySelectorAll('[role=alert], .alert, .error, .errors, .toast, .toast-message, .text-danger, .help-block, .invalid-feedback, md-toast, .md-toast-content, .swal2-popup, .swal2-html-container, .noty_body, .notification, .snackbar, .mat-snack-bar-container, .ng-binding, small, p, span');
    for (const n of nodes) {
      if (!n.offsetParent && getComputedStyle(n).position !== 'fixed') continue;
      const t = (n.innerText || '').trim();
      if (t && t.length < 220 && re.test(t)) return t;
    }
    return null;
  }, AUTH_ERROR.source).catch(() => null);
}

// ---------- navigation ----------

async function clickByText(page, re, { scope = 'a, button, [role=menuitem], [role=tab], [role=button], [role=link], li, span, div, md-tab-item, mat-tab' } = {}) {
  const idx = await page.evaluate(({ src, flags, scope }) => {
    const re = new RegExp(src, flags);
    const els = Array.from(document.querySelectorAll(scope)).filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && re.test((e.innerText || e.textContent || '').trim());
    });
    if (!els.length) return -1;
    // innermost match is the real control
    const inner = els.filter((e) => !els.some((o) => o !== e && e.contains(o)));
    const target = inner[0];
    target.setAttribute('data-ida-click', '1');
    return 1;
  }, { src: re.source, flags: re.flags, scope }).catch(() => -1);
  if (idx < 0) return false;
  const loc = page.locator('[data-ida-click="1"]').first();
  try {
    await loc.click({ timeout: 5000 });
  } catch {
    await loc.evaluate((e) => e.click()).catch(() => {});
  }
  await page.evaluate(() => document.querySelectorAll('[data-ida-click]').forEach((e) => e.removeAttribute('data-ida-click'))).catch(() => {});
  return true;
}

async function gotoTasks(page, sel, settle) {
  if (config.idukay.tasksPath) {
    const base = config.idukay.loginUrl.split('#')[0];
    await page.goto(base + config.idukay.tasksPath, { waitUntil: 'domcontentloaded' });
    await settle();
    return true;
  }
  if (sel.tasksLink && await firstVisible(page, [sel.tasksLink])) {
    await (await firstVisible(page, [sel.tasksLink])).click();
    await settle();
    return true;
  }
  if (await looksLikeTasksView(page)) return true;
  if (await clickByText(page, TASK_SECTION)) { await settle(); return true; }
  // the menu may be collapsed
  const toggle = await firstVisible(page, ['.navbar-toggle', '.navbar-toggler', '.menu-toggle', '[aria-label*=men i]', '.hamburger', '.sidenav-toggle', 'button:has(md-icon:text("menu"))', 'button:has(i:text("menu"))', 'button:has(mat-icon:text("menu"))']);
  if (toggle) {
    await toggle.click().catch(() => {});
    await page.waitForTimeout(600);
    if (await clickByText(page, TASK_SECTION)) { await settle(); return true; }
  }
  return looksLikeTasksView(page);
}

async function looksLikeTasksView(page) {
  const tabs = await findTabs(page);
  if (tabs.length) return true;
  const url = page.url();
  return /#\/.*(tarea|homework|deber|task|activit)/i.test(url);
}

async function selectStudent(page, student, sel, settle) {
  const nameRe = new RegExp(`(^|\\s)${escapeRe(student)}(\\s|$|,)`, 'i');
  // 1) native <select>
  const selects = page.locator('select').filter({ visible: true });
  const n = await selects.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const s = selects.nth(i);
    const label = await s.evaluate((el, src) => {
      const re = new RegExp(src, 'i');
      const o = Array.from(el.options).find((x) => re.test(x.textContent));
      return o ? o.textContent : null;
    }, nameRe.source).catch(() => null);
    if (label) { await s.selectOption({ label }); await settle(); return true; }
  }
  // 2) open a student switcher if configured / present, then click the name
  if (sel.studentSwitch) {
    const sw = await firstVisible(page, [sel.studentSwitch]);
    if (sw) { await sw.click().catch(() => {}); await page.waitForTimeout(500); }
  }
  const shortName = new RegExp(`^\\s*${escapeRe(student)}\\b[^\\n]{0,60}$`, 'i');
  if (await clickByText(page, shortName, { scope: 'a, button, [role=option], [role=menuitem], [role=tab], [role=button], li, md-option, mat-option, .dropdown-item, [class*=student] , [class*=alumno], [class*=hijo], [class*=child], [class*=estudiante], span, div, h1, h2, h3, h4, p' })) {
    await settle();
    return true;
  }
  const toggles = ['[class*=student] [class*=dropdown]', '[class*=alumno] [class*=dropdown]', '[class*=hijo]', '[class*=child-select]', '[class*=estudiante]', '.dropdown-toggle', '[aria-haspopup=listbox]', '[aria-haspopup=menu]', 'md-select', 'mat-select'];
  const t = await firstVisible(page, toggles);
  if (t) {
    await t.click().catch(() => {});
    await page.waitForTimeout(600);
    if (await clickByText(page, shortName, { scope: 'a, button, [role=option], [role=menuitem], li, md-option, mat-option, .dropdown-item, span, div' })) { await settle(); return true; }
    await page.keyboard.press('Escape').catch(() => {});
  }
  return false;
}

async function findTabs(page) {
  return page.evaluate((names) => {
    const found = [];
    const els = Array.from(document.querySelectorAll('[role=tab], .nav-tabs a, .nav-tabs li, .tabs a, .tab, md-tab-item, mat-tab, .mat-tab-label, button, a, li'));
    for (const name of names) {
      const re = new RegExp('^\\s*' + name + '\\s*(\\(\\d+\\))?\\s*$', 'i');
      if (els.some((e) => e.getBoundingClientRect().width > 0 && re.test((e.innerText || '').trim()))) found.push(name);
    }
    return found;
  }, TAB_NAMES).catch(() => []);
}

async function clickTab(page, name) {
  return clickByText(page, new RegExp(`^\\s*${escapeRe(name)}\\s*(\\(\\d+\\))?\\s*$`, 'i'), { scope: '[role=tab], .nav-tabs a, .nav-tabs li, .tabs a, .tab, md-tab-item, mat-tab, .mat-tab-label, button, a, li' });
}

async function logout(page, settle) {
  if (await clickByText(page, /^\s*(cerrar sesi[oó]n|salir|logout|log out)\s*$/i)) await settle();
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---------- reading the rendered list ----------

async function readItems(page, sel, settle, tab) {
  // Load lazily rendered lists.
  for (let i = 0; i < 6; i++) {
    const grown = await page.evaluate(() => { const h = document.body.scrollHeight; window.scrollTo(0, h); return h; }).catch(() => 0);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => document.body.scrollHeight).catch(() => 0);
    if (after <= grown) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  let items = await page.evaluate(collectItems, { itemSelector: sel.taskItem || null }).catch(() => []);

  if (config.idukay.openDetails && items.length) {
    let opened = 0;
    for (const it of items) {
      if (opened >= config.idukay.maxDetails) break;
      const parsed = domItemToTask(it, { ctxStudent: null, students: config.idukay.students, tab });
      if (parsed && parsed.description && parsed.description.length > 60) continue; // the card already shows the details
      opened++;
      const detail = await openDetail(page, it.index, settle, tab);
      if (detail) {
        it.lines = Array.from(new Set([...it.lines, ...detail.lines]));
        it.links = [...it.links, ...detail.links];
      }
    }
  }
  return items;
}

async function openDetail(page, index, settle, tab) {
  const el = page.locator(`[data-ida-item="${index}"]`).first();
  if (!await el.count().catch(() => 0)) return null;
  const urlBefore = page.url();
  try {
    await el.click({ timeout: 4000 });
  } catch { return null; }
  await settle(500);
  const dialogSel = '[role=dialog], .modal.in, .modal.show, md-dialog, .mat-dialog-container, .swal2-popup, .drawer.open, [class*=detail]:not([data-ida-item])';
  let detail = await page.evaluate((s) => {
    const d = Array.from(document.querySelectorAll(s)).filter((e) => e.getBoundingClientRect().height > 40).pop();
    if (!d) return null;
    return {
      lines: d.innerText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 80),
      links: Array.from(d.querySelectorAll('a[href]')).map((a) => ({ text: a.innerText.trim(), href: a.href })),
    };
  }, dialogSel).catch(() => null);
  if (detail) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    const close = await firstVisible(page, ['[role=dialog] button:text-matches("cerrar|close|aceptar|volver|×|x", "i")', '.modal .close', 'md-dialog button:text-matches("cerrar|close", "i")']);
    if (close) await close.click().catch(() => {});
  } else if (page.url() !== urlBefore) {
    detail = await page.evaluate(() => {
      const m = document.querySelector('main, [role=main], .content, #content, .container') || document.body;
      return { lines: m.innerText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 80), links: Array.from(m.querySelectorAll('a[href]')).map((a) => ({ text: a.innerText.trim(), href: a.href })) };
    }).catch(() => null);
    await page.goBack().catch(() => {});
    await settle();
    if (tab) { await clickTab(page, tab); await settle(); }
    await page.evaluate(collectItems, { itemSelector: null }).catch(() => {}); // re-tag items
  }
  return detail;
}

/* Runs inside the page. Finds repeated elements that contain a date and returns their text. */
function collectItems({ itemSelector }) {
  const DATE = /(\b\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\b)|(\b\d{4}-\d{2}-\d{2}\b)|(\b(ene|feb|mar|abr|may|jun|jul|ago|sep|sept|set|oct|nov|dic|jan|apr|aug|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})|(\b\d{1,2}\s+(de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|sept|set|oct|nov|dic)[a-z]*\.?)|(\b(hoy|mañana|ayer)\b)/i;
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const root = document.querySelector('main, [role=main], [ui-view], [ng-view], .content-wrapper, #content, .main-content') || document.body;
  const sig = (e) => e.tagName + '.' + Array.from(e.classList).filter((c) => !/active|selected|ng-|hover|odd|even|first|last/.test(c)).sort().join('.');
  const lineCount = (e) => (e.innerText || '').split('\n').filter((l) => l.trim()).length;

  let items = [];
  if (itemSelector) items = Array.from(root.querySelectorAll(itemSelector)).filter(visible);

  if (!items.length) {
    const PAT = '[class*=homework], [class*=tarea], [class*=task], [class*=activit], [class*=deber], [class*=assignment], md-card, mat-card, .card, md-list-item, mat-list-item, .list-group-item, tr, li, article';
    let c = Array.from(root.querySelectorAll(PAT)).filter((e) => visible(e) && DATE.test(e.innerText || '') && lineCount(e) >= 2 && (e.innerText || '').length < 4000);
    // prefer elements that repeat among their siblings (a list of cards), innermost of each chain
    const repeated = (e) => e.parentElement && Array.from(e.parentElement.children).filter((x) => sig(x) === sig(e)).length >= 2;
    const rep = c.filter(repeated);
    let pool = rep.length ? rep : c;
    pool = pool.filter((e) => !pool.some((o) => o !== e && e.contains(o)));
    items = pool;
  }

  if (!items.length) {
    // generic: lowest repeated ancestor of a date-bearing text node
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const set = new Set();
    let n;
    while ((n = walker.nextNode())) {
      if (!DATE.test(n.textContent)) continue;
      let e = n.parentElement;
      while (e && e !== root) {
        const p = e.parentElement;
        const reps = p ? Array.from(p.children).filter((s) => sig(s) === sig(e)).length : 0;
        if (reps >= 2 && lineCount(e) >= 2) { set.add(e); break; }
        e = p;
      }
    }
    items = Array.from(set).filter(visible);
    items = items.filter((e) => !items.some((o) => o !== e && o.contains(e)));
  }

  return items.slice(0, 300).map((e, index) => {
    e.setAttribute('data-ida-item', String(index));
    const q = (s) => Array.from(e.querySelectorAll(s)).map((x) => (x.innerText || '').trim()).filter(Boolean);
    return {
      index,
      id: e.getAttribute('data-id') || e.getAttribute('data-homework-id') || e.getAttribute('id') || null,
      lines: (e.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 60),
      headings: q('h1, h2, h3, h4, h5, h6, strong, b, [class*=title], [class*=titulo], [class*=name], [class*=nombre], .md-title, mat-card-title'),
      subjectHints: q('[class*=subject], [class*=materia], [class*=asignatura], [class*=course]'),
      statusHints: q('[class*=status], [class*=estado], [class*=badge], [class*=label], [class*=chip], [class*=tag]'),
      links: Array.from(e.querySelectorAll('a[href]')).map((a) => ({ text: (a.innerText || '').trim(), href: a.href })),
    };
  });
}

/* Runs inside the page (discovery only): a compact outline of the DOM, with text truncated. */
function domOutline() {
  const out = [];
  const walk = (e, depth) => {
    if (depth > 14 || out.length > 1500) return;
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0 && e !== document.body) return;
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'NOSCRIPT'].includes(e.tagName)) return;
    const own = Array.from(e.childNodes).filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join(' ').trim();
    const attrs = ['id', 'role', 'type', 'name', 'placeholder', 'ng-click', 'ng-repeat', 'ui-sref', 'href', 'aria-label']
      .map((a) => (e.getAttribute(a) ? `${a}="${String(e.getAttribute(a)).slice(0, 60)}"` : '')).filter(Boolean).join(' ');
    const cls = e.classList.length ? '.' + Array.from(e.classList).slice(0, 5).join('.') : '';
    out.push(`${'  '.repeat(depth)}<${e.tagName.toLowerCase()}${cls}${attrs ? ' ' + attrs : ''}>${own ? ' "' + own.slice(0, 50) + '"' : ''}`);
    for (const c of e.children) walk(c, depth + 1);
  };
  walk(document.body, 0);
  return out.join('\n');
}

function describeCaptured(captured) {
  const shape = (v, d = 0) => {
    if (d > 4) return '…';
    if (Array.isArray(v)) return v.length ? `[${shape(v[0], d + 1)}] x${v.length}` : '[]';
    if (v && typeof v === 'object') return '{' + Object.keys(v).slice(0, 30).map((k) => `${k}: ${shape(v[k], d + 1)}`).join(', ') + '}';
    return typeof v;
  };
  return captured.map((c) => `${c.url}  (estudiante: ${c.student || '-'}, pestaña: ${c.tab || '-'})\n  ${shape(c.data)}`).join('\n\n');
}
