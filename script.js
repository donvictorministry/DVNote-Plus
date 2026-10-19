/**
 * DV-NOTE PLUS - CORE CRYPTOGRAPHIC & BIDIRECTIONAL API ENGINE
 * Uses Web Crypto API: PBKDF2 (SHA-256) + AES-GCM (256-bit)
 * Storage Contract: 'dv_vault' (encrypted array), 'theme' ('light' | 'dark')
 */

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

// 3. Two-Way Client-Side API Dispatcher
// Responds to postMessage calls and headless URL queries
window.addEventListener('message', async (e) => {
  const data = e.data;
  if (!data || typeof data !== 'object' || !data.action) return;

  try {
    if (data.action === 'encrypt') {
      const result = await encryptData(data.payload || '', data.key || activeMasterKey);
      e.source.postMessage({ success: true, action: 'encrypt', response: result }, e.origin || '*');
    } else if (data.action === 'decrypt') {
      const plaintext = await decryptData(data.payload, data.key || activeMasterKey);
      e.source.postMessage({ success: true, action: 'decrypt', response: plaintext }, e.origin || '*');
    } else if (data.action === 'ping') {
      e.source.postMessage({ success: true, status: 'DV-NOTE plus Cryptographic API Ready', version: '1.0' }, e.origin || '*');
    }
  } catch (err) {
    e.source.postMessage({ success: false, error: 'Cryptographic operation failed' }, e.origin || '*');
  }
});

// 4. Non-Blocking Toast Notification Engine
const toastContainer = document.getElementById('toastContainer');
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button style="border:none;background:transparent;color:inherit;font-weight:bold;cursor:pointer;font-size:var(--font-size);">✕</button>
  `;
  toast.querySelector('button').addEventListener('click', () => toast.remove());
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

function closeDrawers() {
  leftSidebar.classList.remove('open');
  rightSidebar.classList.remove('open');
  drawerOverlay.classList.remove('active');
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

// 7 Modals
document.querySelectorAll('.nav-link-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    closeDrawers();
    const modal = document.getElementById(btn.getAttribute('data-modal'));
    if (modal) modal.classList.add('active');
  });
});

document.querySelectorAll('.close-modal-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fullscreen-modal').forEach(m => m.classList.remove('active'));
  });
});

// Developer Bio 6-Line Clamp
const toggleBioBtn = document.getElementById('toggleBioBtn');
const devBioText = document.getElementById('devBioText');
toggleBioBtn.addEventListener('click', () => {
  const expanded = devBioText.classList.toggle('expanded');
  toggleBioBtn.textContent = expanded ? 'Show Less' : 'Show More';
});

// Partner Form
document.getElementById('partnerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  showToast('Partnership proposal received.', 'success');
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
    return JSON.parse(localStorage.getItem('dv_vault') || '[]');
  } catch (_) {
    return [];
  }
}

function persistRawVault(vaultArray) {
  localStorage.setItem('dv_vault', JSON.stringify(vaultArray));
}

unlockVaultBtn.addEventListener('click', async () => {
  const key = masterKeyInput.value.trim();
  if (!key) {
    showToast('Enter a master passphrase.', 'danger');
    return;
  }

  const rawVault = loadRawVault();
  decryptedNotes = [];

  try {
    for (let i = 0; i < rawVault.length; i++) {
      const plaintextJson = await decryptData(rawVault[i], key);
      const note = JSON.parse(plaintextJson);
      decryptedNotes.push({ ...note, vaultIndex: i });
    }

    activeMasterKey = key;
    vaultStatusText.textContent = 'Vault Unlocked (Decrypted)';
    vaultStatusIcon.style.fill = 'var(--success)';
    showToast('Vault successfully unlocked with AES-256.', 'success');
    renderNotes();
  } catch (_) {
    showToast('Decryption failed. Incorrect master passphrase.', 'danger');
  }
});

function renderNotes(query = '') {
  notesList.innerHTML = '';
  const filtered = decryptedNotes.filter(n =>
    (n.title && n.title.toLowerCase().includes(query.toLowerCase())) ||
    (n.body && n.body.toLowerCase().includes(query.toLowerCase()))
  );

  vaultCountLabel.textContent = `${filtered.length} of ${decryptedNotes.length} Decrypted Record${decryptedNotes.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        <p>${decryptedNotes.length === 0 ? 'Vault is empty or locked. Unlock above or capture a record.' : 'No matching records found.'}</p>
      </div>
    `;
    return;
  }

  filtered.forEach((note) => {
    const card = document.createElement('article');
    card.className = 'note-card';

    card.innerHTML = `
      <div class="note-title">${note.title || 'Untitled Record'}</div>
      <div class="note-body">${note.body || ''}</div>
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

    // Copy Action
    card.querySelector('.copy').addEventListener('click', () => {
      navigator.clipboard.writeText(`${note.title}\n\n${note.body}`).then(() => {
        showToast('Decrypted note copied to clipboard!', 'success');
      });
    });

    // Delete Action
    card.querySelector('.delete').addEventListener('click', () => {
      const raw = loadRawVault();
      raw.splice(note.vaultIndex, 1);
      persistRawVault(raw);
      decryptedNotes = decryptedNotes.filter(n => n.vaultIndex !== note.vaultIndex);
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
  const pass = activeMasterKey || masterKeyInput.value.trim();

  if (!pass) {
    showToast('Set or unlock your master passphrase first.', 'danger');
    return;
  }
  if (!body) {
    showToast('Note content cannot be empty.', 'danger');
    return;
  }

  try {
    const payload = JSON.stringify({ title, body, date: new Date().toISOString() });
    const encrypted = await encryptData(payload, pass);

    const raw = loadRawVault();
    raw.unshift(encrypted);
    persistRawVault(raw);

    activeMasterKey = pass;
    decryptedNotes.unshift({ title, body, vaultIndex: 0 });

    newNoteTitleInput.value = '';
    newNoteBodyInput.value = '';
    vaultStatusText.textContent = 'Vault Active (Encrypted)';
    vaultStatusIcon.style.fill = 'var(--success)';

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

// 9. API Documentation & Live Tester
const openApiTesterBtn = document.getElementById('openApiTesterBtn');
const apiModal = document.getElementById('apiModal');
const closeApiModalBtn = document.getElementById('closeApiModalBtn');
const apiTestPayload = document.getElementById('apiTestPayload');
const apiTestPass = document.getElementById('apiTestPass');
const apiTestOutput = document.getElementById('apiTestOutput');
const callApiEncryptBtn = document.getElementById('callApiEncryptBtn');
const callApiDecryptBtn = document.getElementById('callApiDecryptBtn');

openApiTesterBtn.addEventListener('click', () => {
  closeDrawers();
  apiModal.classList.add('active');
});
closeApiModalBtn.addEventListener('click', () => apiModal.classList.remove('active'));

callApiEncryptBtn.addEventListener('click', async () => {
  try {
    const enc = await encryptData(apiTestPayload.value, apiTestPass.value);
    apiTestOutput.value = JSON.stringify(enc, null, 2);
    showToast('API 200 OK: Encrypted payload generated.', 'success');
  } catch (_) {
    apiTestOutput.value = JSON.stringify({ error: 'Encryption failure' });
  }
});

callApiDecryptBtn.addEventListener('click', async () => {
  try {
    const parsed = JSON.parse(apiTestOutput.value);
    const dec = await decryptData(parsed, apiTestPass.value);
    apiTestOutput.value = dec;
    showToast('API 200 OK: Payload decrypted.', 'success');
  } catch (_) {
    showToast('Provide valid encrypted JSON in output area to decrypt.', 'danger');
  }
});

// 10. Vault Backup & Restore
const exportVaultBtn = document.getElementById('exportVaultBtn');
const importVaultInput = document.getElementById('importVaultInput');

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
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!Array.isArray(parsed)) throw new Error();
      persistRawVault(parsed);
      closeDrawers();
      showToast('Encrypted vault imported. Enter passphrase to unlock.', 'success');
    } catch (_) {
      showToast('Invalid vault backup file.', 'danger');
    }
  };
  reader.readAsText(file);
});

// 11. Android Install, Share & Bluetooth
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

bluetoothShareBtn.addEventListener('click', async () => {
  if (navigator.bluetooth) {
    try {
      showToast('Scanning nearby Bluetooth devices...', 'info');
      await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      showToast('Bluetooth pairing handshake ready.', 'success');
    } catch (_) {
      showToast('Bluetooth pairing dismissed.', 'danger');
    }
  } else {
    showToast('Web Bluetooth available on Chrome Android.', 'danger');
  }
});

// Initial Setup
const initialRaw = loadRawVault();
vaultCountLabel.textContent = `${initialRaw.length} Encrypted Record${initialRaw.length === 1 ? '' : 's'} Stored`;
renderNotes();