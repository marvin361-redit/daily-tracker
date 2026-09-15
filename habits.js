let habits = [];
let logs = {};
let notes = {};
let selectedDate = fmt(new Date());
let monthCursor = new Date();
let trendChart = null;

function defaultHabits() {
  return [
    { id: 'h1', name: 'Despertar a las 05:00', goal: 7 },
    { id: 'h2', name: 'Gimnasio', goal: 5 },
    { id: 'h3', name: 'Lectura / Aprendizaje', goal: 7 },
    { id: 'h4', name: 'Planificar el día', goal: 7 },
    { id: 'h5', name: 'Control de gastos', goal: 7 },
  ];
}

async function saveHabits() { await guardedSave('habits', () => JSON.stringify(habits)); }
async function saveLogs() { await guardedSave('logs', () => JSON.stringify(logs)); }
async function saveNotes() { await guardedSave('notes', () => JSON.stringify(notes)); }

function toggle(date, habitId) {
  logs[date] = logs[date] || {};
  logs[date][habitId] = !logs[date][habitId];
  saveLogs();
  render();
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
  const h = habits.find(x => x.id === id);
  if (!confirm(`¿Eliminar el hábito "${h ? h.name : ''}"? Se borra también todo su historial marcado.`)) return;
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
        <span>${esc(h.name)}</span>
      </div>`;
    }).join('');
  }

  const wr = document.getElementById('week-days');
  const days = getWeekDates(d).map(ds => new Date(ds + 'T00:00:00'));
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
        <span style="font-size:13px;">${esc(h.name)}</span>
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

  const todayStr = fmt(new Date());
  let totalDone = 0, totalPossible = 0;
  let html = '<tr><th style="text-align:left;">Hábito</th>' + dates.map(ds => `<th>${+ds.slice(-2)}</th>`).join('') + '</tr>';
  habits.forEach(h => {
    html += `<tr><td class="hname">${esc(h.name)}</td>` + dates.map(ds => {
      const on = (logs[ds] || {})[h.id];
      if (ds <= todayStr) {
        if (on) totalDone++;
        totalPossible++;
      }
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
  if (!logs[fmt(d)]) d.setDate(d.getDate() - 1); // hoy sin ninguna marca todavía: no cuenta como racha rota
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
      <span style="width:150px;font-size:12px;flex-shrink:0;">${esc(s.name)}</span>
      <div class="barwrap"><div class="bar" style="width:${s.pct}%"></div></div>
      <span style="width:36px;text-align:right;font-size:12px;color:var(--muted);">${s.pct}%</span>
    </div>`).join('') : '<div class="empty">Aún no hay datos suficientes.</div>';

  document.getElementById('an-rank').innerHTML = stats.slice(0, 5).map((s, i) => `
    <div class="rank"><span class="n">${i + 1}</span><span style="flex:1;">${esc(s.name)}</span><span style="color:var(--accent);font-weight:600;">${s.pct}%</span></div>`
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
      <input type="text" value="${esc(h.name)}" data-rename-habit="${h.id}">
      <input type="number" min="1" max="7" value="${h.goal || 7}" title="Meta semanal (días)" data-goal-habit="${h.id}">
      <button class="danger" data-delete-habit="${h.id}">Eliminar</button>
    </div>`).join('') : '<div class="empty">No tenés hábitos todavía. Agregá uno abajo.</div>';
}
