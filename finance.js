const DEFAULT_EXPENSE_CATS = ['Comida', 'Transporte', 'Vivienda', 'Servicios', 'Salud', 'Entretenimiento', 'Otros'];
const DEFAULT_INCOME_CATS = ['Sueldo', 'Freelance', 'Regalo', 'Otros'];

let finTx = [];
let finCatExpense = [];
let finCatIncome = [];
let finGoals = [];
let finSavingsPlans = [];
let finSavingsLog = {};
let savingsSelectedPeriod = {};
let finEditingId = null;
let finChart = null;

async function saveFinTx() { await guardedSave('fin-tx', () => JSON.stringify(finTx)); }
async function saveFinCatExpense() { await guardedSave('fin-cat-expense', () => JSON.stringify(finCatExpense)); }
async function saveFinCatIncome() { await guardedSave('fin-cat-income', () => JSON.stringify(finCatIncome)); }
async function saveFinGoals() { await guardedSave('fin-goals', () => JSON.stringify(finGoals)); }
async function saveFinSavingsPlans() { await guardedSave('fin-savings-plans', () => JSON.stringify(finSavingsPlans)); }
async function saveFinSavingsLog() { await guardedSave('fin-savings-log', () => JSON.stringify(finSavingsLog)); }

function money(n) {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return 'Bs ' + v.toFixed(2);
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
  const t = finTx.find(x => x.id === id);
  if (!confirm(`¿Eliminar este movimiento${t ? ' de ' + money(t.amount) : ''}?`)) return;
  finTx = finTx.filter(t => t.id !== id);
  saveFinTx();
  renderFinanzas();
}

function populateFinCategorySelect() {
  const type = document.getElementById('fin-type').value;
  const cats = type === 'income' ? finCatIncome : finCatExpense;
  const sel = document.getElementById('fin-category');
  const prev = sel.value;
  sel.innerHTML = cats.length ? cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('') : '<option value="Otros">Otros</option>';
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
  const g = finGoals.find(x => x.id === id);
  if (!confirm(`¿Eliminar la meta "${g ? g.name : ''}"? Perderás el registro de lo ahorrado.`)) return;
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
        <span style="font-size:13px;">${esc(g.name)}</span>
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
        <select data-edit-category style="width:130px;">${cats.map(c => `<option value="${esc(c)}" ${c === t.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <input type="date" value="${t.date}" data-edit-date style="width:140px;">
        <input type="text" value="${esc(t.note || '')}" data-edit-note placeholder="Nota" style="flex:1;min-width:100px;">
        <button class="btn" data-save-edit-tx="${t.id}">Guardar</button>
        <button class="ghost" data-cancel-edit-tx="${t.id}">Cancelar</button>
      </div>`;
    }
    const sign = t.type === 'income' ? '+' : '-';
    const color = t.type === 'income' ? 'var(--green)' : 'var(--red)';
    return `<div class="fin-row">
      <span class="fin-date">${t.date.slice(5)}</span>
      <span class="fin-cat">${esc(t.category)}</span>
      <span class="fin-note">${esc(t.note || '')}</span>
      <span class="fin-amount" style="color:${color};">${sign}${money(t.amount)}</span>
      <button class="ghost" data-edit-tx="${t.id}" title="Editar">✎</button>
      <button class="danger" data-delete-tx="${t.id}">×</button>
    </div>`;
  }).join('') : '<div class="empty">Sin movimientos este mes.</div>';
}

function renderFinCategories() {
  document.getElementById('fin-cat-expense').innerHTML = finCatExpense.length
    ? finCatExpense.map(c => `<span class="cat-chip">${esc(c)}<button data-delete-cat-type="expense" data-delete-cat-name="${esc(c)}">×</button></span>`).join('')
    : '<div class="empty">Sin categorías.</div>';
  document.getElementById('fin-cat-income').innerHTML = finCatIncome.length
    ? finCatIncome.map(c => `<span class="cat-chip">${esc(c)}<button data-delete-cat-type="income" data-delete-cat-name="${esc(c)}">×</button></span>`).join('')
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
  const p = finSavingsPlans.find(x => x.id === id);
  if (!confirm(`¿Eliminar el plan "${p ? p.name : ''}" y todo su historial de aportes?`)) return;
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
        <strong style="font-size:13px;">${esc(plan.name)}</strong>
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
    if (pct >= 40) dynamicTips.push(`📊 "${esc(topCat)}" es tu categoría más grande este mes (${pct}% de tus gastos).`);
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
