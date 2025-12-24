// VPN-style popup logic

let connectionTimer = null;
let startTime = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadStatus();
  setupEventListeners();
});

/**
 * Loads and displays the current extension status
 */
async function loadStatus() {
  try {
    const container = document.getElementById('popup-container');
    container.classList.add('loading');
    
    // Get settings from storage
    const settings = await chrome.storage.local.get({
      enabled: true,
      apiKey: '',
      orgId: '',
      enabledPlatforms: ['chatgpt', 'claude', 'gemini']
    });
    
    const toggleButton = document.getElementById('toggle-button');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const timerDisplay = document.getElementById('connection-timer');
    const timerElement = document.getElementById('timer-display');
    const platformsCount = document.getElementById('platforms-count');
    const configStatus = document.getElementById('config-status');
    
    // Update toggle button state
    if (settings.enabled) {
      toggleButton.classList.add('active');
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected';
      timerDisplay.style.display = 'block';
      
      // Start or resume timer
      if (!startTime) {
        startTime = Date.now();
      }
      startTimer();
    } else {
      toggleButton.classList.remove('active');
      statusDot.classList.remove('connected');
      statusText.textContent = 'Disconnected';
      timerDisplay.style.display = 'none';
      stopTimer();
      startTime = null;
    }
    
    // Update platforms count
    platformsCount.textContent = settings.enabledPlatforms?.length || 3;
    
    // Update config status
    if (settings.apiKey) {
      configStatus.textContent = 'Configured';
      configStatus.style.color = '#10b981';
    } else {
      configStatus.textContent = 'Setup Required';
      configStatus.style.color = '#f59e0b';
    }
    
    container.classList.remove('loading');
    
  } catch (error) {
    console.error('Error loading status:', error);
    const container = document.getElementById('popup-container');
    container.classList.remove('loading');
    container.classList.add('disabled');
    document.getElementById('status-text').textContent = 'Error';
  }
}

/**
 * Starts the connection timer
 */
function startTimer() {
  if (connectionTimer) return;
  
  connectionTimer = setInterval(() => {
    if (!startTime) return;
    
    const elapsed = Date.now() - startTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.textContent = 
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
}

/**
 * Stops the connection timer
 */
function stopTimer() {
  if (connectionTimer) {
    clearInterval(connectionTimer);
    connectionTimer = null;
  }
}

/**
 * Sets up event listeners
 */
function setupEventListeners() {
  const toggleButton = document.getElementById('toggle-button');
  const settingsLink = document.getElementById('settings-link');
  
  // Toggle extension on/off
  toggleButton.addEventListener('click', async () => {
    const isActive = toggleButton.classList.contains('active');
    const newState = !isActive;
    
    try {
      await chrome.storage.local.set({ enabled: newState });
      
      // Update UI immediately for smooth transition
      const statusText = document.getElementById('status-text');
      const statusDot = document.getElementById('status-dot');
      const timerDisplay = document.getElementById('connection-timer');
      
      if (newState) {
        toggleButton.classList.add('active');
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
        timerDisplay.style.display = 'block';
        startTime = Date.now();
        startTimer();
      } else {
        toggleButton.classList.remove('active');
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
        timerDisplay.style.display = 'none';
        stopTimer();
        startTime = null;
      }
      
    } catch (error) {
      console.error('Error toggling extension:', error);
    }
  });
  
  // Open settings page
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });
}
