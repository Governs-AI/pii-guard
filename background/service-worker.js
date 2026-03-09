// Main background service worker
// Handles message interception and policy enforcement

importScripts('precheck-client.js', 'policy-engine.js');

const DEFAULT_DASHBOARD_URL = 'https://app.governsai.com';
const FAIL_CLOSED_REASON = 'Precheck unavailable. Message blocked to prevent potential PII exposure.';

console.log('[GovernsAI] Background service worker initialized');

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[GovernsAI] Received message:', request.type);

  if (request.type === 'INTERCEPT_MESSAGE') {
    handleInterceptedMessage(request, sender)
      .then(sendResponse)
      .catch(error => {
        console.error('[GovernsAI] Error handling message:', error);
        sendResponse(buildFailClosedDecision(request?.message, FAIL_CLOSED_REASON, error.message));
      });

    // Return true to indicate async response
    return true;
  }

  if (request.type === 'INTERCEPT_IMAGE') {
    handleInterceptedImage(request, sender)
      .then(sendResponse)
      .catch(error => {
        console.error('[GovernsAI] Error handling image:', error);
        // Fail-closed: if image processing errors we block rather than leak.
        sendResponse(buildFailClosedDecision('', FAIL_CLOSED_REASON, error.message));
      });

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
      return buildFailClosedDecision(message, FAIL_CLOSED_REASON, error.message);
    }

    if (precheckResult?.fallback) {
      console.warn('[GovernsAI] Precheck fallback mode detected; applying fail-closed policy');
      return buildFailClosedDecision(
        message,
        FAIL_CLOSED_REASON,
        'Fallback PII detection is disabled in fail-closed mode'
      );
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
    return buildFailClosedDecision(message, FAIL_CLOSED_REASON, error.message);
  }
}

/**
 * Handles an image attachment intercepted by a content script.
 * Runs OCR on each image via the offscreen document, feeds the extracted
 * text into the existing Precheck pipeline, and returns ALLOW or BLOCK.
 * Images cannot be redacted (unlike text), so REDACT is mapped to BLOCK.
 *
 * @param {object} request - { platform, message, images: string[], url, timestamp }
 * @param {object} sender
 * @returns {Promise<object>} Decision object with action ALLOW or BLOCK
 */
async function handleInterceptedImage(request, sender) {
  const { platform, message, images = [], url, timestamp } = request;

  console.log(`[GovernsAI] Processing image attachment from ${platform}: ${images.length} image(s)`);

  try {
    const settings = await getSettings();

    if (!settings.enabled) {
      console.log('[GovernsAI] Extension disabled, allowing image');
      return { action: 'ALLOW' };
    }

    if (settings.enabledPlatforms && !settings.enabledPlatforms.includes(platform)) {
      console.log(`[GovernsAI] Platform ${platform} not monitored, allowing image`);
      return { action: 'ALLOW' };
    }

    // Run OCR on all attached images using the offscreen document.
    let ocrResult;
    try {
      await ensureOffscreenDocument();
      ocrResult = await runOCR(images);
    } catch (err) {
      console.error('[GovernsAI] OCR pipeline failed:', err);
      return buildFailClosedDecision('', FAIL_CLOSED_REASON, err.message);
    }

    const extractedText = (ocrResult.texts || []).join('\n').trim();
    console.log('[GovernsAI] OCR extracted text (first 100 chars):', extractedText.slice(0, 100));

    // No text found in images — nothing to scan.
    if (!extractedText) {
      console.log('[GovernsAI] No text found in images, allowing send');
      return { action: 'ALLOW', reason: 'No text detected in attached images' };
    }

    // Re-use the existing Precheck/policy pipeline with the extracted text.
    let precheckResult;
    try {
      precheckResult = await scanForPII(extractedText, settings);
    } catch (err) {
      console.error('[GovernsAI] Precheck API error (image OCR text):', err);
      return buildFailClosedDecision('', FAIL_CLOSED_REASON, err.message);
    }

    if (precheckResult?.fallback) {
      console.warn('[GovernsAI] Precheck fallback detected for image text; applying fail-closed policy');
      return buildFailClosedDecision('', FAIL_CLOSED_REASON, 'Fallback PII detection is disabled in fail-closed mode');
    }

    // For images we only ALLOW or BLOCK — redaction of pixel data is out of scope.
    let decision = applyApiDecision(precheckResult, extractedText, settings);
    if (!decision) {
      decision = evaluatePolicy(precheckResult, settings);
    }

    const imageDecision = {
      action: decision.action === 'REDACT' ? 'BLOCK' : decision.action,
      reason: decision.action === 'REDACT'
        ? `Image contains sensitive information: ${decision.reason}`
        : decision.reason,
      entities: decision.entities || [],
      isImageBlock: true,
    };

    console.log(`[GovernsAI] Image decision: ${imageDecision.action}`);

    await logInteraction({
      platform,
      url,
      timestamp,
      messageLength: extractedText.length,
      hasPII: precheckResult.hasPII,
      entities: precheckResult.entities,
      action: imageDecision.action,
      settings,
    });

    return imageDecision;

  } catch (error) {
    console.error('[GovernsAI] Unexpected error during image processing:', error);
    return buildFailClosedDecision('', FAIL_CLOSED_REASON, error.message);
  }
}

/**
 * Ensures a single offscreen document exists for OCR processing.
 * MV3 allows at most one offscreen document per extension at a time.
 */
async function ensureOffscreenDocument() {
  // chrome.offscreen.hasDocument() returns true if any offscreen doc is open.
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen/ocr-worker.html',
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'Run Tesseract.js OCR on image attachments to detect PII before sending',
  });

  console.log('[GovernsAI] Offscreen OCR document created');
}

/**
 * Sends images to the offscreen document for OCR and returns extracted text.
 *
 * @param {string[]} images - Array of base64 data URLs
 * @returns {Promise<{ texts: string[], confidence: number[] }>}
 */
function runOCR(images) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'PROCESS_IMAGE', target: 'ocr-worker', images },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response?.error) {
          return reject(new Error(response.error));
        }
        resolve(response || { texts: [], confidence: [] });
      }
    );
  });
}

function buildFailClosedDecision(originalMessage, reason, errorMessage = '') {
  return {
    action: 'BLOCK',
    reason: reason || FAIL_CLOSED_REASON,
    originalMessage: originalMessage || '',
    entities: [],
    redactionLog: [],
    ...(errorMessage ? { error: errorMessage } : {})
  };
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

  // Precheck API returns 'deny' for blocked requests
  if (decision === 'deny' || decision === 'block') {
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
