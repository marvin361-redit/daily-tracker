async function load() {
  try {
    await loadData();
    clearSyncError();
  } catch (e) {
    console.error('Error cargando datos:', e);
    showSyncError('No se pudieron cargar tus datos (revisá tu conexión). Los cambios que hagas ahora podrían no reflejar tu historial real hasta reconectar.');
    return;
  }
  render();
}

async function loadData() {
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

function wireStaticEvents() {
  const navDrawer = document.getElementById('nav-drawer');
  const navOverlay = document.getElementById('nav-overlay');
  const viewTitle = document.getElementById('view-title');
  const openMenu = () => { navDrawer.classList.add('open'); navOverlay.classList.add('open'); };
  const closeMenu = () => { navDrawer.classList.remove('open'); navOverlay.classList.remove('open'); };
  document.getElementById('menu-btn').addEventListener('click', openMenu);
  document.getElementById('close-menu-btn').addEventListener('click', closeMenu);
  navOverlay.addEventListener('click', closeMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  document.querySelectorAll('.nav-item').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('view-' + t.dataset.view).classList.add('active');
      viewTitle.textContent = t.textContent;
      closeMenu();
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
    const t = e.target.closest('[data-toggle-habit], [data-select-day], [data-toggle-month], [data-toggle-eng], [data-select-eng-day], [data-delete-habit], [data-delete-tx], [data-delete-cat-type], [data-add-funds], [data-delete-goal], [data-edit-tx], [data-save-edit-tx], [data-cancel-edit-tx], [data-select-saving-period], [data-save-saving], [data-delete-saving-plan], [data-delete-eng-activity]');
    if (!t) return;
    if (t.dataset.toggleHabit) { toggle(selectedDate, t.dataset.toggleHabit); }
    else if (t.dataset.selectDay) { selectDay(t.dataset.selectDay); }
    else if (t.dataset.toggleMonth) { const [ds, id] = t.dataset.toggleMonth.split('|'); toggle(ds, id); }
    else if (t.dataset.toggleEng) { toggleEng(engSelectedDate, t.dataset.toggleEng); }
    else if (t.dataset.selectEngDay) { selectEngDay(t.dataset.selectEngDay); }
    else if (t.dataset.deleteHabit) { deleteHabit(t.dataset.deleteHabit); }
    else if (t.dataset.deleteTx) { deleteTransaction(t.dataset.deleteTx); }
    else if (t.dataset.deleteCatType) { deleteCategory(t.dataset.deleteCatType, t.dataset.deleteCatName); }
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
  clearSyncError();

  // Clear the previous user's data from memory so it can't be seen by
  // whoever signs in next on this device.
  currentUserId = null;
  S = localStorageShim;
  habits = []; logs = {};
  engActivities = []; engLogs = {};
  engBase = DEFAULT_ENG_BASE; engWeekGoal = DEFAULT_ENG_GOAL;
  notes = {};
  finTx = []; finCatExpense = []; finCatIncome = [];
  finGoals = []; finSavingsPlans = []; finSavingsLog = {}; savingsSelectedPeriod = {};
  finEditingId = null;
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  if (finChart) { finChart.destroy(); finChart = null; }
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
