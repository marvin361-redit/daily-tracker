// Respaldo: exportar / importar todas las claves de la app como un JSON.
// Los valores se guardan tal cual están almacenados (strings), así restaurar
// devuelve exactamente lo mismo que se exportó.
const BACKUP_APP_ID = 'daily-tracker';
const BACKUP_VERSION = 1;
const BACKUP_MAX_BYTES = 10 * 1024 * 1024;

// Lista blanca: solo estas claves entran y salen del respaldo. En modo
// localStorage, S.list() devolvería también claves ajenas (sesión de
// Supabase, cola de reintentos), que no deben ir a un archivo.
const BACKUP_KEYS = [
  { key: 'habits', label: 'Hábitos' },
  { key: 'logs', label: 'Registro de hábitos (días)' },
  { key: 'notes', label: 'Notas del día' },
  { key: 'eng-activities', label: 'Actividades de inglés' },
  { key: 'eng-logs', label: 'Registro de inglés (días)' },
  { key: 'eng-base', label: 'Base de horas de inglés' },
  { key: 'eng-goal', label: 'Meta semanal de inglés' },
  { key: 'fin-tx', label: 'Transacciones' },
  { key: 'fin-cat-expense', label: 'Categorías de gasto' },
  { key: 'fin-cat-income', label: 'Categorías de ingreso' },
  { key: 'fin-goals', label: 'Metas de ahorro' },
  { key: 'fin-savings-plans', label: 'Planes de ahorro' },
  { key: 'fin-savings-log', label: 'Registro de ahorro' },
  { key: 'blocmarvin-subjects', label: 'Materias' },
  { key: 'blocmarvin-notes', label: 'Notas por materia' },
  { key: 'blocmarvin-tasks', label: 'Tareas por materia' },
  { key: 'schedule-blocks', label: 'Bloques del horario' },
  { key: 'schedule-done', label: 'Horario: días con checks' },
];

let backupPending = null;

// ¿La app tiene datos cargados en memoria para esta clave? Sirve para detectar
// una lectura que dice "no existe" cuando en realidad no pudo ver la fila
// (sesión de Supabase vencida: RLS devuelve 0 filas sin error).
const BACKUP_IN_MEMORY = {
  'habits': () => habits.length > 0,
  'logs': () => Object.keys(logs).length > 0,
  'notes': () => Object.keys(notes).length > 0,
  'eng-activities': () => engActivities.length > 0,
  'eng-logs': () => Object.keys(engLogs).length > 0,
  'eng-base': () => engBase !== DEFAULT_ENG_BASE,
  'eng-goal': () => engWeekGoal !== DEFAULT_ENG_GOAL,
  'fin-tx': () => finTx.length > 0,
  'fin-cat-expense': () => finCatExpense.length > 0,
  'fin-cat-income': () => finCatIncome.length > 0,
  'fin-goals': () => finGoals.length > 0,
  'fin-savings-plans': () => finSavingsPlans.length > 0,
  'fin-savings-log': () => Object.keys(finSavingsLog).length > 0,
  'blocmarvin-subjects': () => blocSubjects.length > 0,
  'blocmarvin-notes': () => Object.keys(blocNotes).length > 0,
  'blocmarvin-tasks': () => Object.keys(blocTasks).length > 0,
  'schedule-blocks': () => schedBlocks.length > 0,
  'schedule-done': () => Object.keys(schedDone).length > 0,
};

class BackupReadError extends Error {}

// Con Supabase, una sesión vencida no da error al leer: las consultas salen
// como anónimas y RLS devuelve 0 filas, igual que una clave que no existe.
// getUser() valida el token contra el servidor.
async function assertBackupSession() {
  if (S !== supabaseStorage) return;
  let user = null;
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    if (!error) user = data && data.user;
  } catch (e) { /* sin conexión: se trata igual que sesión inválida */ }
  if (!user || user.id !== currentUserId) {
    throw new BackupReadError('Tu sesión venció o no se pudo verificar. Cerrá sesión, volvé a entrar y exportá de nuevo. No se descargó nada.');
  }
}

// Lee todas las claves. Devuelve { data, empty }: data tiene las que existen,
// empty las que de verdad no existen. Si alguna lectura falla (red, error del
// servidor, o "no existe" para algo que la app tiene cargado), lanza
// BackupReadError con la lista: nunca devuelve un respaldo parcial.
// El valor en la cola de reintentos tiene prioridad (es el más nuevo). La cola
// se lee una vez y las lecturas van en paralelo.
async function collectBackupData() {
  await assertBackupSession();
  const queue = readSyncQueue();
  const results = await Promise.allSettled(BACKUP_KEYS.map(({ key }) =>
    Object.prototype.hasOwnProperty.call(queue, key) ? Promise.resolve(queue[key].value) : safeGet(key)));
  const data = {};
  const empty = [];
  const failed = [];
  BACKUP_KEYS.forEach(({ key }, i) => {
    const r = results[i];
    if (r.status === 'rejected') {
      console.error('Respaldo: no se pudo leer "' + key + '":', r.reason);
      failed.push(key);
    } else if (typeof r.value === 'string') {
      data[key] = r.value;
    } else if (r.value === null || r.value === undefined) {
      if (BACKUP_IN_MEMORY[key] && BACKUP_IN_MEMORY[key]()) {
        console.error('Respaldo: "' + key + '" no vino del storage pero la app lo tiene cargado.');
        failed.push(key);
      } else {
        empty.push(key);
      }
    } else {
      console.error('Respaldo: "' + key + '" tiene un valor que no es texto:', r.value);
      failed.push(key);
    }
  });
  if (failed.length) {
    throw new BackupReadError(`No se pudieron leer ${failed.length} de ${BACKUP_KEYS.length} claves: ${failed.join(', ')}. ` +
      'Revisá tu conexión o volvé a iniciar sesión. No se descargó nada para no darte un respaldo incompleto.');
  }
  return { data, empty };
}

function backupExportSummary(data, empty) {
  const keys = Object.keys(data);
  let text = `Exportadas ${keys.length} claves: ${keys.join(', ')}.`;
  if (empty.length) text += `\nVacías (no tenés datos guardados): ${empty.join(', ')}.`;
  return text;
}

function downloadBackupFile(data, prefix) {
  const payload = { app: BACKUP_APP_ID, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}-${fmt(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setBackupStatus(id, text, kind) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'sched-form-msg' + (kind ? ' ' + kind : '');
}

async function exportBackup() {
  const btn = document.getElementById('backup-export-btn');
  btn.disabled = true;
  setBackupStatus('backup-export-status', 'Preparando respaldo...', '');
  try {
    const { data, empty } = await collectBackupData();
    downloadBackupFile(data, 'daily-tracker-respaldo');
    setBackupStatus('backup-export-status', backupExportSummary(data, empty), 'ok');
  } catch (e) {
    console.error('Error exportando respaldo:', e);
    setBackupStatus('backup-export-status', e instanceof BackupReadError ? e.message
      : 'No se pudieron leer tus datos (revisá tu conexión). No se descargó nada para no darte un respaldo incompleto.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// Cuántos elementos tiene un valor, para el resumen.
function describeBackupValue(key, raw) {
  if (raw === null || raw === undefined) return '—';
  let v;
  try { v = JSON.parse(raw); } catch (e) { return '?'; }
  if (key === 'blocmarvin-tasks' && v && typeof v === 'object') {
    return String(Object.values(v).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0));
  }
  if (Array.isArray(v)) return String(v.length);
  if (v && typeof v === 'object') return String(Object.keys(v).length);
  return String(v);
}

// Devuelve { data, ignored } o lanza un Error con un mensaje para el usuario.
function parseBackupFile(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
  if (!obj || obj.app !== BACKUP_APP_ID || !obj.data || typeof obj.data !== 'object') {
    throw new Error('Este archivo no es un respaldo de Mi Daily Tracker.');
  }
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    throw new Error('El respaldo es de una versión más nueva de la app. Actualizá la app antes de importarlo.');
  }
  const known = new Set(BACKUP_KEYS.map(k => k.key));
  const data = {};
  const ignored = [];
  const invalid = [];
  Object.keys(obj.data).forEach(key => {
    if (!known.has(key)) { ignored.push(key); return; }
    const value = obj.data[key];
    if (typeof value !== 'string') { invalid.push(key); return; }
    try { JSON.parse(value); } catch (e) { invalid.push(key); return; }
    data[key] = value;
  });
  if (invalid.length) throw new Error('El respaldo tiene datos dañados en: ' + invalid.join(', ') + '. No se importó nada.');
  if (!Object.keys(data).length) throw new Error('El respaldo no tiene datos para importar.');
  return { data, ignored, exportedAt: obj.exportedAt };
}

async function onBackupFileChosen(input) {
  const file = input.files && input.files[0];
  input.value = '';
  cancelBackupImport();
  if (!file) return;
  if (file.size > BACKUP_MAX_BYTES) { setBackupStatus('backup-import-status', 'El archivo es demasiado grande para ser un respaldo.', 'error'); return; }

  let parsed;
  try {
    parsed = parseBackupFile(await file.text());
  } catch (e) {
    setBackupStatus('backup-import-status', e.message, 'error');
    return;
  }

  setBackupStatus('backup-import-status', 'Leyendo tus datos actuales para comparar...', '');
  let current;
  try {
    current = (await collectBackupData()).data;
  } catch (e) {
    setBackupStatus('backup-import-status', e instanceof BackupReadError ? e.message.replace('No se descargó nada para no darte un respaldo incompleto.', 'No se importó nada.')
      : 'No se pudieron leer tus datos actuales (revisá tu conexión). Probá de nuevo con conexión.', 'error');
    return;
  }
  setBackupStatus('backup-import-status', '', '');
  backupPending = { ...parsed, current, fileName: file.name };
  renderBackupSummary();
}

function renderBackupSummary() {
  const panel = document.getElementById('backup-summary');
  if (!backupPending) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  const { data, ignored, exportedAt, current, fileName } = backupPending;
  const when = exportedAt && !isNaN(new Date(exportedAt))
    ? new Date(exportedAt).toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'fecha desconocida';
  const rows = BACKUP_KEYS.filter(k => k.key in data).map(({ key, label }) => {
    const now = describeBackupValue(key, current[key]);
    const next = describeBackupValue(key, data[key]);
    return `<tr class="${now !== next ? 'changed' : ''}"><td class="hname">${esc(label)}</td><td>${esc(now)}</td><td>${esc(next)}</td></tr>`;
  }).join('');
  const untouched = BACKUP_KEYS.filter(k => !(k.key in data)).map(k => k.label);

  panel.innerHTML = `
    <div class="backup-summary-head">
      <strong>Resumen antes de importar</strong>
      <div class="sub" style="margin:4px 0 0;">${esc(fileName)} · exportado el ${esc(when)}</div>
    </div>
    <div class="scroll-x">
      <table class="backup-table">
        <thead><tr><th style="text-align:left;">Dato</th><th>Ahora</th><th>Archivo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="sub backup-note">Se reemplazan <strong>${Object.keys(data).length}</strong> grupos de datos por los del archivo.
      ${untouched.length ? 'No se tocan: ' + esc(untouched.join(', ')) + '.' : ''}
      ${ignored.length ? 'Se ignoran claves desconocidas: ' + esc(ignored.join(', ')) + '.' : ''}</div>
    <label class="backup-check"><input type="checkbox" id="backup-safety-copy" checked> Descargar antes un respaldo de mis datos actuales</label>
    <div class="sched-form-actions">
      <button class="danger backup-confirm-btn" id="backup-confirm-btn">Sobrescribir con este respaldo</button>
      <button class="ghost" id="backup-cancel-btn">Cancelar</button>
    </div>`;
  panel.style.display = '';
}

function cancelBackupImport() {
  backupPending = null;
  renderBackupSummary();
}

async function confirmBackupImport() {
  if (!backupPending) return;
  const { data, current } = backupPending;
  const n = Object.keys(data).length;
  if (!confirm(`Esto reemplaza ${n} grupos de datos por los del respaldo. No se puede deshacer. ¿Continuar?`)) return;

  const safety = document.getElementById('backup-safety-copy');
  if (safety && safety.checked) {
    // Releer justo ahora por si algo cambió desde que se eligió el archivo.
    let fresh = current;
    try { fresh = (await collectBackupData()).data; } catch (e) { /* sin conexión: usar la lectura previa (que fue completa) */ }
    downloadBackupFile(fresh, 'daily-tracker-antes-de-importar');
  }

  const btn = document.getElementById('backup-confirm-btn');
  if (btn) btn.disabled = true;
  setBackupStatus('backup-import-status', 'Importando...', '');
  for (const key of Object.keys(data)) {
    await guardedSave(key, () => data[key]);
  }
  backupPending = null;
  renderBackupSummary();

  const stillQueued = Object.keys(data).filter(k => k in readSyncQueue());
  await load();
  if (stillQueued.length) {
    setBackupStatus('backup-import-status', `Importado en este dispositivo. ${stillQueued.length} grupo(s) quedaron en la cola y se subirán cuando vuelva la conexión.`, 'warn');
  } else {
    setBackupStatus('backup-import-status', `Listo: se restauraron ${n} grupos de datos.`, 'ok');
  }
  showToast('Respaldo importado');
}
