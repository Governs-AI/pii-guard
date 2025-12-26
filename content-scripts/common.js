// Shared utilities for content scripts
// Common functions used across all interceptors

/**
 * Sends a message to the background worker
 * @param {string} type - Message type
 * @param {object} data - Message data
 * @returns {Promise} Response from background worker
 */
async function sendToBackground(type, data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Shows a notification to the user
 * @param {string} message - Message to display
 * @param {string} type - 'info', 'warning', 'error', 'success'
 * @param {object} options - Additional options (duration, redactionLog, etc.)
 */
function showNotification(message, type = 'info', options = {}) {
  const notification = document.createElement('div');
  notification.className = `governs-ai-notification governs-ai-${type}`;
  
  // Build notification content
  let content = message;
  
  // Add redaction log if provided
  if (options.redactionLog && options.redactionLog.length > 0) {
    const logText = options.redactionLog
      .map(log => `${log.type}: ${log.original} → ${log.redacted}`)
      .join('\n');
    content += '\n\n' + logText;
  }
  
  // Create content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.textContent = content;
  Object.assign(contentWrapper.style, {
    flex: '1',
    paddingRight: '8px',
    whiteSpace: 'pre-wrap'
  });
  
  // Create close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  Object.assign(closeButton.style, {
    background: 'none',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: '0',
    opacity: '0.9',
    transition: 'opacity 0.2s',
    borderRadius: '4px'
  });
  
  // Hover effect for close button
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.opacity = '1';
    closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.opacity = '0.9';
    closeButton.style.backgroundColor = 'transparent';
  });
  
  // Dismiss function
  const dismissNotification = () => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  };
  
  // Add click handler to close button
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering notification click
    dismissNotification();
  });
  
  // Set up notification container structure
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '16px 20px 16px 24px',
    borderRadius: '8px',
    backgroundColor: type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : type === 'success' ? '#28a745' : '#0066cc',
    color: 'white',
    zIndex: '10000',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    maxWidth: '400px',
    maxHeight: '400px',
    overflowY: 'auto',
    animation: 'slideIn 0.3s ease-out',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px'
  });
  
  // Append content and close button
  notification.appendChild(contentWrapper);
  notification.appendChild(closeButton);
  
  // Add click to dismiss (on notification body, not close button)
  notification.addEventListener('click', (e) => {
    // Only dismiss if clicking on the notification body, not the close button
    if (e.target === notification || e.target === contentWrapper) {
      dismissNotification();
    }
  });
  
  document.body.appendChild(notification);
  
  // Auto-remove after duration (default 5 seconds, longer if redaction log)
  const duration = options.duration || (options.redactionLog ? 8000 : 5000);
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

/**
 * Logs debug information if debug mode is enabled
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
  if (localStorage.getItem('governs-ai-debug') === 'true') {
    console.log('[GovernsAI]', ...args);
  }
}

/**
 * Waits for an element to appear in the DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Element>}
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

