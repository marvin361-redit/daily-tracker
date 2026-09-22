class NotFoundError extends Error {}

const localStorageShim = {
  async get(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) throw new NotFoundError('Key not found: ' + key);
    return { key, value: raw, shared: false };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value, shared: false };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { key, deleted: true, shared: false };
  },
  async list(prefix) {
    const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};

let supabaseClient = null;
let currentUserId = null;

function initSupabase() {
  if (typeof supabase === 'undefined' || typeof SUPABASE_URL === 'undefined') return null;
  return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const supabaseStorage = {
  async get(key) {
    const { data, error } = await supabaseClient.from('kv_store').select('value').eq('key', key).eq('user_id', currentUserId).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundError('Key not found: ' + key);
    return { key, value: data.value, shared: false };
  },
  async set(key, value) {
    const { error } = await supabaseClient.from('kv_store')
      .upsert({ key, value, user_id: currentUserId, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (error) throw error;
    return { key, value, shared: false };
  },
  async delete(key) {
    await supabaseClient.from('kv_store').delete().eq('key', key).eq('user_id', currentUserId);
    return { key, deleted: true, shared: false };
  },
  async list(prefix) {
    let q = supabaseClient.from('kv_store').select('key').eq('user_id', currentUserId);
    if (prefix) q = q.like('key', prefix + '%');
    const { data } = await q;
    return { keys: (data || []).map(r => r.key), prefix, shared: false };
  },
};

let S = (window.storage && typeof window.storage.get === 'function') ? window.storage : localStorageShim;

async function safeGet(key) {
  try {
    const r = await S.get(key, false);
    return r ? r.value : null;
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    // Real error (network, RLS, etc.) — rethrow so the caller does not
    // mistake "couldn't reach the server" for "there is no data yet".
    throw e;
  }
}

function showSyncError(msg) {
  const el = document.getElementById('sync-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function clearSyncError() {
  const el = document.getElementById('sync-error');
  if (el) el.style.display = 'none';
}

// Cola de guardados fallidos, persistida directamente en localStorage (no vía
// S) para que sobreviva aunque S sea supabaseStorage y esté inalcanzable.
// Shape: { [key]: { value, ts } } — un objeto en vez de un array hace que
// reintentos repetidos del mismo key (ej. editar el mismo hábito varias
// veces offline) se queden solos con el último valor, sin acumular versiones
// intermedias.
const SYNC_QUEUE_KEY = '__sync_queue__';
let flushInProgress = false;

function readSyncQueue() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function writeSyncQueue(q) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q));
}

function enqueueFailedSave(key, value) {
  const q = readSyncQueue();
  q[key] = { value, ts: Date.now() };
  writeSyncQueue(q);
}

function dequeueSave(key) {
  const q = readSyncQueue();
  if (key in q) {
    delete q[key];
    writeSyncQueue(q);
  }
}

function updateSyncBanner() {
  const n = Object.keys(readSyncQueue()).length;
  if (n === 0) {
    clearSyncError();
  } else {
    const plural = n === 1 ? '' : 's';
    const verb = n === 1 ? 'subirá' : 'subirán';
    showSyncError(`Tenés ${n} cambio${plural} sin sincronizar. Se ${verb} solo${plural} cuando vuelva la conexión.`);
  }
}

async function guardedSave(key, serialize) {
  const value = serialize();
  try {
    await S.set(key, value, false);
    dequeueSave(key);
  } catch (e) {
    console.error('Error guardando "' + key + '":', e);
    enqueueFailedSave(key, value);
  }
  updateSyncBanner();
  if (navigator.onLine) flushSyncQueue();
}

async function flushSyncQueue() {
  if (flushInProgress || !navigator.onLine) return;
  flushInProgress = true;
  try {
    const q = readSyncQueue();
    for (const key of Object.keys(q)) {
      try {
        await S.set(key, q[key].value, false);
        dequeueSave(key);
        updateSyncBanner();
      } catch (e) {
        // Probablemente seguimos sin conexión real: no tiene sentido
        // machacar el resto de la cola ahora, esperamos el próximo trigger
        // ('online', o el próximo guardado).
        break;
      }
    }
  } finally {
    flushInProgress = false;
  }
}

window.addEventListener('online', () => { flushSyncQueue(); });

updateSyncBanner();
if (navigator.onLine) flushSyncQueue();
