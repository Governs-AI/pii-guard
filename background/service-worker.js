// Main background service worker
// Handles message interception and policy enforcement

importScripts('precheck-client.js', 'policy-engine.js');

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
    
    // Evaluate policy
    const policyDecision = evaluatePolicy(precheckResult, settings);
    console.log('[GovernsAI] Policy decision:', policyDecision);
    
    // Log the interaction
    await logInteraction({
      platform,
      url,
      timestamp,
      messageLength: message.length,
      hasPII: precheckResult.hasPII,
      entities: precheckResult.entities,
      action: policyDecision.action,
      settings
    });
    
    // Return the decision
    return {
      action: policyDecision.action,
      reason: policyDecision.reason,
      redactedMessage: policyDecision.redactedMessage,
      redactionLog: policyDecision.redactionLog || [],
      originalMessage: message,
      entities: policyDecision.entities || []
    };
    
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
      precheckApiUrl: '', // Custom API URL (optional)
      policyMode: 'allow', // 'allow', 'redact', 'block'
      enabledPlatforms: ['chatgpt', 'claude', 'gemini'],
      autoRedact: true,
      redactionStrategy: 'full', // 'full', 'partial', 'hash', 'smart'
      debugMode: false
    }, (settings) => {
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
    configured: !!(settings.apiKey && settings.orgId),
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
    // This will be implemented in the API client
    console.log('[GovernsAI] Logging interaction:', {
      platform: data.platform,
      action: data.action,
      hasPII: data.hasPII,
      timestamp: data.timestamp
    });
    
    // TODO: Send to GovernsAI platform API
    // await sendToGovernsAI('/logs', data);
    
  } catch (error) {
    console.error('[GovernsAI] Error logging interaction:', error);
    // Don't throw - logging failures shouldn't block the user
  }
}

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[GovernsAI] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
});

