# Testing Guide for GovernsAI Extension

## Quick Start Testing

### 1. Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the project directory: `/Users/bikrambarua/Desktop/governsai/extension`
5. The extension should appear in your browser toolbar

### 2. Enable Debug Mode

1. Click the GovernsAI extension icon
2. Click "Debug Mode" button to enable console logging
3. This will show detailed logs in the browser console

### 3. Test on ChatGPT

#### Test 1: Basic Interception
1. Navigate to `https://chat.openai.com`
2. Open browser console (F12 or Cmd+Option+I)
3. You should see: `[GovernsAI] ChatGPT interceptor loaded`
4. Type any message and press Enter
5. Check console for interception logs

#### Test 2: PII Detection (Fallback Mode)
1. Type: "My email is john.doe@example.com and my phone is 555-123-4567"
2. Press Enter
3. You should see:
   - Console logs showing PII detection
   - Notification about detection (if in redact/block mode)
   - Message logged to background worker

#### Test 3: Allow Mode (Default)
1. Type any message with PII
2. Message should go through normally
3. Check console for "ALLOW" action

### 4. Test on Claude

1. Navigate to `https://claude.ai`
2. Open browser console
3. You should see: `[GovernsAI] Claude interceptor loaded`
4. Type a message and test similar to ChatGPT
5. Note: Claude uses contenteditable divs

### 5. Test on Gemini

1. Navigate to `https://gemini.google.com`
2. Open browser console
3. You should see: `[GovernsAI] Gemini interceptor loaded`
4. Type a message and test similar to ChatGPT
5. Note: Gemini may use rich-textarea custom elements

## Testing Different Policy Modes

### Change Policy Mode

Open extension popup and navigate to Settings (or manually edit storage):

```javascript
// In browser console on any page:
chrome.storage.local.set({ policyMode: 'redact' });
```

### Test Policy Modes

#### Allow Mode (Default)
```javascript
chrome.storage.local.set({ policyMode: 'allow' });
```
- Messages with PII are logged but sent through
- Check console for "ALLOW" action

#### Redact Mode
```javascript
chrome.storage.local.set({ policyMode: 'redact', autoRedact: true });
```
- PII should be automatically replaced with [EMAIL REDACTED], etc.
- Warning notification shown
- Check console for "REDACT" action

#### Block Mode
```javascript
chrome.storage.local.set({ policyMode: 'block' });
```
- Messages with PII are blocked
- Error notification shown
- Message not sent to AI
- Check console for "BLOCK" action

## Test Cases

### Email Detection
```
Test message: "Contact me at user@example.com"
Expected: Email detected
```

### Phone Number Detection
```
Test message: "Call me at (555) 123-4567 or 555-123-4567"
Expected: Phone numbers detected
```

### SSN Detection
```
Test message: "My SSN is 123-45-6789"
Expected: SSN detected
```

### Credit Card Detection
```
Test message: "Card number: 4532 1488 0343 6467"
Expected: Credit card detected
```

### Multiple PII
```
Test message: "I'm John (john@example.com), call me at 555-1234"
Expected: Email and phone detected
```

### No PII
```
Test message: "What is the capital of France?"
Expected: No PII detected, message allowed
```

## Console Commands for Testing

### Check Current Settings
```javascript
chrome.storage.local.get(null, (data) => console.log(data));
```

### Reset to Defaults
```javascript
chrome.storage.local.set({
  enabled: true,
  policyMode: 'allow',
  enabledPlatforms: ['chatgpt', 'claude', 'gemini'],
  autoRedact: true,
  debugMode: true
});
```

### Enable Debug Mode
```javascript
localStorage.setItem('governs-ai-debug', 'true');
```

### Disable Specific Platform
```javascript
chrome.storage.local.set({ 
  enabledPlatforms: ['chatgpt'] // Only ChatGPT
});
```

### Simulate API Key Configuration
```javascript
chrome.storage.local.set({
  apiKey: 'test_api_key_12345',
  orgId: 'test_org_123'
});
```

## Troubleshooting

### Extension Not Loading
- Check console for errors
- Verify all files are present
- Try reloading the extension

### Content Scripts Not Running
- Check if URL matches manifest patterns
- Look for CSP (Content Security Policy) errors
- Verify the page has loaded completely

### Interception Not Working
- Check if textarea/input element exists
- Enable debug mode and check console
- Verify event listeners are attached

### Background Worker Issues
- Go to `chrome://extensions/`
- Click "Service Worker" under the extension
- Check the service worker console for errors

## Expected Console Output

### Successful Load
```
[GovernsAI] Background service worker initialized
[GovernsAI] ChatGPT interceptor loaded
[GovernsAI] Setting up ChatGPT interception
[GovernsAI] Textarea found: <element>
[GovernsAI] Enter key listener attached
```

### Message Interception
```
[GovernsAI] Intercepting message: My email is...
[GovernsAI] Processing message from chatgpt: My email is...
[GovernsAI] Fallback PII detection: { hasPII: true, entities: 1 }
[GovernsAI] Policy decision: { action: 'ALLOW', reason: '...' }
[GovernsAI] Background response: { action: 'ALLOW', ... }
[GovernsAI] Message allowed, proceeding with original send
```

## Known Limitations

1. **API Integration**: Precheck API is not yet connected (uses fallback detection)
2. **Platform Detection**: DOM selectors may need updates as platforms change
3. **Icons**: Placeholder icons not yet created
4. **Logging**: GovernsAI platform logging not yet implemented

## Next Steps for Full Testing

1. Configure actual Precheck API endpoint
2. Test with real API credentials
3. Verify platform logging works
4. Test across different browsers (Chrome, Edge, Brave)
5. Test with various edge cases (long messages, special characters, etc.)

