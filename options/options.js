// Settings page logic
// Manages extension configuration and preferences

const DEFAULT_PRECHECK_BASE_URL = 'https://app.governsai.com/api/v1';
const DEFAULT_DASHBOARD_URL = 'https://app.governsai.com';
const PRESET_URLS = {
  local: 'http://localhost:8000/api/v1',
  console: DEFAULT_PRECHECK_BASE_URL
};

const STORAGE_DEFAULTS = {
  precheckApiUrl: DEFAULT_PRECHECK_BASE_URL,
  apiKey: '',
  orgId: '',
  dashboardUrl: DEFAULT_DASHBOARD_URL,
  enableDashboardLogging: false,
  localPolicy: {
    mode: 'redact',
    piiTypes: {
      EMAIL: true,
      PHONE: true,
      SSN: true,
      CREDIT_CARD: true,
      IP_ADDRESS: true,
      API_KEY: true,
      ADDRESS: true,
      PASSWORD: true
    }
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

async function loadSettings() {
  // Use deep merge if possible, or just defaults. chrome.storage.local.get with object defaults does a shallow merge usually.
  // We'll read everything and merge manually if needed.
  const stored = await chrome.storage.local.get(null);
  const settings = { ...STORAGE_DEFAULTS, ...stored };
  
  // Ensure localPolicy structure exists
  if (!settings.localPolicy) settings.localPolicy = STORAGE_DEFAULTS.localPolicy;
  if (!settings.localPolicy.piiTypes) settings.localPolicy.piiTypes = STORAGE_DEFAULTS.localPolicy.piiTypes;

  const precheckInput = document.getElementById('precheck-api-url');
  const apiKeyInput = document.getElementById('api-key');
  const orgIdInput = document.getElementById('org-id');
  const dashboardInput = document.getElementById('dashboard-url');
  const enableLogging = document.getElementById('enable-logging');

  precheckInput.value = settings.precheckApiUrl || DEFAULT_PRECHECK_BASE_URL;
  apiKeyInput.value = settings.apiKey || '';
  orgIdInput.value = settings.orgId || '';
  dashboardInput.value = settings.dashboardUrl || DEFAULT_DASHBOARD_URL;
  enableLogging.checked = !!settings.enableDashboardLogging;

  // Set Local Policy UI
  const mode = settings.localPolicy.mode || 'redact';
  const modeRadio = document.querySelector(`input[name="policy-mode"][value="${mode}"]`);
  if (modeRadio) modeRadio.checked = true;

  const piiTypes = settings.localPolicy.piiTypes || {};
  document.querySelectorAll('input[name="pii-type"]').forEach(checkbox => {
    // Default to false if not present, or true if present.
    // Actually, checking if key exists is better, but simplified:
    checkbox.checked = !!piiTypes[checkbox.value];
  });

  const preset = getPresetForUrl(precheckInput.value);
  setPresetSelection(preset);
  
  // Visual cue for Connected Mode
  updateUIForConnectionState(!!settings.apiKey);
}

function updateUIForConnectionState(isConnected) {
  const localCard = document.getElementById('local-policy-card');
  if (localCard) {
    if (isConnected) {
      localCard.style.opacity = '0.7';
      localCard.title = "These settings are overridden by your organization's policy.";
    } else {
      localCard.style.opacity = '1';
      localCard.title = "";
    }
  }
}

function setupEventListeners() {
  const form = document.getElementById('settings-form');
  const precheckInput = document.getElementById('precheck-api-url');
  const presetRadios = document.querySelectorAll('input[name="precheck-preset"]');
  const testButton = document.getElementById('test-connection');
  const apiKeyInput = document.getElementById('api-key');

  form.addEventListener('submit', handleSave);
  testButton.addEventListener('click', handleTestConnection);

  presetRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.value === 'custom') {
        return;
      }
      precheckInput.value = PRESET_URLS[radio.value] || precheckInput.value;
      setConnectionStatus('Status: Not tested');
    });
  });

  precheckInput.addEventListener('input', () => {
    const preset = getPresetForUrl(precheckInput.value);
    setPresetSelection(preset);
    setConnectionStatus('Status: Not tested');
  });
  
  apiKeyInput.addEventListener('input', () => {
     updateUIForConnectionState(!!apiKeyInput.value.trim());
  });
}

async function handleSave(event) {
  event.preventDefault();

  const precheckInput = document.getElementById('precheck-api-url');
  const apiKeyInput = document.getElementById('api-key');
  const orgIdInput = document.getElementById('org-id');
  const dashboardInput = document.getElementById('dashboard-url');
  const enableLogging = document.getElementById('enable-logging');

  const precheckApiUrl = normalizeUrl(precheckInput.value) || DEFAULT_PRECHECK_BASE_URL;
  const dashboardUrl = normalizeUrl(dashboardInput.value) || DEFAULT_DASHBOARD_URL;
  
  // Gather Local Policy
  const selectedMode = document.querySelector('input[name="policy-mode"]:checked')?.value || 'redact';
  const selectedPiiTypes = {};
  document.querySelectorAll('input[name="pii-type"]').forEach(cb => {
    selectedPiiTypes[cb.value] = cb.checked;
  });

  const settings = {
    precheckApiUrl,
    apiKey: apiKeyInput.value.trim(),
    orgId: orgIdInput.value.trim(),
    dashboardUrl,
    enableDashboardLogging: !!enableLogging.checked,
    localPolicy: {
      mode: selectedMode,
      piiTypes: selectedPiiTypes
    }
  };

  if (!getOriginPattern(precheckApiUrl)) {
    setSaveStatus('Invalid Precheck URL.', true);
    return;
  }

  const precheckPermission = await ensureHostPermission(precheckApiUrl);
  if (!precheckPermission) {
    setSaveStatus('Host permission required for Precheck URL.', true);
    return;
  }

  if (settings.enableDashboardLogging) {
    if (!getOriginPattern(dashboardUrl)) {
      setSaveStatus('Invalid Dashboard URL.', true);
      return;
    }
    const dashboardPermission = await ensureHostPermission(dashboardUrl);
    if (!dashboardPermission) {
      setSaveStatus('Host permission required for Dashboard URL.', true);
      return;
    }
  }

  await chrome.storage.local.set(settings);
  setSaveStatus('Settings saved.');
}

async function handleTestConnection() {
  const precheckInput = document.getElementById('precheck-api-url');
  const apiKeyInput = document.getElementById('api-key');
  const orgIdInput = document.getElementById('org-id');
  const testButton = document.getElementById('test-connection');
  const connectionStatus = document.getElementById('connection-status');

  const precheckApiUrl = normalizeUrl(precheckInput.value) || DEFAULT_PRECHECK_BASE_URL;
  const healthUrl = buildHealthUrl(precheckApiUrl);

  if (!getOriginPattern(healthUrl)) {
    setConnectionStatus('Status: Invalid URL');
    return;
  }

  const hasPermission = await ensureHostPermission(healthUrl);
  if (!hasPermission) {
    setConnectionStatus('Status: Permission denied');
    return;
  }

  testButton.disabled = true;
  connectionStatus.textContent = 'Status: Testing...';

  try {
    const headers = {};
    const apiKey = apiKeyInput.value.trim();
    const orgId = orgIdInput.value.trim();
    if (apiKey) {
      headers['X-Governs-Key'] = apiKey;
    }
    if (orgId) {
      headers['X-Org-Id'] = orgId;
    }

    const response = await fetch(healthUrl, { method: 'GET', headers });
    if (response.ok) {
      setConnectionStatus('Status: Connected');
    } else {
      setConnectionStatus(`Status: Failed (${response.status})`);
    }
  } catch (error) {
    setConnectionStatus('Status: Connection error');
  } finally {
    testButton.disabled = false;
  }
}

function setConnectionStatus(message) {
  const connectionStatus = document.getElementById('connection-status');
  connectionStatus.textContent = message;
}

function setSaveStatus(message, isError = false) {
  const saveStatus = document.getElementById('save-status');
  saveStatus.textContent = message;
  saveStatus.style.color = isError ? '#b42318' : '#0f3d91';

  if (!isError) {
    setTimeout(() => {
      if (saveStatus.textContent === message) {
        saveStatus.textContent = '';
      }
    }, 2000);
  }
}

function normalizeUrl(value) {
  return (value || '').trim().replace(/\/+$/, '');
}

function deriveBaseUrl(precheckApiUrl) {
  const normalized = normalizeUrl(precheckApiUrl || DEFAULT_PRECHECK_BASE_URL);
  if (normalized.toLowerCase().endsWith('/precheck')) {
    return normalized.slice(0, -'/precheck'.length);
  }
  return normalized;
}

function buildHealthUrl(precheckApiUrl) {
  const baseUrl = deriveBaseUrl(precheckApiUrl);
  return `${baseUrl}/health`;
}

function getPresetForUrl(url) {
  const normalized = normalizeUrl(url);
  const presetEntries = Object.entries(PRESET_URLS);

  for (const [key, presetUrl] of presetEntries) {
    const presetNormalized = normalizeUrl(presetUrl);
    if (normalized === presetNormalized || normalized === `${presetNormalized}/precheck`) {
      return key;
    }
  }

  return 'custom';
}

function setPresetSelection(preset) {
  const target = preset || 'custom';
  const radios = document.querySelectorAll('input[name="precheck-preset"]');
  radios.forEach((radio) => {
    radio.checked = radio.value === target;
  });
}

function ensureHostPermission(url) {
  const origin = getOriginPattern(url);
  if (!origin) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [origin] }, (hasPermission) => {
      if (hasPermission) {
        resolve(true);
        return;
      }

      chrome.permissions.request({ origins: [origin] }, (granted) => {
        resolve(!!granted);
      });
    });
  });
}

function getOriginPattern(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/*`;
  } catch (error) {
    return '';
  }
}
