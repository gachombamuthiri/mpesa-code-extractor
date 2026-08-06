// Runs inside the sandboxed iframe, where Chrome allows the relaxed
// script permissions (unsafe-eval) that the OCR engine's worker needs.
// Talks to the popup via postMessage: receives an image, sends back text.

let worker = null;

// Build absolute chrome-extension:// URLs so the OCR worker (which runs in
// its own execution context) resolves paths correctly, rather than relying
// on relative paths that can double up (e.g. lib/lib/...).
const EXTENSION_BASE = location.href.replace(/sandbox\.html.*$/, '');

async function getWorker() {
  if (worker) return worker;
  worker = await Tesseract.createWorker('eng', 1, {
    workerPath: EXTENSION_BASE + 'lib/worker.min.js',
    corePath: EXTENSION_BASE + 'lib/',
    workerBlobURL: false,
  });
  return worker;
}

window.addEventListener('message', async (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'ocr-run') return;

  try {
    const w = await getWorker();
    const { data } = await w.recognize(msg.imageDataUrl);
    event.source.postMessage(
      { type: 'ocr-result', requestId: msg.requestId, text: data.text || '' },
      event.origin === 'null' ? '*' : event.origin
    );
  } catch (err) {
    event.source.postMessage(
      { type: 'ocr-error', requestId: msg.requestId, error: String(err && err.message ? err.message : err) },
      event.origin === 'null' ? '*' : event.origin
    );
  }
});

// Let the popup know the sandbox is ready to receive messages
window.parent.postMessage({ type: 'ocr-ready' }, '*');
