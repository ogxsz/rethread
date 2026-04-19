# ReThread

**Your AI chats, always within reach.**

Save, organize and search your conversations across Claude, ChatGPT, Gemini, Grok, Perplexity and DeepSeek.

[Install](#install) · [Features](#features) · [Platforms](#supported-platforms) · [Privacy](#privacy) · [Development](#development) · [License](#license)

---

## Install

### Chrome Web Store (recommended)

(https://chromewebstore.google.com/detail/rethread/mcpigebgpacoicdomgikopcmcibonkoj)

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

**Platform filter** — Quickly filter your saved chats by platform.

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
| Perplexity | perplexity.ai | ✅ Full support |
| DeepSeek | chat.deepseek.com | ✅ Full support |

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
- **No network requests** — all assets (fonts, icons, styles) are bundled with the extension; nothing is fetched from any CDN
- **No cookies or auth tokens** — content scripts run in isolated world, cannot access page JavaScript
- **Open source** — inspect every line of code yourself

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

### Permissions explained

| Permission | Why |
|------------|-----|
| `storage` | Save your bookmarks locally |
| `sidePanel` | Display the management panel |
| `tabs` | Detect which supported AI site is active in the current tab |
| `scripting` | Re-inject the chat detector into already-open supported tabs after install/update |
| `host_permissions` | Inject the chat detector on the six supported AI sites |

**Never requested:** `cookies`, `webRequest`, `history`, `<all_urls>`, `clipboardRead`.

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

```
rethread/
├── manifest.json                      # Extension manifest (MV3)
├── background/
│   └── service-worker.js              # Message broker
├── content/
│   └── content-script.js              # Active-chat detector (reports to side panel)
├── sidepanel/
│   ├── sidepanel.html                 # Panel markup
│   ├── sidepanel.js                   # Panel logic
│   ├── sidepanel-current-chat.js      # Current Chat Section module
│   ├── sidepanel-settings.js          # Settings module
│   └── sidepanel.css                  # Panel styles
├── shared/
│   ├── platforms.js                   # Platform configs
│   ├── storage.js                     # Storage abstraction
│   ├── constants.js                   # Constants
│   └── utils.js                       # Utilities
└── icons/                             # Extension & platform icons
```

### Adding a new platform

1. Add a config entry to `shared/platforms.js` with hostname, URL pattern, and title extractor
2. Add the domain to `manifest.json` in both `host_permissions` and `content_scripts.matches`, and mirror it in `SUPPORTED_HOSTS` / `SUPPORTED_MATCHES` in `background/service-worker.js`
3. Add the platform icon SVG to `icons/` and map it in the Current Chat Section's `PLATFORM_ICON` in `sidepanel/sidepanel-current-chat.js`
4. Add a platform tag color and chip row entry in `sidepanel/sidepanel.css` / `sidepanel.html`, and append the platform id to `PLATFORM_ORDER` in `sidepanel/sidepanel.js`

That's it — the universal content script handles detection.

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
