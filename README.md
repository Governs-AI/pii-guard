# pii-guard

[![npm](https://img.shields.io/npm/v/%40governs-ai%2Fsdk?label=npm%20%40governs-ai%2Fsdk)](https://www.npmjs.com/package/@governs-ai/sdk)
[![PyPI](https://img.shields.io/pypi/v/governs-ai-sdk?label=PyPI%20governs-ai-sdk)](https://pypi.org/project/governs-ai-sdk/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Stops you from accidentally sending PII to ChatGPT, Claude, and Gemini.

## Why this exists

AI chat interfaces make it too easy to paste sensitive data. This extension intercepts your messages, detects PII (emails, phone numbers, SSNs, credit cards, etc.), and either redacts or blocks the message before it hits the AI provider.

![GovernsAI Extension in Action](flow.gif)

## Status: Alpha / Works Locally

- ✅ Intercepts ChatGPT, Claude, Gemini
- ✅ PII detection via Precheck API
- ✅ Auto-redaction
- ✅ Image attachment scanning (OCR-based, client-side)
- ✅ Dashboard logging (optional)
- 🚧 Chrome Web Store submission pending

## Install (Dev Mode)

1. Clone this repo
2. `npm install && npm run build`
3. Chrome → `chrome://extensions/` → Enable Developer Mode
4. Load unpacked → select this folder
5. Done

**Note**: Local mode works without an API key if you run Precheck locally. Console mode requires a free API key from governsai.com.

## Configure

Click the extension icon → Settings:
- **Local mode**: Runs on `localhost:8000` (privacy-first, no data leaves your machine, no API key required)
- **Console mode**: Uses GovernsAI dashboard at `app.governsai.com` (requires API key for logging/policies)
- **Allowed endpoint hosts**: `*.governsai.com`, `*.governs.ai`, `localhost`, `127.0.0.1`

## Security Defaults

- **Fail-closed on Precheck errors**: If Precheck is unavailable or the extension runtime fails, messages are blocked instead of sent.
- **Least-privilege host permissions**: The extension no longer requests wildcard host access.
- **Manifest V3**: Uses a background service worker and MV3-compatible APIs.

See `MV3_COMPLIANCE.md` for the compliance checklist.

## How it works

### Text messages
```
User types message → Extension intercepts → Precheck API scans → Policy applied → Action taken
     ↓                      ↓                       ↓                  ↓              ↓
  ChatGPT/              Content Script          PII Detection      Server Policy    Allow/
  Claude/Gemini                                                                    Redact/Block
```

**Three simple steps:**
1. **Intercept**: Extension catches your message before it's sent to ChatGPT, Claude, or Gemini
2. **Analyze**: Precheck API scans for sensitive information (PII) and applies your organization's policies
3. **Protect**: Based on policy, the message is either allowed, has PII redacted, or is blocked entirely

### Image attachments (ChatGPT)

Images are scanned before they're sent using a fully client-side OCR pipeline — no pixel data leaves your browser.

```
User attaches image → Extension extracts image at Send time → OCR (Tesseract.js, offscreen doc)
        ↓                                                              ↓
  ChatGPT file                                               Text extracted from image
  attachment                                                            ↓
                                                             Precheck API scans text
                                                                        ↓
                                                              Allow / Block (no redact)
```

- **OCR runs entirely in the browser** via a hidden [MV3 Offscreen Document](https://developer.chrome.com/docs/extensions/reference/api/offscreen) — Tesseract.js never sends image data anywhere
- Images with no detectable text pass through without being blocked
- Images larger than 2 MB are skipped (OCR not attempted)
- Because pixel-level redaction is not feasible, the only actions for images are **Allow** or **Block** — if PII is found, the user is asked to remove the attachment

## License

MIT

## Contributing

It works but it's rough. PRs welcome, especially for:
- Additional PII patterns
- Better UI/UX
- More AI platform support
