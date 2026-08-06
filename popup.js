// ---------- Elements ----------
const dropzone = document.getElementById('dropzone');
const dzEmpty = document.getElementById('dz-empty');
const dzPreview = document.getElementById('dz-preview');
const clearBtn = document.getElementById('clear-btn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const mpesaValueEl = document.getElementById('mpesa-value');
const invoiceValueEl = document.getElementById('invoice-value');
const copyMpesaBtn = document.getElementById('copy-mpesa');
const copyInvoiceBtn = document.getElementById('copy-invoice');
const rawDetails = document.getElementById('raw-details');
const rawTextEl = document.getElementById('raw-text');

const sandboxFrame = document.getElementById('ocr-sandbox');
let sandboxReady = false;
let requestCounter = 0;
const pendingRequests = new Map();

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'ocr-ready') {
    sandboxReady = true;
    return;
  }

  if (msg.type === 'ocr-result' || msg.type === 'ocr-error') {
    const pending = pendingRequests.get(msg.requestId);
    if (!pending) return;
    pendingRequests.delete(msg.requestId);
    if (msg.type === 'ocr-result') {
      pending.resolve(msg.text);
    } else {
      pending.reject(new Error(msg.error || 'OCR failed'));
    }
  }
});

function runOcrInSandbox(imageDataUrl) {
  return new Promise((resolve, reject) => {
    const requestId = ++requestCounter;
    pendingRequests.set(requestId, { resolve, reject });
    sandboxFrame.contentWindow.postMessage(
      { type: 'ocr-run', requestId, imageDataUrl },
      '*'
    );
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Focus the dropzone so paste works immediately ----------
dropzone.focus();

// ---------- Paste handling ----------
dropzone.addEventListener('paste', async (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;

  let imageFile = null;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      imageFile = item.getAsFile();
      break;
    }
  }

  if (!imageFile) {
    showStatus('No image found on clipboard. Copy a screenshot, then paste (Ctrl+V) here.', true);
    return;
  }

  const imageUrl = URL.createObjectURL(imageFile);
  showPreview(imageUrl);
  await runOcr(imageFile);
});

// Also allow drag-and-drop of an image file, since it's the same use case
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('is-active');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-active'));
dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropzone.classList.remove('is-active');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const imageUrl = URL.createObjectURL(file);
    showPreview(imageUrl);
    await runOcr(file);
  }
});

dropzone.addEventListener('click', () => dropzone.focus());

clearBtn.addEventListener('click', resetAll);

// ---------- Copy buttons ----------
copyMpesaBtn.addEventListener('click', () => copyValue(copyMpesaBtn, mpesaValueEl.dataset.raw));
copyInvoiceBtn.addEventListener('click', () => copyValue(copyInvoiceBtn, invoiceValueEl.dataset.raw));

function copyValue(btn, value) {
  if (!value) return;
  navigator.clipboard.writeText(value).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1200);
  });
}

// ---------- UI helpers ----------
function showPreview(imageUrl) {
  dzEmpty.hidden = true;
  dzPreview.hidden = false;
  dzPreview.src = imageUrl;
  clearBtn.hidden = false;
  resultsEl.hidden = true;
  rawDetails.hidden = true;
}

function showStatus(message, isError = false) {
  statusEl.hidden = false;
  statusEl.classList.toggle('error', isError);
  statusEl.innerHTML = isError
    ? message
    : `<span class="spinner"></span><span>${message}</span>`;
}

function hideStatus() {
  statusEl.hidden = true;
}

function resetAll() {
  dzEmpty.hidden = false;
  dzPreview.hidden = true;
  dzPreview.src = '';
  clearBtn.hidden = true;
  resultsEl.hidden = true;
  rawDetails.hidden = true;
  hideStatus();
  dropzone.focus();
}

// ---------- OCR ----------
async function waitForSandbox(timeoutMs = 8000) {
  const start = Date.now();
  while (!sandboxReady) {
    if (Date.now() - start > timeoutMs) throw new Error('OCR engine did not start in time');
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function runOcr(imageFile) {
  showStatus('Reading screenshot…');
  copyMpesaBtn.disabled = true;
  copyInvoiceBtn.disabled = true;

  try {
    await waitForSandbox();
    const imageDataUrl = await fileToDataUrl(imageFile);
    const text = await runOcrInSandbox(imageDataUrl);
    hideStatus();
    extractAndShow(text);
  } catch (err) {
    console.error(err);
    showStatus('Could not read that image. Try a clearer screenshot.', true);
  }
}

// ---------- Extraction logic ----------
function extractAndShow(rawText) {
  const cleaned = rawText.replace(/\r/g, '');

  const mpesaCode = extractMpesaCode(cleaned);
  const invoiceNo = extractInvoiceNumber(cleaned);

  setResult(mpesaValueEl, copyMpesaBtn, mpesaCode);
  setResult(invoiceValueEl, copyInvoiceBtn, invoiceNo);

  resultsEl.hidden = false;
  rawDetails.hidden = false;
  rawTextEl.textContent = rawText.trim() || '(no text detected)';
}

function setResult(el, btn, value) {
  if (value) {
    el.textContent = value;
    el.dataset.raw = value;
    el.classList.remove('empty');
    btn.disabled = false;
  } else {
    el.textContent = 'Not found — check text below';
    el.dataset.raw = '';
    el.classList.add('empty');
    btn.disabled = true;
  }
}

// M-Pesa transaction codes are ~10 characters, uppercase letters + digits,
// and normally sit right before the word "Confirmed" in the SMS text.
function extractMpesaCode(text) {
  const contextMatch = text.match(/\b([A-Z0-9]{9,11})\s+Confirmed/i);
  if (contextMatch) {
    const candidate = normalizeCode(contextMatch[1]);
    if (isPlausibleCode(candidate, 9, 11)) return candidate;
  }

  // Fallback: scan standalone all-caps tokens of the right length/shape
  const tokens = text.match(/\b[A-Z][A-Z0-9]{8,10}\b/g) || [];
  const scored = tokens
    .map(normalizeCode)
    .filter((t) => isPlausibleCode(t, 9, 11) && /[0-9]/.test(t) && /[A-Z]/.test(t));
  return scored[0] || null;
}

// Invoice / account numbers are ~7-8 characters, all caps, and usually
// follow the word "account" (paybill/e-Citizen payment messages).
function extractInvoiceNumber(text) {
  const contextMatch = text.match(/account\s+(?:number\s+)?([A-Z0-9]{6,9})/i);
  if (contextMatch) {
    const candidate = normalizeCode(contextMatch[1]);
    if (isPlausibleCode(candidate, 6, 9)) return candidate;
  }

  // Fallback: standalone all-caps tokens 7-8 chars long, excluding anything
  // already claimed as the M-Pesa code
  const mpesaCode = extractMpesaCode(text);
  const tokens = text.match(/\b[A-Z0-9]{7,8}\b/g) || [];
  const scored = tokens
    .map(normalizeCode)
    .filter((t) => t !== mpesaCode && isPlausibleCode(t, 7, 8));
  return scored[0] || null;
}

function normalizeCode(raw) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isPlausibleCode(token, minLen, maxLen) {
  return !!token && token.length >= minLen && token.length <= maxLen;
}
