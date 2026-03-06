// ChatGPT interceptor
// Intercepts messages sent to ChatGPT

(function() {
  'use strict';
  
  debugLog('ChatGPT interceptor loaded');
  
  let isProcessing = false;
  let isSyntheticSend = false;
  let activeInput = null;
  
  /**
   * Intercepts the message submission, scanning both text and any attached images.
   * When images are present the request is routed as INTERCEPT_IMAGE so the
   * background can run OCR before feeding the extracted text to Precheck.
   *
   * @param {string}   message      - The text content of the input
   * @param {string[]} images       - Base64 data URLs of attached images (may be empty)
   * @param {Function} sendCallback - Called with the (possibly redacted) text to send
   */
  async function interceptMessage(message, images, sendCallback) {
    if (isProcessing) {
      debugLog('Already processing a message, skipping');
      return;
    }

    isProcessing = true;
    debugLog('Intercepting message:', message, '| images:', images.length);

    try {
      const hasImages = images.length > 0;
      const messageType = hasImages ? 'INTERCEPT_IMAGE' : 'INTERCEPT_MESSAGE';

      const response = await sendToBackground(messageType, {
        platform: 'chatgpt',
        message: message,
        images: images,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });

      debugLog('Background response:', response);

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
          sendCallback(response.redactedMessage);
          break;

        case 'BLOCK':
          debugLog('Message blocked:', response.reason);
          if (response.isImageBlock) {
            showNotification(
              `Image blocked: sensitive information detected in attachment.`,
              'error',
              { isImageBlock: true }
            );
          } else {
            showNotification(`Message blocked: ${response.reason}`, 'error');
          }
          break;

        default:
          debugLog('Unknown action, blocking message');
          showNotification('Message blocked: Unknown policy action', 'error');
      }
    } catch (error) {
      console.error('[GovernsAI] Error processing message:', error);
      showNotification('GovernsAI unavailable. Message blocked for safety.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  /**
   * Extracts base64 JPEG data URLs from any image attachments visible in the
   * input area container.  Only blob: and data: src images are considered —
   * these are user-uploaded files, not UI chrome.  Canvas taint errors (rare
   * cross-origin cases) are caught and the image is silently skipped.
   *
   * @param {Element} textarea - The active input element
   * @returns {string[]} Array of base64 data URLs (JPEG, ≤2 MB each)
   */
  function extractAttachedImages(textarea) {
    const images = [];
    if (!textarea) return images;

    // Walk up from the textarea to find its enclosing form or input container.
    // ChatGPT nests the textarea several divs deep inside the prompt form.
    let container = textarea;
    for (let i = 0; i < 7; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      if (container.tagName === 'FORM') break;
    }

    const allImgs = container.querySelectorAll('img');
    for (const img of allImgs) {
      const src = img.src || img.getAttribute('src') || '';

      // Only process user-uploaded blobs or inline data URIs.
      if (!src.startsWith('blob:') && !src.startsWith('data:image/')) continue;

      // Skip tiny images that are likely UI icons, not file attachments.
      const rect = img.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) continue;

      try {
        const w = img.naturalWidth || Math.round(rect.width);
        const h = img.naturalHeight || Math.round(rect.height);
        if (w === 0 || h === 0) continue;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // toDataURL throws if the canvas is tainted by a cross-origin image.
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // A non-empty JPEG will always be longer than a few hundred chars.
        if (dataUrl.length > 200) {
          images.push(dataUrl);
          debugLog('Captured image attachment:', dataUrl.length, 'chars');
        }
      } catch (err) {
        // Canvas taint or security error — skip this image.
        debugLog('Could not capture image (skipped):', err.message);
      }
    }

    debugLog('extractAttachedImages found', images.length, 'image(s)');
    return images;
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

              const images = extractAttachedImages(textarea);
              await interceptMessage(message, images, (finalMessage) => {
                applyMessageToInput(textarea, finalMessage);

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

                const images = extractAttachedImages(textarea);
                await interceptMessage(message, images, (finalMessage) => {
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
