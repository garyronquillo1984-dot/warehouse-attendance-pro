// TEST FIXTURE ONLY — a tiny imitation of an Idukay-like school portal used to exercise
// the browser automation end to end (login, student switch, tabs, details, errors).
// It is not used by the real app.
import express from 'express';

function iso(offset) {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
}
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function human(isoDate, time) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${MON[m - 1]}. ${String(d).padStart(2, '0')}, ${y}${time ? ' · ' + time : ''}`;
}

export function buildData() {
  return {
    s1: { name: 'Gael', homeworks: [
      { _id: 'hw-g1', titulo: 'Mapa conceptual de las provincias', materia: { nombre: 'Estudios Sociales' }, docente: { nombres: 'Ana', apellidos: 'Pérez' }, descripcion: '<p>Realizar un mapa conceptual.</p><p>Ver <a href="https://example.org/guia.pdf">guía</a></p>', fecha_creacion: iso(-1), fecha_entrega: iso(0) + 'T23:59:00', estado: 'Vigente', tab: 'vigentes' },
      { _id: 'hw-g2', titulo: 'Spelling Quiz', materia: { nombre: 'Language Arts' }, descripcion: 'Words 275–285', fecha_creacion: iso(-2), fecha_entrega: iso(5) + 'T23:59:00', estado: 'Vigente', tab: 'vigentes' },
      { _id: 'hw-g3', titulo: 'Taller de divisiones', materia: { nombre: 'Matemática' }, descripcion: 'Resolver 10 divisiones', fecha_creacion: iso(-9), fecha_entrega: iso(-3) + 'T23:59:00', estado: 'Entregada', tab: 'anteriores' },
    ] },
    s2: { name: 'Edric', homeworks: [
      { _id: 'hw-e1', titulo: 'Amphibians', materia: { nombre: 'Science' }, descripcion: 'Copy the 3 characteristics', fecha_creacion: iso(-3), fecha_entrega: iso(1) + 'T23:59:00', estado: 'Vigente', tab: 'vigentes', adjuntos: [{ nombre: 'amphibians.pdf', url: 'https://example.org/amphibians.pdf' }] },
      { _id: 'hw-e2', titulo: 'Propiedades de la adición', materia: { nombre: 'Matemática / Ed. Financiera' }, descripcion: 'Página 67 del libro', fecha_creacion: iso(-12), fecha_entrega: iso(-5) + 'T23:59:00', estado: 'No entregada', tab: 'anteriores' },
    ] },
  };
}

export function startMockIdukay({ port = 0, mode = 'json', captcha = false, mfa = false, password = 'clave-correcta', data = buildData() } = {}) {
  const app = express();
  app.use(express.json());
  const sessions = new Set();
  const sid = (req) => (req.headers.cookie || '').match(/sid=([a-z0-9]+)/)?.[1];
  const authed = (req) => sessions.has(sid(req));

  app.post('/colegios/api/login', (req, res) => {
    if (req.body.usuario === 'padre@example.com' && req.body.clave === password) {
      const id = Math.random().toString(36).slice(2);
      sessions.add(id);
      res.setHeader('Set-Cookie', `sid=${id}; Path=/; HttpOnly`);
      return res.json({ ok: true, mfa });
    }
    res.status(401).json({ ok: false, mensaje: 'Usuario o contraseña incorrectos' });
  });
  app.get('/colegios/api/estudiantes', (req, res) => {
    if (!authed(req)) return res.status(401).json({});
    res.json(Object.entries(data).map(([id, s]) => ({ _id: id, nombres: s.name, apellidos: 'Ronquillo' })));
  });
  app.get('/colegios/api/tareas', (req, res) => {
    if (!authed(req)) return res.status(401).json({});
    const s = data[req.query.estudiante];
    const list = (s?.homeworks || []).filter((h) => h.tab === req.query.tab);
    if (mode === 'html') {
      // no JSON: the page receives pre-rendered HTML
      res.type('text/html').send(list.map((h) => `
        <div class="homework-card">
          <div class="subject">${h.materia.nombre}</div>
          <h4 class="title">${h.titulo}</h4>
          ${h.docente ? `<div>${h.docente.apellidos}, ${h.docente.nombres}</div>` : ''}
          <div>Asignada: ${human(h.fecha_creacion)}</div>
          <div>Entrega: ${human(h.fecha_entrega.slice(0, 10), '23:59')}</div>
          <span class="badge">${h.estado}</span>
          <div class="hidden-desc" style="display:none">${h.descripcion.replace(/<[^>]+>/g, ' ')}</div>
        </div>`).join(''));
      return;
    }
    res.json({ data: list.map(({ tab, ...h }) => h) });
  });

  app.get('/colegios/', (req, res) => res.type('html').send(PAGE(captcha)));
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/colegios/#/login` }));
  });
}

const PAGE = (captcha) => `<!doctype html><html><head><meta charset="utf-8"><title>Idukay (simulado)</title>
<style>.homework-card{border:1px solid #ccc;margin:8px;padding:8px;cursor:pointer}.modal{position:fixed;top:20px;left:20px;right:20px;background:#fff;border:2px solid #000;padding:20px}</style></head>
<body><div id="app"></div>
<script>
const app = document.getElementById('app');
let current = null, tab = 'vigentes';
async function route() {
  const h = location.hash || '#/login';
  if (h.startsWith('#/login')) return login();
  const r = await fetch('api/estudiantes');
  if (r.status === 401) { location.hash = '#/login'; return; }
  const students = await r.json();
  if (!current) current = students[0]._id;
  const nav = '<nav><a href="#/inicio">Inicio</a> <a href="#/tareas">Tareas</a> <a href="#/login" id="out">Cerrar sesión</a></nav>' +
    '<div class="student-switch">' + students.map(s => '<div class="student-option" data-id="' + s._id + '">' + s.nombres + ' ' + s.apellidos + '</div>').join('') + '</div>';
  if (h.startsWith('#/tareas')) {
    app.innerHTML = nav + '<ul class="nav-tabs"><li><a href="javascript:void 0" data-tab="vigentes">Vigentes</a></li><li><a href="javascript:void 0" data-tab="anteriores">Anteriores</a></li></ul><main id="list">Cargando…</main>';
    const resp = await fetch('api/tareas?estudiante=' + current + '&tab=' + tab);
    const ct = resp.headers.get('content-type') || '';
    const list = document.getElementById('list');
    if (ct.includes('json')) {
      const j = await resp.json();
      list.innerHTML = j.data.map(t => '<div class="homework-card"><h4>' + t.titulo + '</h4><div>' + t.materia.nombre + '</div><div>Entrega: ' + t.fecha_entrega.slice(0,10) + '</div><div class="hidden-desc" style="display:none">' + t.descripcion + '</div></div>').join('') || '<p>No hay tareas</p>';
    } else {
      list.innerHTML = (await resp.text()) || '<p>No hay tareas</p>';
    }
  } else {
    app.innerHTML = nav + '<main><h2>Bienvenido</h2></main>';
  }
}
function login() {
  app.innerHTML = '<form id="f"><input placeholder="Usuario" name="u"><input type="password" name="p"><button type="submit">Ingresar</button><div id="err" class="alert"></div>' +
    ${captcha ? `'<iframe src="about:blank#recaptcha/api2/anchor" title="reCAPTCHA" style="width:300px;height:80px"></iframe><p>No soy un robot</p>'` : "''"} + '</form>';
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const r = await fetch('api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: e.target.u.value, clave: e.target.p.value }) });
    const j = await r.json();
    if (!j.ok) { document.getElementById('err').textContent = j.mensaje; return; }
    if (j.mfa) { app.innerHTML = '<p>Ingrese el código de verificación enviado a su correo</p><input name="code">'; return; }
    location.hash = '#/inicio';
  };
}
document.addEventListener('click', async (e) => {
  const s = e.target.closest('.student-option'); if (s) { current = s.dataset.id; route(); return; }
  const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; route(); return; }
  const c = e.target.closest('.homework-card');
  if (c) {
    const d = c.querySelector('.hidden-desc').innerHTML;
    const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog');
    m.innerHTML = '<h3>Detalle de la tarea</h3><div>' + d + '</div><button onclick="this.parentNode.remove()">Cerrar</button>';
    document.body.appendChild(m);
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal').forEach(m => m.remove()); });
window.addEventListener('hashchange', route);
route();
</script></body></html>`;
