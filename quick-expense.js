let quickExpenseOpen = false;
let quickMoveType = 'expense'; // 'expense' | 'income'
let toastTimer = null;

// Movimiento rápido: el mismo modal sirve para gastos e ingresos.
// Los ids siguen siendo quick-expense-* para no romper el atajo #quick-expense.
function populateQuickExpenseCategories() {
  const sel = document.getElementById('quick-expense-category');
  if (!sel) return;
  const isIncome = quickMoveType === 'income';
  const own = isIncome ? finCatIncome : finCatExpense;
  const cats = own.length ? own : (isIncome ? DEFAULT_INCOME_CATS : DEFAULT_EXPENSE_CATS);
  sel.innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

function setQuickMoveType(type) {
  quickMoveType = type === 'income' ? 'income' : 'expense';
  document.querySelectorAll('#quick-move-type .seg-btn').forEach(b => {
    const on = b.dataset.quickType === quickMoveType;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  populateQuickExpenseCategories();
}

async function openQuickExpenseModal(type) {
  // El FAB queda visible apenas se agrega la clase .authed, pero loadData()
  // (que trae las categorías desde Supabase) sigue en curso en ese momento:
  // hay que esperarlo o el modal se abre con las categorías todavía vacías.
  if (dataLoadPromise) { try { await dataLoadPromise; } catch (e) {} }
  // Desde el FAB llega un evento, no un tipo: en ese caso se abre como gasto.
  setQuickMoveType(typeof type === 'string' ? type : 'expense');
  const amountInp = document.getElementById('quick-expense-amount');
  amountInp.value = '';
  amountInp.style.borderColor = '';
  document.getElementById('quick-expense-overlay').classList.add('open');
  document.getElementById('quick-expense-modal').classList.add('open');
  quickExpenseOpen = true;
  setTimeout(() => amountInp.focus(), 50);
}

function closeQuickExpenseModal() {
  if (!quickExpenseOpen) return;
  document.getElementById('quick-expense-overlay').classList.remove('open');
  document.getElementById('quick-expense-modal').classList.remove('open');
  quickExpenseOpen = false;
}

function saveQuickExpense() {
  const amountInp = document.getElementById('quick-expense-amount');
  const amount = parseFloat(amountInp.value);
  if (isNaN(amount) || amount <= 0) {
    amountInp.style.borderColor = 'var(--red)';
    setTimeout(() => { amountInp.style.borderColor = ''; }, 1200);
    return;
  }
  const type = quickMoveType;
  const category = document.getElementById('quick-expense-category').value || 'Otros';
  finTx.push({ id: 't' + Date.now(), type, amount: Math.abs(amount), category, date: fmt(new Date()), note: '' });
  saveFinTx();
  renderFinanzas();
  closeQuickExpenseModal();
  showToast(type === 'income' ? 'Ingreso guardado' : 'Gasto guardado');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = icon('check') + '<span>' + esc(msg) + '</span>';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// Atajos: #quick-expense abre como gasto, #quick-income como ingreso.
const QUICK_HASHES = { '#quick-expense': 'expense', '#quick-income': 'income' };
function maybeOpenQuickExpenseFromHash() {
  const type = QUICK_HASHES[location.hash];
  if (!type || !document.body.classList.contains('authed')) return;
  history.replaceState(null, '', location.pathname + location.search);
  openQuickExpenseModal(type);
}
