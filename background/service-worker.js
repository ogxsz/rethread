import { MESSAGE_TYPES } from '../shared/constants.js';
import {
  initStorage,
  migrateStorage,
  saveChat,
  updateChat,
  deleteChat,
  getChat,
  updateSettings,
  createFolder,
  deleteFolder
} from '../shared/storage.js';

const SUPPORTED_HOSTS = [
  'claude.ai',
  'chatgpt.com',
  'chat.openai.com',
  'gemini.google.com',
  'grok.com',
  'perplexity.ai',
  'chat.deepseek.com'
];

const SUPPORTED_MATCHES = [
  'https://claude.ai/*',
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
  'https://gemini.google.com/*',
  'https://grok.com/*',
  'https://perplexity.ai/*',
  'https://*.perplexity.ai/*',
  'https://chat.deepseek.com/*'
];

const CS_FILES = ['shared/platforms.js', 'content/content-script.js'];

// ---- Content-script reinjection (for extension install/reload/startup) ----
async function reinjectContentScripts() {
  try {
    const tabs = await chrome.tabs.query({ url: SUPPORTED_MATCHES });
    await Promise.all(
      tabs.map(async (t) => {
        if (!t.id) return;
        try {
          await chrome.scripting.executeScript({
            target: { tabId: t.id },
            files: CS_FILES
          });
        } catch (e) {
          // Tab might be privileged (chrome://) or closed during the query — ignore.
        }
      })
    );
    console.log('[ReThread SW] Reinjected content scripts into', tabs.length, 'tab(s)');
  } catch (e) {
    // chrome.tabs.query can throw if permissions change mid-startup — ignore.
  }
}

// Initialize storage on install/update, run migrations, reinject content scripts.
chrome.runtime.onInstalled.addListener(async () => {
  try { await initStorage(); } catch {}
  try { await migrateStorage(); } catch {}
  await reinjectContentScripts();
});

// Reinject on browser startup so existing tabs recover without F5.
chrome.runtime.onStartup.addListener(async () => {
  await reinjectContentScripts();
});

// Open side panel when extension icon is clicked
try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} catch (e) {
  // Older Chrome versions — ignore.
}

// ---- Current chat routing helpers ----

function isSupportedUrl(url) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    // Smart match: accept exact hostname or any subdomain of a supported host
    // (e.g., `www.perplexity.ai` → matches `perplexity.ai`).
    return SUPPORTED_HOSTS.some(
      (host) => hostname === host || hostname.endsWith('.' + host)
    );
  } catch {
    return false;
  }
}

async function askTab(tabId) {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.GET_CURRENT_CHAT });
    return resp || null;
  } catch {
    return null;
  }
}

async function injectAndAsk(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CS_FILES
    });
  } catch (e) {
    return null;
  }
  // Give the freshly-loaded listener a tick to attach before we re-ask.
  await new Promise((r) => setTimeout(r, 80));
  return askTab(tabId);
}

async function fetchCurrentChatFromActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url) {
      console.log('[ReThread SW] fetchCurrentChat: no active tab');
      return { supported: false };
    }
    if (!isSupportedUrl(tab.url)) {
      console.log('[ReThread SW] fetchCurrentChat: unsupported host', tab.url);
      return { supported: false };
    }

    // First try the (assumed live) content script.
    let resp = await askTab(tab.id);
    if (resp) {
      console.log('[ReThread SW] fetchCurrentChat: got response from CS', resp);
      return resp;
    }

    // Content script didn't answer — reinject and retry once.
    console.log('[ReThread SW] fetchCurrentChat: CS silent, reinjecting');
    resp = await injectAndAsk(tab.id);
    if (resp) {
      console.log('[ReThread SW] fetchCurrentChat: got response after reinject', resp);
      return resp;
    }

    console.log('[ReThread SW] fetchCurrentChat: no response even after reinject');
    return { supported: false };
  } catch (e) {
    console.log('[ReThread SW] fetchCurrentChat: error', e?.message);
    return { supported: false };
  }
}

function broadcastToSidePanel(payload) {
  console.log('[ReThread SW] Broadcasting CURRENT_CHAT_UPDATE', payload);
  try {
    chrome.runtime
      .sendMessage({ type: MESSAGE_TYPES.CURRENT_CHAT_UPDATE, payload })
      .catch(() => { /* side panel may not be open */ });
  } catch (e) {
    // Ignore
  }
}

async function pushActiveChatToSidePanel() {
  const info = await fetchCurrentChatFromActiveTab();
  broadcastToSidePanel(info);
}

// ---- Tab + window activity listeners ----

// User switches Chrome tabs.
chrome.tabs.onActivated.addListener(() => {
  pushActiveChatToSidePanel();
});

// Tab URL changes (full-page navigation, user-typed URL, redirect).
// SPA navigations are caught by the content script's own history patch.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  if (!tab.active) return;
  if (isSupportedUrl(changeInfo.url)) {
    pushActiveChatToSidePanel();
  } else {
    broadcastToSidePanel({ supported: false });
  }
});

// User switches between Chrome windows.
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  pushActiveChatToSidePanel();
});

// ---- Quick-save hotkey ----
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'quick-save') return;
  try {
    const info = await fetchCurrentChatFromActiveTab();
    if (!info || info.supported === false || !info.chatId) return;

    const existing = await getChat(info.chatId);
    if (existing) return;

    await saveChat({
      id: info.chatId,
      url: info.url,
      title: info.title || 'Untitled chat',
      savedAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      isPinned: false,
      pinnedAt: null,
      notes: '',
      messageCount: null,
      platform: info.platform || 'claude',
      folder: null
    });
  } catch (e) {
    console.error('ReThread: quick-save failed', e);
  }
});

// ---- Message router ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case MESSAGE_TYPES.SAVE_CHAT: {
      const chatData = {
        id: message.chatId,
        url: message.url,
        title: message.title || 'Untitled chat',
        savedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        isPinned: false,
        pinnedAt: null,
        notes: '',
        messageCount: message.messageCount || null,
        platform: message.platform || 'claude',
        folder: null,
        isArchived: false,
        archivedAt: null
      };
      const success = await saveChat(chatData);
      return { success };
    }

    case MESSAGE_TYPES.UPDATE_CHAT: {
      const success = await updateChat(message.chatId, message.updates);
      return { success };
    }

    case MESSAGE_TYPES.DELETE_CHAT: {
      const success = await deleteChat(message.chatId);
      return { success };
    }

    case MESSAGE_TYPES.CREATE_FOLDER: {
      const success = await createFolder(message.name);
      return { success };
    }

    case MESSAGE_TYPES.DELETE_FOLDER: {
      const success = await deleteFolder(message.name);
      return { success };
    }

    case MESSAGE_TYPES.CURRENT_CHAT_UPDATE: {
      console.log('[ReThread SW] Received CURRENT_CHAT_UPDATE from CS', message.payload);
      broadcastToSidePanel(message.payload);
      return { ok: true };
    }

    case MESSAGE_TYPES.GET_CURRENT_CHAT: {
      console.log('[ReThread SW] Received GET_CURRENT_CHAT from SP');
      return await fetchCurrentChatFromActiveTab();
    }

    case 'UPDATE_SETTINGS': {
      const success = await updateSettings(message.updates);
      return { success };
    }

    default:
      return { error: 'Unknown message type' };
  }
}
