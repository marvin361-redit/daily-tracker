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

async function guardedSave(key, serialize) {
  try {
    await S.set(key, serialize(), false);
    clearSyncError();
  } catch (e) {
    console.error('Error guardando "' + key + '":', e);
    showSyncError('No se pudo guardar. Revisá tu conexión — tus últimos cambios podrían no haberse sincronizado.');
  }
}
