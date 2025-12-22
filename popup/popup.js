// Extension popup logic
// Displays current status and quick actions

document.addEventListener('DOMContentLoaded', async () => {
  await loadStatus();
  setupEventListeners();
});

/**
 * Loads and displays the current extension status
 */
async function loadStatus() {
  try {
    // Get status from background worker
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    
    // Get settings from storage
    const settings = await chrome.storage.local.get({
      enabled: true,
      apiKey: '',
      orgId: '',
      policyMode: 'allow',
      enabledPlatforms: ['chatgpt', 'claude', 'gemini'],
      debugMode: false
    });
    
    // Update status badge
    const statusBadge = document.getElementById('status-badge');
    if (settings.enabled) {
      statusBadge.textContent = 'Active';
      statusBadge.className = 'badge badge-success';
    } else {
      statusBadge.textContent = 'Disabled';
      statusBadge.className = 'badge badge-error';
    }
    
    // Update extension status
    document.getElementById('extension-status').textContent = 
      settings.enabled ? '✅ Active' : '⏸️ Disabled';
    
    // Update configuration status
    const isConfigured = !!settings.apiKey;
    document.getElementById('config-status').textContent = 
      isConfigured ? '✅ Configured' : '⚠️ Not Configured';
    
    // Update policy mode
    const policyModeText = {
      'allow': '✅ Allow (Log Only)',
      'redact': '🔒 Auto-Redact',
      'block': '🚫 Block PII'
    }[settings.policyMode] || settings.policyMode;
    document.getElementById('policy-mode').textContent = policyModeText;
    
    // Update platform checkboxes
    settings.enabledPlatforms.forEach(platform => {
      const checkbox = document.getElementById(`platform-${platform}`);
      if (checkbox) {
        checkbox.checked = true;
      }
    });
    
    // Update debug button state
    const debugBtn = document.getElementById('toggle-debug');
    if (settings.debugMode) {
      debugBtn.textContent = 'Debug: ON';
      debugBtn.classList.add('active');
    }
    
  } catch (error) {
    console.error('Error loading status:', error);
    document.getElementById('extension-status').textContent = '❌ Error';
  }
}

/**
 * Sets up event listeners for interactive elements
 */
function setupEventListeners() {
  // Open options page
  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // Toggle debug mode
  document.getElementById('toggle-debug').addEventListener('click', async () => {
    const settings = await chrome.storage.local.get({ debugMode: false });
    const newDebugMode = !settings.debugMode;
    
    await chrome.storage.local.set({ debugMode: newDebugMode });
    
    // Update localStorage for content scripts
    localStorage.setItem('governs-ai-debug', newDebugMode.toString());
    
    const btn = document.getElementById('toggle-debug');
    if (newDebugMode) {
      btn.textContent = 'Debug: ON';
      btn.classList.add('active');
    } else {
      btn.textContent = 'Debug Mode';
      btn.classList.remove('active');
    }
    
    showMessage('Debug mode ' + (newDebugMode ? 'enabled' : 'disabled'));
  });
  
  // Platform checkboxes
  const platformCheckboxes = document.querySelectorAll('.platform-item input[type="checkbox"]');
  platformCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const platform = e.target.value;
      const settings = await chrome.storage.local.get({ 
        enabledPlatforms: ['chatgpt', 'claude', 'gemini'] 
      });
      
      if (e.target.checked) {
        if (!settings.enabledPlatforms.includes(platform)) {
          settings.enabledPlatforms.push(platform);
        }
      } else {
        settings.enabledPlatforms = settings.enabledPlatforms.filter(p => p !== platform);
      }
      
      await chrome.storage.local.set({ enabledPlatforms: settings.enabledPlatforms });
      showMessage(`${platform} ${e.target.checked ? 'enabled' : 'disabled'}`);
    });
  });
}

/**
 * Shows a temporary message
 * @param {string} message - Message to display
 */
function showMessage(message) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.textContent = message;
  document.getElementById('popup-container').appendChild(messageEl);
  
  setTimeout(() => {
    messageEl.style.opacity = '0';
    setTimeout(() => messageEl.remove(), 300);
  }, 2000);
}
