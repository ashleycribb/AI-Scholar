<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/11DnbZoGbLy6qtxVCFwBXCN6K3pukqsV3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Gemini API key handling

`GEMINI_API_KEY` is read **only by the Node server** (`server.ts`). The browser bundle and the
Chrome extension never contain it: the client calls `POST /api/gemini/generate` and
`POST /api/gemini/embed` (`server/geminiProxy.ts`), which validate the request, rate-limit it,
and call Gemini with the server-side key. In AI Studio, keep the key in the app's Secrets/env.

Optional server env: `GEMINI_PROXY_PER_CLIENT_PER_MIN` (default 60), `GEMINI_PROXY_GLOBAL_PER_MIN`
(default 600), `GEMINI_PROXY_ALLOWED_ORIGINS` (comma-separated extra origins, e.g.
`chrome-extension://<id>`; the extension also needs `chrome.storage.local.set({geminiProxyUrl: "https://<app-url>"})`).

Tests: `npm test` (bun).
