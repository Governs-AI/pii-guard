// Precheck API integration
// Calls GovernsAI Precheck API for PII detection

// Configuration constants
const DEFAULT_PRECHECK_API_BASE_URL = 'https://app.governsai.com/api/v1';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds
const DEFAULT_TOOL = 'browser.prompt';
const DEFAULT_SCOPE = 'ai.prompt';

function normalizeUrl(value) {
  return (value || '').trim().replace(/\/+$/, '');
}

function deriveBaseUrl(precheckApiUrl) {
  const normalized = normalizeUrl(precheckApiUrl || DEFAULT_PRECHECK_API_BASE_URL);
  if (normalized.toLowerCase().endsWith('/precheck')) {
    return normalized.slice(0, -'/precheck'.length);
  }
  return normalized;
}

function buildPrecheckUrl(precheckApiUrl) {
  const baseUrl = deriveBaseUrl(precheckApiUrl);
  return `${baseUrl}/precheck`;
}

/**
 * Scans text for PII using the Precheck API with retry logic
 * @param {string} text - Text to scan
 * @param {object} settings - User settings with API credentials
 * @returns {Promise<object>} Scan results
 */
async function scanForPII(text, settings) {
  const { apiKey, orgId, precheckApiUrl } = settings;
  
  if (!apiKey) {
    console.warn('[GovernsAI] No API key configured; Precheck may reject requests');
  }
  
  // Use custom API URL if provided, otherwise use default
  const apiUrl = buildPrecheckUrl(precheckApiUrl || DEFAULT_PRECHECK_API_BASE_URL);
  const corrId = generateCorrelationId();
  
  // Store original message for fallback
  const originalMessage = text;
  
  try {
    // Pass full settings for context
    const result = await callPrecheckAPIWithRetry(apiUrl, text, apiKey, orgId, corrId, settings);
    
    // Transform API response to internal format
    return transformAPIResponse(result, originalMessage, { corrId });
    
  } catch (error) {
    console.error('[GovernsAI] Precheck API call failed after retries:', error);
    
    // Fallback: basic client-side PII detection
    return fallbackPIIDetection(text);
  }
}

/**
 * Calls Precheck API with exponential backoff retry logic
 * @param {string} apiUrl - API endpoint URL
 * @param {string} text - Text to scan
 * @param {string} apiKey - API authentication key
 * @param {string} orgId - Organization ID
 * @param {string} corrId - Correlation ID
 * @param {object} settings - User settings for context
 * @param {number} attempt - Current attempt number (starts at 1)
 * @returns {Promise<object>} API response
 */
async function callPrecheckAPIWithRetry(apiUrl, text, apiKey, orgId, corrId, settings, attempt = 1) {
  try {
    console.log(`[GovernsAI] Precheck API call attempt ${attempt}/${MAX_RETRIES}`);
    
    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['X-Governs-Key'] = apiKey;
    }
    if (orgId) {
      headers['X-Org-Id'] = orgId;
    }

    // Construct full payload including policy config
    const payload = {
      tool: DEFAULT_TOOL,
      scope: DEFAULT_SCOPE,
      raw_text: text,
      tags: [], // Keep empty or add user-defined tags later
      corr_id: corrId
    };
    
    // Add Policy Configuration if local settings exist
    if (settings && settings.localPolicy) {
      payload.policy_config = buildPolicyConfig(settings.localPolicy);
    }
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    // Handle HTTP errors
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Precheck API error: ${response.status} ${response.statusText}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || errorMessage;
      } catch (e) {
        // If error response isn't JSON, use the text
        if (errorText) {
          errorMessage = errorText;
        }
      }
      
      // Retry on 5xx errors or rate limiting (429)
      if ((response.status >= 500 && response.status < 600) || response.status === 429) {
        throw new RetryableError(errorMessage, response.status);
      } else {
        // Don't retry on 4xx errors (except 429)
        throw new Error(errorMessage);
      }
    }
    
    const result = await response.json();
    console.log(`[GovernsAI] Precheck API success on attempt ${attempt}`);
    return result;
    
  } catch (error) {
    // Check if we should retry
    if (attempt < MAX_RETRIES && (error instanceof RetryableError || isRetryableError(error))) {
      const delay = calculateRetryDelay(attempt);
      console.log(`[GovernsAI] Retrying in ${delay}ms...`);
      
      await sleep(delay);
      return callPrecheckAPIWithRetry(apiUrl, text, apiKey, orgId, corrId, settings, attempt + 1);
    }
    
    // Max retries reached or non-retryable error
    throw error;
  }
}

/**
 * Builds the policy_config object from local settings
 * @param {object} localPolicy - Local policy settings
 * @returns {object} API-compatible policy config
 */
function buildPolicyConfig(localPolicy) {
  const mode = localPolicy.mode || 'redact';
  // Map local modes to API actions: 'block' -> 'block', 'redact' -> 'redact', 'warn' -> 'pass_through' (with warning handled client-side)
  // Actually, if 'warn', we probably want 'redact' or 'pass_through' depending on if we want the API to tag it.
  // Let's assume 'warn' means 'pass_through' for the API, and we handle the warning based on the response detections.
  const action = mode === 'warn' ? 'pass_through' : mode; 
  
  const piiMap = {
    'EMAIL': 'PII:email_address',
    'PHONE': 'PII:phone_number',
    'SSN': 'PII:us_ssn',
    'CREDIT_CARD': 'PII:credit_card',
    'IP_ADDRESS': 'PII:ip_address',
    'API_KEY': 'PII:api_key',
    'ADDRESS': 'PII:us_address',
    'NAME': 'PII:person_name',
    'PASSWORD': 'PII:password'
  };

  const allowPii = {};
  
  // Iterate through enabled PII types and set action
  if (localPolicy.piiTypes) {
    Object.entries(localPolicy.piiTypes).forEach(([type, enabled]) => {
      const apiKey = piiMap[type];
      if (apiKey) {
        if (enabled) {
          // If enabled, apply the policy action
          allowPii[apiKey] = action; 
        } else {
          // If disabled, explicitly pass through
          allowPii[apiKey] = 'pass_through';
        }
      }
    });
  }

  return {
    version: "v1",
    defaults: {
      ingress: { action: "pass_through" },
      egress: { action: action }
    },
    tool_access: {
      [DEFAULT_TOOL]: {
        direction: "ingress", // Matching user example
        action: null,
        allow_pii: allowPii
      }
    }
  };
}

/**
 * Transforms API response to internal format
 * @param {object} apiResponse - Raw API response
 * @param {string} originalMessage - Original message text
 * @returns {object} Transformed response
 */
function transformAPIResponse(apiResponse, originalMessage, requestContext = {}) {
  if (apiResponse && typeof apiResponse.decision === 'string') {
    const reasons = Array.isArray(apiResponse.reasons) ? apiResponse.reasons : [];
    const detections = reasons
      .map(extractDetectionFromReason)
      .filter(Boolean);
    const entities = detections.map(detection => ({
      type: normalizeEntityType(detection.type),
      value: detection.value,
      confidence: detection.confidence || 1.0,
      position: detection.position || null,
      start: detection.position?.start,
      end: detection.position?.end
    }));
    const hasPII = reasons.some((reason) => typeof reason === 'string' && reason.includes('pii.')) ||
      apiResponse.decision.toLowerCase() !== 'allow';
    
    return {
      hasPII,
      entities,
      detections,
      riskScore: hasPII ? 50 : 0,
      originalMessage,
      apiResponse: true,
      apiDecision: apiResponse.decision,
      apiPayload: apiResponse.payload,
      apiReasons: reasons,
      apiPolicyId: apiResponse.policy_id || null,
      apiTimestamp: apiResponse.ts || null,
      corrId: requestContext.corrId || null
    };
  }

  // API response format:
  // {
  //   "hasPII": true,
  //   "detections": [
  //     {
  //       "type": "email",
  //       "value": "john@example.com",
  //       "confidence": 0.95,
  //       "position": { "start": 10, "end": 27 }
  //     }
  //   ]
  // }
  
  const detections = apiResponse.detections || [];
  
  // Transform detections to entities format
  const entities = detections.map(detection => ({
    type: normalizeEntityType(detection.type),
    value: detection.value,
    confidence: detection.confidence || 1.0,
    position: detection.position || null,
    start: detection.position?.start,
    end: detection.position?.end
  }));
  
  // Calculate risk score based on detections
  const riskScore = calculateRiskScore(detections);
  
  return {
    hasPII: apiResponse.hasPII || detections.length > 0,
    entities: entities,
    detections: detections, // Keep original for reference
    riskScore: riskScore,
    originalMessage: originalMessage,
    apiResponse: true // Flag to indicate this came from API
  };
}

function extractDetectionFromReason(reason) {
  if (typeof reason !== 'string') {
    return null;
  }
  const [prefix, type] = reason.split(':');
  if (!type) {
    return null;
  }
  return {
    type: type.trim(),
    value: '',
    confidence: 1.0,
    position: null,
    reason: prefix
  };
}

function generateCorrelationId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalizes entity type to uppercase format
 * @param {string} type - Entity type from API
 * @returns {string} Normalized type
 */
function normalizeEntityType(type) {
  const typeMap = {
    'email': 'EMAIL',
    'phone': 'PHONE',
    'ssn': 'SSN',
    'social_security_number': 'SSN',
    'credit_card': 'CREDIT_CARD',
    'name': 'NAME',
    'address': 'ADDRESS',
    'date_of_birth': 'DATE_OF_BIRTH',
    'dob': 'DATE_OF_BIRTH',
    'ip_address': 'IP_ADDRESS',
    'api_key': 'API_KEY',
    'password': 'PASSWORD'
  };
  
  return typeMap[type?.toLowerCase()] || type?.toUpperCase() || 'UNKNOWN';
}

/**
 * Calculates risk score from detections
 * @param {array} detections - Array of detection objects
 * @returns {number} Risk score (0-100)
 */
function calculateRiskScore(detections) {
  if (!detections || detections.length === 0) {
    return 0;
  }
  
  // Weight by confidence and type
  const typeWeights = {
    'ssn': 30,
    'credit_card': 25,
    'password': 25,
    'api_key': 25,
    'email': 15,
    'phone': 15,
    'name': 10,
    'address': 10,
    'date_of_birth': 10,
    'ip_address': 5
  };
  
  let totalScore = 0;
  detections.forEach(detection => {
    const type = normalizeEntityType(detection.type);
    const weight = typeWeights[type] || 10;
    const confidence = detection.confidence || 1.0;
    totalScore += weight * confidence;
  });
  
  return Math.min(Math.round(totalScore), 100);
}

/**
 * Calculates exponential backoff delay
 * @param {number} attempt - Current attempt number
 * @returns {number} Delay in milliseconds
 */
function calculateRetryDelay(attempt) {
  // Exponential backoff: delay = INITIAL_DELAY * 2^(attempt-1)
  const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
  
  // Add jitter (±20%) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  const finalDelay = delay + jitter;
  
  // Cap at maximum delay
  return Math.min(finalDelay, MAX_RETRY_DELAY);
}

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Checks if an error is retryable
 * @param {Error} error - Error object
 * @returns {boolean} True if retryable
 */
function isRetryableError(error) {
  // Network errors are retryable
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return true;
  }
  
  // Timeout errors
  if (error.message && error.message.includes('timeout')) {
    return true;
  }
  
  return false;
}

/**
 * Custom error class for retryable errors
 */
class RetryableError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'RetryableError';
    this.statusCode = statusCode;
  }
}

/**
 * Fallback PII detection using simple regex patterns
 * Converts to API response format for consistency
 * @param {string} text - Text to scan
 * @returns {object} Basic PII detection results
 */
function fallbackPIIDetection(text) {
  const detections = [];
  
  // Email pattern
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  let match;
  while ((match = emailRegex.exec(text)) !== null) {
    detections.push({
      type: 'email',
      value: match[0],
      confidence: 0.85,
      position: { start: match.index, end: match.index + match[0].length }
    });
  }
  
  // Phone number pattern (US format)
  const phoneRegex = /\b(\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g;
  while ((match = phoneRegex.exec(text)) !== null) {
    detections.push({
      type: 'phone',
      value: match[0],
      confidence: 0.80,
      position: { start: match.index, end: match.index + match[0].length }
    });
  }
  
  // SSN pattern (US)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  while ((match = ssnRegex.exec(text)) !== null) {
    detections.push({
      type: 'ssn',
      value: match[0],
      confidence: 0.95,
      position: { start: match.index, end: match.index + match[0].length }
    });
  }
  
  // Credit card pattern (basic)
  const ccRegex = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
  while ((match = ccRegex.exec(text)) !== null) {
    detections.push({
      type: 'credit_card',
      value: match[0],
      confidence: 0.75,
      position: { start: match.index, end: match.index + match[0].length }
    });
  }
  
  // Transform to entities format
  const entities = detections.map(detection => ({
    type: normalizeEntityType(detection.type),
    value: detection.value,
    confidence: detection.confidence,
    position: detection.position,
    start: detection.position.start,
    end: detection.position.end
  }));
  
  const hasPII = detections.length > 0;
  const riskScore = calculateRiskScore(detections);
  
  console.log('[GovernsAI] Fallback PII detection:', { hasPII, entities: entities.length });
  
  return {
    hasPII,
    entities,
    detections,
    riskScore: Math.min(riskScore, 100),
    originalMessage: text,
    fallback: true
  };
}
