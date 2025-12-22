// Gemini interceptor
// Intercepts messages sent to Gemini

(function() {
  'use strict';
  
  debugLog('Gemini interceptor loaded');
  
  let isProcessing = false;
  let isSyntheticSend = false;
  let activeInput = null;

  // --- Helper Functions (Hoisted) ---

  function getMessageFromInput(input) {
    if (!input) return '';
    // If rich-textarea, dive into shadow
    if (input.tagName === 'RICH-TEXTAREA' && input.shadowRoot) {
        const inner = input.shadowRoot.querySelector('[contenteditable="true"], div[role="textbox"]');
        if (inner) input = inner;
    }
    
    if (input.tagName === 'RICH-TEXTAREA') return input.value || input.textContent; // fallback
    if (input.value !== undefined) return input.value;
    return input.textContent || input.innerText || '';
  }

  function applyMessageToInput(input, value) {
    if (!input) return;
    
    debugLog('Applying message to input:', input.tagName);
    
    // If it's the wrapper rich-textarea, try to find the inner contenteditable
    if (input.tagName === 'RICH-TEXTAREA' && input.shadowRoot) {
        const inner = input.shadowRoot.querySelector('[contenteditable="true"], div[role="textbox"]');
        if (inner) {
            input = inner; // Re-target to the actual editable element
        }
    }

    input.focus();
    
    const isEditable = input.isContentEditable;
    let success = false;

    if (isEditable) {
        // Strategy 1: Clear and Insert Text via execCommand (Best for Undo history and events)
        try {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null); // Clear explicitly
            success = document.execCommand('insertText', false, value);
            
            if (!success && value) {
                // If insertText fails (some browsers restrict it), try insertHTML
                success = document.execCommand('insertHTML', false, value);
            }
        } catch (e) {
            debugLog('execCommand failed', e);
        }
        
        // Strategy 2: Paste Simulation (Bypasses many restrictions)
        if (!success) {
            try {
                const dt = new DataTransfer();
                dt.setData('text/plain', value);
                const pasteEvent = new ClipboardEvent('paste', {
                    clipboardData: dt,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    view: window
                });
                input.dispatchEvent(pasteEvent);
                
                // Check if paste worked (some apps handle paste async)
                // We'll assume success if we dispatched it, but let's double check content
                if (input.textContent === value) success = true;
            } catch (e) {
                debugLog('Paste simulation failed', e);
            }
        }
        
        // Strategy 3: Direct DOM manipulation + Event flood (Last resort)
        if (!success && input.textContent !== value) {
             input.textContent = value; // innerText often triggers different observers
             if (input.innerHTML !== value) input.innerHTML = value;
        }
    } else {
        // Standard inputs
        input.value = value;
    }

    // Always dispatch events to notify framework
    dispatchEvents(input, value);
  }

  function dispatchEvents(input, value) {
      const events = [
        new InputEvent('beforeinput', { bubbles: true, composed: true, data: value, inputType: 'insertText' }),
        new InputEvent('input', { bubbles: true, composed: true, data: value, inputType: 'insertText' }),
        new Event('change', { bubbles: true, composed: true }),
        // specific for Angular/Zone.js sometimes
        new Event('compositionstart', { bubbles: true, composed: true }),
        new Event('compositionend', { bubbles: true, composed: true, data: value })
      ];
      
      events.forEach(e => input.dispatchEvent(e));
  }

  function updateRichTextArea(element, value) {
    // Legacy support wrapper - logic moved to applyMessageToInput
    applyMessageToInput(element, value);
  }

  function triggerSend(sendButton, textarea) {
    isSyntheticSend = true;
    
    setTimeout(() => {
        if (sendButton && !sendButton.disabled) {
            sendButton.click();
        } else if (textarea) {
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                which: 13,
                keyCode: 13,
                bubbles: true,
                composed: true
            });
            textarea.dispatchEvent(enterEvent);
        }
        
        // Reset flag after a delay
        setTimeout(() => isSyntheticSend = false, 500);
    }, 100); // 100ms wait
  }

  function getActiveInput(selectors) {
    const active = document.activeElement;
    // If active element is a good candidate, return it
    if (active && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.tagName === 'RICH-TEXTAREA')) {
       // If it's inside shadow root (e.g. rich-textarea -> activeElement), it might be handled by shadow root logic
       return active;
    }
    
    // If we have a stored active input, use it
    if (activeInput && document.contains(activeInput)) return activeInput;
    
    // Search
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }
  
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
          showNotification(
            `Redacted ${response.entities?.length || 0} PII entities`,
            'warning',
            { redactionLog: response.redactionLog }
          );
          
          // Apply redaction to UI
          if (activeInput) {
            applyMessageToInput(activeInput, response.redactedMessage);
            
            // Wait a bit for UI to sync before sending
            setTimeout(() => {
                sendCallback(response.redactedMessage);
            }, 150);
          } else {
             sendCallback(response.redactedMessage);
          }
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
            activeInput = textarea;
            // Update active input on keydown to ensure we have the latest focused element
            if (document.activeElement && document.activeElement !== document.body) {
                activeInput = document.activeElement;
            }

            if (isSyntheticSend) {
              isSyntheticSend = false;
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
              const message = getMessageFromInput(textarea); // Use original found textarea as fallback source
              
              if (message && message.trim()) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                await interceptMessage(message, (finalMessage) => {
                  // Final callback handles the send
                  const sendButton = findSendButton();
                  triggerSend(sendButton, activeInput || textarea);
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
        return button;
      }
      
      // Check for send icon
      const svg = button.querySelector('svg');
      if (svg) {
        const svgContent = svg.innerHTML.toLowerCase();
        if (svgContent.includes('send')) {
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
          if (isSyntheticSend) {
            isSyntheticSend = false;
            return;
          }
          const textareaSelectors = [
            'rich-textarea',
            'div[contenteditable="true"]',
            'textarea.ql-editor',
            'div[role="textbox"]',
            '.ql-editor',
            'textarea[placeholder*="Enter"]'
          ];
          
          const textarea = getActiveInput(textareaSelectors);
          activeInput = textarea; // capture active input
          
          const message = getMessageFromInput(textarea);
          
          if (message && message.trim()) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            await interceptMessage(message, (finalMessage) => {
               const btn = findSendButton();
               triggerSend(btn, textarea);
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