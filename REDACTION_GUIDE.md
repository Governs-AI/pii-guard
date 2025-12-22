# Redaction Strategies Guide

The GovernsAI extension supports multiple redaction strategies for handling PII. Each strategy has different use cases and privacy implications.

## Available Strategies

### 1. Full Redaction (Default)
**Strategy**: `full`

Replaces PII with generic placeholders.

**Examples:**
- Email: `john@example.com` → `[REDACTED_EMAIL]`
- Phone: `(555) 123-4567` → `[REDACTED_PHONE]`
- SSN: `123-45-6789` → `[REDACTED_SSN]`
- Credit Card: `4532 1488 0343 6467` → `[REDACTED_CREDIT_CARD]`

**Use Cases:**
- Maximum privacy protection
- Compliance with strict data protection regulations
- When original format is not needed

**Pros:**
- Complete privacy protection
- No information leakage
- Simple and clear

**Cons:**
- Loses all context
- May make messages less readable

---

### 2. Partial Redaction
**Strategy**: `partial`

Shows masked version with structure preserved.

**Examples:**
- Email: `john@example.com` → `•••@•••.•••`
- Phone: `(555) 123-4567` → `(•••) •••-••••`
- SSN: `123-45-6789` → `•••-••-••••`
- Credit Card: `4532 1488 0343 6467` → `•••• •••• •••• 6467`

**Use Cases:**
- When format/structure is important
- Testing and debugging
- User education about PII

**Pros:**
- Preserves format
- More readable than full redaction
- Shows what type of data was present

**Cons:**
- May reveal some information through length
- Less privacy than full redaction

---

### 3. Hash Redaction
**Strategy**: `hash`

Replaces with hash for tracking without exposing value.

**Examples:**
- Email: `john@example.com` → `[EMA_a3f5c8d2]`
- Phone: `(555) 123-4567` → `[PHO_9b2e4f1a]`
- SSN: `123-45-6789` → `[SSN_7c1d9e3b]`

**Use Cases:**
- Tracking repeated PII across messages
- Analytics without exposing data
- Audit trails

**Pros:**
- Enables tracking of same PII across sessions
- Useful for analytics
- Deterministic (same value = same hash)

**Cons:**
- Less readable
- Hash collisions possible (unlikely with 8 chars)
- Requires hash storage for reverse lookup (if needed)

---

### 4. Smart Redaction
**Strategy**: `smart`

Context-aware redaction that preserves some useful parts.

**Examples:**
- Email: `john@example.com` → `john@[REDACTED]`
- Phone: `(555) 123-4567` → `(555) [REDACTED]`
- SSN: `123-45-6789` → `[REDACTED]-45-6789`
- Credit Card: `4532 1488 0343 6467` → `[REDACTED] 6467`

**Use Cases:**
- When partial information is useful
- Domain/area code identification
- Last 4 digits for verification

**Pros:**
- Balances privacy and utility
- More readable than full redaction
- Preserves useful context

**Cons:**
- Less privacy than full redaction
- May reveal identifying information
- Not suitable for strict compliance

---

## Configuration

### Via Chrome Storage API

```javascript
// Set redaction strategy
chrome.storage.local.set({ redactionStrategy: 'full' });
chrome.storage.local.set({ redactionStrategy: 'partial' });
chrome.storage.local.set({ redactionStrategy: 'hash' });
chrome.storage.local.set({ redactionStrategy: 'smart' });
```

### Via Extension Popup

1. Click extension icon
2. Go to Settings
3. Select "Redaction Strategy"
4. Choose desired strategy

### Default Behavior

- **Default Strategy**: `full`
- **Fallback**: If invalid strategy, uses `full`

---

## Redaction Log

Each redaction operation creates a log entry:

```javascript
{
  type: 'EMAIL',
  original: 'john@example.com',
  redacted: '[REDACTED_EMAIL]',
  strategy: 'full',
  position: { start: 10, end: 27 }
}
```

The log is included in the response and shown in notifications.

---

## Examples

### Example 1: Email Detection

**Original:**
```
Contact me at john.doe@example.com for more information.
```

**Full Redaction:**
```
Contact me at [REDACTED_EMAIL] for more information.
```

**Partial Redaction:**
```
Contact me at •••@•••.••• for more information.
```

**Hash Redaction:**
```
Contact me at [EMA_a3f5c8d2] for more information.
```

**Smart Redaction:**
```
Contact me at john.doe@[REDACTED] for more information.
```

### Example 2: Multiple PII Types

**Original:**
```
My name is John Doe, email is john@example.com, and phone is (555) 123-4567.
```

**Full Redaction:**
```
My name is [REDACTED_NAME], email is [REDACTED_EMAIL], and phone is [REDACTED_PHONE].
```

**Partial Redaction:**
```
My name is •••• •••, email is •••@•••.•••, and phone is (•••) •••-••••.
```

---

## Best Practices

1. **Compliance Requirements**: Use `full` for strict compliance (GDPR, HIPAA)
2. **User Experience**: Use `smart` or `partial` for better readability
3. **Analytics**: Use `hash` for tracking without exposing data
4. **Testing**: Use `partial` to verify detection accuracy

---

## Security Considerations

- **Full Redaction**: Maximum security, no information leakage
- **Partial Redaction**: May reveal length/format information
- **Hash Redaction**: Secure if hash is one-way, but deterministic
- **Smart Redaction**: May reveal identifying information (domain, area code)

**Recommendation**: Use `full` for production, `partial`/`smart` for development/testing.

---

## Future Enhancements

- Custom redaction patterns per entity type
- User-defined redaction templates
- Preview before sending
- Redaction history/audit log
- Per-platform redaction strategies

