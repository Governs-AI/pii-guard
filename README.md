# GovernsAI Browser Extension

> AI governance extension for ChatGPT, Claude, and Gemini - ensuring data privacy and policy compliance.

## 🎯 What It Does

The GovernsAI Extension monitors and manages your interactions with AI platforms:

- **Intercepts** messages sent to ChatGPT, Claude, and Gemini
- **Scans** for personally identifiable information (PII) using the Precheck API
- **Redacts** sensitive data automatically (configurable)
- **Blocks** requests that violate organizational policies
- **Logs** all interactions to the GovernsAI dashboard
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
3. Enter your GovernsAI API credentials
4. Configure your policy preferences
5. Select which AI platforms to monitor

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
- All API calls use HTTPS
- Compliant with Chrome Extension security policies

## 📄 License

TBD

## 🤝 Contributing

TBD

---

For detailed technical documentation, see [PROJECT_SPECS.md](PROJECT_SPECS.md)
