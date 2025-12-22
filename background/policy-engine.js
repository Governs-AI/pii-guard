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
        return {
          action: 'REDACT',
          reason: `Redacted ${entities.length} PII entities`,
          redactedMessage: redactPII(precheckResult),
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
 * Redacts PII from the original message
 * @param {object} precheckResult - Results from PII scan
 * @returns {string} Redacted message
 */
function redactPII(precheckResult) {
  const { entities } = precheckResult;
  
  if (!entities || entities.length === 0) {
    return precheckResult.originalMessage || '';
  }
  
  let redactedText = precheckResult.originalMessage || '';
  
  // Sort entities by position (if available) to replace from end to start
  // This prevents position shifts during replacement
  const sortedEntities = [...entities].sort((a, b) => {
    if (a.start && b.start) {
      return b.start - a.start;
    }
    return 0;
  });
  
  // Replace each entity with a redaction marker
  sortedEntities.forEach(entity => {
    const redactionText = getRedactionText(entity.type);
    
    if (entity.start !== undefined && entity.end !== undefined) {
      // Position-based replacement
      redactedText = 
        redactedText.substring(0, entity.start) + 
        redactionText + 
        redactedText.substring(entity.end);
    } else if (entity.value) {
      // Value-based replacement (fallback)
      redactedText = redactedText.replace(entity.value, redactionText);
    }
  });
  
  return redactedText;
}

/**
 * Gets the appropriate redaction text for an entity type
 * @param {string} type - Entity type
 * @returns {string} Redaction text
 */
function getRedactionText(type) {
  const redactionMap = {
    'EMAIL': '[EMAIL REDACTED]',
    'PHONE': '[PHONE REDACTED]',
    'SSN': '[SSN REDACTED]',
    'CREDIT_CARD': '[CREDIT CARD REDACTED]',
    'NAME': '[NAME REDACTED]',
    'ADDRESS': '[ADDRESS REDACTED]',
    'DATE_OF_BIRTH': '[DOB REDACTED]',
    'IP_ADDRESS': '[IP REDACTED]',
    'API_KEY': '[API KEY REDACTED]',
    'PASSWORD': '[PASSWORD REDACTED]'
  };
  
  return redactionMap[type] || '[PII REDACTED]';
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

