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
`POST /api/gemini/embed` / `POST /api/gemini/embed-batch` (`server/geminiProxy.ts`), which validate the
request, rate-limit it, and call Gemini with the server-side key. In AI Studio, keep the key in the app's Secrets/env.

Embeddings are batched: the app sends up to 100 texts per `/embed-batch` call (`{model, texts: string[]}`
-> one vector per text, in order), caches vectors by text hash (memory + IndexedDB) and, on a 429, honors
`Retry-After`, retries a bounded number of times and then falls back to keyword ranking. Embeddings have their
own budgets, separate from chat/generate: `GEMINI_PROXY_EMBED_PER_CLIENT_PER_MIN` (calls, default 60),
`GEMINI_PROXY_EMBED_GLOBAL_PER_MIN` (default 600), `GEMINI_PROXY_EMBED_TEXTS_PER_CLIENT_PER_MIN` (texts, default 3000),
`GEMINI_PROXY_EMBED_TEXTS_GLOBAL_PER_MIN` (default 20000), plus the shape caps `GEMINI_PROXY_EMBED_BATCH_MAX_TEXTS`
(default 100) and `GEMINI_PROXY_EMBED_TEXT_MAX_CHARS` (default 20000).

Optional server env: `GEMINI_PROXY_PER_CLIENT_PER_MIN` (default 60) and `GEMINI_PROXY_GLOBAL_PER_MIN`
(default 600) for generate, `GEMINI_PROXY_ALLOWED_ORIGINS` (comma-separated extra origins, e.g.
`chrome-extension://<id>`; the extension also needs `chrome.storage.local.set({geminiProxyUrl: "https://<app-url>"})`).

### LLM provider layer (`server/llm/`)

The proxy does not call Gemini directly. It calls an `LLMService`, which talks to providers through one
contract (`server/llm/types.ts`: `generate`, `embed`, `embedBatch`, normalized `LLMError` kinds such as
`rate_limited` with `retryAfterMs`, `unavailable`, `timeout`, `bad_request`). The Gemini SDK lives only in
`server/llm/providers/gemini.ts`. Only the Gemini adapter is registered; a new vendor means one new adapter
file plus one `register` line in `server/llm/config.ts`. Routes, request/response shapes, caps and rate limits
are unchanged; responses add an `X-LLM-Provider` header (and `providerId` in the `/embed-batch` body).

Policy: `generate` can fail over to the providers in `LLM_FALLBACK_PROVIDERS`; **embeddings never fail over**
(vectors from different models are not comparable), so an embedding error goes back to the client, which falls
back to keyword ranking. Each call has a timeout and a per-provider circuit breaker (opens after consecutive
5xx/network/timeout failures, then lets one probe through; 429s and bad requests do not open it).

| Env var | Default | Meaning |
| --- | --- | --- |
| `LLM_PRIMARY_PROVIDER` | `gemini` | Provider tried first for `generate`. Unknown ids stop the server at startup. |
| `LLM_FALLBACK_PROVIDERS` | empty | Comma-separated, `generate` only, tried in order. |
| `LLM_EMBED_PROVIDER` | the primary | Provider for embeddings. Never failed over. |
| `LLM_GENERATE_TIMEOUT_MS` | `120000` | Per-call timeout for `generate`. |
| `LLM_EMBED_TIMEOUT_MS` | `30000` | Per-call timeout for embeddings. |
| `LLM_BREAKER_FAILURES` | `5` | Consecutive failures that open the breaker. |
| `LLM_BREAKER_OPEN_MS` | `30000` | Time open before one probe call is allowed. |

Tests: `npm test` (runs `bun test`; install [Bun](https://bun.sh) for the test runner only).

## Signing in (email magic links)

The app has one way to sign in: an emailed one-time link. There is no password and no role picker; the
server decides everyone's role (`server/auth/README.md` has the full flow and every `AUTH_*` variable).

1. **Sign In** (header) opens a dialog that asks for an email address and calls `POST /api/auth/magic-link/request`.
   The answer is the same for every well-formed address, so the dialog never says whether an address is allowed.
2. The emailed link opens the server's own confirmation page (`GET /api/auth/magic-link/verify`). Selecting its
   **Sign in** button consumes the token and starts a 12-hour session, then returns to `/`. Mail scanners that
   prefetch the link cannot use it up.
3. The app asks `GET /api/auth/session` on load, on tab focus and every 5 minutes. The session cookie is `HttpOnly`;
   the page only ever sees the email, the role and a CSRF token, and keeps the CSRF token for `X-CSRF-Token` on
   `POST`/`PUT`/`DELETE` calls to its own server. **Sign out** calls `POST /api/auth/logout`.
4. The role the app shows (`researcher`/`admin` get the PI dashboard, `committee` the committee dossier,
   everyone else is a participant) is copied from that session answer only. The browser stores no role. A
   "session" saved by the old credential-less login is ignored and removed; only its pseudonymous ids are kept.

In development with no email provider configured, the link is printed in the server console
(`npm run dev`, look for the `/api/auth/magic-link/verify?token=...` line). For a local run over plain `http`
set `AUTH_COOKIE_SECURE=false`, and set `AUTH_RESEARCHER_EMAILS=you@example.edu` to sign in as a researcher.

### What works without signing in

Anyone can search, read, stage papers, build a workspace and export a backup. That all runs in the browser plus
the read-only public proxies. **Nothing is recorded for research unless the person joins a study and agrees**
(the consent dialog never opens on page load, and a `?studyId=` link only shows a "Join study" banner), and
consent does not depend on an account.

Signing in is optional for participants. It adds what needs the server to know who you are:

| Feature | Signed out | Participant | Committee | Researcher / admin |
|---|---|---|---|---|
| Search, workspace, local export | yes | yes | yes | yes |
| Sync statements and workspace state to this server's LRS (`/xapi/*`) | no, stays queued on the device | yes | yes | yes |
| LRS dashboards (`/api/lrs/*`) | this tab's own records only | own records | all | all |
| Delete my data | local history + device id only | local + server records tied to the sign-in address | local only | local + any exact actor |
| Source discovery actions (test, propose, approve, reject, add) | no | no | yes | yes |
| Local Nanobot / vault, MCP bridge | no | no | no | yes |

Participants' telemetry stays de-identified: they appear as `Participant #XXXX`, and the sign-in address is not
put in statements. Old pseudonymous device ids and study ids cannot be proven to belong to a signed-in person, so a
participant's delete request never names them (the server would refuse it). A researcher or admin can delete rows
stored under an old id by naming the exact id.

### Hosted LRS (service token)

The default LRS endpoint, `https://34.74.163.88.sslip.io/xapi`, is a different origin from the app, so browser
sessions do not reach it. It accepts a **service token** instead:

1. On the server that hosts the LRS, set a secret (at least 32 characters; `openssl rand -base64 32`):
   `SERVICE_TOKENS="lrs-sync|xapi:read+xapi:write|<token>"` (several entries are separated by `;`).
   Scopes: `xapi:read`, `xapi:write`, `marketplace:read`, `marketplace:write`, `mcp`, `relay`.
2. Allow the app's origin to call it from a browser: `CORS_ALLOWED_ORIGINS=https://<the app's address>`
   (exact origins, no `*`).
3. In the app, open **Database (S3A LRS)** and enter user name `lrs-sync` and the token as the password. They are
   stored only in this browser's IndexedDB. Do **not** put the token in a `VITE_*` variable: those are compiled into
   the public bundle.
4. Check it: `curl -u lrs-sync:<token> https://<host>/xapi/about` should answer 200; a wrong token answers 401.

Limits: a service token can read and write statements and state, but it cannot delete (only a signed-in
participant, researcher or admin can), so "Delete my data" does not work against a cross-origin LRS from the browser.
Run the app on the LRS host itself (same origin) and sign in to use it.

## Dependencies and CI

`npm` is the package manager; `package-lock.json` is the only lockfile. Use `npm ci` for a clean,
reproducible install. GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci`, `tsc --noEmit`,
`npm test`, `npm run build` and `npm run build-extension` on every pull request and push to `main`.
