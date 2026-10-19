let blocSubjects = [];
let blocNotes = {};
let blocTasks = {};
let blocSelectedId = null;
let blocSaveTimer = null;
let blocIndicatorTimer = null;

async function saveBlocSubjects() { await guardedSave('blocmarvin-subjects', () => JSON.stringify(blocSubjects)); }
async function saveBlocNotes() { await guardedSave('blocmarvin-notes', () => JSON.stringify(blocNotes)); }
async function saveBlocTasks() { await guardedSave('blocmarvin-tasks', () => JSON.stringify(blocTasks)); }

function addSubject() {
  const inp = document.getElementById('new-subject');
  const name = inp.value.trim();
  if (!name) return;
  const s = { id: uid('sub'), name };
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
  if (!confirm(`¿Eliminar la materia "${s ? s.name : ''}"? Se borran también sus notas y tareas.`)) return;
  blocSubjects = blocSubjects.filter(x => x.id !== id);
  delete blocNotes[id];
  delete blocTasks[id];
  if (blocSelectedId === id) blocSelectedId = null;
  saveBlocSubjects();
  saveBlocNotes();
  saveBlocTasks();
  renderBlocMarvin();
}

function selectSubject(id) {
  blocSelectedId = id;
  renderBlocMarvin();
}

function addTask() {
  const inp = document.getElementById('new-task');
  const text = inp.value.trim();
  if (!text || !blocSelectedId) return;
  const task = { id: uid('task'), text, done: false, createdAt: Date.now() };
  (blocTasks[blocSelectedId] = blocTasks[blocSelectedId] || []).push(task);
  inp.value = '';
  saveBlocTasks();
  renderBlocMarvin();
}

function toggleTask(id) {
  const task = (blocTasks[blocSelectedId] || []).find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  saveBlocTasks();
  renderBlocMarvin();
}

function deleteTask(id) {
  if (!blocTasks[blocSelectedId]) return;
  blocTasks[blocSelectedId] = blocTasks[blocSelectedId].filter(t => t.id !== id);
  saveBlocTasks();
  renderBlocMarvin();
}

function pendingTaskCount(subjectId) {
  return (blocTasks[subjectId] || []).filter(t => !t.done).length;
}

function renderBlocTasks() {
  const card = document.getElementById('bloc-tasks-card');
  if (!blocSelectedId) { card.style.display = 'none'; return; }
  card.style.display = '';

  const tasks = blocTasks[blocSelectedId] || [];
  const doneCount = tasks.filter(t => t.done).length;
  document.getElementById('bloc-tasks-count').textContent = tasks.length ? `${doneCount}/${tasks.length} hechas` : '';

  // Pendientes arriba, terminadas al final; dentro de cada grupo, por orden de creación.
  const sorted = [...tasks].sort((a, b) => (a.done - b.done) || (a.createdAt - b.createdAt));
  document.getElementById('bloc-task-list').innerHTML = sorted.length ? sorted.map(t => `
    <div class="habit-item bloc-task-item ${t.done ? 'done' : ''}">
      <div class="chk ${t.done ? 'on' : ''}" data-toggle-task="${t.id}" role="checkbox" tabindex="0" aria-checked="${t.done}" aria-label="${esc(t.text)}"></div>
      <span class="bloc-task-text">${esc(t.text)}</span>
      <button class="danger" data-delete-task="${t.id}">Eliminar</button>
    </div>`).join('') : '<div class="empty">Esta materia no tiene tareas todavía.</div>';
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
  list.innerHTML = blocSubjects.length ? blocSubjects.map(s => {
    const pending = pendingTaskCount(s.id);
    return `
    <div class="habit-item bloc-subject-row ${s.id === blocSelectedId ? 'active-row' : ''}">
      <input type="text" value="${esc(s.name)}" data-rename-subject="${s.id}" aria-label="Nombre de la materia">
      ${pending ? `<span class="pill">${pending} pendiente${pending === 1 ? '' : 's'}</span>` : ''}
      <button class="ghost" data-select-subject="${s.id}">${s.id === blocSelectedId ? 'Abierta' : 'Abrir'}</button>
      <button class="danger" data-delete-subject="${s.id}">Eliminar</button>
    </div>`;
  }).join('') : '<div class="empty">No tenés materias todavía. Agregá la primera abajo.</div>';

  renderBlocTasks();

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
