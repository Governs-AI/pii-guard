// Claude interceptor
// Intercepts messages sent to Claude

(function() {
  'use strict';
  
  debugLog('Claude interceptor loaded');
  
  let isProcessing = false;
  let isSyntheticSend = false;
  let activeInput = null;
  
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
          debugLog('Redaction log:', response.redactionLog);
          showNotification(
            `Redacted ${response.entities?.length || 0} PII entities`,
            'warning',
            { redactionLog: response.redactionLog }
          );
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
            activeInput = textarea;
            if (isSyntheticSend) {
              isSyntheticSend = false;
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              const message = textarea.textContent || textarea.innerText;
              
              if (message.trim()) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                await interceptMessage(message, (finalMessage) => {
                  applyMessageToInput(textarea, finalMessage);
                  const sendButton = findSendButton();
                  triggerSend(sendButton, textarea);
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
          if (isSyntheticSend) {
            isSyntheticSend = false;
            return;
          }
          const textareaSelectors = [
            'div[contenteditable="true"]',
            '.ProseMirror',
            'div[role="textbox"]',
            'fieldset div[contenteditable]'
          ];
          
          const textarea = getActiveInput(textareaSelectors);
          
          const message = textarea?.textContent || textarea?.innerText;
          
          if (message && message.trim()) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            await interceptMessage(message, (finalMessage) => {
              applyMessageToInput(textarea, finalMessage);
              triggerSend(sendButton, textarea);
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

  function applyMessageToInput(input, value) {
    if (!input) return;
    const isEditable = input.isContentEditable;
    if (isEditable) {
      input.focus();
      const selected = document.execCommand('selectAll', false, null);
      const inserted = document.execCommand('insertText', false, value);
      if (!selected || !inserted) {
        input.textContent = value;
      }
    } else {
      input.textContent = value;
    }
    
    const inputEvent = typeof InputEvent === 'function'
      ? new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' })
      : new Event('input', { bubbles: true });
    input.dispatchEvent(inputEvent);
  }

  function triggerSend(sendButton, textarea) {
    isSyntheticSend = true;
    requestAnimationFrame(() => {
      if (sendButton && !sendButton.disabled) {
        sendButton.click();
        return;
      }
      if (textarea) {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          which: 13,
          keyCode: 13,
          bubbles: true
        });
        textarea.dispatchEvent(enterEvent);
        return;
      }
      isSyntheticSend = false;
    });
  }

  function getActiveInput(selectors) {
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      return active;
    }
    if (activeInput && document.contains(activeInput)) {
      return activeInput;
    }
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }
  
})();
