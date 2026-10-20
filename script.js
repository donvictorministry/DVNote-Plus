/**
 * DV-NOTE PLUS - CORE CRYPTOGRAPHIC & BIDIRECTIONAL API ENGINE
 * Uses Web Crypto API: PBKDF2 (SHA-256) + AES-GCM (256-bit)
 * Storage Contract: 'dv_vault' (encrypted array), 'dv_check' (key-check record),
 * 'theme' ('light' | 'dark'), 'dv_fontsize' ('19'-'23')
 */

// Replace with your real Gmail address before release
const CONTACT_EMAIL = 'contact@dvnoteplus.app';

// Optional postMessage allowlist, e.g. ['https://example.com']. Empty = any origin may call.
const ALLOWED_ORIGINS = [];

const KEY_CHECK_TEXT = 'DV-NOTE-PLUS-KEY-CHECK';

// 1. Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

// 2. Cryptographic Subsystem (AES-GCM 256-Bit)
let activeMasterKey = '';
let decryptedNotes = []; // In-memory plaintext only when unlocked

async function deriveKey(passphrase, saltBuffer) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function encryptData(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt)
  };
}

async function decryptData(encryptedObj, passphrase) {
  const salt = new Uint8Array(base64ToBuffer(encryptedObj.salt));
  const iv = new Uint8Array(base64ToBuffer(encryptedObj.iv));
  const ciphertext = base64ToBuffer(encryptedObj.ciphertext);
  const key = await deriveKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

// 2b. Center-Screen Spinner (shown whenever the API is triggered)
const spinnerOverlay = document.getElementById('spinnerOverlay');
let spinnerCount = 0;

function showSpinner() {
  spinnerCount++;
  spinnerOverlay.classList.add('active');
}

function hideSpinner() {
  spinnerCount = Math.max(0, spinnerCount - 1);
  if (spinnerCount === 0) spinnerOverlay.classList.remove('active');
}

async function withSpinner(task) {
  showSpinner();
  const started = Date.now();
  try {
    return await task();
  } finally {
    const wait = Math.max(0, 400 - (Date.now() - started));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    hideSpinner();
  }
}

// 3. Two-Way Client-Side API Dispatcher
// Mode 1: window.postMessage   Mode 2: URL parameters   Mode 3: in-app tester
class ApiError extends Error {}

function isEncryptedObj(o) {
  return !!o && typeof o === 'object' &&
    typeof o.ciphertext === 'string' && typeof o.iv === 'string' && typeof o.salt === 'string';
}

// Shared engine for all modes. The unlocked vault key is NEVER used here.
async function runApi(action, input) {
  if (action === 'ping') {
    return { status: 'DV-NOTE plus Cryptographic API Ready', version: '1.0' };
  }
  if (action !== 'encrypt' && action !== 'decrypt') {
    throw new ApiError('Unknown action. Use encrypt, decrypt or ping.');
  }
  if (typeof input.key !== 'string' || !input.key) {
    throw new ApiError('A passphrase key is required.');
  }
  if (action === 'encrypt') {
    if (typeof input.payload !== 'string') throw new ApiError('Payload must be a text string.');
    return encryptData(input.payload, input.key);
  }
  if (!isEncryptedObj(input.payload)) {
    throw new ApiError('Payload must contain ciphertext, iv and salt.');
  }
  return decryptData(input.payload, input.key);
}

// Mode 1: postMessage
window.addEventListener('message', async (e) => {
  const data = e.data;
  if (!e.source || !data || typeof data !== 'object' || typeof data.action !== 'string') return;
  if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(e.origin)) return;

  const target = e.origin && e.origin !== 'null' ? e.origin : '*';
  const reply = (body) => {
    if (data.requestId !== undefined) body.requestId = data.requestId;
    e.source.postMessage(body, target);
  };

  try {
    const result = await withSpinner(() => runApi(data.action, { payload: data.payload, key: data.key }));
    if (data.action === 'ping') {
      reply({ success: true, action: 'ping', ...result });
    } else {
      reply({ success: true, action: data.action, response: result });
    }
  } catch (err) {
    reply({
      success: false,
      action: data.action,
      error: err instanceof ApiError ? err.message : 'Cryptographic operation failed'
    });
  }
});

// Mode 2: URL parameters (the #fragment is preferred; it never reaches a server)
function readUrlApiParams() {
  const merged = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.includes('=')) {
    new URLSearchParams(hash).forEach((v, k) => merged.set(k, v));
  }
  return merged;
}

function parseApiPayload(raw) {
  if (!raw) throw new ApiError('Missing payload parameter.');
  try { return JSON.parse(raw); } catch (_) {}
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch (_) {}
  throw new ApiError('Payload must be JSON or base64url-encoded JSON.');
}

async function handleUrlApi() {
  const p = readUrlApiParams();
  const action = (p.get('api') || '').toLowerCase();
  if (!action) return;

  // Remove passphrase and text from the address bar and history immediately
  history.replaceState(null, '', window.location.pathname);

  let response;
  try {
    let payload;
    if (action === 'encrypt') {
      if (!p.has('text')) throw new ApiError('Missing text parameter.');
      payload = p.get('text');
    } else if (action === 'decrypt') {
      payload = parseApiPayload(p.get('payload'));
    }
    const result = await withSpinner(() => runApi(action, { payload, key: p.get('key') }));
    response = action === 'ping'
      ? { success: true, action, ...result }
      : { success: true, action, response: result };
  } catch (err) {
    response = {
      success: false,
      action,
      error: err instanceof ApiError ? err.message : 'Cryptographic operation failed'
    };
  }

  // Optional return trip: result is sent back in the #fragment of an https callback
  const cb = p.get('callback');
  if (cb && /^https:\/\//i.test(cb)) {
    try {
      const u = new URL(cb);
      u.hash = 'result=' + encodeURIComponent(JSON.stringify(response));
      window.location.replace(u.toString());
      return;
    } catch (_) {}
  }

  apiTestOutput.value = JSON.stringify(response, null, 2);
  apiModal.classList.add('active');
  showToast(response.success ? 'API request completed.' : 'API request failed.', response.success ? 'success' : 'danger');
}

// 4. Non-Blocking Toast Notification Engine
const toastContainer = document.getElementById('toastContainer');
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const span = document.createElement('span');
  span.textContent = message;

  const btn = document.createElement('button');
  btn.textContent = '✕';
  btn.setAttribute('aria-label', 'Dismiss');
  btn.style.cssText = 'border:none;background:transparent;color:inherit;font-weight:bold;cursor:pointer;font-size:var(--font-size);';
  btn.addEventListener('click', () => toast.remove());

  toast.appendChild(span);
  toast.appendChild(btn);
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// 5. Drawers, Overlay & Modals
const leftMenuBtn = document.getElementById('leftMenuBtn');
const rightMenuBtn = document.getElementById('rightMenuBtn');
const leftSidebar = document.getElementById('leftSidebar');
const rightSidebar = document.getElementById('rightSidebar');
const drawerOverlay = document.getElementById('drawerOverlay');

function forceCloseDrawers() {
  leftSidebar.classList.remove('open');
  rightSidebar.classList.remove('open');
  drawerOverlay.classList.remove('active');
}

// Never tears the sidebar down while a modal is open on top of it
function closeDrawers() {
  Promise.resolve().then(() => {
    if (document.querySelector('.fullscreen-modal.active')) return;
    forceCloseDrawers();
  });
}

leftMenuBtn.addEventListener('click', () => {
  leftSidebar.classList.add('open');
  drawerOverlay.classList.add('active');
});

rightMenuBtn.addEventListener('click', () => {
  rightSidebar.classList.add('open');
  drawerOverlay.classList.add('active');
});

drawerOverlay.addEventListener('click', closeDrawers);
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closeDrawers));

// 7 Modals (open on top of the sidebar; closing returns to the sidebar)
document.querySelectorAll('.nav-link-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const modal = document.getElementById(btn.getAttribute('data-modal'));
    if (modal) modal.classList.add('active');
  });
});

document.querySelectorAll('.close-modal-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const modal = btn.closest('.fullscreen-modal');
    if (modal) modal.classList.remove('active');
  });
});

// Developer Bio 6-Line Clamp
const toggleBioBtn = document.getElementById('toggleBioBtn');
const devBioText = document.getElementById('devBioText');
toggleBioBtn.addEventListener('click', () => {
  const expanded = devBioText.classList.toggle('expanded');
  toggleBioBtn.textContent = expanded ? 'Show Less' : 'Show More';
});

// Partner Form -> opens the user's Gmail app (mailto), no backend
document.getElementById('partnerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const org = document.getElementById('partnerOrg').value.trim();
  const email = document.getElementById('partnerEmail').value.trim();

  const subject = `Partnership Proposal - ${org}`;
  const body =
    `Organization: ${org}\n` +
    `Reply-to email: ${email}\n\n` +
    `Hello DV-NOTE plus team,\n\n` +
    `We would like to discuss a partnership.\n`;

  const a = document.createElement('a');
  a.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  showToast('Opening your Gmail app. Tap Send there to deliver your proposal.', 'info');
  e.target.reset();
  document.getElementById('modalPartner').classList.remove('active');
});

// 6. Theme & Font Scaling Engine (19px to 23px)
const darkModeCheckbox = document.getElementById('darkModeCheckbox');
const fontSlider = document.getElementById('fontSlider');
const fontSizeIndicator = document.getElementById('fontSizeIndicator');

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  darkModeCheckbox.checked = (theme === 'dark');
}

darkModeCheckbox.addEventListener('change', (e) => {
  const target = e.target.checked ? 'dark' : 'light';
  applyTheme(target);
  showToast(`Switched to ${target} mode`, 'info');
});

fontSlider.addEventListener('input', (e) => {
  const size = e.target.value;
  fontSizeIndicator.textContent = `${size}px`;
  document.documentElement.style.setProperty('--font-size', `${size}px`);
  localStorage.setItem('dv_fontsize', size);
});

const savedFontSize = localStorage.getItem('dv_fontsize') || '19';
fontSlider.value = savedFontSize;
fontSizeIndicator.textContent = `${savedFontSize}px`;
document.documentElement.style.setProperty('--font-size', `${savedFontSize}px`);

const savedTheme = localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);

// 7. Vault Unlock & Records Management
const masterKeyInput = document.getElementById('masterKeyInput');
const unlockVaultBtn = document.getElementById('unlockVaultBtn');
const vaultStatusText = document.getElementById('vaultStatusText');
const vaultStatusIcon = document.getElementById('vaultStatusIcon');
const notesList = document.getElementById('notesList');
const vaultCountLabel = document.getElementById('vaultCountLabel');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');

function loadRawVault() {
  try {
    const parsed = JSON.parse(localStorage.getItem('dv_vault') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function persistRawVault(vaultArray) {
  localStorage.setItem('dv_vault', JSON.stringify(vaultArray));
}

function loadKeyCheck() {
  try {
    const parsed = JSON.parse(localStorage.getItem('dv_check') || 'null');
    return isEncryptedObj(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function lockVault() {
  activeMasterKey = '';
  decryptedNotes = [];
  vaultStatusText.textContent = 'Vault Locked (AES-256)';
  vaultStatusIcon.style.color = '';
  searchInput.value = '';
  clearSearchBtn.classList.remove('visible');
  renderNotes();
}

unlockVaultBtn.addEventListener('click', async () => {
  const key = masterKeyInput.value.trim();
  if (!key) {
    showToast('Enter a master passphrase.', 'danger');
    return;
  }

  const rawVault = loadRawVault();
  const check = loadKeyCheck();
  const unlocked = [];

  try {
    // Wrong passphrase is rejected here, before anything can be saved under it
    if (check) {
      const verdict = await decryptData(check, key);
      if (verdict !== KEY_CHECK_TEXT) throw new Error('bad key');
    }

    for (let i = 0; i < rawVault.length; i++) {
      const plaintextJson = await decryptData(rawVault[i], key);
      const note = JSON.parse(plaintextJson);
      unlocked.push({ ...note, enc: rawVault[i] });
    }

    const isNewVault = !check && rawVault.length === 0;
    if (!check) {
      const created = await encryptData(KEY_CHECK_TEXT, key);
      localStorage.setItem('dv_check', JSON.stringify(created));
    }

    decryptedNotes = unlocked;
    activeMasterKey = key;
    masterKeyInput.value = '';
    vaultStatusText.textContent = 'Vault Unlocked (Decrypted)';
    vaultStatusIcon.style.color = 'var(--success)';
    showToast(
      isNewVault
        ? 'New vault created. Remember this passphrase: it cannot be recovered.'
        : 'Vault successfully unlocked with AES-256.',
      'success'
    );
    renderNotes(searchInput.value);
  } catch (_) {
    showToast('Decryption failed. Incorrect master passphrase.', 'danger');
  }
});

function buildEmptyState(message) {
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';
  const p = document.createElement('p');
  p.textContent = message;
  wrap.appendChild(p);
  return wrap;
}

function renderNotes(query = '') {
  notesList.innerHTML = '';

  if (!activeMasterKey) {
    const n = loadRawVault().length;
    vaultCountLabel.textContent = `${n} Encrypted Record${n === 1 ? '' : 's'} Stored`;
    notesList.appendChild(buildEmptyState(
      n === 0
        ? 'Vault is empty. Enter a master passphrase above and tap Unlock to begin.'
        : 'Vault is locked. Enter your master passphrase to decrypt.'
    ));
    return;
  }

  const q = query.toLowerCase();
  const filtered = decryptedNotes.filter(n =>
    (n.title && n.title.toLowerCase().includes(q)) ||
    (n.body && n.body.toLowerCase().includes(q))
  );

  vaultCountLabel.textContent = `${filtered.length} of ${decryptedNotes.length} Decrypted Record${decryptedNotes.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    notesList.appendChild(buildEmptyState(
      decryptedNotes.length === 0 ? 'Vault is empty. Capture your first record above.' : 'No matching records found.'
    ));
    return;
  }

  filtered.forEach((note) => {
    const card = document.createElement('article');
    card.className = 'note-card';

    card.innerHTML = `
      <div class="note-title"></div>
      <div class="note-body"></div>
      <div class="note-actions">
        <button class="action-btn copy">
          <svg class="ui-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-3-4H4a2 2 0 0 0-2 2v14h2V3h12V1Z"/></svg>
          <span>Copy</span>
        </button>
        <button class="action-btn delete">
          <svg class="ui-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12Z"/></svg>
          <span>Delete</span>
        </button>
      </div>
    `;

    // User text is inserted as plain text (no HTML execution)
    card.querySelector('.note-title').textContent = note.title || 'Untitled Record';
    card.querySelector('.note-body').textContent = note.body || '';

    // Copy Action
    card.querySelector('.copy').addEventListener('click', () => {
      navigator.clipboard.writeText(`${note.title || ''}\n\n${note.body || ''}`).then(() => {
        showToast('Decrypted note copied to clipboard!', 'success');
      }).catch(() => {
        showToast('Clipboard access was blocked.', 'danger');
      });
    });

    // Delete Action: matched by its own ciphertext, never by a shifting index
    card.querySelector('.delete').addEventListener('click', () => {
      const raw = loadRawVault().filter(r => r.ciphertext !== note.enc.ciphertext);
      persistRawVault(raw);
      decryptedNotes = decryptedNotes.filter(n => n !== note);
      renderNotes(searchInput.value);
      showToast('Record deleted from encrypted vault.', 'info');
    });

    notesList.appendChild(card);
  });
}

// 8. Capture & Encrypt New Note
const newNoteTitleInput = document.getElementById('newNoteTitleInput');
const newNoteBodyInput = document.getElementById('newNoteBodyInput');
const saveNoteBtn = document.getElementById('saveNoteBtn');

saveNoteBtn.addEventListener('click', async () => {
  const title = newNoteTitleInput.value.trim();
  const body = newNoteBodyInput.value.trim();

  if (!activeMasterKey) {
    showToast('Unlock your vault with your master passphrase first.', 'danger');
    return;
  }
  if (!body) {
    showToast('Note content cannot be empty.', 'danger');
    return;
  }

  try {
    const date = new Date().toISOString();
    const payload = JSON.stringify({ title, body, date });
    const encrypted = await encryptData(payload, activeMasterKey);

    const raw = loadRawVault();
    raw.unshift(encrypted);
    persistRawVault(raw);

    decryptedNotes.unshift({ title, body, date, enc: encrypted });

    newNoteTitleInput.value = '';
    newNoteBodyInput.value = '';

    renderNotes(searchInput.value);
    showToast('Record encrypted with AES-256 and saved.', 'success');
  } catch (err) {
    showToast('Encryption failed.', 'danger');
  }
});

// Search Filter
searchInput.addEventListener('input', (e) => {
  const q = e.target.value;
  clearSearchBtn.classList.toggle('visible', q.length > 0);
  renderNotes(q);
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.classList.remove('visible');
  renderNotes();
  searchInput.focus();
});

// 9. API Documentation & Live Tester (Mode 3)
const openApiTesterBtn = document.getElementById('openApiTesterBtn');
const apiModal = document.getElementById('apiModal');
const closeApiModalBtn = document.getElementById('closeApiModalBtn');
const apiTestPayload = document.getElementById('apiTestPayload');
const apiTestPass = document.getElementById('apiTestPass');
const apiTestOutput = document.getElementById('apiTestOutput');
const callApiEncryptBtn = document.getElementById('callApiEncryptBtn');
const callApiDecryptBtn = document.getElementById('callApiDecryptBtn');
const apiDocUrlExample = document.getElementById('apiDocUrlExample');
const apiDocPostExample = document.getElementById('apiDocPostExample');

const appBaseUrl = window.location.origin + window.location.pathname;
if (apiDocUrlExample) {
  apiDocUrlExample.textContent =
    `${appBaseUrl}#api=encrypt&key=MyPassphrase&text=Hello%20World&callback=https%3A%2F%2Fexample.com%2Fdone`;
}
if (apiDocPostExample) {
  apiDocPostExample.textContent =
`const frame = document.createElement('iframe');
frame.src = '${appBaseUrl}';
document.body.appendChild(frame);

window.addEventListener('message', (e) => {
  console.log(e.data);
});

frame.onload = () => {
  frame.contentWindow.postMessage(
    { action: 'encrypt', payload: 'Hello World', key: 'MyPassphrase', requestId: 1 },
    '${window.location.origin}'
  );
};`;
}

openApiTesterBtn.addEventListener('click', () => {
  apiModal.classList.add('active');
});
closeApiModalBtn.addEventListener('click', () => apiModal.classList.remove('active'));

callApiEncryptBtn.addEventListener('click', async () => {
  try {
    const enc = await withSpinner(() => runApi('encrypt', { payload: apiTestPayload.value, key: apiTestPass.value }));
    apiTestOutput.value = JSON.stringify(enc, null, 2);
    showToast('API 200 OK: Encrypted payload generated.', 'success');
  } catch (err) {
    apiTestOutput.value = JSON.stringify({ error: err instanceof ApiError ? err.message : 'Encryption failure' });
    showToast('API request failed.', 'danger');
  }
});

callApiDecryptBtn.addEventListener('click', async () => {
  try {
    const parsed = JSON.parse(apiTestOutput.value);
    const dec = await withSpinner(() => runApi('decrypt', { payload: parsed, key: apiTestPass.value }));
    apiTestOutput.value = dec;
    showToast('API 200 OK: Payload decrypted.', 'success');
  } catch (_) {
    showToast('Provide valid encrypted JSON in output area and the correct passphrase.', 'danger');
  }
});

// 10. Vault Backup & Restore
const exportVaultBtn = document.getElementById('exportVaultBtn');
const importVaultInput = document.getElementById('importVaultInput');
const modalConfirm = document.getElementById('modalConfirm');
const confirmMessage = document.getElementById('confirmMessage');
const confirmImportBtn = document.getElementById('confirmImportBtn');
const cancelImportBtn = document.getElementById('cancelImportBtn');
let pendingImport = null;

exportVaultBtn.addEventListener('click', () => {
  const raw = loadRawVault();
  if (raw.length === 0) {
    showToast('Vault is empty. Nothing to export.', 'info');
    return;
  }
  const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dv-note-plus-vault-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Raw encrypted backup downloaded.', 'success');
});

importVaultInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isEncryptedObj)) {
        throw new Error('invalid');
      }
      pendingImport = parsed;
      const current = loadRawVault().length;
      confirmMessage.textContent = current
        ? `This will replace the ${current} encrypted record${current === 1 ? '' : 's'} on this device with ${parsed.length} record${parsed.length === 1 ? '' : 's'} from the backup. Export your current vault first if you still need it.`
        : `${parsed.length} encrypted record${parsed.length === 1 ? '' : 's'} will be imported into this device.`;
      modalConfirm.classList.add('active');
    } catch (_) {
      showToast('Invalid vault backup file.', 'danger');
    }
  };
  reader.readAsText(file);
});

cancelImportBtn.addEventListener('click', () => {
  pendingImport = null;
  modalConfirm.classList.remove('active');
});

confirmImportBtn.addEventListener('click', () => {
  if (!pendingImport) {
    modalConfirm.classList.remove('active');
    return;
  }
  persistRawVault(pendingImport);
  localStorage.removeItem('dv_check'); // re-verified against the imported records on next unlock
  pendingImport = null;
  modalConfirm.classList.remove('active');
  lockVault();
  showToast('Encrypted vault imported. Enter its passphrase to unlock.', 'success');
});

// 11. Android Install, Share & Share Sheet (Bluetooth available inside it)
let deferredPrompt = null;
const installAppBtn = document.getElementById('installAppBtn');
const shareAppBtn = document.getElementById('shareAppBtn');
const bluetoothShareBtn = document.getElementById('bluetoothShareBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installAppBtn.style.display = 'flex';
});

installAppBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredPrompt = null;
      showToast('DV-NOTE plus installed to Android home screen.', 'success');
    }
  } else {
    showToast('App is ready offline or already installed.', 'info');
  }
});

shareAppBtn.addEventListener('click', async () => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'DV-NOTE plus',
        text: 'Sovereign client-side encrypted vault and cryptographic API.',
        url: window.location.href,
      });
      showToast('Shared successfully.', 'success');
    } catch (_) {}
  } else {
    navigator.clipboard.writeText(window.location.href);
    showToast('Direct URL copied to clipboard!', 'success');
  }
});

// Opens the native Android share sheet with the ENCRYPTED backup file.
// Bluetooth, Nearby Share, WhatsApp, Gmail etc. all appear inside that sheet.
bluetoothShareBtn.addEventListener('click', async () => {
  const raw = loadRawVault();
  if (raw.length === 0) {
    showToast('Vault is empty. Nothing to share.', 'info');
    return;
  }
  if (!navigator.share || !navigator.canShare) {
    showToast('Android share sheet is not available in this browser.', 'danger');
    return;
  }

  const json = JSON.stringify(raw, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  const candidates = [
    new File([json], `dv-note-plus-vault-${stamp}.json`, { type: 'application/json' }),
    new File([json], `dv-note-plus-vault-${stamp}.txt`, { type: 'text/plain' })
  ];
  const file = candidates.find(f => navigator.canShare({ files: [f] }));

  if (!file) {
    showToast('This browser cannot share files through the Android share sheet.', 'danger');
    return;
  }

  try {
    await navigator.share({
      title: 'DV-NOTE plus Encrypted Vault',
      text: 'Encrypted DV-NOTE plus backup. Import it with the same master passphrase.',
      files: [file]
    });
    showToast('Encrypted vault sent to the share sheet.', 'success');
  } catch (err) {
    if (err && err.name !== 'AbortError') showToast('Sharing failed.', 'danger');
  }
});

// 12. Android-Style Back Navigation (modal -> sidebar -> home)
let histCount = 0;
let ignorePop = false;

const backArrowSvg = '<svg class="ui-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z"/></svg>';

function closeModalEl(m) {
  m.classList.remove('active');
  if (m.id === 'modalConfirm') pendingImport = null;
  if (m.id === 'modalBible') {
    try { history.replaceState(null, '', window.location.pathname); } catch (_) {}
  }
}

function layerCount() {
  const drawer = (leftSidebar.classList.contains('open') || rightSidebar.classList.contains('open')) ? 1 : 0;
  return drawer + document.querySelectorAll('.fullscreen-modal.active').length;
}

function syncHistory() {
  const depth = layerCount();
  if (depth > histCount) {
    for (let i = histCount; i < depth; i++) history.pushState({ dvLayer: i + 1 }, '');
    histCount = depth;
  } else if (depth < histCount) {
    const diff = histCount - depth;
    histCount = depth;
    ignorePop = true;
    history.go(-diff);
  }
}

function closeTopLayer() {
  const modals = Array.from(document.querySelectorAll('.fullscreen-modal.active'));
  if (modals.length) {
    modals.sort((a, b) => (parseInt(getComputedStyle(b).zIndex, 10) || 0) - (parseInt(getComputedStyle(a).zIndex, 10) || 0));
    closeModalEl(modals[0]);
    return;
  }
  forceCloseDrawers();
}

window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  histCount = Math.max(0, histCount - 1);
  closeTopLayer();
});

const layerObserver = new MutationObserver(syncHistory);
function watchLayer(el) {
  layerObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
}

function prepareModal(m) {
  watchLayer(m);
  const header = m.querySelector('.modal-header');
  if (!header || header.querySelector('.modal-back-btn')) return;
  const b = document.createElement('button');
  b.className = 'header-btn modal-back-btn';
  b.setAttribute('aria-label', 'Back');
  b.innerHTML = backArrowSvg;
  b.addEventListener('click', () => closeModalEl(m));
  header.insertBefore(b, header.firstChild);
}

[leftSidebar, rightSidebar].forEach(watchLayer);
document.querySelectorAll('.fullscreen-modal').forEach(prepareModal);

// Also covers modals added later by other modules (e.g. bible.js)
new MutationObserver((muts) => {
  muts.forEach((mu) => mu.addedNodes.forEach((n) => {
    if (n.nodeType === 1 && n.classList.contains('fullscreen-modal')) prepareModal(n);
  }));
}).observe(document.body, { childList: true });

// Initial Setup
renderNotes();
handleUrlApi();