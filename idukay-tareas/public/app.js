(function () {
  'use strict';

  var state = { tasks: [], students: [], today: null, historyDays: 14, status: null, tab: 'hoy', histStudent: 'all', archStudent: 'all', archQ: '' };
  var TZ = 'America/Guayaquil';
  var MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var STATUS = { pendiente: '🔴 Pendiente', proxima: '🟡 Próxima', completada: '🟢 Completada', vencida: 'Vencida', archivada: 'Archivada' };
  var EVENT = { created: 'Detectada por primera vez en Idukay', updated: 'Cambió en Idukay', missing: 'Ya no aparece en Idukay', reappeared: 'Volvió a aparecer en Idukay', parent_done: 'Marcada como hecha en casa', parent_undone: 'Desmarcada como hecha en casa' };
  var FIELD = { subject: 'Materia', title: 'Título', description: 'Descripción', instructions: 'Instrucciones', teacher: 'Profesor', assigned_date: 'Asignada', due_date: 'Entrega', due_time: 'Hora de entrega', idukay_status: 'Estado en Idukay', completed_by_idukay: 'Completada en Idukay', attachments: 'Archivos' };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kidClass(s) { return /edric/i.test(s) ? 'edric' : 'gael'; }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    opts.credentials = 'same-origin';
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { location.href = '/login'; throw new Error('auth'); }
      return r.json().then(function (j) { if (!r.ok && r.status !== 202) { var e = new Error(j.error || 'Error'); e.status = r.status; throw e; } return j; });
    });
  }

  // ---------- dates ----------
  function parseISO(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)); }
  function fmtDay(iso) { if (!iso) return '—'; var d = parseISO(iso); return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; }
  function fmtStamp(isoTs) {
    if (!isoTs) return '—';
    var d = new Date(isoTs);
    var date = new Intl.DateTimeFormat('es-EC', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    var time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
    return date + ' ' + time;
  }
  function dayDiff(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function addDays(iso, n) { var d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function relDay(iso) {
    var n = dayDiff(iso, state.today);
    if (n === 0) return 'Hoy';
    if (n === 1) return 'Ayer';
    if (n > 1) return 'Hace ' + n + ' días';
    if (n === -1) return 'Mañana';
    return 'En ' + (-n) + ' días';
  }
  function dueText(t) {
    if (!t.dueDate) return 'Sin fecha de entrega';
    var n = t.daysLeft;
    var rel = n === 0 ? 'hoy' : n === 1 ? 'mañana' : n < 0 ? 'hace ' + (-n) + ' d' : 'en ' + n + ' días';
    return rel;
  }

  // ---------- status bar ----------
  function renderStatus() {
    var s = state.status;
    if (!s) return;
    TZ = s.timezone || TZ;
    var last = s.lastSuccessAt;
    $('last-sync').textContent = last ? fmtStamp(last) : 'todavía no';
    $('next-sync').textContent = s.scheduler === 'internal' ? fmtStamp(s.nextSyncAt) : 'según el cron externo';
    var btn = $('sync-btn');
    btn.disabled = s.running;
    btn.innerHTML = s.running ? '<span class="spin"></span>Actualizando…' : '🔄 Actualizar ahora';
    var alert = $('sync-alert');
    var run = s.lastRun;
    if (!s.credentialsConfigured) {
      alert.className = 'alert'; alert.hidden = false;
      alert.textContent = '⚠️ Faltan las credenciales de Idukay en el servidor (IDUKAY_USERNAME / IDUKAY_PASSWORD).';
    } else if (run && run.status === 'error' && !s.running) {
      alert.className = 'alert'; alert.hidden = false;
      alert.textContent = s.needsReauth && /captcha|mfa/.test(run.errorCode || '')
        ? '⚠️ Se requiere volver a autenticar Idukay. ' + (run.message || '')
        : '⚠️ No se pudo actualizar Idukay. ' + (run.message || '');
    } else if (run && run.status === 'partial' && run.message && !s.running) {
      alert.className = 'alert warn'; alert.hidden = false;
      alert.textContent = 'Actualización parcial: ' + run.message;
    } else {
      alert.hidden = true;
    }
  }

  function loadStatus() { return api('/api/status').then(function (s) { state.status = s; renderStatus(); return s; }); }
  function loadTasks() {
    return api('/api/tasks').then(function (d) {
      state.tasks = d.tasks; state.students = d.students; state.today = d.today; state.historyDays = d.historyDays;
      render();
    });
  }

  var polling = null;
  function pollWhileRunning() {
    if (polling) return;
    polling = setInterval(function () {
      loadStatus().then(function (s) {
        if (!s.running) { clearInterval(polling); polling = null; loadTasks(); if (state.tab === 'diagnostico') renderRuns(); }
      }).catch(function () {});
    }, 3000);
  }

  $('sync-btn').addEventListener('click', function () {
    var btn = $('sync-btn');
    btn.disabled = true;
    api('/api/sync', { method: 'POST', body: '{}' }).then(function () {
      state.status = Object.assign({}, state.status, { running: true });
      renderStatus();
      pollWhileRunning();
    }).catch(function (e) {
      btn.disabled = false;
      var a = $('sync-alert'); a.className = 'alert warn'; a.hidden = false; a.textContent = e.message;
    });
  });

  // ---------- rendering ----------
  function render() {
    if (state.tab === 'hoy') renderHoy();
    if (state.tab === 'historial') renderHistorial();
    if (state.tab === 'archivo') renderArchivo();
  }

  function rowHtml(t, opts) {
    opts = opts || {};
    var st = t.parentDoneAt && t.status !== 'completada' ? 'casa' : t.status;
    var pills = '';
    if (opts.showStudent) pills += '<span class="pill ' + kidClass(t.student) + '">' + esc(t.student.toUpperCase()) + '</span>';
    if (opts.showStatus) pills += '<span class="pill ' + st + '">' + (st === 'casa' ? '✔ Hecha en casa' : esc(STATUS[t.status] || t.status)) + '</span>';
    if (t.english) pills += '<span class="pill en">🇺🇸 EN INGLÉS</span>';
    if (t.missingSince && t.bucket !== 'archivo') pills += '<span class="pill missing">ya no aparece en Idukay</span>';
    var meta = [];
    if (t.teacher) meta.push('Prof. ' + esc(t.teacher));
    if (t.idukayStatus && t.status !== 'completada') meta.push('Idukay: ' + esc(t.idukayStatus));
    return '<button type="button" class="task-row" data-id="' + esc(t.id) + '">' +
      '<span class="dot ' + st + '"></span>' +
      '<span class="task-main"><span class="task-title' + (st === 'casa' ? ' done' : '') + '">' + (t.subject ? esc(t.subject) + ' — ' : '') + esc(t.title) + '</span>' +
      '<span class="task-meta">' + pills + meta.map(function (m) { return '<span>' + m + '</span>'; }).join('') + '</span></span>' +
      '<span class="task-due">' + (t.dueDate ? '<b>' + fmtDay(t.dueDate) + '</b>' + esc(t.dueTime || '') + '<br>' + esc(dueText(t)) : 'sin fecha') + '</span>' +
      '</button>';
  }

  function group(title, emoji, list, opts) {
    var h = '<div class="group-title">' + emoji + ' ' + title + ' <span class="n">' + list.length + '</span></div>';
    if (!list.length) return h + '<div class="none">' + (opts && opts.emptyText || 'Nada por aquí.') + '</div>';
    return h + list.map(function (t) { return rowHtml(t, opts); }).join('');
  }

  function byDue(a, b) { return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (a.dueTime || '').localeCompare(b.dueTime || ''); }

  function renderHoy() {
    var box = $('view-hoy');
    if (!state.tasks.length && state.status && !state.status.lastSuccessAt) {
      box.innerHTML = '<div class="empty">Todavía no hay datos de Idukay.<br>Pulsa <b>🔄 Actualizar ahora</b> o espera la próxima actualización automática.</div>';
      return;
    }
    var anyIdukayCompleted = state.tasks.some(function (t) { return t.completedByIdukay; });
    box.innerHTML = state.students.map(function (student) {
      var mine = state.tasks.filter(function (t) { return t.student === student && t.bucket !== 'archivo'; });
      var open = mine.filter(function (t) { return !t.parentDoneAt && t.status !== 'completada'; });
      var pend = open.filter(function (t) { return t.bucket === 'pendiente'; }).sort(byDue);
      var prox = open.filter(function (t) { return t.bucket === 'proxima'; }).sort(byDue);
      var comp = mine.filter(function (t) { return t.status === 'completada'; }).sort(byDue);
      var home = mine.filter(function (t) { return t.parentDoneAt && t.status !== 'completada'; }).sort(byDue);
      var cls = kidClass(student);
      var h = '<div class="card"><div class="kid-head ' + cls + '"><h2>' + esc(student.toUpperCase()) + '</h2>' +
        '<span class="kid-count">' + pend.length + ' para hoy · ' + prox.length + ' próximas</span></div>';
      h += group('Pendientes', '🔴', pend, { emptyText: 'Nada que entregar hoy ni mañana. 🎉' });
      h += group('Próximas', '🟡', prox, { emptyText: 'Sin entregas próximas.' });
      if (anyIdukayCompleted || comp.length) h += group('Completadas (según Idukay)', '🟢', comp, { emptyText: 'Ninguna marcada como entregada en Idukay.' });
      if (home.length) h += group('Hechas en casa', '✔', home);
      return h + '</div>';
    }).join('') + (anyIdukayCompleted ? '' : '<div class="note">Idukay no indica si una tarea fue entregada, por eso no se muestran “Completadas”. Puedes marcar una tarea como “hecha en casa” desde su detalle.</div>');
  }

  function refDate(t) { return t.assignedDate || (t.firstSeenAt ? isoInTz(t.firstSeenAt) : t.dueDate); }
  function isoInTz(ts) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); }

  function chips(id, current, onPick) {
    var opts = [['all', 'Ambos']].concat(state.students.map(function (s) { return [s, s]; }));
    var el = $(id);
    el.innerHTML = opts.map(function (o) { return '<button type="button" class="chip' + (o[0] === current ? ' active' : '') + '" data-v="' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join('');
    el.onclick = function (e) { var b = e.target.closest('.chip'); if (b) onPick(b.getAttribute('data-v')); };
  }

  function renderHistorial() {
    chips('hist-filters', state.histStudent, function (v) { state.histStudent = v; renderHistorial(); });
    var from = addDays(state.today, -state.historyDays);
    var list = state.tasks.filter(function (t) {
      if (state.histStudent !== 'all' && t.student !== state.histStudent) return false;
      var r = refDate(t);
      return (r && r >= from) || (t.dueDate && t.dueDate >= from && t.dueDate <= state.today);
    });
    var groups = {};
    list.forEach(function (t) {
      var r = refDate(t);
      var day = r && r <= state.today ? (r < from ? from : r) : state.today;
      (groups[day] = groups[day] || []).push(t);
    });
    var days = Object.keys(groups).sort().reverse();
    $('hist-list').innerHTML = days.length ? days.map(function (d) {
      return '<div class="card spaced"><div class="day-head"><h3>' + relDay(d) + '</h3><span>' + fmtDay(d) + ' · ' + groups[d].length + '</span></div>' +
        groups[d].sort(byDue).map(function (t) { return rowHtml(t, { showStudent: true, showStatus: true }); }).join('') + '</div>';
    }).join('') : '<div class="empty">No hay tareas en las últimas 2 semanas.</div>';
  }

  function renderArchivo() {
    chips('arch-filters', state.archStudent, function (v) { state.archStudent = v; renderArchivo(); });
    var q = state.archQ.toLowerCase();
    var list = state.tasks.filter(function (t) {
      if (t.bucket !== 'archivo') return false;
      if (state.archStudent !== 'all' && t.student !== state.archStudent) return false;
      if (q && [t.subject, t.title, t.description, t.teacher].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return (b.dueDate || '').localeCompare(a.dueDate || ''); });
    $('arch-list').innerHTML = list.length
      ? '<div class="card">' + list.map(function (t) { return rowHtml(t, { showStudent: true, showStatus: true }); }).join('') + '</div>'
      : '<div class="empty">' + (q ? 'Sin resultados.' : 'Todavía no hay tareas archivadas. Las tareas pasan aquí cuando vence su fecha de entrega.') + '</div>';
  }
  $('arch-search').addEventListener('input', function (e) { state.archQ = e.target.value.trim(); renderArchivo(); });

  function renderRuns() {
    api('/api/runs').then(function (d) {
      var LABEL = { ok: '✅ Correcta', partial: '⚠️ Parcial', error: '❌ Error', running: '⏳ En curso' };
      $('runs').innerHTML = d.runs.length ? d.runs.map(function (r, i) {
        var logs = r.logs.map(function (l) {
          var t = new Intl.DateTimeFormat('es-EC', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(l.at));
          return '[' + t + '] ' + (l.level !== 'info' ? l.level.toUpperCase() + ' ' : '') + l.message;
        }).join('\n');
        return '<details class="run"' + (i === 0 ? ' open' : '') + '><summary><b>' + (LABEL[r.status] || r.status) + '</b><span>' + fmtStamp(r.startedAt) + '</span><span class="pill missing">' + esc(r.trigger) + '</span></summary>' +
          (r.message ? '<div class="note">' + esc(r.message) + '</div>' : '') + '<pre>' + esc(logs || 'Sin registros.') + '</pre></details>';
      }).join('') : '<div class="empty">Aún no hay sincronizaciones.</div>';
    }).catch(function () {});
  }

  // ---------- detail ----------
  function openTask(id) {
    api('/api/tasks/' + encodeURIComponent(id)).then(function (t) {
      var cls = kidClass(t.student);
      var st = t.parentDoneAt && t.status !== 'completada' ? 'casa' : t.status;
      var h = '<div class="modal-top"><div><span class="pill ' + cls + '">' + esc(t.student.toUpperCase()) + '</span> <span class="pill ' + st + '">' + (st === 'casa' ? '✔ Hecha en casa' : esc(STATUS[t.status])) + '</span>' +
        '<h2>' + esc(t.title) + '</h2></div><button class="close" type="button" id="close" aria-label="Cerrar">✕</button></div>';
      h += '<div class="kv">';
      h += kv('Materia', t.subject || '—');
      if (t.teacher) h += kv('Profesor', t.teacher);
      h += kv('Asignada', t.assignedDate ? fmtDay(t.assignedDate) : '—');
      h += kv('Entrega', t.dueDate ? fmtDay(t.dueDate) + (t.dueTime ? ' · ' + t.dueTime : '') + ' (' + dueText(t) + ')' : 'Sin fecha');
      h += kv('Estado en Idukay', t.idukayStatus || 'Idukay no indica estado');
      if (t.extra && t.extra.calificacion) h += kv('Calificación', t.extra.calificacion);
      if (t.extra && t.extra.tipo) h += kv('Tipo', t.extra.tipo);
      h += '</div>';

      h += '<div class="section"><h4>' + (t.english ? 'Instrucciones (en inglés)' : 'Descripción') + '</h4>';
      if (t.english) h += '<div class="en-banner">🇺🇸 Esta tarea se hace EN INGLÉS: escribir y responder en inglés.</div>';
      h += '<div class="desc">' + esc(t.description || 'Idukay no muestra descripción para esta tarea.') + '</div>';
      if (t.instructions && t.instructions !== t.description) h += '<div class="desc spaced-top">' + esc(t.instructions) + '</div>';
      h += '</div>';

      if (t.attachments && t.attachments.length) {
        h += '<div class="section files"><h4>Archivos y enlaces</h4>' + t.attachments.map(function (a) {
          return a.url && /^https?:/i.test(a.url) ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">📎 ' + esc(a.name) + '</a>' : '<span>📎 ' + esc(a.name) + ' (abrir en Idukay)</span>';
        }).join('') + '</div>';
      }

      h += '<div class="section"><button class="btn ' + (t.parentDoneAt ? 'secondary' : '') + '" type="button" id="done-btn">' + (t.parentDoneAt ? 'Desmarcar “hecha en casa”' : '✔ Marcar como hecha en casa') + '</button>' +
        '<div class="note">Esto solo se guarda en esta app; no cambia nada en Idukay.</div></div>';

      if (t.events && t.events.length) {
        h += '<div class="section"><h4>Historial</h4><div class="timeline">' + t.events.map(function (e) {
          var ch = e.changes ? Object.keys(e.changes).map(function (k) {
            var c = e.changes[k];
            var show = function (v) { return v == null || v === '' ? '—' : typeof v === 'object' ? (Array.isArray(v) ? v.map(function (a) { return a.name; }).join(', ') : JSON.stringify(v)) : String(v); };
            return '<div>' + esc(FIELD[k] || k) + ': ' + esc(show(c.antes)).slice(0, 160) + ' → ' + esc(show(c.ahora)).slice(0, 160) + '</div>';
          }).join('') : '';
          return '<div class="item"><div class="when">' + fmtStamp(e.at) + '</div>' + esc(EVENT[e.type] || e.type) + ch + '</div>';
        }).join('') + '</div></div>';
      }

      $('modal').innerHTML = h;
      $('overlay').hidden = false;
      $('close').onclick = closeModal;
      $('done-btn').onclick = function () {
        api('/api/tasks/' + encodeURIComponent(t.id) + '/done', { method: 'POST', body: JSON.stringify({ done: !t.parentDoneAt }) })
          .then(function () { closeModal(); loadTasks(); });
      };
    });
  }
  function kv(k, v) { return '<div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div>'; }
  function closeModal() { $('overlay').hidden = true; }
  $('overlay').addEventListener('click', function (e) { if (e.target.id === 'overlay') closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('click', function (e) {
    var row = e.target.closest('.task-row[data-id]');
    if (row) openTask(row.getAttribute('data-id'));
  });

  // ---------- tabs ----------
  Array.prototype.forEach.call(document.querySelectorAll('nav.tabs button'), function (b) {
    b.addEventListener('click', function () {
      state.tab = b.getAttribute('data-tab');
      Array.prototype.forEach.call(document.querySelectorAll('nav.tabs button'), function (x) { x.classList.toggle('active', x === b); });
      ['hoy', 'historial', 'archivo', 'diagnostico'].forEach(function (k) { $('view-' + k).hidden = k !== state.tab; });
      if (state.tab === 'diagnostico') renderRuns(); else render();
    });
  });

  // ---------- start ----------
  loadStatus().then(function (s) { if (s.running) pollWhileRunning(); return loadTasks(); }).catch(function (e) {
    if (e.message !== 'auth') $('view-hoy').innerHTML = '<div class="empty">No se pudo cargar la información. Revisa tu conexión.</div>';
  });
  // keep the screen fresh while it is open
  setInterval(function () {
    if (document.visibilityState !== 'visible') return;
    loadStatus().then(function (s) { if (s.running) pollWhileRunning(); else loadTasks(); }).catch(function () {});
  }, 5 * 60000);
})();
