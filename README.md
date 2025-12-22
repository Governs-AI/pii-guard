# GovernsAI Browser Extension

> AI governance extension for ChatGPT, Claude, and Gemini - ensuring data privacy and policy compliance.

## 🎯 What It Does

The GovernsAI Extension monitors and manages your interactions with AI platforms:

- **Intercepts** messages sent to ChatGPT, Claude, and Gemini
- **Scans** for personally identifiable information (PII) using the Precheck API (configurable endpoint)
- **Redacts** sensitive data automatically (configurable)
- **Blocks** requests that violate organizational policies
- **Logs** interactions to the GovernsAI dashboard when enabled
- **Enforces** tool usage policies for AI features

## 📦 Project Structure

```
governs-ai-extension/
├── manifest.json                 # Extension configuration
├── background/                   # Background service worker
│   ├── service-worker.js        # Main background logic
│   ├── precheck-client.js       # Precheck API integration
│   └── policy-engine.js         # Policy evaluation
├── content-scripts/              # Platform interceptors
│   ├── chatgpt.js
│   ├── claude.js
│   ├── gemini.js
│   └── common.js
├── popup/                        # Extension popup UI
├── options/                      # Settings page
├── utils/                        # Shared utilities
└── assets/                       # Icons and styles
```

## 🚀 Getting Started

### Installation (Development)

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the project root directory
6. The extension will appear in your browser toolbar

### Configuration

1. Click the GovernsAI extension icon
2. Go to "Settings" or right-click → "Options"
3. Set the Precheck API endpoint (local, console, or custom)
4. Add your GovernsAI API key (required in all modes)
5. Optionally enable dashboard logging
6. Configure your policy preferences and platforms

### Modes

- **Local**: `http://localhost:8000/api/v1` (privacy-first, run Precheck locally)
- **Console**: `https://app.governsai.com/api/v1` (full dashboard, managed platform)
- **Self-hosted**: your own domain (full features with private hosting)

## 🏗️ Development Status

**Current Version**: 0.1.0 (Alpha)  
**Status**: Initial project structure created

See [PROJECT_SPECS.md](PROJECT_SPECS.md) for complete technical documentation.

## 📋 Implementation Roadmap

- [x] Project structure setup
- [ ] Content script interceptors
- [ ] Precheck API integration
- [ ] Policy engine implementation
- [ ] UI development
- [ ] Testing & refinement
- [ ] Chrome Web Store submission

## 🔒 Privacy & Security

- Messages are processed in memory only
- No local storage of message content
- API keys encrypted by Chrome storage
- Remote API calls use HTTPS; local endpoints may use HTTP
- Compliant with Chrome Extension security policies

## 📄 License

TBD

## 🤝 Contributing

TBD

---

For detailed technical documentation, see [PROJECT_SPECS.md](PROJECT_SPECS.md)
