# GovernsAI Extension - Quick Start

## 🚀 Load Extension in 3 Steps

1. **Open Extensions Page**
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`

2. **Enable Developer Mode**
   - Toggle "Developer mode" in top right

3. **Load Extension**
   - Click "Load unpacked"
   - Select: `/Users/bikrambarua/Desktop/governsai/extension`
   - Extension appears in toolbar!

## ✅ Verify It's Working

### Quick Test
1. Click extension icon → "Debug Mode" button
2. Visit ChatGPT, Claude, or Gemini
3. Open browser console (F12)
4. Look for: `[GovernsAI] ... interceptor loaded`
5. Type message with email (e.g., "test@example.com")
6. Press Enter
7. Check console for interception logs ✅

## 🎛️ Current Features

### ✅ Fully Implemented
- Message interception on ChatGPT, Claude, Gemini
- PII detection (fallback regex mode)
- Policy enforcement (allow/redact/block)
- Auto-redaction of PII
- User notifications
- Functional popup UI
- Debug mode

### ⚠️ Pending
- Real Precheck API integration (using fallback)
- Options/settings page
- Extension icons
- Platform dashboard logging
- API key configuration UI

## 🧪 Test Commands

### Enable Debug Mode
```javascript
// In any tab's console
chrome.storage.local.set({ debugMode: true });
localStorage.setItem('governs-ai-debug', 'true');
```

### Change Policy Mode
```javascript
// Allow mode (default) - log only
chrome.storage.local.set({ policyMode: 'allow' });

// Redact mode - auto-redact PII
chrome.storage.local.set({ policyMode: 'redact', autoRedact: true });

// Block mode - prevent PII from being sent
chrome.storage.local.set({ policyMode: 'block' });
```

### Check Settings
```javascript
chrome.storage.local.get(null, (data) => console.log(data));
```

## 📝 Test Messages

### Email Detection
```
"Contact me at john.doe@example.com"
```

### Phone Detection
```
"Call me at (555) 123-4567"
```

### Multiple PII
```
"I'm John (john@example.com), SSN: 123-45-6789"
```

### No PII (should allow)
```
"What is artificial intelligence?"
```

## 🐛 Troubleshooting

**Extension won't load?**
- Check for syntax errors in console
- Verify all files exist
- Try reloading extension

**Interception not working?**
- Enable debug mode
- Check console for errors
- Verify you're on correct URL
- Hard refresh page (Cmd+Shift+R)

**Can't find extension icon?**
- Click puzzle piece icon in toolbar
- Pin GovernsAI extension

## 📚 Full Documentation

- **TESTING.md** - Comprehensive testing guide
- **PROJECT_SPECS.md** - Complete technical specs
- **README.md** - Project overview

## 🎯 Next Steps

1. ✅ Load and test the extension
2. ⏳ Configure real API keys (when available)
3. ⏳ Build options page for settings
4. ⏳ Create extension icons
5. ⏳ Production deployment

---

**Current Version**: 0.1.0 (Alpha)  
**Status**: Core functionality complete, API integration pending

