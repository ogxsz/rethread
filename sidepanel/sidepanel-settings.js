// Settings module — theme application, export/import, storage usage.
// Kept separate from sidepanel.js so that file size stays manageable and so
// theme can be applied *before* the rest of the Side Panel renders (no FOUC).

import { updateSettings } from '../shared/storage.js';

const THEME_VALUES = new Set(['auto', 'light', 'dark']);

// ---- Theme ----

// Apply a theme class to <html>. Idempotent. Exported so sidepanel.js can call
// it synchronously on boot before first paint, avoiding a flash.
export function applyTheme(theme) {
  const normalized = THEME_VALUES.has(theme) ? theme : 'auto';
  const root = document.documentElement;
  root.classList.remove('theme-auto', 'theme-light', 'theme-dark');
  root.classList.add('theme-' + normalized);
}

// Wire up the theme radio buttons in the Settings view.
// - preselects the radio that matches storage
// - on change: persists via updateSettings + re-applies immediately
// - listens to `prefers-color-scheme` so Auto follows system in real time
//   (the CSS @media query handles the switch; we just ensure the class stays
//    on `.theme-auto` and trigger a repaint via a no-op class toggle).
export function initThemeControls(currentTheme) {
  const radios = document.querySelectorAll('input[name="theme"]');
  const activeTheme = THEME_VALUES.has(currentTheme) ? currentTheme : 'auto';
  radios.forEach((radio) => {
    radio.checked = radio.value === activeTheme;
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      const next = radio.value;
      applyTheme(next);
      try {
        await updateSettings({ theme: next });
      } catch (e) {
        console.error('ReThread: failed to persist theme', e);
      }
    });
  });

  // prefers-color-scheme is handled purely by CSS when .theme-auto is active;
  // there's nothing to force here. We keep the listener so we can update any
  // future JS-dependent theme-reactive code in one place.
  if (window.matchMedia) {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    // `change` listener is harmless even when user is on explicit Light/Dark —
    // the CSS @media query scoped to `.theme-auto` means nothing flips.
    const handler = () => { /* CSS owns the repaint */ };
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else if (mql.addListener) mql.addListener(handler); // legacy
  }
}

// ---- Toast ----

let toastTimer = null;

function showToast(kind, message) {
  const el = document.getElementById('settings-data-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('settings-toast--error', kind === 'error');
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('visible');
  }, 3000);
}

// ---- Export ----

async function exportData() {
  try {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rethread-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('ok', 'Export downloaded');
  } catch (err) {
    showToast('error', 'Export failed: ' + (err?.message || 'unknown error'));
  }
}

// ---- Import ----

async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data.chats !== 'object' || data.chats === null) {
      throw new Error('Invalid file: missing or invalid "chats" field');
    }

    const existing = await chrome.storage.local.get(null);
    const existingChats = existing.chats || {};
    const existingFolders = existing.folders || [];
    const existingTags = existing.tags || {};

    let addedCount = 0;
    const mergedChats = { ...existingChats };
    for (const [id, chat] of Object.entries(data.chats)) {
      if (!mergedChats[id]) {
        mergedChats[id] = chat;
        addedCount++;
      }
    }

    // Union folders, preserving existing order; dedupe.
    const mergedFolders = [
      ...existingFolders,
      ...((data.folders || []).filter((f) => !existingFolders.includes(f)))
    ];

    // Tags: existing wins on conflicts (so user's local color/count isn't overwritten).
    const mergedTags = { ...(data.tags || {}), ...existingTags };

    // Do NOT overwrite settings (user's preferences win).
    await chrome.storage.local.set({
      chats: mergedChats,
      folders: mergedFolders,
      tags: mergedTags
    });

    showToast('ok', 'Imported ' + addedCount + ' new chat' + (addedCount === 1 ? '' : 's'));
    await refreshStorageUsage();
  } catch (err) {
    showToast('error', 'Import failed: ' + (err?.message || 'invalid JSON'));
  }
}

// ---- Storage usage ----

export async function refreshStorageUsage() {
  const el = document.getElementById('settings-storage-usage');
  if (!el) return;
  try {
    const data = await chrome.storage.local.get(null);
    const chatCount = Object.keys(data.chats || {}).length;
    const bytes = JSON.stringify(data).length;
    const kb = Math.max(1, Math.round(bytes / 1024));
    el.textContent = chatCount + ' chat' + (chatCount === 1 ? '' : 's') + ' · ~' + kb + ' KB';
  } catch (err) {
    el.textContent = '—';
  }
}

// ---- Wiring ----

export function initSettingsData() {
  const exportBtn = document.getElementById('btn-export-data');
  const importBtn = document.getElementById('btn-import-data');
  const importInput = document.getElementById('import-file-input');

  if (exportBtn) exportBtn.addEventListener('click', exportData);
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', () => {
      const file = importInput.files && importInput.files[0];
      if (file) importData(file);
      // Reset so picking the same file again re-fires change.
      importInput.value = '';
    });
  }

  const versionEl = document.getElementById('settings-version');
  if (versionEl) {
    try {
      versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
    } catch {
      versionEl.textContent = '';
    }
  }
}
