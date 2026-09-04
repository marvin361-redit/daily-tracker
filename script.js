const localStorageShim = {
  async get(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) throw new Error('Key not found: ' + key);
    return { key, value: raw, shared: false };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value, shared: false };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { key, deleted: true, shared: false };
  },
  async list(prefix) {
    const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};

let supabaseClient = null;
let currentUserId = null;

function initSupabase() {
  if (typeof supabase === 'undefined' || typeof SUPABASE_URL === 'undefined') return null;
  return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const supabaseStorage = {
  async get(key) {
    const { data, error } = await supabaseClient.from('kv_store').select('value').eq('key', key).eq('user_id', currentUserId).maybeSingle();
    if (error || !data) throw new Error('Key not found: ' + key);
    return { key, value: data.value, shared: false };
  },
  async set(key, value) {
    const { error } = await supabaseClient.from('kv_store')
      .upsert({ key, value, user_id: currentUserId, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (error) throw error;
    return { key, value, shared: false };
  },
  async delete(key) {
    await supabaseClient.from('kv_store').delete().eq('key', key).eq('user_id', currentUserId);
    return { key, deleted: true, shared: false };
  },
  async list(prefix) {
    let q = supabaseClient.from('kv_store').select('key').eq('user_id', currentUserId);
    if (prefix) q = q.like('key', prefix + '%');
    const { data } = await q;
    return { keys: (data || []).map(r => r.key), prefix, shared: false };
  },
};

let S = (window.storage && typeof window.storage.get === 'function') ? window.storage : localStorageShim;

function defaultEngActivities() {
  return [
    { id: 'temas', name: 'Temas', defaultMinutes: 45 },
    { id: 'anki', name: 'Anki', defaultMinutes: 25 },
    { id: 'shadowing', name: 'Shadowing', defaultMinutes: 25 },
    { id: 'diario', name: 'Diario', defaultMinutes: 15 },
    { id: 'libro', name: 'Libro', defaultMinutes: 30 },
  ];
}
const ENG_LEVELS = [
  { name: 'B2', hours: 700 },
  { name: 'C1', hours: 1000 },
  { name: 'C2', hours: 1400 },
];
const DOW = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DEFAULT_ENG_BASE = 393.8;
const DEFAULT_ENG_GOAL = 5;
const DEFAULT_EXPENSE_CATS = ['Comida', 'Transporte', 'Vivienda', 'Servicios', 'Salud', 'Entretenimiento', 'Otros'];
const DEFAULT_INCOME_CATS = ['Sueldo', 'Freelance', 'Regalo', 'Otros'];

let habits = [];
let logs = {};
let engActivities = [];
let engLogs = {};
let engBase = DEFAULT_ENG_BASE;
let engWeekGoal = DEFAULT_ENG_GOAL;
let notes = {};
let finTx = [];
let finCatExpense = [];
let finCatIncome = [];
let finGoals = [];
let finSavingsPlans = [];
let finSavingsLog = {};
let savingsSelectedPeriod = {};
let finEditingId = null;
let trendChart = null;
let finChart = null;
let selectedDate = fmt(new Date());
let engSelectedDate = fmt(new Date());
let monthCursor = new Date();

function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function pad(n) { return String(n).padStart(2, '0'); }

function clampNonNegative(n, fallback) {
  const v = parseFloat(n);
  if (isNaN(v) || v < 0) return fallback !== undefined ? fallback : 0;
  return v;
}

function defaultHabits() {
  return [
    { id: 'h1', name: 'Despertar a las 05:00', goal: 7 },
    { id: 'h2', name: 'Gimnasio', goal: 5 },
    { id: 'h3', name: 'Lectura / Aprendizaje', goal: 7 },
    { id: 'h4', name: 'Planificar el día', goal: 7 },
    { id: 'h5', name: 'Control de gastos', goal: 7 },
  ];
}

async function safeGet(key) {
  try {
    const r = await S.get(key, false);
    return r ? r.value : null;
  } catch (e) {
    return null;
  }
}

async function saveHabits() { await S.set('habits', JSON.stringify(habits), false); }
async function saveLogs() { await S.set('logs', JSON.stringify(logs), false); }
async function saveEngLogs() { await S.set('eng-logs', JSON.stringify(engLogs), false); }
async function saveEngBaseValue() { await S.set('eng-base', String(engBase), false); }
async function saveEngGoalValue() { await S.set('eng-goal', String(engWeekGoal), false); }
async function saveNotes() { await S.set('notes', JSON.stringify(notes), false); }
async function saveEngActivities() { await S.set('eng-activities', JSON.stringify(engActivities), false); }
async function saveFinTx() { await S.set('fin-tx', JSON.stringify(finTx), false); }
async function saveFinCatExpense() { await S.set('fin-cat-expense', JSON.stringify(finCatExpense), false); }
async function saveFinCatIncome() { await S.set('fin-cat-income', JSON.stringify(finCatIncome), false); }
async function saveFinGoals() { await S.set('fin-goals', JSON.stringify(finGoals), false); }
async function saveFinSavingsPlans() { await S.set('fin-savings-plans', JSON.stringify(finSavingsPlans), false); }
async function saveFinSavingsLog() { await S.set('fin-savings-log', JSON.stringify(finSavingsLog), false); }

function money(n) {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return 'Bs ' + v.toFixed(2);
}

async function load() {
  const rawHabits = await safeGet('habits');
  if (rawHabits) {
    try { habits = JSON.parse(rawHabits); } catch (e) { habits = defaultHabits(); }
  } else {
    habits = defaultHabits();
    await saveHabits();
  }
  let needsResave = false;
  habits.forEach(h => { if (!h.goal || h.goal < 1 || h.goal > 7) { h.goal = 7; needsResave = true; } });
  if (needsResave) await saveHabits();

  const rawLogs = await safeGet('logs');
  try { logs = rawLogs ? JSON.parse(rawLogs) : {}; } catch (e) { logs = {}; }

  const rawEngActivities = await safeGet('eng-activities');
  if (rawEngActivities) {
    try { engActivities = JSON.parse(rawEngActivities); } catch (e) { engActivities = defaultEngActivities(); }
  } else {
    engActivities = defaultEngActivities();
    await saveEngActivities();
  }

  const rawEngLogs = await safeGet('eng-logs');
  try { engLogs = rawEngLogs ? JSON.parse(rawEngLogs) : {}; } catch (e) { engLogs = {}; }
  let engMigrated = false;
  Object.keys(engLogs).forEach(ds => {
    engActivities.forEach(a => {
      const v = engLogs[ds][a.id];
      if (v === true) { engLogs[ds][a.id] = a.defaultMinutes; engMigrated = true; }
      else if (v === false) { delete engLogs[ds][a.id]; engMigrated = true; }
    });
  });
  if (engMigrated) await saveEngLogs();

  engBase = clampNonNegative(await safeGet('eng-base'), DEFAULT_ENG_BASE);
  engWeekGoal = clampNonNegative(await safeGet('eng-goal'), DEFAULT_ENG_GOAL);

  const rawNotes = await safeGet('notes');
  try { notes = rawNotes ? JSON.parse(rawNotes) : {}; } catch (e) { notes = {}; }

  const rawTx = await safeGet('fin-tx');
  try { finTx = rawTx ? JSON.parse(rawTx) : []; } catch (e) { finTx = []; }

  const rawCatE = await safeGet('fin-cat-expense');
  if (rawCatE) {
    try { finCatExpense = JSON.parse(rawCatE); } catch (e) { finCatExpense = [...DEFAULT_EXPENSE_CATS]; }
  } else {
    finCatExpense = [...DEFAULT_EXPENSE_CATS];
    await saveFinCatExpense();
  }

  const rawCatI = await safeGet('fin-cat-income');
  if (rawCatI) {
    try { finCatIncome = JSON.parse(rawCatI); } catch (e) { finCatIncome = [...DEFAULT_INCOME_CATS]; }
  } else {
    finCatIncome = [...DEFAULT_INCOME_CATS];
    await saveFinCatIncome();
  }

  const rawGoals = await safeGet('fin-goals');
  try { finGoals = rawGoals ? JSON.parse(rawGoals) : []; } catch (e) { finGoals = []; }

  const rawSavingsPlans = await safeGet('fin-savings-plans');
  try { finSavingsPlans = rawSavingsPlans ? JSON.parse(rawSavingsPlans) : []; } catch (e) { finSavingsPlans = []; }

  const rawSavingsLog = await safeGet('fin-savings-log');
  try { finSavingsLog = rawSavingsLog ? JSON.parse(rawSavingsLog) : {}; } catch (e) { finSavingsLog = {}; }

  const dateInput = document.getElementById('fin-date');
  if (dateInput && !dateInput.value) dateInput.value = fmt(new Date());
  const hoyJump = document.getElementById('hoy-date-jump');
  if (hoyJump) hoyJump.value = selectedDate;
  const engJump = document.getElementById('eng-date-jump');
  if (engJump) engJump.value = engSelectedDate;

  render();
}

function toggle(date, habitId) {
  logs[date] = logs[date] || {};
  logs[date][habitId] = !logs[date][habitId];
  saveLogs();
  render();
}

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
      <input type="text" value="${a.name}" data-rename-eng-activity="${a.id}">
      <input type="number" min="0" max="1440" value="${a.defaultMinutes}" title="Minutos típicos" data-eng-activity-minutes="${a.id}">
      <button class="danger" data-delete-eng-activity="${a.id}" ${engActivities.length <= 1 ? 'disabled title="Debe quedar al menos una actividad"' : ''}>Eliminar</button>
    </div>`).join('');
}

function saveNote(val) {
  notes[selectedDate] = val;
  saveNotes();
}

function dayPct(date) {
  if (habits.length === 0) return 0;
  const l = logs[date] || {};
  const done = habits.filter(h => l[h.id]).length;
  return Math.max(0, Math.round((done / habits.length) * 100));
}

function getWeekDates(d) {
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  const arr = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    arr.push(fmt(x));
  }
  return arr;
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

function setHabitGoal(id, val) {
  const h = habits.find(x => x.id === id);
  if (!h) return;
  let g = parseInt(val, 10);
  if (isNaN(g) || g < 1) g = 1;
  if (g > 7) g = 7;
  h.goal = g;
  saveHabits();
  render();
}

function addHabit() {
  const inp = document.getElementById('new-habit');
  const name = inp.value.trim();
  if (!name) return;
  habits.push({ id: 'h' + Date.now(), name, goal: 7 });
  inp.value = '';
  saveHabits();
  render();
}

function renameHabit(id, name) {
  const h = habits.find(x => x.id === id);
  const trimmed = name.trim();
  if (h && trimmed) { h.name = trimmed; saveHabits(); render(); }
}

function deleteHabit(id) {
  habits = habits.filter(h => h.id !== id);
  Object.keys(logs).forEach(ds => { if (logs[ds]) delete logs[ds][id]; });
  saveHabits();
  saveLogs();
  render();
}

function selectDay(ds) {
  selectedDate = ds;
  const jump = document.getElementById('hoy-date-jump');
  if (jump) jump.value = ds;
  renderHoy();
}

function render() {
  const now = new Date();
  document.getElementById('today-label').textContent =
    now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  renderHoy();
  renderMes();
  renderAnalytics();
  renderEditor();
  renderIngles();
  renderFinanzas();
}

function renderHoy() {
  const d = new Date(selectedDate + 'T00:00:00');
  document.getElementById('hoy-title').textContent =
    selectedDate === fmt(new Date()) ? 'Hoy' : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });

  const pct = dayPct(selectedDate);
  const ring = document.getElementById('hoy-ring');
  ring.textContent = pct + '%';
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--accent)' : 'var(--red)';
  ring.style.borderColor = color;
  ring.style.color = color;

  const list = document.getElementById('hoy-list');
  if (habits.length === 0) {
    list.innerHTML = '<div class="empty">Agrega hábitos en la pestaña "Editar hábitos".</div>';
  } else {
    list.innerHTML = habits.map(h => {
      const on = (logs[selectedDate] || {})[h.id];
      return `<div class="habit-item">
        <div class="chk ${on ? 'on' : ''}" data-toggle-habit="${h.id}"></div>
        <span>${h.name}</span>
      </div>`;
    }).join('');
  }

  const wr = document.getElementById('week-days');
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay() + 1);
  const days = [];
  for (let i = 0; i < 7; i++) { const x = new Date(start); x.setDate(start.getDate() + i); days.push(x); }
  document.getElementById('week-range').textContent =
    `${days[0].getDate()} ${MONTHS[days[0].getMonth()].slice(0, 3)} - ${days[6].getDate()} ${MONTHS[days[6].getMonth()].slice(0, 3)}`;
  wr.innerHTML = days.map(x => {
    const ds = fmt(x);
    const p = dayPct(ds);
    const active = ds === selectedDate;
    return `<div class="day-btn ${active ? 'active' : ''}" data-select-day="${ds}">${DOW[x.getDay()]} ${x.getDate()}<div class="weekday">${p}%</div></div>`;
  }).join('');

  document.getElementById('day-note').value = notes[selectedDate] || '';
  renderGoals();
}

function renderGoals() {
  const el = document.getElementById('goal-list');
  if (habits.length === 0) { el.innerHTML = '<div class="empty">Sin hábitos aún.</div>'; return; }
  const weekDates = getWeekDates(new Date(selectedDate + 'T00:00:00'));
  el.innerHTML = habits.map(h => {
    const goal = h.goal || 7;
    const done = weekDates.filter(ds => (logs[ds] || {})[h.id]).length;
    const pct = Math.min(100, Math.round((done / goal) * 100));
    const met = done >= goal;
    return `<div class="goal-row">
      <div class="row">
        <span style="font-size:13px;">${h.name}</span>
        <span style="font-size:12px;color:${met ? 'var(--green)' : 'var(--muted)'};">${done}/${goal}</span>
      </div>
      <div class="barwrap"><div class="bar" style="width:${pct}%;background:${met ? 'var(--green)' : 'var(--accent)'};"></div></div>
    </div>`;
  }).join('');
}

function renderMes() {
  const picker = document.getElementById('month-picker');
  if (!picker.value) picker.value = `${monthCursor.getFullYear()}-${pad(monthCursor.getMonth() + 1)}`;
  const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${y}-${pad(m + 1)}-${pad(i + 1)}`);

  let totalDone = 0, totalPossible = 0;
  let html = '<tr><th style="text-align:left;">Hábito</th>' + dates.map(ds => `<th>${+ds.slice(-2)}</th>`).join('') + '</tr>';
  habits.forEach(h => {
    html += `<tr><td class="hname">${h.name}</td>` + dates.map(ds => {
      const on = (logs[ds] || {})[h.id];
      if (on) totalDone++;
      totalPossible++;
      return `<td><div class="chk small ${on ? 'on' : ''}" data-toggle-month="${ds}|${h.id}"></div></td>`;
    }).join('') + '</tr>';
  });
  document.getElementById('month-table').innerHTML = html || '<tr><td class="empty">Sin hábitos aún.</td></tr>';
  const pct = totalPossible ? Math.round((totalDone / totalPossible) * 100) : 0;
  document.getElementById('mes-ring').textContent = pct + '%';
}

function renderAnalytics() {
  const loggedDaysWithActivity = Object.keys(logs).filter(ds => Object.values(logs[ds] || {}).some(v => v));
  document.getElementById('an-total').textContent = loggedDaysWithActivity.length;

  let streak = 0;
  let d = new Date();
  while (dayPct(fmt(d)) > 0) { streak++; d.setDate(d.getDate() - 1); }
  document.getElementById('an-streak').textContent = streak;

  const allLoggedDays = Object.keys(logs);
  let avg = 0;
  if (allLoggedDays.length) avg = Math.round(allLoggedDays.reduce((s, ds) => s + dayPct(ds), 0) / allLoggedDays.length);
  document.getElementById('an-avg').textContent = avg + '%';

  const stats = habits.map(h => {
    const days = Object.keys(logs);
    const done = days.filter(ds => (logs[ds] || {})[h.id]).length;
    const pct = days.length ? Math.round((done / days.length) * 100) : 0;
    return { name: h.name, pct };
  }).sort((a, b) => b.pct - a.pct);

  document.getElementById('an-bars').innerHTML = stats.length ? stats.map(s => `
    <div class="row" style="gap:10px;">
      <span style="width:150px;font-size:12px;flex-shrink:0;">${s.name}</span>
      <div class="barwrap"><div class="bar" style="width:${s.pct}%"></div></div>
      <span style="width:36px;text-align:right;font-size:12px;color:var(--muted);">${s.pct}%</span>
    </div>`).join('') : '<div class="empty">Aún no hay datos suficientes.</div>';

  document.getElementById('an-rank').innerHTML = stats.slice(0, 5).map((s, i) => `
    <div class="rank"><span class="n">${i + 1}</span><span style="flex:1;">${s.name}</span><span style="color:var(--accent);font-weight:600;">${s.pct}%</span></div>`
  ).join('') || '<div class="empty">-</div>';

  if (document.getElementById('view-analytics').classList.contains('active')) renderTrendChart();
}

function renderTrendChart() {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;

  const labels = [];
  const vals = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const x = new Date(today);
    x.setDate(today.getDate() - i);
    labels.push(`${x.getDate()}/${x.getMonth() + 1}`);
    vals.push(dayPct(fmt(x)));
  }

  const gridColor = '#2B2C2F';
  const textColor = '#8C8D90';

  if (trendChart) {
    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = vals;
    trendChart.options.scales.y.ticks.color = textColor;
    trendChart.options.scales.x.ticks.color = textColor;
    trendChart.options.scales.y.grid.color = gridColor;
    trendChart.resize();
    trendChart.update();
    return;
  }

  trendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '% cumplido',
        data: vals,
        borderColor: '#E8A33D',
        backgroundColor: 'rgba(232,163,61,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100, ticks: { color: textColor, callback: v => v + '%' }, grid: { color: gridColor } },
        x: { ticks: { color: textColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
      },
    },
  });
}

function renderEditor() {
  const ed = document.getElementById('habit-editor');
  ed.innerHTML = habits.length ? habits.map(h => `
    <div class="habit-item">
      <input type="text" value="${h.name}" data-rename-habit="${h.id}">
      <input type="number" min="1" max="7" value="${h.goal || 7}" title="Meta semanal (días)" data-goal-habit="${h.id}">
      <button class="danger" data-delete-habit="${h.id}">Eliminar</button>
    </div>`).join('') : '<div class="empty">No tenés hábitos todavía. Agregá uno abajo.</div>';
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
      <span style="flex:1;">${a.name}</span>
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
      return `<span class="pill ${mins > 0 ? 'on' : ''}">${a.name}${mins > 0 ? ' · ' + mins + 'm' : ''}</span>`;
    }).join('');
    const active = ds === engSelectedDate;
    return `<div class="history-row ${active ? 'active-row' : ''}" data-select-eng-day="${ds}" style="cursor:pointer;">
      <span class="d">${dLabel}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${pills}</div>
    </div>`;
  }).join('');

  renderEngActivitiesEditor();
}

function addTransaction() {
  const type = document.getElementById('fin-type').value;
  const amountInp = document.getElementById('fin-amount');
  let amount = parseFloat(amountInp.value);
  if (isNaN(amount) || amount <= 0) {
    amountInp.style.borderColor = 'var(--red)';
    setTimeout(() => { amountInp.style.borderColor = ''; }, 1200);
    return;
  }
  amount = Math.abs(amount);
  const category = document.getElementById('fin-category').value || 'Otros';
  let date = document.getElementById('fin-date').value;
  if (!date) date = fmt(new Date());
  const note = document.getElementById('fin-note').value.trim();
  finTx.push({ id: 't' + Date.now(), type, amount, category, date, note });
  amountInp.value = '';
  document.getElementById('fin-note').value = '';
  saveFinTx();
  renderFinanzas();
}

function deleteTransaction(id) {
  finTx = finTx.filter(t => t.id !== id);
  saveFinTx();
  renderFinanzas();
}

function populateFinCategorySelect() {
  const type = document.getElementById('fin-type').value;
  const cats = type === 'income' ? finCatIncome : finCatExpense;
  const sel = document.getElementById('fin-category');
  const prev = sel.value;
  sel.innerHTML = cats.length ? cats.map(c => `<option value="${c}">${c}</option>`).join('') : '<option value="Otros">Otros</option>';
  if (cats.includes(prev)) sel.value = prev;
}

function addCategory(type) {
  const inputId = type === 'expense' ? 'new-cat-expense' : 'new-cat-income';
  const inp = document.getElementById(inputId);
  const name = inp.value.trim();
  if (!name) return;
  const list = type === 'expense' ? finCatExpense : finCatIncome;
  if (list.some(c => c.toLowerCase() === name.toLowerCase())) { inp.value = ''; return; }
  list.push(name);
  inp.value = '';
  if (type === 'expense') saveFinCatExpense(); else saveFinCatIncome();
  renderFinanzas();
}

function deleteCategory(type, name) {
  if (type === 'expense') { finCatExpense = finCatExpense.filter(c => c !== name); saveFinCatExpense(); }
  else { finCatIncome = finCatIncome.filter(c => c !== name); saveFinCatIncome(); }
  renderFinanzas();
}

function addGoal() {
  const nameInp = document.getElementById('new-goal-name');
  const targetInp = document.getElementById('new-goal-target');
  const name = nameInp.value.trim();
  const target = clampNonNegative(targetInp.value, 0);
  if (!name || target <= 0) return;
  finGoals.push({ id: 'g' + Date.now(), name, target, saved: 0 });
  nameInp.value = ''; targetInp.value = '';
  saveFinGoals();
  renderFinanzas();
}

function addFundsToGoal(id, rawAmount) {
  const g = finGoals.find(x => x.id === id);
  if (!g) return;
  const amount = clampNonNegative(rawAmount, 0);
  if (amount <= 0) return;
  g.saved = Math.max(0, g.saved + amount);
  saveFinGoals();
  renderFinanzas();
}

function deleteGoal(id) {
  finGoals = finGoals.filter(g => g.id !== id);
  saveFinGoals();
  renderFinanzas();
}

function renderFinSummary() {
  const totalIncome = finTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = finTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  const now = new Date();
  const mKey = finMonthKey(now);
  const monthTx = finTx.filter(t => t.date.startsWith(mKey));
  const monthIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const monthSavings = monthIncome - monthExpense;

  document.getElementById('fin-balance').textContent = money(balance);
  document.getElementById('fin-balance').style.color = balance >= 0 ? '' : 'var(--red)';
  document.getElementById('fin-income-month').textContent = money(monthIncome);
  document.getElementById('fin-expense-month').textContent = money(monthExpense);
  const savEl = document.getElementById('fin-savings-month');
  savEl.textContent = money(monthSavings);
  savEl.style.color = monthSavings >= 0 ? 'var(--green)' : 'var(--red)';

  const weekDates = getWeekDates(now);
  const weekTx = finTx.filter(t => weekDates.includes(t.date));
  const weekIncome = weekTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const weekExpense = weekTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  document.getElementById('fin-week-summary').textContent =
    `Esta semana: ingresos ${money(weekIncome)} · gastos ${money(weekExpense)} · ahorro ${money(weekIncome - weekExpense)}`;
}

function renderFinGoals() {
  const el = document.getElementById('fin-goals');
  el.innerHTML = finGoals.length ? finGoals.map(g => {
    const pct = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
    const done = g.saved >= g.target;
    return `<div class="goal-row">
      <div class="row">
        <span style="font-size:13px;">${g.name}</span>
        <span style="font-size:12px;color:${done ? 'var(--green)' : 'var(--muted)'};">${money(g.saved)} / ${money(g.target)}</span>
      </div>
      <div class="barwrap"><div class="bar" style="width:${pct}%;background:${done ? 'var(--green)' : 'var(--accent)'};"></div></div>
      <div class="goal-actions">
        <input type="number" min="0" step="1" placeholder="Bs a agregar" data-goal-input="${g.id}">
        <button class="btn" data-add-funds="${g.id}">Agregar</button>
        <button class="danger" data-delete-goal="${g.id}">Eliminar</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty">Sin metas todavía. Creá una abajo.</div>';
}

function renderFinHistory() {
  const now = new Date();
  const mKey = finMonthKey(now);
  const monthTx = finTx.filter(t => t.date.startsWith(mKey)).sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById('fin-history').innerHTML = monthTx.length ? monthTx.map(t => {
    if (t.id === finEditingId) {
      const cats = t.type === 'income' ? finCatIncome : finCatExpense;
      return `<div class="fin-row fin-edit-row" data-tx-edit-row="${t.id}">
        <span class="fin-cat">${t.type === 'income' ? 'Ingreso' : 'Gasto'}</span>
        <input type="number" min="0" step="0.01" value="${t.amount}" data-edit-amount style="width:80px;">
        <select data-edit-category style="width:130px;">${cats.map(c => `<option value="${c}" ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <input type="date" value="${t.date}" data-edit-date style="width:140px;">
        <input type="text" value="${t.note || ''}" data-edit-note placeholder="Nota" style="flex:1;min-width:100px;">
        <button class="btn" data-save-edit-tx="${t.id}">Guardar</button>
        <button class="ghost" data-cancel-edit-tx="${t.id}">Cancelar</button>
      </div>`;
    }
    const sign = t.type === 'income' ? '+' : '-';
    const color = t.type === 'income' ? 'var(--green)' : 'var(--red)';
    return `<div class="fin-row">
      <span class="fin-date">${t.date.slice(5)}</span>
      <span class="fin-cat">${t.category}</span>
      <span class="fin-note">${t.note || ''}</span>
      <span class="fin-amount" style="color:${color};">${sign}${money(t.amount)}</span>
      <button class="ghost" data-edit-tx="${t.id}" title="Editar">✎</button>
      <button class="danger" data-delete-tx="${t.id}">×</button>
    </div>`;
  }).join('') : '<div class="empty">Sin movimientos este mes.</div>';
}

function renderFinCategories() {
  document.getElementById('fin-cat-expense').innerHTML = finCatExpense.length
    ? finCatExpense.map(c => `<span class="cat-chip">${c}<button data-delete-cat="expense|${c}">×</button></span>`).join('')
    : '<div class="empty">Sin categorías.</div>';
  document.getElementById('fin-cat-income').innerHTML = finCatIncome.length
    ? finCatIncome.map(c => `<span class="cat-chip">${c}<button data-delete-cat="income|${c}">×</button></span>`).join('')
    : '<div class="empty">Sin categorías.</div>';
}

function renderFinChart() {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('fin-chart');
  if (!canvas) return;

  const now = new Date();
  const mKey = finMonthKey(now);
  const byCat = {};
  finTx.filter(t => t.type === 'expense' && t.date.startsWith(mKey)).forEach(t => {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  const labels = Object.keys(byCat);
  const vals = Object.values(byCat);

  const gridColor = '#2B2C2F';
  const textColor = '#8C8D90';

  if (finChart) {
    finChart.data.labels = labels;
    finChart.data.datasets[0].data = vals;
    finChart.options.scales.y.ticks.color = textColor;
    finChart.options.scales.x.ticks.color = textColor;
    finChart.options.scales.y.grid.color = gridColor;
    finChart.resize();
    finChart.update();
    return;
  }

  finChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Gasto', data: vals, backgroundColor: '#E8A33D', borderRadius: 4 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } },
        x: { ticks: { color: textColor }, grid: { display: false } },
      },
    },
  });
}

function startEditTx(id) { finEditingId = id; renderFinHistory(); }
function cancelEditTx() { finEditingId = null; renderFinHistory(); }

function saveEditTx(id) {
  const row = document.querySelector(`[data-tx-edit-row="${id}"]`);
  if (!row) return;
  const amountInp = row.querySelector('[data-edit-amount]');
  let amount = parseFloat(amountInp.value);
  if (isNaN(amount) || amount <= 0) { amountInp.style.borderColor = 'var(--red)'; return; }
  const category = row.querySelector('[data-edit-category]').value;
  const dateVal = row.querySelector('[data-edit-date]').value;
  const note = row.querySelector('[data-edit-note]').value.trim();
  const t = finTx.find(x => x.id === id);
  if (t) {
    t.amount = Math.abs(amount);
    t.category = category;
    t.date = dateVal || t.date;
    t.note = note;
    saveFinTx();
  }
  finEditingId = null;
  renderFinanzas();
}

function finMonthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

function getPeriodKey(freq, d) {
  if (freq === 'daily') return fmt(d);
  if (freq === 'weekly') return getWeekDates(d)[0];
  return finMonthKey(d);
}

function getSavingsSelectedPeriod(plan) {
  if (!savingsSelectedPeriod[plan.id]) savingsSelectedPeriod[plan.id] = getPeriodKey(plan.frequency, new Date());
  return savingsSelectedPeriod[plan.id];
}

function getRecentPeriods(freq, count) {
  const periods = [];
  const now = new Date();
  if (freq === 'daily') {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      periods.push({ key: fmt(d), label: `${d.getDate()}/${d.getMonth() + 1}` });
    }
  } else if (freq === 'weekly') {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i * 7);
      const monday = getWeekDates(d)[0];
      periods.push({ key: monday, label: 'Sem ' + monday.slice(5) });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      periods.push({ key: finMonthKey(d), label: MONTHS[d.getMonth()].slice(0, 3) });
    }
  }
  return periods;
}

function addSavingsPlan() {
  const nameInp = document.getElementById('new-saving-name');
  const freqSel = document.getElementById('new-saving-freq');
  const targetInp = document.getElementById('new-saving-target');
  const name = nameInp.value.trim();
  const freq = freqSel.value;
  const target = clampNonNegative(targetInp.value, 0);
  if (!name || target <= 0) return;
  finSavingsPlans.push({ id: 'sp' + Date.now(), name, frequency: freq, targetAmount: target });
  nameInp.value = ''; targetInp.value = '';
  saveFinSavingsPlans();
  renderFinanzas();
}

function deleteSavingsPlan(id) {
  finSavingsPlans = finSavingsPlans.filter(p => p.id !== id);
  delete finSavingsLog[id];
  delete savingsSelectedPeriod[id];
  saveFinSavingsPlans();
  saveFinSavingsLog();
  renderFinanzas();
}

function selectSavingPeriod(planId, key) {
  savingsSelectedPeriod[planId] = key;
  renderFinanzas();
}

function saveSavingAmount(planId, val) {
  const amount = clampNonNegative(val, 0);
  const plan = finSavingsPlans.find(p => p.id === planId);
  if (!plan) return;
  const period = getSavingsSelectedPeriod(plan);
  finSavingsLog[planId] = finSavingsLog[planId] || {};
  finSavingsLog[planId][period] = amount;
  saveFinSavingsLog();
  renderFinanzas();
}

function renderFinSavingsPlans() {
  const el = document.getElementById('fin-savings-plans');
  if (!finSavingsPlans.length) { el.innerHTML = '<div class="empty">Sin rutinas de ahorro todavía. Creá una abajo.</div>'; return; }
  const freqLabels = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual' };
  const periodCounts = { daily: 14, weekly: 8, monthly: 6 };

  el.innerHTML = finSavingsPlans.map(plan => {
    const periods = getRecentPeriods(plan.frequency, periodCounts[plan.frequency]);
    const selected = getSavingsSelectedPeriod(plan);
    const log = finSavingsLog[plan.id] || {};
    const selectedAmount = log[selected] || 0;
    const chips = periods.map(p => {
      const amt = log[p.key] || 0;
      const done = plan.targetAmount > 0 && amt >= plan.targetAmount;
      const active = p.key === selected;
      return `<span class="pill ${done ? 'on' : ''} ${active ? 'active-pill' : ''}" data-select-saving-period="${plan.id}|${p.key}" style="cursor:pointer;">${p.label}</span>`;
    }).join('');
    return `<div class="savings-plan-card">
      <div class="row">
        <strong style="font-size:13px;">${plan.name}</strong>
        <button class="danger" data-delete-saving-plan="${plan.id}">Eliminar</button>
      </div>
      <div class="sub" style="margin-bottom:10px;">${freqLabels[plan.frequency]} · meta ${money(plan.targetAmount)} por periodo</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">${chips}</div>
      <div class="inline-field">
        <input type="number" min="0" step="1" placeholder="Bs ahorrado" value="${selectedAmount || ''}" data-saving-amount-input="${plan.id}">
        <button class="btn" data-save-saving="${plan.id}">Guardar</button>
      </div>
    </div>`;
  }).join('');
}

function renderFinTips() {
  const staticTips = [
    'Regla 50/30/20: 50% necesidades, 30% gustos, 20% ahorro o deudas.',
    'Antes de una compra no esencial, esperá 24 horas — si aún la querés, comprala.',
    'Automatizá tu ahorro: separalo apenas cobrás, no al final del mes.',
    'Revisá cada 3 meses las suscripciones que ya no usás.',
    'Un fondo de emergencia ideal cubre entre 3 y 6 meses de gastos básicos.',
    'Anotá también los gastos chicos — son los que menos se notan y más suman con el tiempo.',
  ];

  const now = new Date();
  const mKey = finMonthKey(now);
  const monthTx = finTx.filter(t => t.date.startsWith(mKey));
  const monthIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const dynamicTips = [];
  if (monthIncome > 0 && monthExpense > monthIncome) {
    dynamicTips.push('⚠️ Este mes tus gastos superan tus ingresos. Revisá qué categoría creció más.');
  } else if (monthIncome > 0) {
    const savedPct = Math.round(((monthIncome - monthExpense) / monthIncome) * 100);
    if (savedPct >= 20) dynamicTips.push(`✅ Estás ahorrando el ${savedPct}% de tus ingresos este mes. ¡Vas muy bien!`);
  }
  const byCat = {};
  monthTx.filter(t => t.type === 'expense').forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (catEntries.length && monthExpense > 0) {
    const [topCat, topAmt] = catEntries[0];
    const pct = Math.round((topAmt / monthExpense) * 100);
    if (pct >= 40) dynamicTips.push(`📊 "${topCat}" es tu categoría más grande este mes (${pct}% de tus gastos).`);
  }

  const html = dynamicTips.map(t => `<div class="tip-row dynamic">${t}</div>`).join('')
    + staticTips.map(t => `<div class="tip-row">${t}</div>`).join('');
  document.getElementById('fin-tips').innerHTML = html;
}

function renderFinanzas() {
  populateFinCategorySelect();
  renderFinSummary();
  renderFinGoals();
  renderFinSavingsPlans();
  renderFinTips();
  renderFinHistory();
  renderFinCategories();
  if (document.getElementById('view-finanzas').classList.contains('active')) renderFinChart();
}

function wireStaticEvents() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('view-' + t.dataset.view).classList.add('active');
      if (t.dataset.view === 'analytics') renderTrendChart();
      if (t.dataset.view === 'finanzas') renderFinChart();
    });
  });

  document.getElementById('add-habit-btn').addEventListener('click', addHabit);
  document.getElementById('add-eng-activity-btn').addEventListener('click', addEngActivity);
  document.getElementById('new-habit').addEventListener('keydown', e => { if (e.key === 'Enter') addHabit(); });
  document.getElementById('save-eng-base-btn').addEventListener('click', saveEngBase);
  document.getElementById('day-note').addEventListener('change', e => saveNote(e.target.value));
  document.getElementById('eng-goal-input').addEventListener('change', e => saveEngGoal(e.target.value));
  document.getElementById('month-picker').addEventListener('change', e => {
    const [y, m] = e.target.value.split('-');
    monthCursor = new Date(+y, +m - 1, 1);
    renderMes();
  });

  document.getElementById('fin-type').addEventListener('change', populateFinCategorySelect);
  document.getElementById('fin-add-btn').addEventListener('click', addTransaction);
  document.getElementById('fin-amount').addEventListener('keydown', e => { if (e.key === 'Enter') addTransaction(); });
  document.getElementById('add-cat-expense-btn').addEventListener('click', () => addCategory('expense'));
  document.getElementById('new-cat-expense').addEventListener('keydown', e => { if (e.key === 'Enter') addCategory('expense'); });
  document.getElementById('add-cat-income-btn').addEventListener('click', () => addCategory('income'));
  document.getElementById('new-cat-income').addEventListener('keydown', e => { if (e.key === 'Enter') addCategory('income'); });
  document.getElementById('add-goal-btn').addEventListener('click', addGoal);
  document.getElementById('add-saving-plan-btn').addEventListener('click', addSavingsPlan);
  document.getElementById('hoy-date-jump').addEventListener('change', e => { if (e.target.value) selectDay(e.target.value); });
  document.getElementById('eng-date-jump').addEventListener('change', e => { if (e.target.value) selectEngDay(e.target.value); });

  document.body.addEventListener('click', e => {
    const t = e.target.closest('[data-toggle-habit], [data-select-day], [data-toggle-month], [data-toggle-eng], [data-select-eng-day], [data-delete-habit], [data-delete-tx], [data-delete-cat], [data-add-funds], [data-delete-goal], [data-edit-tx], [data-save-edit-tx], [data-cancel-edit-tx], [data-select-saving-period], [data-save-saving], [data-delete-saving-plan], [data-delete-eng-activity]');
    if (!t) return;
    if (t.dataset.toggleHabit) { toggle(selectedDate, t.dataset.toggleHabit); }
    else if (t.dataset.selectDay) { selectDay(t.dataset.selectDay); }
    else if (t.dataset.toggleMonth) { const [ds, id] = t.dataset.toggleMonth.split('|'); toggle(ds, id); }
    else if (t.dataset.toggleEng) { toggleEng(engSelectedDate, t.dataset.toggleEng); }
    else if (t.dataset.selectEngDay) { selectEngDay(t.dataset.selectEngDay); }
    else if (t.dataset.deleteHabit) { deleteHabit(t.dataset.deleteHabit); }
    else if (t.dataset.deleteTx) { deleteTransaction(t.dataset.deleteTx); }
    else if (t.dataset.deleteCat) { const [type, name] = t.dataset.deleteCat.split('|'); deleteCategory(type, name); }
    else if (t.dataset.addFunds) {
      const row = t.closest('.goal-row');
      const input = row ? row.querySelector('[data-goal-input]') : null;
      if (input) { addFundsToGoal(t.dataset.addFunds, input.value); input.value = ''; }
    }
    else if (t.dataset.deleteGoal) { deleteGoal(t.dataset.deleteGoal); }
    else if (t.dataset.editTx) { startEditTx(t.dataset.editTx); }
    else if (t.dataset.saveEditTx) { saveEditTx(t.dataset.saveEditTx); }
    else if (t.dataset.cancelEditTx) { cancelEditTx(); }
    else if (t.dataset.selectSavingPeriod) { const [planId, key] = t.dataset.selectSavingPeriod.split('|'); selectSavingPeriod(planId, key); }
    else if (t.dataset.saveSaving) {
      const card = t.closest('.savings-plan-card');
      const input = card ? card.querySelector('[data-saving-amount-input]') : null;
      if (input) saveSavingAmount(t.dataset.saveSaving, input.value);
    }
    else if (t.dataset.deleteSavingPlan) { deleteSavingsPlan(t.dataset.deleteSavingPlan); }
    else if (t.dataset.deleteEngActivity) { deleteEngActivity(t.dataset.deleteEngActivity); }
  });

  document.body.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.renameHabit) renameHabit(t.dataset.renameHabit, t.value);
    else if (t.dataset.goalHabit) setHabitGoal(t.dataset.goalHabit, t.value);
    else if (t.dataset.engMinutes) setEngMinutes(engSelectedDate, t.dataset.engMinutes, t.value);
    else if (t.dataset.renameEngActivity) renameEngActivity(t.dataset.renameEngActivity, t.value);
    else if (t.dataset.engActivityMinutes) setEngActivityDefaultMinutes(t.dataset.engActivityMinutes, t.value);
  });
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function clearAuthError() {
  document.getElementById('auth-error').style.display = 'none';
}

async function handleSignIn() {
  clearAuthError();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showAuthError('Completá correo y contraseña.'); return; }
  document.getElementById('auth-status').textContent = 'Entrando...';
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  document.getElementById('auth-status').textContent = '';
  if (error) { showAuthError(error.message); return; }
  onAuthed(data.user);
}

async function handleSignUp() {
  clearAuthError();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showAuthError('Completá correo y contraseña.'); return; }
  if (password.length < 6) { showAuthError('La contraseña debe tener al menos 6 caracteres.'); return; }
  document.getElementById('auth-status').textContent = 'Creando cuenta...';
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  document.getElementById('auth-status').textContent = '';
  if (error) { showAuthError(error.message); return; }
  if (data.session) { onAuthed(data.user); }
  else { document.getElementById('auth-status').textContent = 'Revisá tu correo para confirmar la cuenta, luego iniciá sesión.'; }
}

async function handleSignOut() {
  await supabaseClient.auth.signOut();
  document.body.classList.remove('authed');
  document.getElementById('logout-btn').style.display = 'none';
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
}

function onAuthed(user) {
  currentUserId = user.id;
  S = supabaseStorage;
  document.body.classList.add('authed');
  document.getElementById('logout-btn').style.display = '';
  load();
}

async function bootstrap() {
  document.getElementById('logout-btn').addEventListener('click', handleSignOut);
  document.getElementById('auth-signin-btn').addEventListener('click', handleSignIn);
  document.getElementById('auth-signup-btn').addEventListener('click', handleSignUp);
  document.getElementById('auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleSignIn(); });

  if (window.storage && typeof window.storage.get === 'function') {
    // Corriendo dentro de Claude.ai: no hace falta login, se usa su storage propio.
    document.body.classList.add('authed');
    load();
    return;
  }

  supabaseClient = initSupabase();
  if (!supabaseClient) {
    showAuthError('No se pudo conectar con Supabase. Revisá supabase-config.js.');
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    onAuthed(session.user);
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      document.body.classList.remove('authed');
      document.getElementById('logout-btn').style.display = 'none';
    }
  });
}

wireStaticEvents();
bootstrap();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
