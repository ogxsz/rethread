# ReThread

**Your AI chats, always within reach.**

Save, organize and search your conversations across Claude, ChatGPT, Gemini and Grok.

[Install](#install) · [Features](#features) · [Platforms](#supported-platforms) · [Privacy](#privacy) · [Development](#development) · [License](#license)

---

## Install

### Chrome Web Store (recommended)

> Coming soon — review in progress.

### Manual install (Developer Mode)

1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome, Edge, or Brave
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the project folder
5. Pin ReThread to your toolbar — done!

---

## Features

**One-click save** — Bookmark any AI conversation with a single click. A Save button appears on every supported platform.

**Side Panel UI** — All your saved chats live in a clean side panel that stays open while you browse. No popups, no new tabs.

**Pin & prioritize** — Pin your most important chats to the top for instant access.

**Add notes** — Attach context, reminders, or key takeaways directly to any saved chat.

**Folders** — Group chats into custom folders to keep things organized.

**Platform filter** — Quickly filter your saved chats by Claude, ChatGPT, Gemini, or Grok.

**Search** — Find any saved chat by title instantly.

**Keyboard shortcuts** — `Ctrl+Shift+S` to quick-save, `Ctrl+Shift+L` to toggle the panel.

---

## Supported Platforms

| Platform | Domain | Status |
|----------|--------|--------|
| Claude | claude.ai | ✅ Full support |
| ChatGPT | chatgpt.com | ✅ Full support |
| Gemini | gemini.google.com | ✅ Full support |
| Grok | grok.com | ✅ Full support |

Each platform has a native-feeling Save button styled to match its design language.

---

## How It Works

ReThread is a Chrome extension built on Manifest V3 with three components:

**Content Script** — Injects a Save button on supported AI chat pages. Detects the current chat via URL pattern and captures the title from `document.title`. Runs in an isolated world with no access to page JavaScript or auth tokens.

**Side Panel** — The main UI where you manage saved chats. Supports pinning, notes, folders, search, and platform filtering. Opens alongside the page without disrupting your workflow.

**Service Worker** — A lightweight message broker between the content script and side panel. Wakes only when needed.

All data is stored locally in `chrome.storage.local`. Nothing leaves your browser.

---

## Privacy

ReThread is built with a privacy-first architecture:

- **No server, no accounts, no tracking** — all data stays in your browser's local storage
- **No chat content access** — only saves URLs and page titles, never reads your conversations
- **Minimal permissions** — only `storage`, `sidePanel`, and access to the four supported AI domains
- **No cookies or auth tokens** — content scripts run in isolated world, cannot access page JavaScript
- **Open source** — inspect every line of code yourself

### Permissions explained

| Permission | Why |
|------------|-----|
| `storage` | Save your bookmarks locally |
| `sidePanel` | Display the management panel |
| `host_permissions` | Inject Save button on supported AI sites |

**Never requested:** `cookies`, `webRequest`, `tabs`, `<all_urls>`, `clipboardRead`, `history`.

---

## Tech Stack

- **Manifest V3** — Modern Chrome extension architecture
- **Vanilla JavaScript** — Zero npm dependencies in production
- **Shadow DOM** — CSS isolation for injected UI elements
- **chrome.storage.local** — Local-only data persistence
- **Side Panel API** — Persistent UI alongside the page

Total extension size: ~80 KB.

---

## Development

### Project structure

rethread/
├── manifest.json            # Extension manifest (MV3)
├── background/
│   └── service-worker.js    # Message broker
├── content/
│   ├── content-script.js    # Save button injection
│   └── content-styles.css   # Shadow DOM styles
├── sidepanel/
│   ├── sidepanel.html       # Panel markup
│   ├── sidepanel.js         # Panel logic
│   └── sidepanel.css        # Panel styles
├── shared/
│   ├── platforms.js         # Platform configs
│   ├── storage.js           # Storage abstraction
│   ├── constants.js         # Constants
│   └── utils.js             # Utilities
└── icons/                   # Extension & platform icons

### Adding a new platform

1. Add a config entry to `shared/platforms.js` with hostname, URL pattern, title extractor, and button styles
2. Add the domain to `manifest.json` in both `host_permissions` and `content_scripts.matches`
3. Add platform-specific button CSS in `content/content-styles.css` using `:host(.platform-name)` selector
4. Add the platform icon SVG to `icons/`

That's it — the universal content script handles the rest.

### Local development

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked" and select the project folder
4. Make changes, then click the reload button on the extension card

---

## Roadmap

- Export/import bookmarks as JSON
- Dark theme synced with platform
- Auto-save on chat visit
- Cross-device sync via chrome.storage.sync
- Tag system for granular organization
- Usage analytics dashboard (local only)

---

## Contributing

Contributions are welcome! Feel free to open issues for bugs or feature requests, or submit a pull request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

[MIT](LICENSE) — free for personal and commercial use.

---

Built by [Monceau](https://github.com/ogxsz)
