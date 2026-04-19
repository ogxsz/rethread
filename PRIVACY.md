# Privacy Policy

**ReThread — Chrome Extension**

Last updated: April 17, 2026

## Overview

ReThread is a browser extension that helps users bookmark and organize their AI chat conversations. This privacy policy explains what data the extension accesses and how it is handled.

## Data Collection

**ReThread does not collect, transmit, or share any user data.**

The extension stores the following information locally in your browser using `chrome.storage.local`:

- Chat URLs (links to your AI conversations)
- Page titles (the title of the chat as shown in the browser tab)
- User-created notes, folder assignments, and pin status
- Extension settings (theme preference, sort order)

This data never leaves your browser. There is no server, no database, no analytics, and no tracking of any kind.

## Data Access

The extension has access to the following websites:

- claude.ai
- chatgpt.com (and chat.openai.com)
- gemini.google.com
- grok.com
- perplexity.ai (and www.perplexity.ai)
- chat.deepseek.com

On these sites, the extension reads only two things:

1. The page URL (to identify the chat)
2. The document title (to display a readable name)

**The extension does not read, store, or transmit:**

- Chat message content
- Authentication tokens or session cookies
- Personal information (name, email, etc.)
- Browsing history outside of the supported sites
- Any data from other websites or browser tabs

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save bookmarks locally in the browser |
| `sidePanel` | Display the bookmark management panel |
| `tabs` | Detect which supported AI site is active in the current tab, so the correct chat can be captured |
| `scripting` | Re-inject the content script into already-open supported tabs after the extension is installed, updated, or reloaded |
| `host_permissions` | Inject the chat detector on the supported AI chat sites listed above |

No additional permissions are requested. ReThread does **not** request `cookies`, `webRequest`, `history`, `<all_urls>`, `clipboardRead`, or any other permission.

## Third-Party Services

ReThread does not use any third-party services, APIs, SDKs, analytics tools, or CDNs. **The extension makes no network requests of any kind** — all assets (fonts, icons, styles, scripts) are bundled with the extension and served locally from the extension package. No data is sent to any external server, including Google, Anthropic, OpenAI, or any font/CDN provider.

## Data Storage and Security

All data is stored in `chrome.storage.local`, which is sandboxed to the extension and inaccessible to other extensions or websites. Data persists until the user manually deletes it or uninstalls the extension.

## Children's Privacy

ReThread does not knowingly collect any data from children under the age of 13.

## Changes to This Policy

If this privacy policy is updated, the changes will be posted here with an updated revision date.

## Contact

If you have questions about this privacy policy, please open an issue on GitHub:

https://github.com/ogxsz/rethread/issues

## Open Source

ReThread is fully open source. You can inspect all code at:

https://github.com/ogxsz/rethread
