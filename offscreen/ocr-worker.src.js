import Tesseract from 'tesseract.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB base64 size cap

// Tesseract worker is created lazily on first request and reused.
let tessWorker = null;

async function getTessWorker() {
  if (tessWorker) return tessWorker;

  // All vendor files are served from the extension's own origin, satisfying
  // Chrome's MV3 CSP which blocks remote script execution.
  const workerPath = chrome.runtime.getURL('vendor/tesseract/worker.min.js');
  const corePath = chrome.runtime.getURL('vendor/tesseract/');

  // Language traineddata is fetched from jsdelivr CDN on first use and then
  // cached by Tesseract.js in IndexedDB for subsequent calls.
  tessWorker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
    workerPath,
    corePath,
    // workerBlobURL must be false so Chrome uses the actual chrome-extension:// URL
    // for the Worker; blob: URLs created from fetched content fail MV3 CSP.
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === 'recognizing text') {
        console.debug('[GovernsAI OCR] progress', Math.round(m.progress * 100) + '%');
      }
    },
  });

  return tessWorker;
}

async function runOCR(images) {
  const worker = await getTessWorker();
  const texts = [];
  const confidence = [];

  for (const dataUrl of images) {
    // Skip oversized images to keep processing time reasonable.
    if (dataUrl.length > MAX_IMAGE_BYTES) {
      console.warn('[GovernsAI OCR] Image exceeds 2 MB, skipping OCR for this attachment.');
      texts.push('');
      confidence.push(0);
      continue;
    }

    try {
      const result = await worker.recognize(dataUrl);
      texts.push(result.data.text);
      confidence.push(result.data.confidence);
      console.debug('[GovernsAI OCR] Extracted text (first 80 chars):', result.data.text.slice(0, 80));
    } catch (err) {
      console.error('[GovernsAI OCR] Recognition failed for one image:', err);
      texts.push('');
      confidence.push(0);
    }
  }

  return { texts, confidence };
}

// Listen for PROCESS_IMAGE messages from the service worker.
// The `target` field scopes messages to this offscreen document only,
// preventing content scripts from accidentally handling them.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'ocr-worker' || msg.type !== 'PROCESS_IMAGE') return;

  runOCR(msg.images)
    .then(sendResponse)
    .catch((err) => {
      console.error('[GovernsAI OCR] Unexpected error:', err);
      sendResponse({ texts: [], confidence: [], error: err.message });
    });

  // Return true to keep the message channel open for the async sendResponse.
  return true;
});

console.log('[GovernsAI OCR] Offscreen OCR worker ready.');
