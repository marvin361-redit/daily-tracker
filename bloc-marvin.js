let blocSubjects = [];
let blocNotes = {};
let blocSelectedId = null;
let blocSaveTimer = null;
let blocIndicatorTimer = null;

async function saveBlocSubjects() { await guardedSave('blocmarvin-subjects', () => JSON.stringify(blocSubjects)); }
async function saveBlocNotes() { await guardedSave('blocmarvin-notes', () => JSON.stringify(blocNotes)); }

function addSubject() {
  const inp = document.getElementById('new-subject');
  const name = inp.value.trim();
  if (!name) return;
  const s = { id: 'sub' + Date.now(), name };
  blocSubjects.push(s);
  blocSelectedId = s.id;
  inp.value = '';
  saveBlocSubjects();
  renderBlocMarvin();
}

function renameSubject(id, name) {
  const s = blocSubjects.find(x => x.id === id);
  const trimmed = name.trim();
  if (s && trimmed) { s.name = trimmed; saveBlocSubjects(); renderBlocMarvin(); }
}

function deleteSubject(id) {
  const s = blocSubjects.find(x => x.id === id);
  if (!confirm(`¿Eliminar la materia "${s ? s.name : ''}"? Se borran también sus notas.`)) return;
  blocSubjects = blocSubjects.filter(x => x.id !== id);
  delete blocNotes[id];
  if (blocSelectedId === id) blocSelectedId = null;
  saveBlocSubjects();
  saveBlocNotes();
  renderBlocMarvin();
}

function selectSubject(id) {
  blocSelectedId = id;
  renderBlocMarvin();
}

function onBlocNoteInput(text) {
  if (!blocSelectedId) return;
  blocNotes[blocSelectedId] = text;
  const indicator = document.getElementById('bloc-save-indicator');
  if (indicator) indicator.classList.remove('show');
  clearTimeout(blocSaveTimer);
  blocSaveTimer = setTimeout(async () => {
    await saveBlocNotes();
    showBlocSaved();
  }, 900);
}

function showBlocSaved() {
  const indicator = document.getElementById('bloc-save-indicator');
  if (!indicator) return;
  indicator.textContent = 'Guardado';
  indicator.classList.add('show');
  clearTimeout(blocIndicatorTimer);
  blocIndicatorTimer = setTimeout(() => indicator.classList.remove('show'), 1500);
}

function renderBlocMarvin() {
  if (blocSelectedId && !blocSubjects.some(s => s.id === blocSelectedId)) blocSelectedId = null;
  if (!blocSelectedId && blocSubjects.length) blocSelectedId = blocSubjects[0].id;

  const list = document.getElementById('bloc-subject-list');
  list.innerHTML = blocSubjects.length ? blocSubjects.map(s => `
    <div class="habit-item bloc-subject-row ${s.id === blocSelectedId ? 'active-row' : ''}">
      <input type="text" value="${esc(s.name)}" data-rename-subject="${s.id}">
      <button class="ghost" data-select-subject="${s.id}">${s.id === blocSelectedId ? 'Abierta' : 'Abrir'}</button>
      <button class="danger" data-delete-subject="${s.id}">Eliminar</button>
    </div>`).join('') : '<div class="empty">No tenés materias todavía. Agregá la primera abajo.</div>';

  const header = document.getElementById('bloc-notes-header');
  const empty = document.getElementById('bloc-notes-empty');
  const textarea = document.getElementById('bloc-notes-textarea');
  if (!blocSelectedId) {
    header.style.display = 'none';
    empty.style.display = '';
    textarea.style.display = 'none';
  } else {
    const subj = blocSubjects.find(s => s.id === blocSelectedId);
    header.style.display = '';
    empty.style.display = 'none';
    textarea.style.display = '';
    document.getElementById('bloc-notes-title').textContent = subj ? subj.name : 'Notas';
    if (document.activeElement !== textarea) textarea.value = blocNotes[blocSelectedId] || '';
  }
}
