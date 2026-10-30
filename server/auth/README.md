# Server auth (email magic links)

Foundation for signing in to Scholar Explorer. It is mounted at `/api/auth` in `server.ts`.
Only one route uses it so far (`POST /api/marketplace/capabilities`); the rest of the server is
locked down in follow-up PRs (see the end of this file).

## Flow

1. `POST /api/auth/magic-link/request` with `{ "email": "..." }`. A well-formed address always gets
   the same `202` answer, whether or not it may sign in, whether or not it was throttled, and whether
   or not the email could be sent. Malformed input gets `400`.
2. The email links to `GET /api/auth/magic-link/verify?token=...`. That page only shows a
   "Sign in" button (mail scanners that prefetch links cannot use up the token).
3. The button (or a script) does `POST /api/auth/magic-link/verify` with the token. Success sets the session
   cookie. JSON clients get `{ user, csrfToken }`; browser forms get a `303` to `AUTH_POST_LOGIN_REDIRECT`.
   Every failure (unknown, wrong, expired, reused) gets the same `400`.
4. `GET /api/auth/session` returns `{ authenticated, user, csrfToken }`.
5. `POST /api/auth/logout` (needs `X-CSRF-Token`) deletes the session on the server and clears the cookie.

## Security properties

- Tokens: 256-bit random, 15 minutes (`AUTH_TOKEN_TTL_MINUTES`), single use (one atomic `UPDATE`), only the
  SHA-256 hash is stored, compared with `timingSafeEqual`.
- Sessions: server-side rows with expiry (`AUTH_SESSION_TTL_HOURS`, default 12), new id on every login,
  max 10 per address. Cookie is `HttpOnly; Secure; SameSite=Lax; Path=/` and named `__Host-scholar_sid`.
- CSRF: every non-GET request through `requireAuth`/`requireRole` needs the `X-CSRF-Token` returned by
  `/session` or `/verify` (an HMAC derived from the session secret, so nothing extra is stored) and a same-origin
  `Origin` (or no cross-site `Sec-Fetch-Site`).
- Roles (`participant`, `researcher`, `committee`, `admin`) come only from `AUTH_*_EMAILS` and are looked up on every
  request, so removing an address takes effect immediately. `admin` passes every `requireRole` check.
- Limits: requests per IP (20/hour) and per address (3 per 15 minutes, silently ignored beyond that), verify attempts
  per IP (30/minute). In memory, so per process.
- The link in the email is built from `AUTH_PUBLIC_URL`, never from the request's `Host` header.

## Environment variables

| Variable | Needed | Meaning |
|---|---|---|
| `NODE_ENV=production` | prod | Turns on the production checks below |
| `AUTH_PUBLIC_URL` | prod | Public `https://` origin of the app, used in emailed links |
| `AUTH_EMAIL_PROVIDER` | prod | `resend` or `smtp` (inferred from `RESEND_API_KEY` / `SMTP_HOST`). `console` is dev only |
| `AUTH_EMAIL_FROM` | prod | e.g. `Scholar Explorer <no-reply@yourdomain>` |
| `RESEND_API_KEY` | resend | Resend API key |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | smtp | `SMTP_SECURE` is `tls` (default for 465), `starttls` (default otherwise) or `none` (not in production) |
| `AUTH_ADMIN_EMAILS`, `AUTH_RESEARCHER_EMAILS`, `AUTH_COMMITTEE_EMAILS` | yes | Comma separated allowlists. Highest role wins if listed twice |
| `AUTH_ALLOW_PARTICIPANT_SIGNUP` | no | Default `true`. `false` = only allowlisted addresses can sign in |
| `AUTH_TRUST_PROXY` | behind a proxy | e.g. `1`. Without it every user shares the proxy's IP for rate limits |
| `AUTH_DB_PATH` | no | Default `local_engine/auth.sqlite` (git-ignored) |
| `AUTH_ALLOWED_ORIGINS` | no | Extra origins allowed to POST |
| `AUTH_POST_LOGIN_REDIRECT` | no | Relative path, default `/` |
| `AUTH_COOKIE_SECURE=false` | dev only | Refused in production |

In production, if the sender or public URL is missing, the server still starts but `/magic-link/*` answer `503`
and the reason is logged once at startup. In development with no sender configured, the link is printed to the
server console and nowhere else.

## Using the middleware

```ts
const auth = createAuth();
app.use("/api/auth", auth.router);                       // before express.json() and the wildcard CORS
app.get("/api/x", auth.requireAuth, handler);            // any signed-in user, req.auth = { email, role, ... }
app.delete("/api/y", auth.requireRole("researcher", "committee"), handler); // admin always passes
```

## Limits to know about

- Sessions and tokens live in SQLite on the instance's disk. If the host has several instances or a
  throwaway disk, users sign in again after a restart and must hit the same instance.
- Magic links prove control of a mailbox, not identity; participants are anyone with an email address
  unless `AUTH_ALLOW_PARTICIPANT_SIGNUP=false`.

## Next PRs

1. Lock down the remaining routes (LRS delete/role/sources/marketplace/MCP) with `requireRole`, replace
   `?role=` query handling and the wildcard CORS, escape the approve page, fix the `LIKE` delete.
2. Replace the client-side login (`authService.ts`, `LoginScreen.tsx`) with a magic-link screen that calls these endpoints.
