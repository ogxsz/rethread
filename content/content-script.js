// ReThread Content Script — slim detector for the Current Chat Section in the Side Panel.
// Runs in ISOLATED world. PLATFORMS is provided by shared/platforms.js (loaded first).
// Reports { platform, chatId, url, title, supported:true } to the service worker; never injects UI.

(function () {
  'use strict';

  // Idempotency guard — if the service worker reinjects us into an already-live tab,
  // bail out so we don't register duplicate listeners / observers.
  if (window.__rethread_loaded) return;
  window.__rethread_loaded = true;

  const MSG = {
    CURRENT_CHAT_UPDATE: 'CURRENT_CHAT_UPDATE',
    GET_CURRENT_CHAT: 'GET_CURRENT_CHAT'
  };

  const hostname = window.location.hostname;
  let currentPlatform = null;
  for (const platform of Object.values(PLATFORMS)) {
    if (platform.hostnames.includes(hostname)) {
      currentPlatform = platform;
      break;
    }
  }
  if (!currentPlatform) return;

  function getChatId() {
    const match = window.location.pathname.match(currentPlatform.chatUrlPattern);
    return match ? match[1] : null;
  }

  function snapshot() {
    return {
      platform: currentPlatform.id,
      chatId: getChatId(),
      url: window.location.href,
      title: currentPlatform.getTitle(),
      supported: true
    };
  }

  function broadcast() {
    try {
      const payload = snapshot();
      console.log('[ReThread CS] Sending CURRENT_CHAT_UPDATE', payload);
      chrome.runtime.sendMessage({
        type: MSG.CURRENT_CHAT_UPDATE,
        payload
      }).catch(() => { /* side panel may not be open */ });
    } catch (e) {
      // Extension context invalidated (e.g., during reload) — ignore.
    }
  }

  let lastUrl = window.location.href;
  let lastTitle = document.title;

  function maybeBroadcast() {
    const urlChanged = window.location.href !== lastUrl;
    const titleChanged = document.title !== lastTitle;
    if (urlChanged || titleChanged) {
      lastUrl = window.location.href;
      lastTitle = document.title;
      broadcast();
    }
  }

  // ---- URL-change detection: popstate + history API patch ----
  // SPAs use history.pushState/replaceState which don't fire popstate; patch to emit a custom
  // event that we listen to. Patched function still calls the original, so host-page behavior
  // is unaffected.
  (function patchHistory() {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () {
      const result = origPush.apply(this, arguments);
      window.dispatchEvent(new Event('rt:urlchange'));
      return result;
    };
    history.replaceState = function () {
      const result = origReplace.apply(this, arguments);
      window.dispatchEvent(new Event('rt:urlchange'));
      return result;
    };
  })();

  window.addEventListener('rt:urlchange', maybeBroadcast);
  window.addEventListener('popstate', maybeBroadcast);

  // ---- Title-change detection: observe <title> directly ----
  // Some platforms update <title> after the first message (chatId already in URL but title
  // still "New chat"). Observing document.title text via the actual <title> node is more
  // reliable than scanning document.body mutations.
  const titleNode = document.querySelector('title');
  if (titleNode) {
    new MutationObserver(maybeBroadcast).observe(titleNode, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // ---- Side Panel / service worker queries ----
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === MSG.GET_CURRENT_CHAT) {
      const snap = snapshot();
      console.log('[ReThread CS] Responding to GET_CURRENT_CHAT', snap);
      sendResponse(snap);
      return true;
    }
  });

  // ---- Initial broadcast ----
  broadcast();
})();
