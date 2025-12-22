// Main background service worker
// Handles message interception and policy enforcement

importScripts('precheck-client.js', 'policy-engine.js');

const DEFAULT_DASHBOARD_URL = 'https://app.governsai.com';

console.log('[GovernsAI] Background service worker initialized');

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[GovernsAI] Received message:', request.type);
  
  if (request.type === 'INTERCEPT_MESSAGE') {
    handleInterceptedMessage(request, sender)
      .then(sendResponse)
      .catch(error => {
        console.error('[GovernsAI] Error handling message:', error);
        sendResponse({
          action: 'ALLOW',
          error: error.message
        });
      });
    
    // Return true to indicate async response
    return true;
  }
  
  if (request.type === 'GET_STATUS') {
    getExtensionStatus()
      .then(sendResponse)
      .catch(error => {
        console.error('[GovernsAI] Error getting status:', error);
        sendResponse({ enabled: false, error: error.message });
      });
    
    return true;
  }
});

/**
 * Handles an intercepted message from a content script
 * @param {object} request - The request object
 * @param {object} sender - The sender information
 * @returns {Promise<object>} Response object with action and data
 */
async function handleInterceptedMessage(request, sender) {
  const { platform, message, url, timestamp } = request;
  
  console.log(`[GovernsAI] Processing message from ${platform}:`, message.substring(0, 50) + '...');
  
  try {
    // Get user settings
    const settings = await getSettings();
    
    if (!settings.enabled) {
      console.log('[GovernsAI] Extension disabled, allowing message');
      return { action: 'ALLOW', message };
    }
    
    // Check if this platform is enabled
    if (settings.enabledPlatforms && !settings.enabledPlatforms.includes(platform)) {
      console.log(`[GovernsAI] Platform ${platform} not monitored, allowing message`);
      return { action: 'ALLOW', message };
    }
    
    // Call Precheck API to scan for PII
    let precheckResult;
    try {
      precheckResult = await scanForPII(message, settings);
      console.log('[GovernsAI] Precheck result:', precheckResult);
    } catch (error) {
      console.error('[GovernsAI] Precheck API error:', error);
      // If API fails, use fallback policy
      precheckResult = { hasPII: false, entities: [] };
    }
    
    let decision = applyApiDecision(precheckResult, message, settings);
    if (decision) {
      console.log('[GovernsAI] API decision:', decision);
    } else {
      decision = evaluatePolicy(precheckResult, settings);
      console.log('[GovernsAI] Policy decision:', decision);
      decision = {
        action: decision.action,
        reason: decision.reason,
        redactedMessage: decision.redactedMessage,
        redactionLog: decision.redactionLog || [],
        originalMessage: message,
        entities: decision.entities || []
      };
    }

    // Log the interaction
    await logInteraction({
      platform,
      url,
      timestamp,
      messageLength: message.length,
      hasPII: precheckResult.hasPII,
      entities: precheckResult.entities,
      action: decision.action,
      settings
    });
    
    // Return the decision
    return decision;
    
  } catch (error) {
    console.error('[GovernsAI] Unexpected error:', error);
    return {
      action: 'ALLOW',
      message,
      error: error.message
    };
  }
}

/**
 * Gets extension settings from storage
 * @returns {Promise<object>} Settings object
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({
      enabled: true,
      apiKey: '',
      orgId: '',
      userId: '', // Persistent User ID
      precheckApiUrl: DEFAULT_PRECHECK_API_BASE_URL,
      dashboardUrl: DEFAULT_DASHBOARD_URL,
      enableDashboardLogging: false,
      policyMode: 'allow', // Legacy support
      enabledPlatforms: ['chatgpt', 'claude', 'gemini'],
      autoRedact: true,
      redactionStrategy: 'full',
      debugMode: false,
      // New Local Policy Structure
      localPolicy: {
        mode: 'redact',
        piiTypes: {
          EMAIL: true,
          PHONE: true,
          SSN: true,
          CREDIT_CARD: true,
          NAME: false,
          ADDRESS: true,
          IP_ADDRESS: true,
          API_KEY: true,
          PASSWORD: true
        },
        customWords: []
      }
    }, (settings) => {
      // Ensure nested objects exist if they were partially retrieved
      if (!settings.localPolicy) settings.localPolicy = {};
      if (!settings.localPolicy.piiTypes) {
        settings.localPolicy.piiTypes = {
          EMAIL: true, PHONE: true, SSN: true, CREDIT_CARD: true,
          NAME: false, ADDRESS: true, IP_ADDRESS: true, API_KEY: true, PASSWORD: true
        };
      }

      // Generate and save User ID if missing
      if (!settings.userId) {
        settings.userId = crypto.randomUUID();
        chrome.storage.local.set({ userId: settings.userId });
      }

      resolve(settings);
    });
  });
}

/**
 * Gets extension status
 * @returns {Promise<object>} Status object
 */
async function getExtensionStatus() {
  const settings = await getSettings();
  return {
    enabled: settings.enabled,
    configured: !!settings.apiKey,
    platforms: settings.enabledPlatforms,
    mode: settings.policyMode
  };
}

/**
 * Logs an interaction to the GovernsAI platform
 * @param {object} data - Interaction data
 */
async function logInteraction(data) {
  try {
    console.log('[GovernsAI] Logging interaction:', {
      platform: data.platform,
      action: data.action,
      hasPII: data.hasPII,
      timestamp: data.timestamp
    });
    
    const settings = data.settings || {};
    if (!settings.enableDashboardLogging) {
      return;
    }

    if (!settings.dashboardUrl || !settings.apiKey) {
      console.warn('[GovernsAI] Dashboard logging enabled but URL or API key is missing');
      return;
    }

    const logUrl = buildDashboardLogUrl(settings.dashboardUrl);
    const payload = {
      platform: data.platform,
      url: data.url,
      timestamp: data.timestamp,
      messageLength: data.messageLength,
      hasPII: data.hasPII,
      entities: data.entities,
      action: data.action
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    };
    if (settings.orgId) {
      headers['X-Org-Id'] = settings.orgId;
    }

    const response = await fetch(logUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn('[GovernsAI] Dashboard logging failed:', response.status, response.statusText);
    }
    
  } catch (error) {
    console.error('[GovernsAI] Error logging interaction:', error);
    // Don't throw - logging failures shouldn't block the user
  }
}

function applyApiDecision(precheckResult, originalMessage, settings) {
  if (!precheckResult || !precheckResult.apiDecision) {
    return null;
  }

  const decision = precheckResult.apiDecision.toLowerCase();
  const reasons = Array.isArray(precheckResult.apiReasons) ? precheckResult.apiReasons : [];

  if (decision === 'allow') {
    return {
      action: 'ALLOW',
      reason: reasons.join(', ') || 'Allowed by GovernsAI',
      originalMessage,
      entities: precheckResult.entities || []
    };
  }

  if (decision === 'block') {
    return {
      action: 'BLOCK',
      reason: reasons.join(', ') || 'Blocked by GovernsAI',
      originalMessage,
      entities: precheckResult.entities || []
    };
  }

  if (decision === 'transform') {
    const transformedText = extractTransformedText(precheckResult.apiPayload);
    if (transformedText) {
      return {
        action: 'REDACT',
        reason: reasons.join(', ') || 'Transformed by GovernsAI',
        redactedMessage: transformedText,
        redactionLog: buildRedactionLogFromReasons(reasons),
        originalMessage,
        entities: precheckResult.entities || []
      };
    }

    const fallback = fallbackPIIDetection(originalMessage);
    const redactionResult = redactPII(fallback, settings || {});
    return {
      action: 'REDACT',
      reason: 'Transformed by GovernsAI (local fallback)',
      redactedMessage: redactionResult.redactedText,
      redactionLog: redactionResult.redactionLog,
      originalMessage,
      entities: fallback.entities || []
    };
  }

  return null;
}

function extractTransformedText(payload) {
  if (!payload) {
    return '';
  }
  if (typeof payload === 'string') {
    return payload;
  }
  return payload.raw_text || payload.text || payload.redacted_text || '';
}

function buildRedactionLogFromReasons(reasons) {
  return reasons
    .filter((reason) => typeof reason === 'string')
    .map((reason) => ({
      reason
    }));
}

function normalizeUrl(value) {
  return (value || '').trim().replace(/\/+$/, '');
}

function buildDashboardLogUrl(dashboardUrl) {
  const normalized = normalizeUrl(dashboardUrl || DEFAULT_DASHBOARD_URL);
  if (normalized.endsWith('/api/v1')) {
    return `${normalized}/decisions`;
  }
  if (normalized.endsWith('/api')) {
    return `${normalized}/decisions`;
  }
  return `${normalized}/api/v1/decisions`;
}

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[GovernsAI] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
});
