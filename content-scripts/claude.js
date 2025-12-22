// Claude interceptor
// Intercepts messages sent to Claude

(function() {
  'use strict';
  
  debugLog('Claude interceptor loaded');
  
  let isProcessing = false;
  
  /**
   * Intercepts the message submission
   * @param {string} message - The message text
   * @param {Function} sendCallback - Original send function
   */
  async function interceptMessage(message, sendCallback) {
    if (isProcessing) {
      debugLog('Already processing a message, skipping');
      return;
    }
    
    isProcessing = true;
    debugLog('Intercepting message:', message);
    
    try {
      // Send to background worker for processing
      const response = await sendToBackground('INTERCEPT_MESSAGE', {
        platform: 'claude',
        message: message,
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
      
      debugLog('Background response:', response);
      
      // Handle response based on action
      switch (response.action) {
        case 'ALLOW':
          debugLog('Message allowed, proceeding with original send');
          sendCallback(message);
          break;
          
        case 'REDACT':
          debugLog('Message redacted:', response.redactedMessage);
          showNotification('Sensitive information was redacted', 'warning');
          sendCallback(response.redactedMessage);
          break;
          
        case 'BLOCK':
          debugLog('Message blocked:', response.reason);
          showNotification(`Message blocked: ${response.reason}`, 'error');
          break;
          
        default:
          debugLog('Unknown action, allowing message');
          sendCallback(message);
      }
    } catch (error) {
      console.error('[GovernsAI] Error processing message:', error);
      showNotification('Error processing message, sending anyway', 'warning');
      sendCallback(message);
    } finally {
      isProcessing = false;
    }
  }
  
  /**
   * Sets up interception for the textarea and send button
   */
  function setupInterception() {
    debugLog('Setting up Claude interception');
    
    // Claude uses a contenteditable div
    // Multiple possible selectors for Claude's input area
    const textareaSelectors = [
      'div[contenteditable="true"]',
      '.ProseMirror',
      'div[role="textbox"]',
      'fieldset div[contenteditable]'
    ];
    
    let foundTextarea = null;
    
    // Try each selector
    for (const selector of textareaSelectors) {
      waitForElement(selector, 3000)
        .then((textarea) => {
          if (foundTextarea) return; // Already found one
          foundTextarea = textarea;
          
          debugLog('Claude textarea found:', textarea);
          
          // Intercept Enter key press
          textarea.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              const message = textarea.textContent || textarea.innerText;
              
              if (message.trim()) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                await interceptMessage(message, (finalMessage) => {
                  // Update textarea with potentially redacted message
                  textarea.textContent = finalMessage;
                  
                  // Trigger input event to update Claude's internal state
                  const inputEvent = new Event('input', { bubbles: true });
                  textarea.dispatchEvent(inputEvent);
                  
                  // Find and click the send button
                  const sendButton = findSendButton();
                  if (sendButton && !sendButton.disabled) {
                    setTimeout(() => sendButton.click(), 50);
                  } else {
                    // Fallback: dispatch Enter event
                    const enterEvent = new KeyboardEvent('keydown', {
                      key: 'Enter',
                      code: 'Enter',
                      which: 13,
                      keyCode: 13,
                      bubbles: true
                    });
                    textarea.dispatchEvent(enterEvent);
                  }
                });
              }
            }
          }, true); // Use capture phase
          
          debugLog('Claude Enter key listener attached');
          
          // Setup send button interception
          setupSendButtonInterception();
          
          showNotification('GovernsAI protection enabled for Claude', 'success');
        })
        .catch((error) => {
          debugLog('Selector failed:', selector, error.message);
        });
    }
  }
  
  /**
   * Finds the send button
   * @returns {Element|null} Send button element
   */
  function findSendButton() {
    // Claude's send button can have various forms
    const buttonSelectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button svg[class*="send"]',
      'button:has(svg[class*="send"])',
      'fieldset button[type="submit"]',
      'form button[type="button"]:last-of-type'
    ];
    
    for (const selector of buttonSelectors) {
      const button = document.querySelector(selector);
      if (button) {
        debugLog('Found send button with selector:', selector);
        return button;
      }
    }
    
    // Fallback: find button with send icon
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
      const ariaLabel = button.getAttribute('aria-label') || '';
      if (ariaLabel.toLowerCase().includes('send')) {
        debugLog('Found send button by aria-label');
        return button;
      }
    }
    
    return null;
  }
  
  /**
   * Sets up send button interception
   */
  function setupSendButtonInterception() {
    const sendButtonObserver = new MutationObserver(() => {
      const sendButton = findSendButton();
      
      if (sendButton && !sendButton.hasAttribute('data-governs-intercepted')) {
        sendButton.setAttribute('data-governs-intercepted', 'true');
        
        sendButton.addEventListener('click', async (e) => {
          const textareaSelectors = [
            'div[contenteditable="true"]',
            '.ProseMirror',
            'div[role="textbox"]',
            'fieldset div[contenteditable]'
          ];
          
          let textarea = null;
          for (const selector of textareaSelectors) {
            textarea = document.querySelector(selector);
            if (textarea) break;
          }
          
          const message = textarea?.textContent || textarea?.innerText;
          
          if (message && message.trim()) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            await interceptMessage(message, (finalMessage) => {
              if (textarea) {
                textarea.textContent = finalMessage;
                
                // Trigger input event
                const inputEvent = new Event('input', { bubbles: true });
                textarea.dispatchEvent(inputEvent);
              }
              
              // Remove interception temporarily to allow actual send
              sendButton.removeAttribute('data-governs-intercepted');
              setTimeout(() => sendButton.click(), 50);
              
              // Re-add interception after a delay
              setTimeout(() => {
                sendButton.setAttribute('data-governs-intercepted', 'true');
              }, 200);
            });
          }
        }, true);
        
        debugLog('Claude send button listener attached');
      }
    });
    
    sendButtonObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupInterception);
  } else {
    setupInterception();
  }
  
  // Also retry setup on navigation (Claude is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      debugLog('URL changed, re-initializing Claude interception');
      setTimeout(setupInterception, 1000);
    }
  }).observe(document, { subtree: true, childList: true });
  
})();

