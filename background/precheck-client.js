// Precheck API integration
// Calls GovernsAI Precheck API for PII detection

/**
 * Scans text for PII using the Precheck API
 * @param {string} text - Text to scan
 * @param {object} settings - User settings with API credentials
 * @returns {Promise<object>} Scan results
 */
async function scanForPII(text, settings) {
  const { apiKey, orgId } = settings;
  
  // If no API key configured, return no PII found
  if (!apiKey) {
    console.warn('[GovernsAI] No API key configured, skipping PII scan');
    return {
      hasPII: false,
      entities: [],
      riskScore: 0
    };
  }
  
  try {
    // TODO: Replace with actual Precheck API endpoint
    const PRECHECK_API_URL = 'https://api.governsai.com/v1/precheck';
    
    const response = await fetch(PRECHECK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Org-Id': orgId
      },
      body: JSON.stringify({
        text: text,
        context: {
          source: 'browser_extension',
          timestamp: new Date().toISOString()
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Precheck API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    return {
      hasPII: result.hasPII || false,
      entities: result.entities || [],
      riskScore: result.riskScore || 0,
      categories: result.categories || []
    };
    
  } catch (error) {
    console.error('[GovernsAI] Precheck API call failed:', error);
    
    // Fallback: basic client-side PII detection
    return fallbackPIIDetection(text);
  }
}

/**
 * Fallback PII detection using simple regex patterns
 * @param {string} text - Text to scan
 * @returns {object} Basic PII detection results
 */
function fallbackPIIDetection(text) {
  const entities = [];
  
  // Email pattern
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = text.match(emailRegex);
  if (emails) {
    emails.forEach(email => {
      entities.push({ type: 'EMAIL', value: email });
    });
  }
  
  // Phone number pattern (US format)
  const phoneRegex = /\b(\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g;
  const phones = text.match(phoneRegex);
  if (phones) {
    phones.forEach(phone => {
      entities.push({ type: 'PHONE', value: phone });
    });
  }
  
  // SSN pattern (US)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  const ssns = text.match(ssnRegex);
  if (ssns) {
    ssns.forEach(ssn => {
      entities.push({ type: 'SSN', value: ssn });
    });
  }
  
  // Credit card pattern (basic)
  const ccRegex = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
  const creditCards = text.match(ccRegex);
  if (creditCards) {
    creditCards.forEach(cc => {
      entities.push({ type: 'CREDIT_CARD', value: cc });
    });
  }
  
  const hasPII = entities.length > 0;
  const riskScore = entities.length * 25; // Simple scoring
  
  console.log('[GovernsAI] Fallback PII detection:', { hasPII, entities: entities.length });
  
  return {
    hasPII,
    entities,
    riskScore: Math.min(riskScore, 100),
    fallback: true
  };
}

