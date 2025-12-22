// Policy evaluation engine
// Determines allow/redact/block actions based on policies

/**
 * Evaluates policy based on PII detection results
 * @param {object} precheckResult - Results from PII scan
 * @param {object} settings - User settings and policies
 * @returns {object} Policy decision with action and details
 */
function evaluatePolicy(precheckResult, settings) {
  const { hasPII, entities, riskScore } = precheckResult;
  const { policyMode, autoRedact } = settings;
  
  // If no PII detected, always allow
  if (!hasPII || entities.length === 0) {
    return {
      action: 'ALLOW',
      reason: 'No PII detected'
    };
  }
  
  console.log(`[GovernsAI] PII detected: ${entities.length} entities, risk score: ${riskScore}`);
  
  // Evaluate based on policy mode
  switch (policyMode) {
    case 'block':
      return {
        action: 'BLOCK',
        reason: `Blocked due to PII: ${entities.map(e => e.type).join(', ')}`,
        entities
      };
      
    case 'redact':
      if (autoRedact) {
        const redactionResult = redactPII(precheckResult, settings);
        return {
          action: 'REDACT',
          reason: `Redacted ${entities.length} PII entities using ${settings.redactionStrategy || 'full'} strategy`,
          redactedMessage: redactionResult.redactedText,
          redactionLog: redactionResult.redactionLog,
          entities
        };
      } else {
        return {
          action: 'BLOCK',
          reason: 'PII detected but auto-redact disabled',
          entities
        };
      }
      
    case 'allow':
    default:
      // Even in allow mode, warn if high risk
      if (riskScore > 75) {
        console.warn('[GovernsAI] High risk PII detected but allowing due to policy');
      }
      return {
        action: 'ALLOW',
        reason: 'Allowed by policy despite PII',
        entities
      };
  }
}

/**
 * Redacts PII from the original message using configured strategy
 * @param {object} precheckResult - Results from PII scan
 * @param {object} settings - User settings including redaction strategy
 * @returns {object} Redacted message and redaction log
 */
function redactPII(precheckResult, settings) {
  const { entities, detections, originalMessage } = precheckResult;
  
  if (!entities || entities.length === 0) {
    return {
      redactedText: originalMessage || '',
      redactionLog: []
    };
  }
  
  const redactionStrategy = settings.redactionStrategy || 'full';
  let redactedText = originalMessage || '';
  const redactionLog = [];
  
  // Use detections array if available (from API), otherwise use entities
  const itemsToRedact = detections || entities.map(e => ({
    type: e.type.toLowerCase(),
    value: e.value,
    position: e.position || (e.start !== undefined ? { start: e.start, end: e.end } : null)
  }));
  
  // Sort by position (end to start) to prevent position shifts during replacement
  const sortedItems = [...itemsToRedact].sort((a, b) => {
    const aStart = a.position?.start ?? a.start ?? 0;
    const bStart = b.position?.start ?? b.start ?? 0;
    return bStart - aStart;
  });
  
  // Replace each detection with redacted version
  sortedItems.forEach((item, index) => {
    const entityType = normalizeEntityTypeForRedaction(item.type);
    const originalValue = item.value;
    const position = item.position || (entities[index]?.start !== undefined ? {
      start: entities[index].start,
      end: entities[index].end
    } : null);
    
    // Get redacted value based on strategy
    const redactedValue = getRedactedValue(originalValue, entityType, redactionStrategy);
    
    // Log the redaction
    redactionLog.push({
      type: entityType,
      original: originalValue,
      redacted: redactedValue,
      strategy: redactionStrategy,
      position: position
    });
    
    // Perform replacement
    if (position && position.start !== undefined && position.end !== undefined) {
      // Position-based replacement (most accurate)
      redactedText = 
        redactedText.substring(0, position.start) + 
        redactedValue + 
        redactedText.substring(position.end);
    } else if (originalValue) {
      // Value-based replacement (fallback)
      redactedText = redactedText.replace(originalValue, redactedValue);
    }
  });
  
  return {
    redactedText,
    redactionLog
  };
}

/**
 * Normalizes entity type for redaction
 * @param {string} type - Entity type
 * @returns {string} Normalized type
 */
function normalizeEntityTypeForRedaction(type) {
  const normalized = type.toUpperCase();
  const typeMap = {
    'EMAIL': 'EMAIL',
    'PHONE': 'PHONE',
    'SSN': 'SSN',
    'SOCIAL_SECURITY_NUMBER': 'SSN',
    'CREDIT_CARD': 'CREDIT_CARD',
    'NAME': 'NAME',
    'ADDRESS': 'ADDRESS',
    'DATE_OF_BIRTH': 'DATE_OF_BIRTH',
    'DOB': 'DATE_OF_BIRTH',
    'IP_ADDRESS': 'IP_ADDRESS',
    'API_KEY': 'API_KEY',
    'PASSWORD': 'PASSWORD'
  };
  
  return typeMap[normalized] || normalized;
}

/**
 * Gets redacted value based on strategy
 * @param {string} value - Original value
 * @param {string} type - Entity type
 * @param {string} strategy - Redaction strategy ('full', 'partial', 'hash', 'smart')
 * @returns {string} Redacted value
 */
function getRedactedValue(value, type, strategy) {
  switch (strategy) {
    case 'partial':
      return getPartialRedaction(value, type);
      
    case 'hash':
      return getHashRedaction(value, type);
      
    case 'smart':
      return getSmartRedaction(value, type);
      
    case 'full':
    default:
      return getFullRedaction(type);
  }
}

/**
 * Full redaction - replaces with placeholder
 * @param {string} type - Entity type
 * @returns {string} Redaction placeholder
 */
function getFullRedaction(type) {
  const redactionMap = {
    'EMAIL': '[REDACTED_EMAIL]',
    'PHONE': '[REDACTED_PHONE]',
    'SSN': '[REDACTED_SSN]',
    'CREDIT_CARD': '[REDACTED_CREDIT_CARD]',
    'NAME': '[REDACTED_NAME]',
    'ADDRESS': '[REDACTED_ADDRESS]',
    'DATE_OF_BIRTH': '[REDACTED_DOB]',
    'IP_ADDRESS': '[REDACTED_IP]',
    'API_KEY': '[REDACTED_API_KEY]',
    'PASSWORD': '[REDACTED_PASSWORD]'
  };
  
  return redactionMap[type] || '[REDACTED]';
}

/**
 * Partial redaction - shows masked version
 * @param {string} value - Original value
 * @param {string} type - Entity type
 * @returns {string} Partially redacted value
 */
function getPartialRedaction(value, type) {
  switch (type) {
    case 'EMAIL':
      // john@example.com -> •••@•••.•••
      const [local, domain] = value.split('@');
      if (domain) {
        const [domainName, tld] = domain.split('.');
        return `${'•'.repeat(Math.min(local.length, 3))}@${'•'.repeat(Math.min(domainName.length, 3))}.${'•'.repeat(Math.min(tld.length, 3))}`;
      }
      return '•••@•••.•••';
      
    case 'PHONE':
      // (555) 123-4567 -> (•••) •••-••••
      return value.replace(/\d/g, '•');
      
    case 'SSN':
      // 123-45-6789 -> •••-••-••••
      return value.replace(/\d/g, '•');
      
    case 'CREDIT_CARD':
      // 4532 1488 0343 6467 -> •••• •••• •••• 6467
      const parts = value.replace(/\s/g, '').match(/.{1,4}/g) || [];
      if (parts.length > 0) {
        const last4 = parts[parts.length - 1];
        return parts.slice(0, -1).map(() => '••••').join(' ') + ' ' + last4;
      }
      return '•••• •••• •••• ••••';
      
    default:
      // Generic partial redaction
      if (value.length <= 4) {
        return '•'.repeat(value.length);
      }
      return value.substring(0, 2) + '•'.repeat(value.length - 4) + value.substring(value.length - 2);
  }
}

/**
 * Hash redaction - replaces with hash for tracking
 * Note: This is synchronous for now, but uses a deterministic hash
 * @param {string} value - Original value
 * @param {string} type - Entity type
 * @returns {string} Hash-based redaction
 */
function getHashRedaction(value, type) {
  // Use simple hash for synchronous operation
  // In a production environment, you might want to pre-compute hashes
  // or use a different approach for async hashing
  const hash = simpleHash(value);
  const typePrefix = type.substring(0, 3).toUpperCase();
  return `[${typePrefix}_${hash.substring(0, 8)}]`;
}

/**
 * Hash function using Web Crypto API (SHA-256)
 * Falls back to simple hash if crypto API unavailable
 * @param {string} str - String to hash
 * @returns {Promise<string>} Hash value
 */
async function hashValue(str) {
  // Try Web Crypto API first (more secure)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    } catch (error) {
      console.warn('[GovernsAI] Crypto API failed, using simple hash:', error);
    }
  }
  
  // Fallback to simple hash
  return simpleHash(str);
}

/**
 * Simple hash function (fallback)
 * @param {string} str - String to hash
 * @returns {string} Hash value
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Smart redaction - context-aware redaction
 * @param {string} value - Original value
 * @param {string} type - Entity type
 * @returns {string} Smart redacted value
 */
function getSmartRedaction(value, type) {
  switch (type) {
    case 'EMAIL':
      // john@example.com -> john@[REDACTED]
      const emailParts = value.split('@');
      if (emailParts.length === 2) {
        return `${emailParts[0]}@[REDACTED]`;
      }
      return '[REDACTED_EMAIL]';
      
    case 'PHONE':
      // (555) 123-4567 -> (555) [REDACTED]
      const phoneMatch = value.match(/^(\+?1[-.]?)?\(?(\d{3})\)?[-.]?(\d{3})[-.]?(\d{4})$/);
      if (phoneMatch) {
        return `${phoneMatch[1] || ''}${phoneMatch[2] ? `(${phoneMatch[2]})` : ''} [REDACTED]`;
      }
      return '[REDACTED_PHONE]';
      
    case 'SSN':
      // 123-45-6789 -> [REDACTED]-45-6789
      const ssnParts = value.split('-');
      if (ssnParts.length === 3) {
        return `[REDACTED]-${ssnParts[1]}-${ssnParts[2]}`;
      }
      return '[REDACTED_SSN]';
      
    case 'CREDIT_CARD':
      // 4532 1488 0343 6467 -> [REDACTED] 6467
      const cardParts = value.replace(/\s/g, '');
      if (cardParts.length >= 4) {
        return `[REDACTED] ${cardParts.substring(cardParts.length - 4)}`;
      }
      return '[REDACTED_CREDIT_CARD]';
      
    default:
      // Fallback to partial for unknown types
      return getPartialRedaction(value, type);
  }
}

/**
 * Checks if a specific tool or feature should be blocked
 * @param {string} toolName - Name of the tool/feature
 * @param {object} settings - User settings
 * @returns {boolean} True if blocked
 */
function isToolBlocked(toolName, settings) {
  const blockedTools = settings.blockedTools || [];
  return blockedTools.includes(toolName);
}

/**
 * Evaluates custom policy rules
 * @param {object} context - Context including message, platform, etc.
 * @param {object} settings - User settings with custom rules
 * @returns {object} Policy decision
 */
function evaluateCustomRules(context, settings) {
  const customRules = settings.customRules || [];
  
  for (const rule of customRules) {
    if (ruleMatches(rule, context)) {
      return {
        action: rule.action,
        reason: rule.reason || 'Custom rule applied',
        rule: rule.name
      };
    }
  }
  
  return null; // No custom rule matched
}

/**
 * Checks if a rule matches the current context
 * @param {object} rule - Rule definition
 * @param {object} context - Current context
 * @returns {boolean} True if rule matches
 */
function ruleMatches(rule, context) {
  // Simple rule matching logic
  // In a real implementation, this would be more sophisticated
  
  if (rule.platform && rule.platform !== context.platform) {
    return false;
  }
  
  if (rule.keywords) {
    const message = context.message.toLowerCase();
    return rule.keywords.some(keyword => 
      message.includes(keyword.toLowerCase())
    );
  }
  
  return true;
}

