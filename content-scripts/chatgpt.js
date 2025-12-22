// ChatGPT interceptor
// Intercepts messages sent to ChatGPT

(function() {
  'use strict';
  
  debugLog('ChatGPT interceptor loaded');
  
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
        platform: 'chatgpt',
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
    debugLog('Setting up ChatGPT interception');
    
    // ChatGPT uses a contenteditable div or textarea
    // The selector may need to be updated based on ChatGPT's current DOM structure
    const textareaSelector = 'textarea[data-id], textarea#prompt-textarea, div[contenteditable="true"]';
    
    // Wait for the textarea to load
    waitForElement(textareaSelector)
      .then((textarea) => {
        debugLog('Textarea found:', textarea);
        
        // Intercept Enter key press
        textarea.addEventListener('keydown', async (e) => {
          activeInput = textarea;
          if (isSyntheticSend) {
            isSyntheticSend = false;
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            const message = textarea.value || textarea.textContent;
            
            if (message.trim()) {
              e.preventDefault();
              e.stopPropagation();
              
              await interceptMessage(message, (finalMessage) => {
                applyMessageToInput(textarea, finalMessage);
                
                // Trigger the original send
                const sendButton = document.querySelector('button[data-testid="send-button"], button[aria-label*="Send"]');
                triggerSend(sendButton, textarea);
              });
            }
          }
        }, true); // Use capture phase to intercept before ChatGPT
        
        debugLog('Enter key listener attached');
        
        // Intercept send button clicks
        const sendButtonObserver = new MutationObserver(() => {
          const sendButton = document.querySelector('button[data-testid="send-button"], button[aria-label*="Send"]');
          if (sendButton && !sendButton.hasAttribute('data-governs-intercepted')) {
            sendButton.setAttribute('data-governs-intercepted', 'true');
            
            sendButton.addEventListener('click', async (e) => {
              if (isSyntheticSend) {
                isSyntheticSend = false;
                return;
              }
              const textarea = getActiveInput(textareaSelector);
              const message = textarea?.value || textarea?.textContent;
              
              if (message && message.trim()) {
                e.preventDefault();
                e.stopPropagation();
                
                await interceptMessage(message, (finalMessage) => {
                  applyMessageToInput(textarea, finalMessage);
                  triggerSend(sendButton, textarea);
                });
              }
            }, true);
            
            debugLog('Send button listener attached');
          }
        });
        
        sendButtonObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        showNotification('GovernsAI protection enabled', 'success');
      })
      .catch((error) => {
        console.error('[GovernsAI] Failed to find textarea:', error);
      });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupInterception);
  } else {
    setupInterception();
  }
  
  // Also retry setup on navigation (ChatGPT is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      debugLog('URL changed, re-initializing interception');
      setTimeout(setupInterception, 1000);
    }
  }).observe(document, { subtree: true, childList: true });
  
  function applyMessageToInput(input, value) {
    if (!input) return;
    const isTextArea = input.tagName === 'TEXTAREA';
    const isInput = input.tagName === 'INPUT';
    const isEditable = input.isContentEditable;

    if (isTextArea || isInput) {
      const proto = isTextArea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(input, value);
      } else {
        input.value = value;
      }
    } else if (isEditable) {
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

  function getActiveInput(selector) {
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable)) {
      return active;
    }
    if (activeInput && document.contains(activeInput)) {
      return activeInput;
    }
    return document.querySelector(selector);
  }
  
})();
