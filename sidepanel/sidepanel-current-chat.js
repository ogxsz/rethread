// Current Chat Section — owns detection/render for the active tab's AI chat.
// Three render states:
//   A — supported host + chatId  → icon + title + Save / Saved ✓ button
//   B — supported host, no chat  → icon + "Start a chat to save it"
//   C — unsupported host         → section hidden entirely

import { MESSAGE_TYPES } from '../shared/constants.js';
import { getChat } from '../shared/storage.js';

const PLATFORM_ICON = {
  claude:     '../icons/platform-claude.svg',
  chatgpt:    '../icons/platform-gpt.svg',
  gemini:     '../icons/platform-gemini.svg',
  grok:       '../icons/platform-grok.svg',
  perplexity: '../icons/perplexity-color.svg',
  deepseek:   '../icons/deepseek-color.svg'
};

// GPT and Grok are monochrome — render via CSS mask-image so the glyph tracks
// the active theme. Colored-brand icons use background-image directly.
const THEMED_PLATFORMS = new Set(['chatgpt', 'grok']);

function applyPlatformIcon(el, platform) {
  if (!el) return;
  // Reset both modes first to avoid leftover styles when switching platforms.
  el.style.backgroundColor = '';
  el.style.backgroundImage = '';
  el.style.webkitMaskImage = '';
  el.style.maskImage = '';
  const src = PLATFORM_ICON[platform];
  if (!src) return;
  if (THEMED_PLATFORMS.has(platform)) {
    el.style.backgroundColor = 'var(--text-primary)';
    el.style.webkitMaskImage = "url('" + src + "')";
    el.style.maskImage = "url('" + src + "')";
  } else {
    el.style.backgroundImage = "url('" + src + "')";
  }
}

let section = null;
let iconEl = null;
let titleEl = null;
let emptyEl = null;
let buttonEl = null;

let currentInfo = null;   // { platform, chatId, url, title } or null/unsupported
let currentSaved = false;

export function initCurrentChat() {
  section  = document.getElementById('current-chat-section');
  if (!section) return;

  iconEl   = section.querySelector('.cc-icon');
  titleEl  = section.querySelector('.cc-title');
  emptyEl  = section.querySelector('.cc-empty');
  buttonEl = section.querySelector('.cc-button');

  buttonEl.addEventListener('click', onButtonClick);

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === MESSAGE_TYPES.CURRENT_CHAT_UPDATE) {
      console.log('[ReThread SP] Received CURRENT_CHAT_UPDATE', message.payload);
      handleUpdate(message.payload);
    }
  });

  requestCurrent();
}

// Called from sidepanel.js when chrome.storage.chats changes — the user may have
// saved/deleted the currently-displayed chat elsewhere (list card menu, etc.).
export async function refreshSavedState() {
  if (currentInfo && currentInfo.chatId) {
    await render(currentInfo);
  }
}

function askWithTimeout(ms) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, ms);

    chrome.runtime
      .sendMessage({ type: MESSAGE_TYPES.GET_CURRENT_CHAT })
      .then((resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(resp ?? null);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      });
  });
}

async function requestCurrent() {
  console.log('[ReThread SP] Cold-start GET_CURRENT_CHAT');
  let resp = await askWithTimeout(200);
  if (resp === null) {
    console.log('[ReThread SP] GET_CURRENT_CHAT first attempt timed out, retrying');
    resp = await askWithTimeout(800);
  }
  console.log('[ReThread SP] GET_CURRENT_CHAT response', resp);
  await handleUpdate(resp);
}

async function handleUpdate(info) {
  currentInfo = info;
  await render(info);
}

async function render(info) {
  if (!section) return;

  // State C — not on a supported platform
  if (!info || info.supported === false || !info.platform) {
    section.hidden = true;
    currentSaved = false;
    return;
  }

  section.hidden = false;
  applyPlatformIcon(iconEl, info.platform);
  iconEl.setAttribute('aria-label', info.platform || '');

  // State B — supported host but no chat id
  if (!info.chatId) {
    titleEl.hidden = true;
    titleEl.textContent = '';
    emptyEl.hidden = false;
    buttonEl.hidden = true;
    currentSaved = false;
    return;
  }

  // State A — savable chat. Resolve saved status from storage.
  const existing = await getChat(info.chatId);
  currentSaved = !!existing;

  emptyEl.hidden = true;
  titleEl.hidden = false;
  titleEl.textContent = info.title || 'Untitled chat';
  buttonEl.hidden = false;
  applyButtonVariant(currentSaved);
}

function applyButtonVariant(saved) {
  buttonEl.classList.remove('cc-button--save', 'cc-button--saved');
  if (saved) {
    buttonEl.classList.add('cc-button--saved');
    buttonEl.textContent = 'Saved \u2713';
    buttonEl.title = 'Remove from saved chats';
  } else {
    buttonEl.classList.add('cc-button--save');
    buttonEl.textContent = 'Save';
    buttonEl.title = 'Save this chat';
  }
}

async function onButtonClick() {
  if (!currentInfo || !currentInfo.chatId) return;

  if (currentSaved) {
    // Optimistic flip; storage listener will re-render to authoritative state.
    currentSaved = false;
    applyButtonVariant(false);
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.DELETE_CHAT,
        chatId: currentInfo.chatId
      });
    } catch (e) { /* service worker will be back up on next click */ }
  } else {
    currentSaved = true;
    applyButtonVariant(true);
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.SAVE_CHAT,
        chatId: currentInfo.chatId,
        url: currentInfo.url,
        title: currentInfo.title,
        platform: currentInfo.platform,
        messageCount: null
      });
    } catch (e) { /* ignore */ }
  }
}
