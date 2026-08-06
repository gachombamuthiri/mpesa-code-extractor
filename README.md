# M-Pesa Code Extractor

A small Chrome extension that reads a pasted M-Pesa payment screenshot and pulls out the **M-Pesa code** and **invoice/account number**, ready to copy with one click.

Everything runs locally in the browser — the screenshot is never uploaded anywhere.

## How to install (load unpacked)

1. Unzip this folder somewhere permanent on your computer (don't delete it after — Chrome loads the extension from this folder every time).
2. Open Chrome and go to `chrome://extensions`
3. Turn on **Developer mode** (toggle, top-right corner)
4. Click **Load unpacked**
5. Select the `mpesa-extractor` folder (the one with `manifest.json` inside)
6. The extension icon (green "M") will appear in your toolbar. You can pin it for quick access.

## How to use

1. Copy an M-Pesa screenshot (or open the image and copy it — e.g. right-click → Copy image, or use the Windows screenshot tool)
2. Click the extension icon to open the popup
3. Click inside the paste area, then press **Ctrl+V**
4. Wait a moment while it reads the image
5. Click **Copy** next to the M-Pesa code or invoice number, then paste into Pesaflow as usual

If a code isn't detected correctly, expand **"Didn't look right? See extracted text"** at the bottom to see exactly what the tool read from the image, so you can copy it manually.

## Notes

- First-time OCR on a fresh install may take a few seconds longer while it downloads the English language data (one-time, then cached).
- Works best with clear, non-blurry screenshots. Very small or heavily compressed images may not read reliably — the raw text preview helps you catch and correct these cases.
- No screenshot data leaves your computer — OCR runs entirely inside the browser via Tesseract.js.

## Version 2 fix

The first version hit a Chrome security restriction that blocked the OCR engine's background worker from loading inside the popup. This version runs the OCR engine inside a sandboxed page instead, which Chrome allows more permissions for. Functionality and usage are unchanged — just paste and go.

## Troubleshooting history (so future edits don't repeat past mistakes)

If you or anyone else touches this code later, know this:

1. **The popup cannot run Tesseract.js directly** — Chrome blocks it (`'unsafe-eval'` isn't allowed in a normal extension popup). This is why OCR runs inside `sandbox.html`, a specially declared "sandboxed" page that Chrome allows more permissions for.
2. **`popup.html`'s iframe id, `popup.js`'s `getElementById`, and the message `type` fields in `popup.js`/`sandbox.js` must all match exactly.** If any one of these is edited without updating the others, OCR silently breaks with a "failed to load" error that looks identical no matter what's actually wrong — this happened once already.
3. **`corePath` in `sandbox.js` must point to the `lib/` folder**, and only these engine files exist there: `tesseract-core-lstm.wasm(.js)` and `tesseract-core-simd-lstm.wasm(.js)`. The plain (non-LSTM) variants were deliberately removed to cut file size — don't reference `tesseract-core.wasm.js` or `tesseract-core-simd.wasm.js`, they don't exist in this repo.
4. When editing, change **all** related files together and re-upload them **in the same commit** — partial edits (changing `manifest.json` but not `popup.js`, for example) leave the extension in a broken, hard-to-debug mixed state.

## Project structure

```
mpesa-extractor/
├── manifest.json      Extension configuration
├── popup.html          Popup UI
├── popup.js            Paste handling, OCR, extraction logic
├── styles.css           Styling
├── icons/                Extension icons
└── lib/                   Bundled Tesseract.js OCR engine (runs locally)
```
