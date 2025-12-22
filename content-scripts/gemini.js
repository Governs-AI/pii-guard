// Gemini interceptor
// Intercepts messages sent to Gemini

(function() {
  'use strict';
  
  debugLog('Gemini interceptor loaded');
  
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
        platform: 'gemini',
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
    debugLog('Setting up Gemini interception');
    
    // Gemini uses various input elements
    const textareaSelectors = [
      'rich-textarea',
      'div[contenteditable="true"]',
      'textarea.ql-editor',
      'div[role="textbox"]',
      '.ql-editor',
      'textarea[placeholder*="Enter"]'
    ];
    
    let foundTextarea = null;
    
    // Try each selector
    for (const selector of textareaSelectors) {
      waitForElement(selector, 3000)
        .then((textarea) => {
          if (foundTextarea) return; // Already found one
          foundTextarea = textarea;
          
          debugLog('Gemini textarea found:', textarea);
          
          // Intercept Enter key press
          textarea.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
              let message;
              
              // Get message text based on element type
              if (textarea.tagName === 'RICH-TEXTAREA') {
                // For rich-textarea custom element
                message = textarea.value || textarea.textContent || textarea.innerText;
              } else if (textarea.tagName === 'TEXTAREA') {
                message = textarea.value;
              } else {
                message = textarea.textContent || textarea.innerText;
              }
              
              if (message && message.trim()) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                await interceptMessage(message, (finalMessage) => {
                  // Update textarea with potentially redacted message
                  if (textarea.tagName === 'TEXTAREA' || textarea.value !== undefined) {
                    textarea.value = finalMessage;
                  } else {
                    textarea.textContent = finalMessage;
                  }
                  
                  // Trigger input event to update Gemini's internal state
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
          
          debugLog('Gemini Enter key listener attached');
          
          // Setup send button interception
          setupSendButtonInterception();
          
          showNotification('GovernsAI protection enabled for Gemini', 'success');
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
    // Gemini's send button can have various forms
    const buttonSelectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button mat-icon[aria-label*="Send"]',
      'button.send-button',
      'button[data-test-id="send-button"]',
      'button[mattooltip*="Send"]',
      'button svg use[href*="send"]'
    ];
    
    for (const selector of buttonSelectors) {
      const button = document.querySelector(selector);
      if (button) {
        debugLog('Found send button with selector:', selector);
        return button;
      }
    }
    
    // Fallback: find button with send icon or label
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
      const ariaLabel = button.getAttribute('aria-label') || '';
      const tooltip = button.getAttribute('mattooltip') || '';
      const text = button.textContent || '';
      
      if (ariaLabel.toLowerCase().includes('send') || 
          tooltip.toLowerCase().includes('send') ||
          text.toLowerCase().includes('send')) {
        debugLog('Found send button by attributes');
        return button;
      }
      
      // Check for send icon
      const svg = button.querySelector('svg');
      if (svg) {
        const svgContent = svg.innerHTML.toLowerCase();
        if (svgContent.includes('send')) {
          debugLog('Found send button by SVG content');
          return button;
        }
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
            'rich-textarea',
            'div[contenteditable="true"]',
            'textarea.ql-editor',
            'div[role="textbox"]',
            '.ql-editor',
            'textarea[placeholder*="Enter"]'
          ];
          
          let textarea = null;
          for (const selector of textareaSelectors) {
            textarea = document.querySelector(selector);
            if (textarea) break;
          }
          
          let message;
          if (textarea) {
            if (textarea.tagName === 'RICH-TEXTAREA') {
              message = textarea.value || textarea.textContent || textarea.innerText;
            } else if (textarea.tagName === 'TEXTAREA') {
              message = textarea.value;
            } else {
              message = textarea.textContent || textarea.innerText;
            }
          }
          
          if (message && message.trim()) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            await interceptMessage(message, (finalMessage) => {
              if (textarea) {
                if (textarea.tagName === 'TEXTAREA' || textarea.value !== undefined) {
                  textarea.value = finalMessage;
                } else {
                  textarea.textContent = finalMessage;
                }
                
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
        
        debugLog('Gemini send button listener attached');
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
  
  // Also retry setup on navigation (Gemini is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      debugLog('URL changed, re-initializing Gemini interception');
      setTimeout(setupInterception, 1000);
    }
  }).observe(document, { subtree: true, childList: true });
  
})();

