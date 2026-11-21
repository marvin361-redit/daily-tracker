// Reportes: gráficos de Finanzas, Hábitos, Inglés y Horario con filtro de período.
// Solo lee los datos ya cargados (finTx, logs, engLogs, schedBlocks, schedDone); no guarda nada.

const REPORT_PERIODS = {
  semana: { label: 'esta semana', bucket: 'day' },
  mes: { label: 'el último mes', bucket: 'week' },
  '3meses': { label: 'los últimos 3 meses', bucket: 'week' },
  anio: { label: 'el último año', bucket: 'month' },
};
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

let reportPeriod = 'mes';
let reportCharts = {};

function parseDs(ds) { return new Date(ds + 'T00:00:00'); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function mondayOf(d) { return addDays(d, -((d.getDay() + 6) % 7)); }
function shortDate(d) { return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; }

// Inicio del período (inclusive); el fin siempre es hoy.
function reportRangeStart(period, today) {
  if (period === 'semana') return mondayOf(today);
  if (period === 'mes') return addDays(today, -29);
  if (period === '3meses') return addDays(today, -90);
  return new Date(today.getFullYear(), today.getMonth() - 11, 1);
}

// Cortes del período: [{ label, start, end }] con fechas 'YYYY-MM-DD' inclusivas, sin pasar de hoy.
function reportBuckets(period, kind) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = reportRangeStart(period, today);
  const todayDs = fmt(today);
  const out = [];
  if (kind === 'day') {
    for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
      out.push({ label: `${DOW[d.getDay()]} ${d.getDate()}`, start: fmt(d), end: fmt(d) });
    }
  } else if (kind === 'week') {
    for (let d = mondayOf(start); d <= today; d = addDays(d, 7)) {
      const endD = addDays(d, 6);
      out.push({ label: shortDate(d), start: fmt(d), end: endD > today ? todayDs : fmt(endD) });
    }
  } else {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= today; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = MONTHS_SHORT[d.getMonth()] + (d.getMonth() === 0 ? ' ' + String(d.getFullYear()).slice(2) : '');
      out.push({ label, start: fmt(d), end: endD > today ? todayDs : fmt(endD) });
    }
  }
  return out;
}

function daysIn(bucket) {
  const arr = [];
  for (let d = parseDs(bucket.start), e = parseDs(bucket.end); d <= e; d = addDays(d, 1)) arr.push(d);
  return arr;
}

// ---------- Cálculos ----------

function finByBucket(buckets) {
  return buckets.map(b => {
    let inc = 0, exp = 0;
    finTx.forEach(t => {
      if (t.date < b.start || t.date > b.end) return;
      if (t.type === 'income') inc += t.amount; else exp += t.amount;
    });
    return { inc: round2(inc), exp: round2(exp) };
  });
}

function finBalanceAt(buckets) {
  // Balance real: incluye todo lo anterior al período.
  return buckets.map(b => round2(finTx.reduce((s, t) => t.date <= b.end ? s + (t.type === 'income' ? t.amount : -t.amount) : s, 0)));
}

function finExpenseByCategory(start, end) {
  const byCat = {};
  finTx.forEach(t => {
    if (t.type !== 'expense' || t.date < start || t.date > end) return;
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  return Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round2(v)]);
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function habitWeekPct(b) {
  if (!habits.length) return 0;
  const days = daysIn(b);
  return Math.round(days.reduce((s, d) => s + dayPct(fmt(d)), 0) / days.length);
}

function engWeekHours(b) {
  let mins = 0;
  daysIn(b).forEach(d => {
    const l = engLogs[fmt(d)];
    if (l) engActivities.forEach(a => { if (l[a.id] > 0) mins += l[a.id]; });
  });
  return Math.round((mins / 60) * 10) / 10;
}

// % de bloques cumplidos según el horario actual (los bloques borrados no cuentan).
function schedWeekPct(b) {
  let planned = 0, done = 0;
  daysIn(b).forEach(d => {
    const blocks = schedBlocks.filter(x => x.day === d.getDay());
    const marks = schedDone[fmt(d)] || {};
    planned += blocks.length;
    done += blocks.filter(x => marks[x.id]).length;
  });
  return planned ? Math.round((done / planned) * 100) : null;
}

// ---------- Render ----------

function destroyReportCharts() {
  Object.values(reportCharts).forEach(c => c.destroy());
  reportCharts = {};
}

function setReportPeriod(p) {
  if (!REPORT_PERIODS[p]) return;
  reportPeriod = p;
  renderReportes();
}

function reportEmpty(id, msg) {
  const wrap = document.getElementById(id + '-wrap');
  const empty = document.getElementById(id + '-empty');
  if (wrap) wrap.hidden = !!msg;
  if (empty) { empty.hidden = !msg; empty.textContent = msg || ''; }
  return !!msg;
}

function reportChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === 'undefined') return;
  reportCharts[id] = new Chart(canvas, config);
}

function baseScales(textColor, gridColor, yOpts = {}) {
  return {
    x: { ticks: { color: textColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false }, border: { display: false } },
    y: Object.assign({ beginAtZero: true, ticks: { color: textColor, maxTicksLimit: 5 }, grid: { color: gridColor }, border: { display: false } }, yOpts),
  };
}

function renderReportes() {
  const view = document.getElementById('view-reportes');
  if (!view) return;
  document.querySelectorAll('#report-period .seg-btn').forEach(b => {
    const on = b.dataset.period === reportPeriod;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  renderHabitHeatmap(); // es anual: no depende del filtro
  if (!view.classList.contains('active')) return; // Chart.js necesita la vista visible para medir
  destroyReportCharts();

  const period = REPORT_PERIODS[reportPeriod];
  const buckets = reportBuckets(reportPeriod, period.bucket);
  const weeks = reportBuckets(reportPeriod, 'week');
  const rangeStart = buckets[0].start, rangeEnd = buckets[buckets.length - 1].end;
  const { gridColor, textColor, ink, inkSoft, pos, neg } = chartTheme();
  const shortMoney = v => 'Bs ' + new Intl.NumberFormat('es-BO', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  const bucketWord = { day: 'día', week: 'semana', month: 'mes' }[period.bucket];
  document.getElementById('rep-fin-flow-title').textContent = `Ingresos vs gastos por ${bucketWord}`;
  document.getElementById('rep-fin-balance-title').textContent = `Balance acumulado por ${bucketWord}`;

  // Finanzas
  const txInRange = finTx.some(t => t.date >= rangeStart && t.date <= rangeEnd);
  const noFin = !finTx.length ? 'Todavía no registraste movimientos.' : (!txInRange ? `Sin movimientos en ${period.label}.` : '');
  if (!reportEmpty('rep-fin-flow', noFin)) {
    const flow = finByBucket(buckets);
    reportChart('rep-fin-flow', {
      type: 'bar',
      data: {
        labels: buckets.map(b => b.label),
        datasets: [
          { label: 'Ingresos', data: flow.map(f => f.inc), backgroundColor: pos, borderRadius: 4, maxBarThickness: 18 },
          { label: 'Gastos', data: flow.map(f => f.exp), backgroundColor: neg, borderRadius: 4, maxBarThickness: 18 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y)}` } },
        },
        scales: baseScales(textColor, gridColor, { ticks: { color: textColor, maxTicksLimit: 5, callback: shortMoney } }),
      },
    });
  }
  const cats = finExpenseByCategory(rangeStart, rangeEnd);
  if (!reportEmpty('rep-fin-cat', noFin || (!cats.length ? `Sin gastos en ${period.label}.` : ''))) {
    document.getElementById('rep-fin-cat-wrap').style.height = Math.max(120, cats.length * 36 + 32) + 'px';
    reportChart('rep-fin-cat', {
      type: 'bar',
      data: { labels: cats.map(c => c[0]), datasets: [{ label: 'Gasto', data: cats.map(c => c[1]), backgroundColor: neg, borderRadius: 4, maxBarThickness: 22 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => money(c.parsed.x) } } },
        scales: {
          x: { beginAtZero: true, ticks: { color: textColor, maxTicksLimit: 5, callback: shortMoney }, grid: { color: gridColor }, border: { display: false } },
          y: { ticks: { color: ink }, grid: { display: false }, border: { display: false } },
        },
      },
    });
  }
  if (!reportEmpty('rep-fin-balance', !finTx.length ? 'Todavía no registraste movimientos.' : '')) {
    const bal = finBalanceAt(buckets);
    const last = bal[bal.length - 1];
    reportChart('rep-fin-balance', {
      type: 'line',
      data: { labels: buckets.map(b => b.label), datasets: [{ label: 'Balance', data: bal, borderColor: last < 0 ? neg : pos, backgroundColor: 'transparent', borderWidth: 2, pointRadius: buckets.length > 16 ? 0 : 3, pointBackgroundColor: last < 0 ? neg : pos, tension: 0.3, cubicInterpolationMode: 'monotone' }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => money(c.parsed.y) } } },
        scales: baseScales(textColor, gridColor, { beginAtZero: false, ticks: { color: textColor, maxTicksLimit: 5, callback: shortMoney } }),
      },
    });
  }

  // Hábitos: cumplimiento semanal
  const weekLabel = b => b.label;
  const habPct = weeks.map(habitWeekPct);
  const noHab = !habits.length ? 'Agregá hábitos en "Editar hábitos" para ver tu cumplimiento.'
    : (!habPct.some(p => p > 0) ? `Sin hábitos cumplidos en ${period.label}.` : '');
  if (!reportEmpty('rep-hab-week', noHab)) {
    reportChart('rep-hab-week', {
      type: 'bar',
      data: { labels: weeks.map(weekLabel), datasets: [{ label: 'Cumplimiento', data: habPct, backgroundColor: ink, borderRadius: 4, maxBarThickness: 28 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => 'Semana del ' + c[0].label, label: c => c.parsed.y + '%' } } },
        scales: baseScales(textColor, gridColor, { max: 100, ticks: { color: textColor, maxTicksLimit: 5, callback: v => v + '%' } }),
      },
    });
  }

  // Inglés: horas por semana
  const engHours = weeks.map(engWeekHours);
  const noEng = !engActivities.length ? 'Agregá actividades de inglés para registrar horas.'
    : (!engHours.some(h => h > 0) ? `Sin horas de inglés en ${period.label}.` : '');
  if (!reportEmpty('rep-eng-week', noEng)) {
    reportChart('rep-eng-week', {
      type: 'bar',
      data: { labels: weeks.map(weekLabel), datasets: [{ label: 'Horas', data: engHours, backgroundColor: ink, borderRadius: 4, maxBarThickness: 28 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => 'Semana del ' + c[0].label, label: c => String(c.parsed.y).replace('.', ',') + ' h' } } },
        scales: baseScales(textColor, gridColor, { ticks: { color: textColor, maxTicksLimit: 5, callback: v => v + ' h' } }),
      },
    });
  }

  // Horario: % de bloques cumplidos por semana
  const schedPct = weeks.map(schedWeekPct);
  const noSched = !schedBlocks.length ? 'Armá tu horario en "Horario" para ver cuántos bloques cumplís.'
    : (!schedPct.some(p => p > 0) ? `Sin bloques marcados como hechos en ${period.label}.` : '');
  document.getElementById('rep-sched-note').hidden = !schedBlocks.length;
  if (!reportEmpty('rep-sched-week', noSched)) {
    reportChart('rep-sched-week', {
      type: 'bar',
      data: { labels: weeks.map(weekLabel), datasets: [{ label: 'Bloques cumplidos', data: schedPct.map(p => p ?? 0), backgroundColor: ink, borderRadius: 4, maxBarThickness: 28 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => 'Semana del ' + c[0].label, label: c => schedPct[c.dataIndex] === null ? 'Sin bloques planeados' : c.parsed.y + '%' } } },
        scales: baseScales(textColor, gridColor, { max: 100, ticks: { color: textColor, maxTicksLimit: 5, callback: v => v + '%' } }),
      },
    });
  }
}

// Mapa de calor anual tipo GitHub: 53 columnas (semanas, lunes arriba) hasta hoy.
function renderHabitHeatmap() {
  const el = document.getElementById('rep-heatmap');
  if (!el) return;
  if (reportEmpty('rep-heatmap', !habits.length ? 'Agregá hábitos para ver tu año de un vistazo.' : '')) { el.innerHTML = ''; return; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = addDays(mondayOf(today), -52 * 7);
  const cells = [], months = [];
  let lastMonth = -1;
  for (let w = 0; w < 53; w++) {
    const colStart = addDays(first, w * 7);
    // La primera columna solo lleva mes si arranca temprano en él (si no, pisa a la etiqueta siguiente).
    if (colStart.getMonth() !== lastMonth && !(w === 0 && colStart.getDate() > 14)) {
      months.push(`<span style="grid-column:${w + 1}">${MONTHS_SHORT[colStart.getMonth()]}</span>`);
      lastMonth = colStart.getMonth();
    } else if (w === 0) lastMonth = colStart.getMonth();
    for (let r = 0; r < 7; r++) {
      const d = addDays(colStart, r);
      if (d > today) { cells.push('<i class="hm-cell hm-future"></i>'); continue; }
      const p = dayPct(fmt(d));
      const lvl = p === 0 ? 0 : p < 25 ? 1 : p < 50 ? 2 : p < 100 ? 3 : 4;
      cells.push(`<i class="hm-cell" data-l="${lvl}" title="${shortDate(d)}: ${p}%"></i>`);
    }
  }
  el.innerHTML = `<div class="hm-months">${months.join('')}</div><div class="hm-grid" role="img" aria-label="Mapa de calor del cumplimiento diario de hábitos en el último año">${cells.join('')}</div>`;
  const scroller = document.getElementById('rep-heatmap-wrap');
  if (scroller) scroller.scrollLeft = scroller.scrollWidth; // lo más reciente a la vista
}
