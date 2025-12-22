// Chrome storage wrapper
// Provides simplified interface for extension storage and default settings

const DEFAULT_SETTINGS = {
  // Connection Settings
  precheckApiUrl: 'https://app.governsai.com/api/v1',
  apiKey: '',
  orgId: '',
  dashboardUrl: 'https://app.governsai.com',
  enableDashboardLogging: false,
  
  // Local Policy Settings (Tier 1)
  localPolicy: {
    enabled: true,
    mode: 'redact', // 'block', 'redact', 'warn'
    piiTypes: {
      EMAIL: true,
      PHONE: true,
      SSN: true,
      CREDIT_CARD: true,
      NAME: false, // Beta
      ADDRESS: true,
      IP_ADDRESS: true,
      API_KEY: true,
      PASSWORD: true
    },
    customWords: [] // Future extensibility
  },
  
  // Cache for platform policies (Tier 2)
  platformPolicyCache: null,
  lastPolicySync: null
};

/**
 * Retrieves settings from storage with defaults applied
 * @returns {Promise<object>} Settings object
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      // Deep merge with defaults to ensure structure exists
      const settings = deepMerge(DEFAULT_SETTINGS, items);
      resolve(settings);
    });
  });
}

/**
 * Saves specific settings to storage
 * @param {object} updates - Object containing settings to update
 * @returns {Promise<void>}
 */
async function saveSettings(updates) {
  return new Promise((resolve) => {
    chrome.storage.local.set(updates, resolve);
  });
}

/**
 * Simple deep merge utility
 */
function deepMerge(target, source) {
  const output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target))
          Object.assign(output, { [key]: source[key] });
        else
          output[key] = deepMerge(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

// Export for usage in other modules (if using modules) or global scope
if (typeof window !== 'undefined') {
  window.StorageUtils = {
    getSettings,
    saveSettings,
    defaults: DEFAULT_SETTINGS
  };
}