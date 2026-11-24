// ---------- Racha con llama (vista Hoy) ----------
// Un día cuenta si se completó al menos el 75% de los hábitos (dayPct).
// Racha = días seguidos que cumplen contando hacia atrás desde ayer, más hoy
// si ya pasó el 75%. Hoy sin completar todavía no corta la racha.
// Se calcula de los logs: no hay ninguna clave nueva en Supabase. Lo único
// que se guarda es, en localStorage del dispositivo, la fecha del último
// encendido animado (para que pase una sola vez por día).

const STREAK_THRESHOLD = 75;
const STREAK_MILESTONES = [7, 30, 100, 365];
const STREAK_IGNITED_KEY = 'streak-ignited-date';
const STREAK_MAX_DAYS = 3660; // tope de seguridad del bucle hacia atrás

let streakIgnitedMem = null; // respaldo si localStorage no está disponible
let streakPendingIgnite = false;
let streakRenderedKey = '';
let streakTimers = [];
let streakRaf = 0;

function computeStreak() {
  const today = new Date();
  const d = new Date(today);
  d.setDate(d.getDate() - 1);
  let past = 0;
  while (past < STREAK_MAX_DAYS && dayPct(fmt(d)) >= STREAK_THRESHOLD) {
    past++;
    d.setDate(d.getDate() - 1);
  }
  const todayMet = habits.length > 0 && dayPct(fmt(today)) >= STREAK_THRESHOLD;
  return { past, todayMet, total: past + (todayMet ? 1 : 0) };
}

function streakIgnitedToday() {
  const today = fmt(new Date());
  if (streakIgnitedMem === today) return true;
  try { return localStorage.getItem(STREAK_IGNITED_KEY) === today; } catch (e) { return false; }
}

function markStreakIgnited() {
  const today = fmt(new Date());
  streakIgnitedMem = today;
  try { localStorage.setItem(STREAK_IGNITED_KEY, today); } catch (e) {}
}

// Lo llama toggle() con el % de hoy antes y después del cambio.
function streakOnToggle(beforePct, afterPct) {
  if (beforePct >= STREAK_THRESHOLD || afterPct < STREAK_THRESHOLD) return;
  if (streakIgnitedToday()) return;
  markStreakIgnited();
  const view = document.getElementById('view-hoy');
  if (view && view.classList.contains('active')) streakPendingIgnite = true;
}

function streakReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function streakDays(n) { return `${n} ${n === 1 ? 'día' : 'días'}`; }

function streakFlameSvg(burstCount) {
  // Chispas del encendido: ángulos repartidos hacia arriba, distancia variable.
  let burst = '';
  for (let i = 0; i < burstCount; i++) {
    const a = (-160 + (140 * i) / Math.max(1, burstCount - 1)) * Math.PI / 180;
    const dist = 18 + ((i * 37) % 17) + (burstCount > 8 ? 10 : 0);
    const dx = (Math.cos(a) * dist).toFixed(1);
    const dy = (Math.sin(a) * dist - 6).toFixed(1);
    const delay = 480 + ((i * 53) % 160);
    burst += `<circle class="sk-burst" cx="30" cy="40" r="${i % 3 === 0 ? 1.8 : 1.3}" style="--dx:${dx}px;--dy:${dy}px;--d:${delay}ms"/>`;
  }
  return `<svg class="streak-flame" viewBox="0 0 60 80" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="sk-g-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#FF9F2E" stop-opacity=".55"/>
        <stop offset=".55" stop-color="#FF8A1F" stop-opacity=".18"/>
        <stop offset="1" stop-color="#FF8A1F" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="sk-g-flash" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#FFFBEA" stop-opacity="1"/>
        <stop offset=".4" stop-color="#FFD36B" stop-opacity=".7"/>
        <stop offset="1" stop-color="#FFB13B" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="sk-g-outer" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFB13B"/>
        <stop offset=".55" stop-color="#FF7A1A"/>
        <stop offset="1" stop-color="#EE4F17"/>
      </linearGradient>
      <linearGradient id="sk-g-mid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFD25C"/>
        <stop offset="1" stop-color="#FF9A2E"/>
      </linearGradient>
      <linearGradient id="sk-g-core" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFF8E1"/>
        <stop offset="1" stop-color="#FFE08A"/>
      </linearGradient>
    </defs>
    <circle class="sk-glow" cx="30" cy="42" r="30" fill="url(#sk-g-glow)"/>
    <path class="sk-smoke" d="M31 54 C27 48 35 44 31 38 C28 33 33 29 31 23" fill="none" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse class="sk-base" cx="30" cy="73" rx="11" ry="3.5"/>
    <path class="sk-wick" d="M30 72 C30 66 29 62 31 58" fill="none" stroke-width="3" stroke-linecap="round"/>
    <circle class="sk-ember" cx="31" cy="57.5" r="2.2"/>
    <g class="sk-flame">
      <path class="sk-l sk-outer" fill="url(#sk-g-outer)" d="M30 4 C34 16 47 26 47 42 C47 53.5 39.4 62 30 62 C20.6 62 13 53.5 13 42 C13 33 18 27 21 20 C22 26 25 29 27 29 C26 20 27 12 30 4 Z"/>
      <path class="sk-l sk-mid" fill="url(#sk-g-mid)" d="M30 18 C33 27 41 33 41 45 C41 53 36 59 30 59 C24 59 19 53 19 45 C19 38 23 34 25 29 C26 33 28 35 29 35 C28.5 29 28.5 24 30 18 Z"/>
      <path class="sk-l sk-core" fill="url(#sk-g-core)" d="M30 34 C32 39 36 43 36 49 C36 54 33.5 57 30 57 C26.5 57 24 54 24 49 C24 44 28 40 30 34 Z"/>
    </g>
    <circle class="sk-spark sk-s1" cx="25" cy="22" r="1.3"/>
    <circle class="sk-spark sk-s2" cx="35" cy="18" r="1.1"/>
    <circle class="sk-spark sk-s3" cx="30" cy="12" r="1.4"/>
    <circle class="sk-flash" cx="30" cy="40" r="26" fill="url(#sk-g-flash)"/>
    <circle class="sk-spark0" cx="31" cy="57" r="3"/>
    ${burst}
  </svg>`;
}

function clearStreakAnim() {
  streakTimers.forEach(clearTimeout);
  streakTimers = [];
  if (streakRaf) cancelAnimationFrame(streakRaf);
  streakRaf = 0;
}

function animateStreakCount(el, to, delay, duration) {
  const from = Math.max(0, to - 30); // con rachas largas, contar solo el último tramo
  el.textContent = from;
  streakTimers.push(setTimeout(() => {
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (t < 1) streakRaf = requestAnimationFrame(step);
      else streakRaf = 0;
    };
    streakRaf = requestAnimationFrame(step);
  }, delay));
}

function renderStreak() {
  const card = document.getElementById('streak-card');
  if (!card) return;
  const { total, todayMet } = computeStreak();
  const ignite = streakPendingIgnite && todayMet;
  streakPendingIgnite = false;
  const milestone = todayMet && STREAK_MILESTONES.includes(total);
  const key = `${todayMet ? 1 : 0}|${total}`;
  if (!ignite && key === streakRenderedKey) return; // no cortar animaciones en curso
  streakRenderedKey = key;
  clearStreakAnim();

  const reduce = streakReducedMotion();
  const burstCount = ignite && !reduce ? (milestone ? 16 : 7) : 0;
  let body;
  if (todayMet) {
    body = `<div class="streak-count"><span class="streak-num">${total}</span><span class="streak-unit">${total === 1 ? 'día' : 'días'}</span></div>
      <div class="streak-sub">Racha encendida · hoy al ${dayPct(fmt(new Date()))}%</div>
      ${milestone ? `<div class="streak-chip">${total} días seguidos</div>` : ''}`;
  } else if (total === 0) {
    body = `<p class="streak-msg"><strong>Empezá tu racha hoy</strong></p>
      <div class="streak-sub">Completá el ${STREAK_THRESHOLD}% de tus hábitos</div>`;
  } else {
    body = `<p class="streak-msg"><strong>Racha de ${streakDays(total)}</strong> · completá el ${STREAK_THRESHOLD}% para mantenerla</p>`;
  }

  card.className = 'card streak' + (todayMet ? ' is-lit' : '') + (ignite && !reduce ? ' igniting' : '') + (milestone && ignite && !reduce ? ' is-milestone' : '');
  card.innerHTML = `${streakFlameSvg(burstCount)}<div class="streak-body" aria-live="polite">${body}</div>`;

  if (ignite && !reduce) {
    const num = card.querySelector('.streak-num');
    if (num) animateStreakCount(num, total, 420, 760);
    streakTimers.push(setTimeout(() => card.classList.remove('igniting', 'is-milestone'), milestone ? 1800 : 1400));
  }
}
