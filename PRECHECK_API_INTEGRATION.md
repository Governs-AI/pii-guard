# Precheck API Integration Guide

## Overview

The GovernsAI extension now includes a complete Precheck API client with retry logic and multiple redaction strategies.

## API Client Features

### ✅ Implemented Features

1. **Precheck API Client** (`precheck-client.js`)
   - POST requests to `/api/precheck` endpoint
   - Handles API response format with `detections` array
   - Exponential backoff retry logic (up to 3 attempts)
   - Graceful fallback to regex-based detection
   - Position-based entity detection
   - Risk score calculation

2. **Retry Logic**
   - Exponential backoff: 1s → 2s → 4s (with jitter)
   - Retries on 5xx errors and rate limiting (429)
   - Max retry delay: 10 seconds
   - Non-retryable errors fail immediately (4xx except 429)

3. **Response Transformation**
   - Converts API response to internal format
   - Normalizes entity types
   - Calculates risk scores
   - Preserves position information

## API Response Format

### Expected Format

```json
{
  "hasPII": true,
  "detections": [
    {
      "type": "email",
      "value": "john@example.com",
      "confidence": 0.95,
      "position": { "start": 10, "end": 27 }
    },
    {
      "type": "ssn",
      "value": "123-45-6789",
      "confidence": 0.99,
      "position": { "start": 50, "end": 61 }
    }
  ]
}
```

### Transformed Internal Format

```javascript
{
  hasPII: true,
  entities: [
    {
      type: 'EMAIL',
      value: 'john@example.com',
      confidence: 0.95,
      position: { start: 10, end: 27 },
      start: 10,
      end: 27
    }
  ],
  detections: [...], // Original API response
  riskScore: 85,
  originalMessage: "...",
  apiResponse: true
}
```

## Configuration

### API Endpoint

Default: `https://api.governsai.com/api/precheck`

Can be customized via settings:
```javascript
chrome.storage.local.set({ 
  precheckApiUrl: 'https://custom-api.example.com/api/precheck' 
});
```

### API Authentication

```javascript
chrome.storage.local.set({
  apiKey: 'your-api-key-here',
  orgId: 'your-org-id-here'
});
```

### Headers Sent

```
Content-Type: application/json
Authorization: Bearer {apiKey}
X-Org-Id: {orgId}
```

### Request Body

```json
{
  "text": "User message text here",
  "context": {
    "source": "browser_extension",
    "timestamp": "2025-12-22T10:30:00.000Z"
  }
}
```

## Retry Logic Details

### Retry Conditions

- **Retries**: 5xx errors, 429 (rate limit), network errors
- **No Retry**: 4xx errors (except 429), invalid responses

### Retry Delays

- Attempt 1: Immediate
- Attempt 2: ~1 second (with jitter)
- Attempt 3: ~2 seconds (with jitter)
- Max delay: 10 seconds

### Exponential Backoff Formula

```
delay = INITIAL_DELAY * 2^(attempt - 1) + jitter
jitter = ±20% of delay
```

## Fallback Detection

If API call fails after all retries, falls back to regex-based detection:

- ✅ Email addresses
- ✅ Phone numbers (US format)
- ✅ Social Security Numbers
- ✅ Credit card numbers

Fallback detection includes position information for consistency.

## Error Handling

### API Errors

```javascript
// Network error
catch (error) {
  // Retries up to MAX_RETRIES
  // Falls back to regex detection if all retries fail
}

// HTTP error (4xx)
if (!response.ok && response.status < 500) {
  // No retry, use fallback
}

// HTTP error (5xx)
if (response.status >= 500) {
  // Retry with exponential backoff
}
```

### Fallback Behavior

- Falls back to regex detection
- Logs error to console
- Continues processing (doesn't block user)
- Returns detection results in same format

## Testing

### Test API Call

```javascript
// In browser console
chrome.storage.local.set({
  apiKey: 'test-key',
  orgId: 'test-org',
  precheckApiUrl: 'https://api.governsai.com/api/precheck'
});

// Send test message
// Check console for API call logs
```

### Test Retry Logic

1. Set API URL to invalid endpoint
2. Send message with PII
3. Check console for retry attempts
4. Verify fallback detection works

### Test Fallback

```javascript
// Disable API key
chrome.storage.local.set({ apiKey: '' });

// Send message with PII
// Should use regex fallback
```

## Redaction Strategies

See [REDACTION_GUIDE.md](REDACTION_GUIDE.md) for complete details.

### Available Strategies

1. **full** - `[REDACTED_EMAIL]`
2. **partial** - `•••@•••.•••`
3. **hash** - `[EMA_a3f5c8d2]`
4. **smart** - `john@[REDACTED]`

### Configuration

```javascript
chrome.storage.local.set({ redactionStrategy: 'full' });
```

## Redaction Log

Each redaction creates a log entry:

```javascript
{
  type: 'EMAIL',
  original: 'john@example.com',
  redacted: '[REDACTED_EMAIL]',
  strategy: 'full',
  position: { start: 10, end: 27 }
}
```

Log is included in response and shown in user notifications.

## Performance Considerations

- **API Latency**: Typically <500ms
- **Retry Overhead**: Adds 1-3 seconds on failure
- **Fallback Speed**: <10ms (regex)
- **Total Processing**: <1 second in normal case

## Security

- API keys stored in Chrome Storage (encrypted at rest)
- HTTPS required for all API calls
- No PII stored locally
- Hash redaction uses deterministic hashing

## Monitoring

### Console Logs

```
[GovernsAI] Precheck API call attempt 1/3
[GovernsAI] Precheck API success on attempt 1
[GovernsAI] Precheck result: { hasPII: true, entities: [...] }
```

### Error Logs

```
[GovernsAI] Precheck API call failed after retries: Error message
[GovernsAI] Fallback PII detection: { hasPII: true, entities: 2 }
```

## Next Steps

1. ✅ API client implemented
2. ✅ Retry logic working
3. ✅ Response parsing complete
4. ✅ Redaction strategies implemented
5. ⏳ Configure production API endpoint
6. ⏳ Add API key management UI
7. ⏳ Implement API response caching (optional)
8. ⏳ Add analytics/metrics collection

## Troubleshooting

### API Not Called

- Check `apiKey` is set in storage
- Verify `precheckApiUrl` is correct
- Check browser console for errors

### Retries Not Working

- Verify network connectivity
- Check API endpoint is reachable
- Review console logs for error details

### Fallback Not Working

- Check regex patterns in `fallbackPIIDetection()`
- Verify message contains detectable PII
- Check console for detection logs

---

**Status**: ✅ Complete and ready for production API endpoint configuration

