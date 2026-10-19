// Horario semanal: plantilla de bloques por día de la semana + check diario.
// day usa la convención de Date.getDay() (0 = domingo), igual que DOW en utils.js.
const SCHED_COLORS = [
  { id: 'accent', label: 'Claro' },
  { id: 'green', label: 'Verde' },
  { id: 'red', label: 'Rojo' },
  { id: 'muted', label: 'Gris' },
];
const SCHED_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SCHED_DAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const SCHED_PX_PER_HOUR = 48;

let schedBlocks = [];
let schedDone = {};
let schedTab = 'hoy';
let schedEditingId = null;
let schedDupId = null;
let schedDupDays = new Set();
let schedClockTimer = null;

async function saveSchedBlocks() { await guardedSave('schedule-blocks', () => JSON.stringify(schedBlocks)); }
async function saveSchedDone() { await guardedSave('schedule-done', () => JSON.stringify(schedDone)); }

function toMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function minToHHMM(min) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }

function schedColorVar(color) {
  return `var(--${SCHED_COLORS.some(c => c.id === color) ? color : 'accent'})`;
}

function schedRange(b) { return `${b.start}–${b.end}`; }

function blocksForDay(day) {
  return schedBlocks
    .filter(b => b.day === day)
    .sort((a, b) => (toMin(a.start) - toMin(b.start)) || (toMin(a.end) - toMin(b.end)));
}

function findSchedOverlaps(day, start, end, ignoreId) {
  const s = toMin(start), e = toMin(end);
  return schedBlocks.filter(b => b.id !== ignoreId && b.day === day && toMin(b.start) < e && s < toMin(b.end));
}

function schedHasOverlap(b) { return findSchedOverlaps(b.day, b.start, b.end, b.id).length > 0; }

// ---------- Editor ----------

function readSchedForm() {
  return {
    name: document.getElementById('sched-name').value.trim(),
    day: parseInt(document.getElementById('sched-day').value, 10),
    start: document.getElementById('sched-start').value,
    end: document.getElementById('sched-end').value,
    color: document.getElementById('sched-color').value,
  };
}

function setSchedFormMsg(text, kind) {
  const msg = document.getElementById('sched-form-msg');
  msg.textContent = text;
  msg.className = 'sched-form-msg' + (kind ? ' ' + kind : '');
}

// Error bloquea el guardado (fin <= inicio); el solape solo avisa.
function validateSchedForm() {
  const f = readSchedForm();
  let error = '';
  if (!f.start || !f.end) error = 'Completá la hora de inicio y la de fin.';
  else if (toMin(f.end) <= toMin(f.start)) error = 'La hora de fin tiene que ser posterior a la de inicio.';
  if (error) { setSchedFormMsg(error, 'error'); return { f, error }; }

  const overlaps = findSchedOverlaps(f.day, f.start, f.end, schedEditingId);
  if (overlaps.length) {
    setSchedFormMsg('Se solapa con ' + overlaps.map(b => `${b.name} (${schedRange(b)})`).join(', ') + '. Podés guardarlo igual.', 'warn');
  } else {
    setSchedFormMsg('', '');
  }
  return { f, error: '' };
}

function saveSchedBlock() {
  const { f, error } = validateSchedForm();
  if (error) return;
  if (!f.name) { setSchedFormMsg('Ponele un nombre al bloque.', 'error'); document.getElementById('sched-name').focus(); return; }

  const wasEditing = !!schedEditingId;
  if (wasEditing) {
    const b = schedBlocks.find(x => x.id === schedEditingId);
    if (b) Object.assign(b, f);
  } else {
    schedBlocks.push({ id: uid('blk'), ...f });
  }
  saveSchedBlocks();

  if (wasEditing) {
    resetSchedForm();
  } else {
    // Para cargar clases seguidas: el próximo bloque arranca donde terminó este,
    // con la misma duración, mismo día y mismo color.
    const dur = toMin(f.end) - toMin(f.start);
    const nextStart = Math.min(toMin(f.end), 23 * 60);
    document.getElementById('sched-name').value = '';
    document.getElementById('sched-start').value = minToHHMM(nextStart);
    document.getElementById('sched-end').value = minToHHMM(Math.min(nextStart + dur, 23 * 60 + 59));
    setSchedFormMsg('', '');
  }
  renderSchedule();
  showToast(wasEditing ? 'Bloque actualizado' : 'Bloque agregado');
}

function resetSchedForm() {
  schedEditingId = null;
  document.getElementById('sched-name').value = '';
  document.getElementById('sched-day').value = String(new Date().getDay());
  document.getElementById('sched-start').value = '08:00';
  document.getElementById('sched-end').value = '09:00';
  document.getElementById('sched-color').value = 'accent';
  document.getElementById('sched-form-title').textContent = 'Nuevo bloque';
  document.getElementById('sched-save-btn').textContent = 'Agregar bloque';
  document.getElementById('sched-cancel-btn').style.display = 'none';
  setSchedFormMsg('', '');
}

function startEditSchedBlock(id) {
  const b = schedBlocks.find(x => x.id === id);
  if (!b) return;
  schedEditingId = id;
  schedDupId = null;
  schedTab = 'editar';
  document.getElementById('sched-name').value = b.name;
  document.getElementById('sched-day').value = String(b.day);
  document.getElementById('sched-start').value = b.start;
  document.getElementById('sched-end').value = b.end;
  document.getElementById('sched-color').value = SCHED_COLORS.some(c => c.id === b.color) ? b.color : 'accent';
  document.getElementById('sched-form-title').textContent = 'Editar bloque';
  document.getElementById('sched-save-btn').textContent = 'Guardar cambios';
  document.getElementById('sched-cancel-btn').style.display = '';
  renderSchedule();
  validateSchedForm();
  document.getElementById('sched-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEditSchedBlock() {
  resetSchedForm();
  renderSchedule();
}

function deleteSchedBlock(id) {
  const b = schedBlocks.find(x => x.id === id);
  if (!b) return;
  if (!confirm(`¿Eliminar "${b.name}" (${SCHED_DAY_LONG[b.day]} ${schedRange(b)})?`)) return;
  schedBlocks = schedBlocks.filter(x => x.id !== id);
  if (schedEditingId === id) resetSchedForm();
  if (schedDupId === id) schedDupId = null;
  saveSchedBlocks();
  renderSchedule();
}

function openSchedDuplicate(id) {
  schedDupId = schedDupId === id ? null : id;
  schedDupDays = new Set();
  renderSchedule();
}

function toggleSchedDupDay(day) {
  if (schedDupDays.has(day)) schedDupDays.delete(day); else schedDupDays.add(day);
  renderSchedule();
}

function confirmSchedDuplicate() {
  const src = schedBlocks.find(x => x.id === schedDupId);
  if (!src || !schedDupDays.size) return;
  let overlapping = 0;
  schedDupDays.forEach(day => {
    if (findSchedOverlaps(day, src.start, src.end, null).length) overlapping++;
    schedBlocks.push({ id: uid('blk'), name: src.name, day, start: src.start, end: src.end, color: src.color });
  });
  const n = schedDupDays.size;
  schedDupId = null;
  schedDupDays = new Set();
  saveSchedBlocks();
  renderSchedule();
  showToast(`Duplicado en ${n} día${n === 1 ? '' : 's'}` + (overlapping ? ' · revisá los solapes' : ''));
}

// ---------- Check diario ----------

function toggleSchedDone(id) {
  const today = fmt(new Date());
  const day = schedDone[today] = schedDone[today] || {};
  if (day[id]) delete day[id]; else day[id] = true;
  if (!Object.keys(day).length) delete schedDone[today];
  const hadFocus = document.activeElement && document.activeElement.dataset.toggleSched === id;
  saveSchedDone();
  renderSchedule();
  // El re-render reemplaza el nodo: devolver el foco para que el teclado no lo pierda.
  if (hadFocus) {
    const el = document.querySelector(`[data-toggle-sched="${id}"]`);
    if (el) el.focus();
  }
}

// ---------- Render ----------

function selectSchedTab(tab) {
  schedTab = tab;
  renderSchedule();
  if (tab === 'semana') scrollSchedWeekToToday();
}

function renderSchedule() {
  document.querySelectorAll('.sched-tabs [data-sched-tab]').forEach(b => {
    const on = b.dataset.schedTab === schedTab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  ['hoy', 'semana', 'editar'].forEach(t => {
    document.getElementById('sched-pane-' + t).style.display = t === schedTab ? '' : 'none';
  });
  renderSchedHoy();
  renderSchedSemana();
  renderSchedEditorList();
  startSchedClock();
}

function renderSchedHoy() {
  const now = new Date();
  const today = fmt(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const blocks = blocksForDay(now.getDay());
  const done = schedDone[today] || {};

  document.getElementById('sched-hoy-title').textContent = SCHED_DAY_LONG[now.getDay()];
  const doneCount = blocks.filter(b => done[b.id]).length;
  document.getElementById('sched-hoy-count').textContent = blocks.length ? `${doneCount}/${blocks.length} hechos` : '';

  const list = document.getElementById('sched-hoy-list');
  if (!blocks.length) {
    list.innerHTML = `<div class="empty">${schedBlocks.length ? 'No tenés bloques para hoy.' : 'Todavía no armaste tu horario.'}<br>
      <button class="ghost sched-empty-btn" data-sched-tab="editar">${schedBlocks.length ? 'Agregar un bloque' : 'Armar mi horario'}</button></div>`;
    return;
  }

  const next = blocks.find(b => toMin(b.start) > nowMin);
  list.innerHTML = blocks.map(b => {
    const s = toMin(b.start), e = toMin(b.end);
    const isCurrent = s <= nowMin && nowMin < e;
    const isPast = e <= nowMin;
    const isDone = !!done[b.id];
    let status = '';
    if (isCurrent) status = `<span class="pill on">Ahora · quedan ${formatSchedWait(e - nowMin)}</span>`;
    else if (next && b.id === next.id) status = `<span class="pill">Siguiente · en ${formatSchedWait(s - nowMin)}</span>`;
    return `<div class="habit-item sched-item ${isCurrent ? 'is-current' : ''} ${isPast && !isDone ? 'is-past' : ''} ${isDone ? 'done' : ''}">
      <div class="chk ${isDone ? 'on' : ''}" data-toggle-sched="${b.id}" role="checkbox" tabindex="0"
        aria-checked="${isDone}" aria-label="Marcar ${esc(b.name)} como hecho"></div>
      <span class="sched-dot" style="background:${schedColorVar(b.color)}"></span>
      <div class="sched-main">
        <div class="sched-name">${esc(b.name)}</div>
        <div class="sched-time">${schedRange(b)}</div>
      </div>
      ${status}
    </div>`;
  }).join('');
}

function formatSchedWait(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Reparte bloques solapados en carriles lado a lado dentro de su columna.
function layoutSchedDay(blocks) {
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    const placed = cluster.map(b => {
      let lane = lanes.findIndex(end => end <= toMin(b.start));
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = toMin(b.end);
      return { b, lane };
    });
    placed.forEach(p => out.push({ ...p, lanes: lanes.length }));
    cluster = [];
    clusterEnd = -1;
  };
  blocks.forEach(b => {
    if (cluster.length && toMin(b.start) >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, toMin(b.end));
  });
  if (cluster.length) flush();
  return out;
}

function renderSchedSemana() {
  const wrap = document.getElementById('sched-week');
  if (!schedBlocks.length) {
    wrap.innerHTML = `<div class="empty">Todavía no armaste tu horario.<br>
      <button class="ghost sched-empty-btn" data-sched-tab="editar">Armar mi horario</button></div>`;
    return;
  }

  const now = new Date();
  const todayDay = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const minH = Math.floor(Math.min(...schedBlocks.map(b => toMin(b.start))) / 60);
  const maxH = Math.ceil(Math.max(...schedBlocks.map(b => toMin(b.end))) / 60);
  const px = SCHED_PX_PER_HOUR;
  const height = (maxH - minH) * px;
  const topOf = min => (min - minH * 60) / 60 * px;

  const hours = [];
  for (let h = minH; h <= maxH; h++) hours.push(`<div class="sched-hour" style="top:${(h - minH) * px}px">${pad(h)}:00</div>`);

  const cols = SCHED_DAY_ORDER.map(day => {
    const blocks = layoutSchedDay(blocksForDay(day)).map(({ b, lane, lanes }) => {
      const top = topOf(toMin(b.start));
      const h = Math.max(topOf(toMin(b.end)) - top, 20);
      return `<button class="sched-block" data-edit-sched="${b.id}"
        style="top:${top}px;height:${h}px;left:calc(${lane} * 100% / ${lanes});width:calc(100% / ${lanes});--c:${schedColorVar(b.color)}"
        title="${esc(b.name)} · ${schedRange(b)}" aria-label="${esc(b.name)}, ${SCHED_DAY_LONG[day]} ${schedRange(b)}. Editar">
        <span class="sched-block-name">${esc(b.name)}</span>
        <span class="sched-block-time">${schedRange(b)}</span>
      </button>`;
    }).join('');
    const nowLine = day === todayDay && nowMin >= minH * 60 && nowMin <= maxH * 60
      ? `<div class="sched-now" style="top:${topOf(nowMin)}px"></div>` : '';
    return `<div class="sched-col ${day === todayDay ? 'today' : ''}" data-sched-day-col="${day}">
      <div class="sched-col-head">${DOW[day]}</div>
      <div class="sched-col-body" style="height:${height}px">${blocks}${nowLine}</div>
    </div>`;
  }).join('');

  wrap.innerHTML = `<div class="sched-week-scroll" id="sched-week-scroll">
    <div class="sched-grid" style="--hour-px:${px}px">
      <div class="sched-hours-col"><div class="sched-col-head"></div><div class="sched-col-body" style="height:${height}px">${hours.join('')}</div></div>
      ${cols}
    </div>
  </div>`;
}

function scrollSchedWeekToToday() {
  const scroller = document.getElementById('sched-week-scroll');
  const col = scroller && scroller.querySelector('.sched-col.today');
  if (!scroller || !col) return;
  const hoursCol = scroller.querySelector('.sched-hours-col');
  scroller.scrollLeft = Math.max(0, col.offsetLeft - (hoursCol ? hoursCol.offsetWidth : 0));
}

function renderSchedEditorList() {
  const list = document.getElementById('sched-editor-list');
  if (!schedBlocks.length) {
    list.innerHTML = '<div class="empty">Sin bloques todavía. Agregá el primero arriba.</div>';
    return;
  }
  list.innerHTML = SCHED_DAY_ORDER.map(day => {
    const blocks = blocksForDay(day);
    if (!blocks.length) return '';
    return `<div class="sched-day-group">
      <div class="sched-day-label">${SCHED_DAY_LONG[day]}</div>
      ${blocks.map(b => `
        <div class="habit-item sched-edit-row ${b.id === schedEditingId ? 'editing' : ''}">
          <span class="sched-dot" style="background:${schedColorVar(b.color)}"></span>
          <div class="sched-main">
            <div class="sched-name">${esc(b.name)}</div>
            <div class="sched-time">${schedRange(b)}${schedHasOverlap(b) ? ' <span class="pill sched-overlap-pill">Se solapa</span>' : ''}</div>
          </div>
          <div class="sched-row-actions">
            <button class="ghost" data-edit-sched="${b.id}">Editar</button>
            <button class="ghost" data-dup-sched="${b.id}" aria-expanded="${b.id === schedDupId}">Duplicar</button>
            <button class="danger" data-delete-sched="${b.id}">Eliminar</button>
          </div>
          ${b.id === schedDupId ? renderSchedDupPanel(b) : ''}
        </div>`).join('')}
    </div>`;
  }).join('');
}

function renderSchedDupPanel(b) {
  const days = SCHED_DAY_ORDER.filter(d => d !== b.day).map(d => `
    <button class="day-btn ${schedDupDays.has(d) ? 'active' : ''}" data-dup-day="${d}" aria-pressed="${schedDupDays.has(d)}">${DOW[d]}</button>`).join('');
  return `<div class="sched-dup-panel">
    <div class="sub" style="margin-bottom:8px;">Duplicar "${esc(b.name)}" (${schedRange(b)}) en:</div>
    <div class="day-select">${days}</div>
    <div class="sched-form-actions">
      <button class="btn" data-dup-confirm="1" ${schedDupDays.size ? '' : 'disabled'}>Duplicar${schedDupDays.size ? ` en ${schedDupDays.size}` : ''}</button>
      <button class="ghost" data-dup-cancel="1">Cancelar</button>
    </div>
  </div>`;
}

// Refresca "Ahora / Siguiente" y la línea de la hora actual una vez por minuto,
// solo mientras la sección Horario está a la vista.
function startSchedClock() {
  if (schedClockTimer) return;
  schedClockTimer = setInterval(() => {
    const view = document.getElementById('view-horario');
    if (!view || !view.classList.contains('active') || document.hidden) return;
    if (schedTab === 'hoy') renderSchedHoy();
    else if (schedTab === 'semana') {
      const scroller = document.getElementById('sched-week-scroll');
      const left = scroller ? scroller.scrollLeft : 0;
      renderSchedSemana();
      const again = document.getElementById('sched-week-scroll');
      if (again) again.scrollLeft = left;
    }
  }, 60 * 1000);
}

function stopSchedClock() {
  clearInterval(schedClockTimer);
  schedClockTimer = null;
}

function populateSchedFormOptions() {
  document.getElementById('sched-day').innerHTML = SCHED_DAY_ORDER
    .map(d => `<option value="${d}">${SCHED_DAY_LONG[d]}</option>`).join('');
  document.getElementById('sched-color').innerHTML = SCHED_COLORS
    .map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  resetSchedForm();
}
