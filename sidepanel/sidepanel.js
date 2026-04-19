import { MESSAGE_TYPES, VERSION } from '../shared/constants.js';
import { getChats, getSettings, getFolders, createFolder, deleteFolder, updateSettings } from '../shared/storage.js';
import { formatDate, debounce } from '../shared/utils.js';
import { initCurrentChat, refreshSavedState } from './sidepanel-current-chat.js';
import {
  applyTheme,
  initThemeControls,
  initSettingsData,
  refreshStorageUsage
} from './sidepanel-settings.js';

// SVG icon templates
const ICONS = {
  starFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  starOutline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  pencil: `<svg viewBox="0 0 17 17" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.1363 1.0625C13.1443 1.0625 14.111 1.46292 14.8237 2.17566C15.5364 2.8884 15.9369 3.85509 15.9369 4.86306C15.9369 5.14994 15.8221 5.42619 15.6181 5.63019L15.0571 6.19225L12.9629 8.28644L7.58773 13.6616C7.14269 14.1064 6.57595 14.4096 5.95892 14.5329L3.15604 15.0939C2.98447 15.1283 2.80705 15.1197 2.63957 15.0691C2.47208 15.0184 2.3197 14.9271 2.19596 14.8034C2.07223 14.6797 1.98097 14.5273 1.9303 14.3598C1.87962 14.1923 1.8711 14.0149 1.90548 13.8433L2.46648 11.0404C2.58976 10.4234 2.89291 9.85667 3.33773 9.41162L8.71292 4.03644L11.3692 1.38019C11.5721 1.17725 11.8484 1.0625 12.1363 1.0625ZM9.68192 5.32206L4.46504 10.5389C4.24272 10.7613 4.09116 11.0445 4.02942 11.3528L3.62567 13.3748L5.64654 12.971C5.95525 12.9095 6.23881 12.7579 6.46148 12.5354L11.6784 7.3185C11.6309 6.80474 11.4052 6.32377 11.0404 5.95894C10.6756 5.59411 10.1946 5.36843 9.68085 5.321M12.9725 6.02012C12.5862 5.12459 11.8724 4.41044 10.9771 4.02369L12.3371 2.66369C13.3943 2.75931 14.2369 3.60294 14.3325 4.66119L12.9725 6.02012Z"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`,
  folder: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`
};

// Sentinel values for folder dropdown pseudo-folders.
// activeFolder === null     → All folders (hide archived)
// activeFolder === ARCHIVE_VIEW → Archive (only archived)
// activeFolder === '<name>'  → Custom folder (hide archived)
const ARCHIVE_VIEW = '__archive__';

// Platform filter pill pager — agnostic to count. Adding more platforms to the
// HTML chip markup AND to PLATFORM_ORDER extends to additional pages automatically
// (CSS pages size to content via flex: 0 0 auto; track translation is measured).
const PLATFORM_ORDER = ['claude', 'chatgpt', 'gemini', 'grok', 'perplexity', 'deepseek'];
const PLATFORMS_PER_PAGE = 4;
let currentPlatformPage = 1;

function platformPageCount() {
  return Math.ceil(PLATFORM_ORDER.length / PLATFORMS_PER_PAGE);
}

function platformPageOf(platformId) {
  if (!platformId) return null;
  const idx = PLATFORM_ORDER.indexOf(platformId);
  if (idx < 0) return null;
  return Math.floor(idx / PLATFORMS_PER_PAGE) + 1;
}

// ---- Sort options ----
// Keyed by the value stored in settings.sortBy. `label` appears in the selector
// and the dropdown; `chronological` controls whether date grouping is shown.
const SORT_OPTIONS = [
  { value: 'savedAt',        label: 'Recently saved',  chronological: true  },
  { value: 'lastAccessedAt', label: 'Recently opened', chronological: true  },
  { value: 'title',          label: 'Title (A\u2192Z)', chronological: false },
  { value: 'platform',       label: 'Platform',        chronological: false }
];

function getSortOption(value) {
  return SORT_OPTIONS.find((o) => o.value === value) || SORT_OPTIONS[0];
}

function getComparator(sortBy) {
  switch (sortBy) {
    case 'lastAccessedAt':
      return (a, b) =>
        new Date(b.lastAccessedAt || b.savedAt) - new Date(a.lastAccessedAt || a.savedAt);
    case 'title':
      return (a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
    case 'platform':
      return (a, b) => {
        const pa = a.platform || 'claude';
        const pb = b.platform || 'claude';
        if (pa !== pb) return pa.localeCompare(pb);
        return new Date(b.savedAt) - new Date(a.savedAt);
      };
    case 'savedAt':
    default:
      return (a, b) => new Date(b.savedAt) - new Date(a.savedAt);
  }
}

// Classify a chat into a date bucket based on savedAt in local time.
function getDateGroup(isoTimestamp) {
  const d = new Date(isoTimestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= startOfToday) return 'today';
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  if (d >= sevenDaysAgo) return 'thisWeek';
  return 'earlier';
}

// XSS-safe: splits `title` around case-insensitive occurrences of `query` and
// returns an array of text/<mark> DOM nodes. Only textContent is used, so the
// user-typed query never reaches innerHTML.
function renderHighlightedTitle(title, query) {
  if (!query) return [document.createTextNode(title)];
  const lower = title.toLowerCase();
  const q = query.toLowerCase();
  const parts = [];
  let i = 0;
  while (i < title.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      parts.push(document.createTextNode(title.slice(i)));
      break;
    }
    if (idx > i) parts.push(document.createTextNode(title.slice(i, idx)));
    const mark = document.createElement('mark');
    mark.textContent = title.slice(idx, idx + q.length);
    parts.push(mark);
    i = idx + q.length;
  }
  return parts;
}

// State
let chats = {};
let settings = {};
let folders = [];
let activePlatform = null;
let activeFolder = null;
let searchQuery = '';

// DOM refs
const viewOnboarding = document.getElementById('view-onboarding');
const viewEmpty = document.getElementById('view-empty');
const viewList = document.getElementById('view-list');
const viewSettings = document.getElementById('view-settings');
const btnGetStarted = document.getElementById('btn-get-started');
const sectionPinned = document.getElementById('section-pinned');
const sectionRecent = document.getElementById('section-recent');
const sectionArchiveEmpty = document.getElementById('section-archive-empty');
const sectionListEmpty = document.getElementById('section-list-empty');
const platformPagerArrow = document.getElementById('platform-pager-arrow');
const pinnedList = document.getElementById('pinned-list');
// section-recent is populated dynamically by renderChatList (headers + chat-list
// blocks per date group, or one flat list for alpha/platform/search modes), so
// there's no static #recent-list reference to keep.
const deleteModal = document.getElementById('delete-modal');
const modalCancel = document.getElementById('modal-cancel');
const modalDelete = document.getElementById('modal-delete');
const searchInput = document.getElementById('search-input');
const btnSettings = document.getElementById('btn-settings');
const btnSettingsBack = document.getElementById('btn-settings-back');
const folderSelector = document.getElementById('folder-selector');
const folderSelectorText = document.getElementById('folder-selector-text');
const folderDropdown = document.getElementById('folder-dropdown');
const sortSelector = document.getElementById('sort-selector');
const sortSelectorText = document.getElementById('sort-selector-text');
const sortDropdown = document.getElementById('sort-dropdown');
const folderDeleteModal = document.getElementById('folder-delete-modal');
const folderModalCancel = document.getElementById('folder-modal-cancel');
const folderModalDelete = document.getElementById('folder-modal-delete');
const folderAssignModal = document.getElementById('folder-assign-modal');
const folderAssignCancel = document.getElementById('folder-assign-cancel');
const folderAssignSave = document.getElementById('folder-assign-save');
const folderAssignList = document.getElementById('folder-assign-list');
const folderAssignInput = document.getElementById('folder-assign-input');
const folderAssignCreateBtn = document.getElementById('folder-assign-create-btn');
const settingsFolderList = document.getElementById('settings-folder-list');
const settingsNewFolder = document.getElementById('settings-new-folder');
const settingsAddFolder = document.getElementById('settings-add-folder');

// ---- Platform pager helpers ----

function initPlatformPager() {
  const viewport = document.querySelector('.platform-pager-viewport');
  const firstPage = viewport?.querySelector('.platform-pager-page[data-page="1"]');
  if (!viewport || !firstPage) return;
  // Anchor viewport width to the first page so it doesn't reflow when pages swap.
  const width = firstPage.getBoundingClientRect().width;
  if (width > 0) viewport.style.width = width + 'px';

  // If an active filter is on another page, open on that page (per spec).
  const initial = platformPageOf(activePlatform) || 1;
  currentPlatformPage = initial;
  applyPlatformPageTransform();
}

function applyPlatformPageTransform() {
  const track = document.querySelector('.platform-pager-track');
  const firstPage = track?.querySelector('.platform-pager-page[data-page="1"]');
  if (!track || !firstPage) return;
  const pageWidth = firstPage.getBoundingClientRect().width;
  track.style.transform = 'translateX(-' + (currentPlatformPage - 1) * pageWidth + 'px)';
  if (platformPagerArrow) {
    platformPagerArrow.classList.toggle('flipped', currentPlatformPage !== 1);
  }
  updateArrowIndicator();
}

function updateArrowIndicator() {
  if (!platformPagerArrow) return;
  const activePage = platformPageOf(activePlatform);
  const offPage = activePage && activePage !== currentPlatformPage;
  platformPagerArrow.classList.toggle('has-offpage-filter', !!offPage);
}

function togglePlatformPage() {
  const count = platformPageCount();
  currentPlatformPage = currentPlatformPage >= count ? 1 : currentPlatformPage + 1;
  applyPlatformPageTransform();
}

// Initialize
async function init() {
  settings = await getSettings();
  // Apply theme ASAP so the first paint already matches the user's choice.
  applyTheme(settings.theme);
  chats = await getChats();
  folders = await getFolders();
  applySortLabelToSelector();
  render();
  setupListeners();
  initCurrentChat();
  initSettingsData();
  // Pager needs chips to have rendered + CSS applied; defer one tick so the
  // first-page width measurement reflects actual layout.
  requestAnimationFrame(initPlatformPager);
}

function render() {
  // The list view is the canonical post-onboarding home. It handles the
  // "zero chats" state internally so the sticky header (logo + Current Chat
  // Section + pills + search + folder/sort selectors) stays visible.
  // #view-empty markup is kept for now but no longer routed to.
  if (!settings.onboardingDone) {
    showView('onboarding');
  } else {
    showView('list');
    renderChatList();
  }
}

function showView(name) {
  viewOnboarding.hidden = name !== 'onboarding';
  viewEmpty.hidden = name !== 'empty';
  viewList.hidden = name !== 'list';
  viewSettings.hidden = name !== 'settings';
}

// ---- Filtering ----
function getFilteredChats() {
  let chatArray = Object.values(chats);

  // Platform filter (null = show all; pre-0.2.0 chats default to 'claude')
  if (activePlatform) {
    chatArray = chatArray.filter(c => (c.platform || 'claude') === activePlatform);
  }

  // Folder / archive filter
  if (activeFolder === ARCHIVE_VIEW) {
    chatArray = chatArray.filter(c => c.isArchived === true);
  } else if (activeFolder !== null) {
    chatArray = chatArray.filter(c => c.folder === activeFolder && !c.isArchived);
  } else {
    chatArray = chatArray.filter(c => !c.isArchived);
  }

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    chatArray = chatArray.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.notes || '').toLowerCase().includes(q)
    );
  }

  return chatArray;
}

function renderChatList() {
  const chatArray = getFilteredChats();

  // Empty-archive placeholder takes precedence in the Archive pseudo-folder when
  // there's nothing to show AND no active search (a no-result search should look
  // like an ordinary empty list, not like "no archives exist").
  if (
    activeFolder === ARCHIVE_VIEW &&
    chatArray.length === 0 &&
    !searchQuery
  ) {
    sectionPinned.hidden = true;
    sectionRecent.hidden = true;
    hideListEmpty();
    if (sectionArchiveEmpty) sectionArchiveEmpty.hidden = false;
    return;
  }
  if (sectionArchiveEmpty) sectionArchiveEmpty.hidden = true;

  // Contextual empty state for every other zero-result case. Keeps the sticky
  // header (logo + Current Chat Section + pills + search + selectors) visible
  // so the user can still save chats / change filters.
  if (chatArray.length === 0) {
    sectionPinned.hidden = true;
    sectionRecent.hidden = true;
    showListEmpty(getEmptyListMessage());
    return;
  }
  hideListEmpty();

  const sortBy = (settings && settings.sortBy) || 'savedAt';
  const sortOption = getSortOption(sortBy);

  const pinned = chatArray
    .filter(c => c.isPinned)
    .sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt));
  const nonPinned = chatArray.filter(c => !c.isPinned);

  // Pinned section — always "most recently pinned first"; preserves prior UX.
  if (pinned.length > 0) {
    sectionPinned.hidden = false;
    pinnedList.textContent = '';
    pinned.forEach(chat => pinnedList.appendChild(createChatCard(chat)));
  } else {
    sectionPinned.hidden = true;
  }

  // Non-pinned: rebuild sectionRecent's children fresh each render so grouping
  // transitions (chronological ↔ alpha/platform, or search on/off) work cleanly.
  while (sectionRecent.firstChild) sectionRecent.removeChild(sectionRecent.firstChild);

  if (nonPinned.length === 0) {
    sectionRecent.hidden = true;
    return;
  }
  sectionRecent.hidden = false;

  const sorted = nonPinned.slice().sort(getComparator(sortBy));

  // Date grouping only applies when sorted chronologically AND not searching.
  const showDateGroups = sortOption.chronological && !searchQuery;

  if (showDateGroups) {
    const buckets = { today: [], thisWeek: [], earlier: [] };
    const groupKey = sortBy === 'lastAccessedAt' ? 'lastAccessedAt' : 'savedAt';
    sorted.forEach((c) => {
      buckets[getDateGroup(c[groupKey] || c.savedAt)].push(c);
    });
    appendGroupSection(sectionRecent, 'Today', buckets.today);
    appendGroupSection(sectionRecent, 'This week', buckets.thisWeek);
    appendGroupSection(sectionRecent, 'Earlier', buckets.earlier);
  } else {
    // Flat list, no header. Pinned section header above remains if any.
    const listDiv = document.createElement('div');
    listDiv.className = 'chat-list';
    sorted.forEach((c) => listDiv.appendChild(createChatCard(c)));
    sectionRecent.appendChild(listDiv);
  }
}

const PLATFORM_DISPLAY_NAMES = {
  claude: 'Claude',
  chatgpt: 'GPT',
  gemini: 'Gemini',
  grok: 'Grok',
  perplexity: 'Perplexity',
  deepseek: 'DeepSeek'
};

function getEmptyListMessage() {
  if (searchQuery) {
    return {
      title: 'No chats match your search.',
      subtitle: 'Try a different term or clear the search.'
    };
  }
  if (activePlatform) {
    const name = PLATFORM_DISPLAY_NAMES[activePlatform] || activePlatform;
    return {
      title: 'No chats saved from ' + name + ' yet.',
      subtitle: 'Save one from a ' + name + ' chat to see it here.'
    };
  }
  if (activeFolder !== null && activeFolder !== ARCHIVE_VIEW) {
    return {
      title: 'No chats in this folder.',
      subtitle: 'Move a chat here from the \u201C\u22EF\u201D menu on any card.'
    };
  }
  return {
    title: 'No saved chats yet.',
    subtitle: 'Save any AI chat with the button above.'
  };
}

function showListEmpty(msg) {
  if (!sectionListEmpty) return;
  const titleEl = sectionListEmpty.querySelector('.archive-empty-title');
  const subEl = sectionListEmpty.querySelector('.archive-empty-subtitle');
  if (titleEl) titleEl.textContent = msg.title;
  if (subEl) subEl.textContent = msg.subtitle;
  sectionListEmpty.hidden = false;
}

function hideListEmpty() {
  if (sectionListEmpty) sectionListEmpty.hidden = true;
}

function appendGroupSection(parent, label, chats) {
  if (chats.length === 0) return;
  const header = document.createElement('h2');
  header.className = 'section-header';
  header.textContent = label;
  const listDiv = document.createElement('div');
  listDiv.className = 'chat-list';
  chats.forEach((c) => listDiv.appendChild(createChatCard(c)));
  parent.appendChild(header);
  parent.appendChild(listDiv);
}

function createChatCard(chat) {
  const card = document.createElement('div');
  card.className = 'chat-card';
  card.dataset.chatId = chat.id;
  card.draggable = true;

  // Drag source wiring. Ignore drags that originate from interactive children
  // (buttons, the contenteditable notes field, or the title while editing) so
  // star / pencil / "..." / notes / inline title edit still work normally.
  card.addEventListener('dragstart', (e) => {
    const t = e.target;
    if (
      t && t.nodeType === 1 && (
        t.closest('button') ||
        t.closest('.chat-notes-input') ||
        t.isContentEditable
      )
    ) {
      e.preventDefault();
      return;
    }
    try {
      e.dataTransfer.setData('text/plain', chat.id);
      e.dataTransfer.effectAllowed = 'move';
    } catch { /* dataTransfer may be restricted; continue with classes-only */ }
    card.classList.add('dragging');
    setDragVisuals(true);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    setDragVisuals(false);
    // Close the dropdown if the drag ended without a drop (cancel / drop outside).
    // If the drop handler already closed it, this is a no-op.
    folderDropdown.classList.remove('open');
  });

  // Header row
  const header = document.createElement('div');
  header.className = 'chat-card-header';

  // Body (title + meta)
  const body = document.createElement('div');
  body.className = 'chat-card-body';

  const title = document.createElement('div');
  title.className = 'chat-title';
  const titleText = chat.title || 'Untitled chat';
  // Highlight current search substring via <mark>. XSS-safe: every part is built
  // with createElement + textContent — user input never reaches innerHTML.
  if (searchQuery) {
    renderHighlightedTitle(titleText, searchQuery).forEach((node) => {
      title.appendChild(node);
    });
  } else {
    title.textContent = titleText;
  }
  title.addEventListener('click', () => {
    if (title.isContentEditable) return;
    openChat(chat.url);
  });

  const meta = document.createElement('div');
  meta.className = 'chat-meta';
  const dateStr = formatDate(chat.savedAt);
  const msgStr = chat.messageCount ? ` \u00b7 ${chat.messageCount} messages` : '';
  meta.textContent = `${dateStr}${msgStr}`;

  body.appendChild(title);
  body.appendChild(meta);

  // Top-right actions (star + pencil)
  const actions = document.createElement('div');
  actions.className = 'chat-actions';

  const starBtn = document.createElement('button');
  starBtn.className = 'btn-icon' + (chat.isPinned ? ' active' : '');
  starBtn.innerHTML = chat.isPinned ? ICONS.starFilled : ICONS.starOutline;
  starBtn.title = chat.isPinned ? 'Unpin' : 'Pin';
  starBtn.addEventListener('click', () => togglePin(chat));

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-icon';
  editBtn.innerHTML = ICONS.pencil;
  editBtn.title = 'Edit title';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startTitleEdit(title, chat);
  });

  actions.appendChild(starBtn);
  actions.appendChild(editBtn);

  header.appendChild(body);
  header.appendChild(actions);

  // 3-dot menu (rendered in bottom-right footer)
  const menuWrapper = document.createElement('div');
  menuWrapper.className = 'card-menu-wrapper';

  const menuBtn = document.createElement('button');
  menuBtn.className = 'btn-menu';
  menuBtn.textContent = '\u22EF';
  menuBtn.title = 'More';

  const menu = document.createElement('div');
  menu.className = 'card-menu';

  const openItem = document.createElement('div');
  openItem.className = 'card-menu-item';
  openItem.textContent = 'Open';

  const archiveItem = document.createElement('div');
  archiveItem.className = 'card-menu-item';
  archiveItem.textContent = chat.isArchived ? 'Unarchive' : 'Archive';

  const addCommentItem = document.createElement('div');
  addCommentItem.className = 'card-menu-item';
  addCommentItem.textContent = 'Add comment';

  const moveToFolderItem = document.createElement('div');
  moveToFolderItem.className = 'card-menu-item';
  moveToFolderItem.textContent = 'Move to folder';

  const deleteItem = document.createElement('div');
  deleteItem.className = 'card-menu-item danger';
  deleteItem.textContent = 'Delete';

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    closeAllMenus();
    if (!wasOpen) {
      menu.classList.add('open');
      positionDropdown(menuBtn, menu);
    }
  });

  openItem.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.remove('open');
    openChat(chat.url);
  });

  archiveItem.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.remove('open');
    const nextArchived = !chat.isArchived;
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.UPDATE_CHAT,
      chatId: chat.id,
      updates: {
        isArchived: nextArchived,
        archivedAt: nextArchived ? new Date().toISOString() : null
      }
    });
  });

  addCommentItem.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.remove('open');
    notesContainer.hidden = false;
    notesInput.focus();
  });

  moveToFolderItem.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.remove('open');
    showFolderAssignModal(chat);
  });

  deleteItem.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.remove('open');
    showDeleteModal(chat);
  });

  menu.appendChild(openItem);
  menu.appendChild(archiveItem);
  menu.appendChild(addCommentItem);
  menu.appendChild(moveToFolderItem);
  menu.appendChild(deleteItem);
  menuWrapper.appendChild(menuBtn);
  menuWrapper.appendChild(menu);

  // Tags row (platform + folder)
  const tags = document.createElement('div');
  tags.className = 'chat-tags';

  // Platform tag
  const platform = chat.platform || 'claude';
  const platformPill = document.createElement('span');
  platformPill.className = 'tag-pill tag-pill--' + platform;

  const platformMeta = {
    claude:     { icon: '../icons/platform-claude.svg',  label: 'Claude' },
    chatgpt:    { icon: '../icons/platform-gpt.svg',     label: 'GPT' },
    gemini:     { icon: '../icons/platform-gemini.svg',  label: 'Gemini' },
    grok:       { icon: '../icons/platform-grok.svg',    label: 'Grok' },
    perplexity: { icon: '../icons/perplexity-color.svg', label: 'Perplexity' },
    deepseek:   { icon: '../icons/deepseek-color.svg',   label: 'DeepSeek' }
  };
  const pInfo = platformMeta[platform] || platformMeta.claude;

  // GPT and Grok are monochrome — render as a CSS-masked span so the glyph
  // color follows the active theme. Colored-brand icons stay as <img>.
  if (platform === 'chatgpt' || platform === 'grok') {
    const maskEl = document.createElement('span');
    maskEl.className =
      'platform-mask-icon platform-mask-icon--' + (platform === 'chatgpt' ? 'gpt' : 'grok');
    platformPill.appendChild(maskEl);
  } else {
    const platformImg = document.createElement('img');
    platformImg.width = 12;
    platformImg.height = 12;
    platformImg.src = pInfo.icon;
    platformPill.appendChild(platformImg);
  }
  platformPill.appendChild(document.createTextNode(' ' + pInfo.label));

  tags.appendChild(platformPill);

  // Folder tag
  if (chat.folder) {
    const folderPill = document.createElement('span');
    folderPill.className = 'tag-pill tag-pill--folder';
    folderPill.innerHTML = ICONS.folder + ' ' + escapeText(chat.folder);
    tags.appendChild(folderPill);
  }

  // Archived tag — only shown when the user is viewing the Archive pseudo-folder.
  if (chat.isArchived && activeFolder === ARCHIVE_VIEW) {
    const archivedPill = document.createElement('span');
    archivedPill.className = 'tag-pill tag-pill--archived';
    archivedPill.textContent = 'Archived';
    tags.appendChild(archivedPill);
  }

  // Notes container (peach background, below header)
  const notesContainer = document.createElement('div');
  notesContainer.className = 'chat-notes';
  notesContainer.hidden = !chat.notes;

  const notesInput = document.createElement('div');
  notesInput.className = 'chat-notes-input';
  notesInput.contentEditable = 'true';
  notesInput.setAttribute('data-placeholder', 'Add a note...');
  if (chat.notes) notesInput.innerText = chat.notes;

  const saveNotes = debounce((value) => {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.UPDATE_CHAT,
      chatId: chat.id,
      updates: { notes: value }
    });
  }, 500);

  notesInput.addEventListener('input', () => {
    saveNotes(notesInput.innerText);
  });

  notesInput.addEventListener('blur', () => {
    if (!notesInput.innerText.trim()) {
      notesContainer.hidden = true;
    }
  });

  notesContainer.appendChild(notesInput);

  // Bottom-right footer: tags on left, menu on right
  const footer = document.createElement('div');
  footer.className = 'chat-card-footer';
  footer.appendChild(tags);
  footer.appendChild(menuWrapper);

  card.appendChild(header);
  card.appendChild(footer);
  card.appendChild(notesContainer);

  return card;
}

function startTitleEdit(titleEl, chat) {
  const originalText = titleEl.textContent;
  titleEl.contentEditable = 'true';
  titleEl.classList.add('editing');
  titleEl.focus();

  // Select all text inside the title
  const range = document.createRange();
  range.selectNodeContents(titleEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  let finished = false;

  const cleanup = () => {
    titleEl.contentEditable = 'false';
    titleEl.classList.remove('editing');
    titleEl.removeEventListener('keydown', onKey);
    titleEl.removeEventListener('blur', onBlur);
  };

  const save = () => {
    if (finished) return;
    finished = true;
    const newText = titleEl.textContent.trim();
    cleanup();
    if (!newText) {
      titleEl.textContent = originalText;
      return;
    }
    if (newText === originalText) return;
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.UPDATE_CHAT,
      chatId: chat.id,
      updates: { title: newText }
    });
  };

  const cancel = () => {
    if (finished) return;
    finished = true;
    cleanup();
    titleEl.textContent = originalText;
  };

  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const onBlur = () => save();

  titleEl.addEventListener('keydown', onKey);
  titleEl.addEventListener('blur', onBlur);
}

function escapeText(str) {
  const span = document.createElement('span');
  span.textContent = str;
  return span.innerHTML;
}

function openChat(url) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab) {
      chrome.tabs.update(tab.id, { url });
    }
  });
}

function togglePin(chat) {
  const isPinned = !chat.isPinned;
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.UPDATE_CHAT,
    chatId: chat.id,
    updates: {
      isPinned,
      pinnedAt: isPinned ? new Date().toISOString() : null
    }
  });
}

// ---- Settings ----
function showSettingsView() {
  showView('settings');
  renderSettingsFolders();
  initThemeControls(settings.theme);
  refreshStorageUsage();
}

function renderSettingsFolders() {
  settingsFolderList.textContent = '';

  if (folders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'settings-empty';
    empty.textContent = 'No folders yet';
    settingsFolderList.appendChild(empty);
    return;
  }

  const chatValues = Object.values(chats);
  folders.forEach(name => {
    const count = chatValues.filter(c => c.folder === name).length;

    const row = document.createElement('div');
    row.className = 'settings-folder-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'settings-folder-name';
    nameEl.textContent = name;

    const countEl = document.createElement('span');
    countEl.className = 'settings-folder-count';
    countEl.textContent = count + (count === 1 ? ' chat' : ' chats');

    const delBtn = document.createElement('button');
    delBtn.className = 'settings-folder-delete';
    delBtn.innerHTML = ICONS.trash;
    delBtn.title = 'Delete folder';
    delBtn.addEventListener('click', () => showFolderDeleteModal(name));

    row.appendChild(nameEl);
    row.appendChild(countEl);
    row.appendChild(delBtn);
    settingsFolderList.appendChild(row);
  });
}

// ---- Folder dropdown ----
function renderSortDropdown() {
  if (!sortDropdown) return;
  const currentSort = (settings && settings.sortBy) || 'savedAt';
  sortDropdown.textContent = '';

  SORT_OPTIONS.forEach((opt) => {
    const item = document.createElement('div');
    item.className = 'folder-dropdown-item' + (currentSort === opt.value ? ' active' : '');
    item.textContent = opt.label;
    item.addEventListener('click', async () => {
      sortDropdown.classList.remove('open');
      if (currentSort === opt.value) return;
      // Optimistically update the in-memory settings so the next render picks
      // it up immediately; persist asynchronously.
      settings = { ...settings, sortBy: opt.value };
      if (sortSelectorText) sortSelectorText.textContent = 'Sort: ' + opt.label;
      renderChatList();
      try {
        await updateSettings({ sortBy: opt.value });
      } catch (e) {
        console.error('ReThread: failed to persist sort', e);
      }
    });
    sortDropdown.appendChild(item);
  });
}

function applySortLabelToSelector() {
  if (!sortSelectorText) return;
  const opt = getSortOption((settings && settings.sortBy) || 'savedAt');
  sortSelectorText.textContent = 'Sort: ' + opt.label;
}

function renderFolderDropdown() {
  folderDropdown.textContent = '';

  const makeItem = (label, value, extraClass) => {
    const item = document.createElement('div');
    item.className = 'folder-dropdown-item' + (activeFolder === value ? ' active' : '');
    if (extraClass) item.classList.add(extraClass);
    item.textContent = label;
    item.addEventListener('click', () => {
      activeFolder = value;
      folderSelectorText.textContent = label;
      folderDropdown.classList.remove('open');
      renderChatList();
    });

    // Drop-target wiring. Only active while a chat is being dragged.
    item.addEventListener('dragover', (e) => {
      if (!document.body.classList.contains('dragging-chat')) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });
    item.addEventListener('dragenter', (e) => {
      if (!document.body.classList.contains('dragging-chat')) return;
      e.preventDefault();
      item.classList.add('drop-hover');
    });
    item.addEventListener('dragleave', (e) => {
      // Only clear when actually leaving the item, not when moving over a text node child.
      if (item.contains(e.relatedTarget)) return;
      item.classList.remove('drop-hover');
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drop-hover');
      const chatId = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
      handleDropOnFolderValue(chatId, value, label);
    });

    return item;
  };

  // Pinned pseudo-folders
  folderDropdown.appendChild(makeItem('All folders', null));
  folderDropdown.appendChild(makeItem('Archive', ARCHIVE_VIEW, 'folder-dropdown-item--archive'));

  // Separator only when there are custom folders to separate from
  if (folders.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'folder-dropdown-separator';
    folderDropdown.appendChild(separator);
  }

  folders.forEach(name => {
    folderDropdown.appendChild(makeItem(name, name));
  });
}

// ---- Folder assignment modal ----
let assignTargetChat = null;
let assignSelectedFolder = null;

function showFolderAssignModal(chat) {
  assignTargetChat = chat;
  assignSelectedFolder = chat.folder || null;
  renderFolderAssignList();
  folderAssignInput.value = '';
  folderAssignModal.classList.add('open');
}

function renderFolderAssignList() {
  folderAssignList.textContent = '';

  // "None" option
  const noneItem = document.createElement('div');
  noneItem.className = 'folder-assign-item' + (assignSelectedFolder === null ? ' selected' : '');
  const noneRadio = document.createElement('div');
  noneRadio.className = 'folder-assign-radio';
  const noneLabel = document.createElement('span');
  noneLabel.textContent = 'None';
  noneItem.appendChild(noneRadio);
  noneItem.appendChild(noneLabel);
  noneItem.addEventListener('click', () => {
    assignSelectedFolder = null;
    renderFolderAssignList();
  });
  folderAssignList.appendChild(noneItem);

  folders.forEach(name => {
    const item = document.createElement('div');
    item.className = 'folder-assign-item' + (assignSelectedFolder === name ? ' selected' : '');
    const radio = document.createElement('div');
    radio.className = 'folder-assign-radio';
    const label = document.createElement('span');
    label.textContent = name;
    item.appendChild(radio);
    item.appendChild(label);
    item.addEventListener('click', () => {
      assignSelectedFolder = name;
      renderFolderAssignList();
    });
    folderAssignList.appendChild(item);
  });
}

// ---- Delete modals ----
let pendingDeleteChat = null;
let pendingDeleteFolder = null;

function showDeleteModal(chat) {
  pendingDeleteChat = chat;
  deleteModal.classList.add('open');
}

function closeDeleteModal() {
  deleteModal.classList.remove('open');
  pendingDeleteChat = null;
}

function showFolderDeleteModal(name) {
  pendingDeleteFolder = name;
  folderDeleteModal.classList.add('open');
}

function closeFolderDeleteModal() {
  folderDeleteModal.classList.remove('open');
  pendingDeleteFolder = null;
}

// ---- Global toast ----
let appToastTimer = null;
function showAppToast(text) {
  const toast = document.getElementById('app-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('visible');
  clearTimeout(appToastTimer);
  appToastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

// ---- Drag-and-drop: move a chat into a folder ----
// Source = any .chat-card (wired in createChatCard). Target = each dropdown item
// inside #folder-dropdown (wired in makeItem below). An auto-open timer on the
// folder-selector-wrapper lets the user hover over the closed selector to open
// the dropdown mid-drag.
let folderDropHoverTimer = null;

function setDragVisuals(active) {
  document.body.classList.toggle('dragging-chat', active);
  const wrapper = document.querySelector('.folder-selector-wrapper');
  if (wrapper) wrapper.classList.toggle('drop-ready', active);
  if (!active) {
    document
      .querySelectorAll('.folder-dropdown-item.drop-hover')
      .forEach((i) => i.classList.remove('drop-hover'));
    if (folderDropHoverTimer) {
      clearTimeout(folderDropHoverTimer);
      folderDropHoverTimer = null;
    }
  }
}

function handleDropOnFolderValue(chatId, value, label) {
  if (!chatId || !chats[chatId]) return;
  const updates = {};
  let toastLabel;
  if (value === ARCHIVE_VIEW) {
    updates.isArchived = true;
    updates.archivedAt = new Date().toISOString();
    toastLabel = 'Archive';
  } else if (value === null) {
    updates.folder = null;
    toastLabel = 'All folders';
  } else {
    updates.folder = value;
    toastLabel = label || value;
  }
  try {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.UPDATE_CHAT,
      chatId,
      updates
    });
  } catch (e) {
    console.error('ReThread: drag-drop move failed', e);
  }
  folderDropdown.classList.remove('open');
  showAppToast('Moved to ' + toastLabel);
}

function closeAllMenus() {
  document.querySelectorAll('.card-menu.open').forEach((m) => {
    m.classList.remove('open');
    // Clear inline positioning so the next open starts from a clean slate.
    m.style.top = '';
    m.style.bottom = '';
    m.style.left = '';
    m.style.right = '';
    m.style.maxHeight = '';
    m.style.overflowY = '';
  });
}

// Smart auto-flip positioning for card "..." menus.
// Prefers opening downward; flips up when space below is insufficient; falls back
// to the larger side with scroll when neither fits. Treats `.list-header-sticky`
// bottom as the top of the available area so the menu never gets clipped by
// the sticky header. Menu is already `position: fixed` via CSS.
function positionDropdown(triggerEl, menuEl) {
  const triggerRect = triggerEl.getBoundingClientRect();
  // Menu must have been displayed (.open) before calling — otherwise offset*=0.
  const menuHeight = menuEl.offsetHeight || 200;
  const menuWidth = menuEl.offsetWidth || 150;

  const sticky = document.querySelector('.list-header-sticky');
  const topBound = sticky ? sticky.getBoundingClientRect().bottom : 0;
  const bottomBound = window.innerHeight;
  const gap = 4;
  const edgePad = 4;

  const spaceBelow = bottomBound - triggerRect.bottom - gap;
  const spaceAbove = triggerRect.top - topBound - gap;

  if (spaceBelow >= menuHeight) {
    menuEl.style.top = (triggerRect.bottom + gap) + 'px';
    menuEl.style.bottom = 'auto';
  } else if (spaceAbove >= menuHeight) {
    menuEl.style.bottom = (window.innerHeight - triggerRect.top + gap) + 'px';
    menuEl.style.top = 'auto';
  } else if (spaceBelow >= spaceAbove) {
    menuEl.style.top = (triggerRect.bottom + gap) + 'px';
    menuEl.style.bottom = 'auto';
    menuEl.style.maxHeight = Math.max(80, spaceBelow - edgePad) + 'px';
    menuEl.style.overflowY = 'auto';
  } else {
    menuEl.style.bottom = (window.innerHeight - triggerRect.top + gap) + 'px';
    menuEl.style.top = 'auto';
    menuEl.style.maxHeight = Math.max(80, spaceAbove - edgePad) + 'px';
    menuEl.style.overflowY = 'auto';
  }

  // Horizontal: right-align to trigger's right edge. Clamp if that would push
  // the menu's left edge off-screen (narrow panel).
  const rightOffset = window.innerWidth - triggerRect.right;
  const leftIfRightAligned = triggerRect.right - menuWidth;
  if (leftIfRightAligned < edgePad) {
    menuEl.style.left = edgePad + 'px';
    menuEl.style.right = 'auto';
  } else {
    menuEl.style.right = rightOffset + 'px';
    menuEl.style.left = 'auto';
  }
}

// ---- Listeners ----
function setupListeners() {
  // Get Started button (direct storage call — avoids service worker sleep)
  btnGetStarted.addEventListener('click', async () => {
    await updateSettings({ onboardingDone: true });
    settings.onboardingDone = true;
    render();
  });

  // Platform chips (toggle behavior — click again to deactivate)
  document.querySelectorAll('.chip[data-platform]').forEach(chip => {
    chip.addEventListener('click', () => {
      const platform = chip.dataset.platform;
      if (activePlatform === platform) {
        // Toggle off — show all
        chip.classList.remove('active');
        activePlatform = null;
      } else {
        // Activate this one, deactivate others
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activePlatform = platform;
      }
      renderChatList();
      updateArrowIndicator();
    });
  });

  // Platform pager arrow — toggles between chip pages.
  if (platformPagerArrow) {
    platformPagerArrow.addEventListener('click', togglePlatformPage);
  }

  // Search
  searchInput.addEventListener('input', debounce(() => {
    searchQuery = searchInput.value.trim();
    renderChatList();
  }, 200));

  // Settings
  btnSettings.addEventListener('click', showSettingsView);
  btnSettingsBack.addEventListener('click', () => {
    showView('list');
    renderChatList();
  });

  // Folder selector
  folderSelector.addEventListener('click', (e) => {
    e.stopPropagation();
    renderFolderDropdown();
    folderDropdown.classList.toggle('open');
    // Close the sort dropdown if it was open.
    if (sortDropdown) sortDropdown.classList.remove('open');
  });

  // Drag-over on the folder-selector-wrapper: after ~400ms of hover during a
  // chat drag, auto-open the dropdown so the user can drop on a specific folder.
  const folderWrapper = document.querySelector('.folder-selector-wrapper');
  if (folderWrapper) {
    folderWrapper.addEventListener('dragenter', (e) => {
      if (!document.body.classList.contains('dragging-chat')) return;
      e.preventDefault();
      if (folderDropdown.classList.contains('open')) return;
      if (folderDropHoverTimer) clearTimeout(folderDropHoverTimer);
      folderDropHoverTimer = setTimeout(() => {
        renderFolderDropdown();
        folderDropdown.classList.add('open');
      }, 400);
    });
    folderWrapper.addEventListener('dragleave', (e) => {
      if (folderWrapper.contains(e.relatedTarget)) return;
      if (folderDropHoverTimer) {
        clearTimeout(folderDropHoverTimer);
        folderDropHoverTimer = null;
      }
    });
    folderWrapper.addEventListener('dragover', (e) => {
      if (!document.body.classList.contains('dragging-chat')) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });
  }

  if (sortSelector && sortDropdown) {
    sortSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      renderSortDropdown();
      sortDropdown.classList.toggle('open');
      // Close the folder dropdown if it was open.
      folderDropdown.classList.remove('open');
    });
  }

  // Settings: create folder (direct storage call, no service worker round-trip)
  settingsAddFolder.addEventListener('click', async () => {
    const name = settingsNewFolder.value.trim();
    if (!name) return;
    await createFolder(name);
    settingsNewFolder.value = '';
  });

  settingsNewFolder.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') settingsAddFolder.click();
  });

  // Folder assign modal: create inline (direct storage call)
  folderAssignCreateBtn.addEventListener('click', async () => {
    const name = folderAssignInput.value.trim();
    if (!name || folders.includes(name)) return;
    await createFolder(name);
    folderAssignInput.value = '';
  });

  folderAssignInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') folderAssignCreateBtn.click();
  });

  // Folder assign modal: save
  folderAssignSave.addEventListener('click', () => {
    if (assignTargetChat) {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_CHAT,
        chatId: assignTargetChat.id,
        updates: { folder: assignSelectedFolder }
      });
    }
    folderAssignModal.classList.remove('open');
    assignTargetChat = null;
  });

  folderAssignCancel.addEventListener('click', () => {
    folderAssignModal.classList.remove('open');
    assignTargetChat = null;
  });

  // Delete modal
  modalCancel.addEventListener('click', closeDeleteModal);
  modalDelete.addEventListener('click', () => {
    if (pendingDeleteChat) {
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.DELETE_CHAT,
        chatId: pendingDeleteChat.id
      });
    }
    closeDeleteModal();
  });

  // Folder delete modal (direct storage call)
  folderModalCancel.addEventListener('click', closeFolderDeleteModal);
  folderModalDelete.addEventListener('click', async () => {
    if (pendingDeleteFolder) {
      await deleteFolder(pendingDeleteFolder);
      if (activeFolder === pendingDeleteFolder) {
        activeFolder = null;
        folderSelectorText.textContent = 'All folders';
      }
    }
    closeFolderDeleteModal();
  });

  // Close menus/dropdowns on outside click
  document.addEventListener('click', () => {
    closeAllMenus();
    folderDropdown.classList.remove('open');
    if (sortDropdown) sortDropdown.classList.remove('open');
  });

  // Close card menus on scroll — trying to keep a fixed-positioned menu anchored
  // to a scrolling trigger is fragile and adds no real UX value.
  const listContent = document.querySelector('.list-content');
  if (listContent) {
    listContent.addEventListener('scroll', closeAllMenus, { passive: true });
  }
  window.addEventListener('scroll', closeAllMenus, { passive: true });

  // Listen for storage changes (reactive updates)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.chats) {
      chats = changes.chats.newValue || {};
      // Skip re-render while user is editing notes or a title (avoids losing focus/text)
      const isEditing = document.activeElement && document.activeElement.isContentEditable;
      if (!viewSettings.hidden) {
        renderSettingsFolders();
      } else if (!isEditing) {
        render();
      }
      refreshSavedState();
    }
    if (changes.folders) {
      folders = changes.folders.newValue || [];
      if (!viewSettings.hidden) {
        renderSettingsFolders();
      }
      // Update assign modal if open
      if (folderAssignModal.classList.contains('open')) {
        renderFolderAssignList();
      }
    }
    if (changes.settings) {
      settings = changes.settings.newValue || settings;
      applyTheme(settings.theme);
      applySortLabelToSelector();
      // If the user is in the Settings view, don't re-run the outer render()
      // (which would switch them back to list/empty). Theme is already applied.
      if (viewSettings.hidden) render();
    }
  });
}

init();
