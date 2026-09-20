let quickExpenseOpen = false;
let toastTimer = null;

function populateQuickExpenseCategories() {
  const sel = document.getElementById('quick-expense-category');
  if (!sel) return;
  const cats = finCatExpense.length ? finCatExpense : DEFAULT_EXPENSE_CATS;
  sel.innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

async function openQuickExpenseModal() {
  // El FAB queda visible apenas se agrega la clase .authed, pero loadData()
  // (que trae finCatExpense desde Supabase) sigue en curso en ese momento:
  // hay que esperarlo o el modal se abre con finCatExpense todavía vacío.
  if (dataLoadPromise) { try { await dataLoadPromise; } catch (e) {} }
  populateQuickExpenseCategories();
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
  const category = document.getElementById('quick-expense-category').value || 'Otros';
  finTx.push({ id: 't' + Date.now(), type: 'expense', amount: Math.abs(amount), category, date: fmt(new Date()), note: '' });
  saveFinTx();
  renderFinanzas();
  closeQuickExpenseModal();
  showToast('Gasto guardado ✓');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function maybeOpenQuickExpenseFromHash() {
  if (location.hash === '#quick-expense') {
    history.replaceState(null, '', location.pathname + location.search);
    openQuickExpenseModal();
  }
}
