const DOW = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function pad(n) { return String(n).padStart(2, '0'); }

// Id con prefijo + timestamp + sufijo aleatorio: con solo Date.now(), dos
// altas en el mismo milisegundo comparten id.
function uid(prefix) { return prefix + Date.now() + Math.random().toString(36).slice(2, 6); }

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function clampNonNegative(n, fallback) {
  const v = parseFloat(n);
  if (isNaN(v) || v < 0) return fallback !== undefined ? fallback : 0;
  return v;
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

// Lee un token de color de style.css (cambia con el tema claro/oscuro).
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Colores para Chart.js tomados de los tokens del tema actual.
function chartTheme() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    gridColor: cssVar('--separator'),
    textColor: cssVar('--label-2'),
    ink: cssVar('--label'),
    inkSoft: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    pos: cssVar('--pos'),
    neg: cssVar('--neg'),
  };
}

// Ícono de línea del sprite de index.html (hereda el color del texto).
function icon(name, cls) {
  return `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}
