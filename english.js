const ENG_LEVELS = [
  { name: 'B2', hours: 700 },
  { name: 'C1', hours: 1000 },
  { name: 'C2', hours: 1400 },
];
const DEFAULT_ENG_BASE = 393.8;
const DEFAULT_ENG_GOAL = 5;

let engActivities = [];
let engLogs = {};
let engBase = DEFAULT_ENG_BASE;
let engWeekGoal = DEFAULT_ENG_GOAL;
let engSelectedDate = fmt(new Date());

function defaultEngActivities() {
  return [
    { id: 'temas', name: 'Temas', defaultMinutes: 45 },
    { id: 'anki', name: 'Anki', defaultMinutes: 25 },
    { id: 'shadowing', name: 'Shadowing', defaultMinutes: 25 },
    { id: 'diario', name: 'Diario', defaultMinutes: 15 },
    { id: 'libro', name: 'Libro', defaultMinutes: 30 },
  ];
}

async function saveEngLogs() { await guardedSave('eng-logs', () => JSON.stringify(engLogs)); }
async function saveEngBaseValue() { await guardedSave('eng-base', () => String(engBase)); }
async function saveEngGoalValue() { await guardedSave('eng-goal', () => String(engWeekGoal)); }
async function saveEngActivities() { await guardedSave('eng-activities', () => JSON.stringify(engActivities)); }

function toggleEng(date, actId) {
  const a = engActivities.find(x => x.id === actId);
  engLogs[date] = engLogs[date] || {};
  const current = engLogs[date][actId] || 0;
  engLogs[date][actId] = current > 0 ? 0 : (a ? a.defaultMinutes : 0);
  saveEngLogs();
  renderIngles();
}

function setEngMinutes(date, actId, val) {
  let mins = parseInt(val, 10);
  if (isNaN(mins) || mins < 0) mins = 0;
  if (mins > 1440) mins = 1440;
  engLogs[date] = engLogs[date] || {};
  engLogs[date][actId] = mins;
  saveEngLogs();
  renderIngles();
}

function selectEngDay(ds) {
  engSelectedDate = ds;
  const jump = document.getElementById('eng-date-jump');
  if (jump) jump.value = ds;
  renderIngles();
}

function addEngActivity() {
  const nameInp = document.getElementById('new-eng-activity-name');
  const minInp = document.getElementById('new-eng-activity-minutes');
  const name = nameInp.value.trim();
  let mins = parseInt(minInp.value, 10);
  if (!name) return;
  if (isNaN(mins) || mins < 0) mins = 0;
  if (mins > 1440) mins = 1440;
  engActivities.push({ id: 'ea' + Date.now(), name, defaultMinutes: mins });
  nameInp.value = ''; minInp.value = '';
  saveEngActivities();
  renderIngles();
}

function renameEngActivity(id, name) {
  const a = engActivities.find(x => x.id === id);
  const trimmed = name.trim();
  if (a && trimmed) { a.name = trimmed; saveEngActivities(); renderIngles(); }
}

function setEngActivityDefaultMinutes(id, val) {
  const a = engActivities.find(x => x.id === id);
  if (!a) return;
  let mins = parseInt(val, 10);
  if (isNaN(mins) || mins < 0) mins = 0;
  if (mins > 1440) mins = 1440;
  a.defaultMinutes = mins;
  saveEngActivities();
  renderIngles();
}

function deleteEngActivity(id) {
  if (engActivities.length <= 1) return;
  const a = engActivities.find(x => x.id === id);
  if (!confirm(`¿Eliminar la actividad "${a ? a.name : ''}" y sus minutos registrados en el historial?`)) return;
  engActivities = engActivities.filter(a => a.id !== id);
  Object.keys(engLogs).forEach(ds => { if (engLogs[ds]) delete engLogs[ds][id]; });
  saveEngActivities();
  saveEngLogs();
  renderIngles();
}

function renderEngActivitiesEditor() {
  const el = document.getElementById('eng-activities-editor');
  if (!el) return;
  el.innerHTML = engActivities.map(a => `
    <div class="habit-item">
      <input type="text" value="${esc(a.name)}" data-rename-eng-activity="${a.id}">
      <input type="number" min="0" max="1440" value="${a.defaultMinutes}" title="Minutos típicos" data-eng-activity-minutes="${a.id}">
      <button class="danger" data-delete-eng-activity="${a.id}" ${engActivities.length <= 1 ? 'disabled title="Debe quedar al menos una actividad"' : ''}>Eliminar</button>
    </div>`).join('');
}

function engHoursFromLogs() {
  let totalMinutes = 0;
  Object.keys(engLogs).forEach(ds => {
    engActivities.forEach(a => {
      const mins = (engLogs[ds] && engLogs[ds][a.id]) || 0;
      if (mins > 0) totalMinutes += mins;
    });
  });
  return totalMinutes / 60;
}

function engTotalHours() {
  return Math.max(0, engBase + engHoursFromLogs());
}

function engLevelInfo(total) {
  let current = 'B1';
  ENG_LEVELS.forEach(lv => { if (total >= lv.hours) current = lv.name; });
  return current;
}

function saveEngGoal(v) {
  engWeekGoal = clampNonNegative(v, 0);
  saveEngGoalValue();
  renderIngles();
}

function saveEngBase() {
  const inp = document.getElementById('eng-base-input');
  engBase = clampNonNegative(inp.value, 0);
  inp.value = engBase;
  saveEngBaseValue();
  renderIngles();
}

function renderIngles() {
  const today = fmt(new Date());
  const total = engTotalHours();

  document.getElementById('eng-ring').textContent = total.toFixed(1) + 'h';
  document.getElementById('eng-level').textContent = engLevelInfo(total);
  document.getElementById('eng-base-input').value = engBase;

  const isToday = engSelectedDate === today;
  const dLabelFull = new Date(engSelectedDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  document.getElementById('eng-day-title').textContent =
    'Actividades de ' + (isToday ? 'hoy' : dLabelFull) + (isToday ? '' : ' (editando)');

  document.getElementById('eng-list').innerHTML = engActivities.map(a => {
    const mins = (engLogs[engSelectedDate] || {})[a.id] || 0;
    const on = mins > 0;
    return `<div class="habit-item">
      <div class="chk ${on ? 'on' : ''}" data-toggle-eng="${a.id}" title="Tap para usar el tiempo típico (${a.defaultMinutes} min)"></div>
      <span style="flex:1;">${esc(a.name)}</span>
      <input type="number" class="eng-min-input" min="0" max="1440" step="1" placeholder="${a.defaultMinutes}" value="${mins || ''}" data-eng-minutes="${a.id}">
      <span class="sub" style="margin:0;">min</span>
    </div>`;
  }).join('');

  document.getElementById('eng-progress').innerHTML = ENG_LEVELS.map(lv => {
    const reached = total >= lv.hours;
    const pct = Math.min(100, Math.round((total / lv.hours) * 100));
    const remaining = Math.max(0, lv.hours - total);
    return `<div class="goal-row">
      <div class="row">
        <span style="font-size:13px;">${lv.name}<span style="color:var(--muted);"> · ${lv.hours}h</span></span>
        <span style="font-size:12px;color:${reached ? 'var(--green)' : 'var(--muted)'};">${reached ? 'Alcanzado' : 'Faltan ' + remaining.toFixed(1) + 'h'}</span>
      </div>
      <div class="barwrap"><div class="bar" style="width:${pct}%;background:${reached ? 'var(--green)' : 'var(--accent)'};"></div></div>
    </div>`;
  }).join('');

  const weekDates = getWeekDates(new Date());
  let weekMinutes = 0;
  weekDates.forEach(ds => {
    engActivities.forEach(a => { weekMinutes += (engLogs[ds] && engLogs[ds][a.id]) || 0; });
  });
  const weekHours = Math.max(0, weekMinutes / 60);
  document.getElementById('eng-goal-input').value = engWeekGoal;
  document.getElementById('eng-week-hours').textContent = weekHours.toFixed(1) + 'h / ' + engWeekGoal + 'h';
  const weekPct = engWeekGoal > 0 ? Math.min(100, Math.round((weekHours / engWeekGoal) * 100)) : 0;
  const wbar = document.getElementById('eng-week-bar');
  wbar.style.width = weekPct + '%';
  wbar.style.background = weekHours >= engWeekGoal && engWeekGoal > 0 ? 'var(--green)' : 'var(--accent)';

  const last7 = [];
  const dd = new Date();
  for (let i = 0; i < 7; i++) { const x = new Date(dd); x.setDate(dd.getDate() - i); last7.push(fmt(x)); }
  document.getElementById('eng-history').innerHTML = last7.map(ds => {
    const dLabel = new Date(ds + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    const dayLog = engLogs[ds] || {};
    const pills = engActivities.map(a => {
      const mins = dayLog[a.id] || 0;
      return `<span class="pill ${mins > 0 ? 'on' : ''}">${esc(a.name)}${mins > 0 ? ' · ' + mins + 'm' : ''}</span>`;
    }).join('');
    const active = ds === engSelectedDate;
    return `<div class="history-row ${active ? 'active-row' : ''}" data-select-eng-day="${ds}" style="cursor:pointer;">
      <span class="d">${dLabel}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${pills}</div>
    </div>`;
  }).join('');

  renderEngActivitiesEditor();
}
