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

// ---------- Tema (Sistema / Claro / Oscuro) ----------
// Preferencia por dispositivo en localStorage "ui-theme" (no se sincroniza
// ni entra en el respaldo). El script del <head> la aplica antes de pintar.
const THEME_KEY = 'ui-theme';
const THEME_COLORS = { light: '#F2F2F2', dark: '#000000' }; // = --bg de cada tema
const systemDarkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

let themePrefMem = null; // elección de esta sesión (por si localStorage no está disponible)

function getThemePref() {
  let p = themePrefMem;
  if (p === null) { try { p = localStorage.getItem(THEME_KEY); } catch (e) {} }
  return p === 'light' || p === 'dark' ? p : 'system';
}

function isDarkTheme() { return document.documentElement.getAttribute('data-theme') === 'dark'; }

function applyTheme() {
  const pref = getThemePref();
  const dark = pref === 'dark' || (pref === 'system' && !!systemDarkQuery && systemDarkQuery.matches);
  const root = document.documentElement;
  const changed = isDarkTheme() !== dark;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.setAttribute('data-theme-pref', pref);
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.content = THEME_COLORS[dark ? 'dark' : 'light'];
  document.dispatchEvent(new CustomEvent('themeprefapplied'));
  if (changed) document.dispatchEvent(new CustomEvent('themechange'));
}

function setThemePref(pref) {
  if (pref !== 'light' && pref !== 'dark') pref = 'system';
  themePrefMem = pref;
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch (e) {} // sin localStorage (p. ej. modo privado estricto): vale solo para esta sesión
  applyTheme();
}

// Colores para Chart.js tomados de los tokens del tema actual.
function chartTheme() {
  const dark = isDarkTheme();
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
