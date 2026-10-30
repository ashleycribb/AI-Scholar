# Server auth (email magic links)

Foundation for signing in to Scholar Explorer. It is mounted at `/api/auth` in `server.ts`.
Every other server route is governed by the route policy described under "Route policy" below.

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

## Route policy (who may call what)

`server/routePolicy.ts` is the single table of rules; `enforceRoutePolicy` runs before every handler (and before the
JSON parser) and applies `requireAuth` / `requireRole` (which include the CSRF + same-origin check on unsafe methods)
or a service token. **Fail closed:** any `/api`, `/xapi` or `/mcp` request that matches no rule is admin-only, and
`server/routePolicy.test.ts` fails if `server.ts` registers a route the table does not list. The handler sees the
caller as `req.principal` (`{ kind: "session", email, role }` or `{ kind: "service", name, scopes }`).

| Methods | Path | Who | Notes |
|---|---|---|---|
| GET,POST,PUT,PATCH,DELETE | `/api/auth/**` | public | Magic-link sign-in; own limits, CSRF and origin checks (server/auth) |
| GET,POST,PUT,PATCH,DELETE | `/api/gemini/**` | public | Gemini proxy; own same-origin policy and limits (server/geminiProxy.ts) |
| GET | `/api/health` | public | Liveness |
| GET | `/api/status` | public | Liveness |
| GET | `/xapi/about` | public | xAPI about: public, but credentials that are presented must be valid |
| GET | `/api/xapi/learnmcp/profiles` | public | Public xAPI profile document |
| GET | `/api/openalex/**` | public | Read-only OpenAlex proxy (no rate limit yet) |
| GET | `/api/s2/**` | public | Read-only Semantic Scholar proxy (no rate limit yet) |
| GET | `/api/scholar` | public | SerpApi proxy (spends the server key; rate limit is a follow-up) |
| GET | `/api/scout/search` | public | OpenAlex scout (read-only) |
| GET | `/api/registries/**` | public | Read-only registry proxies |
| POST | `/api/registries/**` | public | DataCite GraphQL / OpenCitations SPARQL queries (read-only) |
| GET | `/api/sources/registry` | public | Approved/discovered sources, approval tokens removed |
| GET,POST | `/api/sources/approve-token` | public | Emailed approval link: the single-use token is the credential |
| POST | `/api/library-mcp/prospectus` | public | Pure document generator, stores nothing |
| POST | `/xapi/statements` | any signed-in · token `xapi:write` | Write statements (acknowledge only today) |
| GET | `/xapi/statements` | any signed-in · token `xapi:read` | Read statements; participants see only their own |
| GET | `/xapi/activities/state` | any signed-in · token `xapi:read` | State document, namespaced per user |
| PUT | `/xapi/activities/state` | any signed-in · token `xapi:write` | State document, namespaced per user |
| DELETE | `/xapi/statements/by-actor` | participant / researcher (+admin) | Delete my data: participants only their own, researchers any exact actor |
| POST | `/xapi/statements/delete-by-actor` | participant / researcher (+admin) | Same, POST form |
| DELETE | `/xapi/statements` | participant / researcher (+admin) | Same, ?actor= form |
| DELETE | `/xapi/actors/*` | participant / researcher (+admin) | Same, path form |
| DELETE | `/api/lrs/actors/*` | participant / researcher (+admin) | Same, path form |
| GET | `/xapi/**` | public | Static xAPI profile/schema JSON from public/xapi (after the dynamic routes above) |
| GET | `/api/lrs/status` | any signed-in | Counts and engine info |
| GET | `/api/lrs/sql-lrs/statements` | any signed-in · token `xapi:read` | Scope from the session role; ?role= and ?userName= are ignored |
| POST | `/api/lrs/sql-lrs/statements` | any signed-in · token `xapi:write` | Write a statement (acknowledge only today) |
| GET | `/api/lrs/duckdb-lrs/statements` | any signed-in · token `xapi:read` | Scope from the session role; participants must name a sessionUuid |
| POST | `/api/lrs/duckdb-lrs/statements` | any signed-in · token `xapi:write` | Write a statement (acknowledge only today) |
| GET | `/api/analytics/duckdb-export` | researcher / committee (+admin) | Full analytics export |
| POST | `/api/provenance/**` | researcher / committee (+admin) | Record claims / evidence |
| GET | `/api/provenance/**` | researcher / committee (+admin) | Claim provenance and research graph |
| POST | `/api/marketplace/capabilities` | researcher (+admin) · token `marketplace:write` | Registers a tool in the server's agent |
| GET | `/api/marketplace/capabilities` | any signed-in · token `marketplace:read` | Capability catalog |
| GET | `/mcp` | researcher (+admin) · token `mcp` | MCP SSE stream (tools spawn local processes) |
| POST | `/mcp/messages` | researcher (+admin) · token `mcp` | MCP messages |
| GET | `/api/local/vault` | researcher (+admin) | Lists vault files |
| POST | `/api/local/verify` | researcher (+admin) | Runs the logician nanobot on a vault file |
| POST | `/api/sources/test-endpoint` | researcher / committee (+admin) | Outbound endpoint probe |
| POST | `/api/sources/propose` | researcher / committee (+admin) | Create a proposal and approval token |
| POST | `/api/sources/approve/*` | researcher / committee (+admin) | Human approval of a source |
| POST | `/api/sources/reject/*` | researcher / committee (+admin) | Human rejection of a source |
| POST | `/api/sources/custom` | researcher / committee (+admin) | Add a discovered source |

`admin` passes every role check. "token `x`" means a service token with that scope is also accepted (no cookie or CSRF).

### Data rules
- **Delete my data** (`DELETE /xapi/statements/by-actor`, `POST /xapi/statements/delete-by-actor`, `DELETE /xapi/statements?actor=`,
  `DELETE /xapi/actors/:id`, `DELETE /api/lrs/actors/:id`): a participant's target is their session address
  (`student@uni.edu` or `mailto:student@uni.edu`); naming anything else is `403`. Researchers/admin must name one actor.
  Committee members and service tokens cannot delete. Matching is exact and case-insensitive with bound parameters
  (no `LIKE`), so `%` and `_` are ordinary characters.
- **Reads** (`/api/lrs/*`, `/xapi/statements`): scope comes from the session. Participants see only statements whose actor is
  their address; researcher/committee/admin and `xapi:read` tokens see all. `?role=` and `?userName=` are ignored.
- **xAPI state documents** are stored per user (`u:<email>` or `s:<service>` prefix on the state id).
- **Emailed source approval link**: `GET /api/sources/approve-token` only shows a confirmation page; `POST` approves if the
  token is the live, unexpired, single-use token issued for that source (256-bit, only its SHA-256 digest is stored, 7 days).
  Output is HTML-escaped. Tokens from older versions are never accepted.
- **Marketplace author** is the authenticated caller, not a header or body field.

### CORS
No wildcard. Allowed origins are `CORS_ALLOWED_ORIGINS` (comma separated, exact origins) plus `AUTH_PUBLIC_URL` and
`AUTH_ALLOWED_ORIGINS`. A `*` entry is ignored and logged. Credentials are never allowed cross-origin. The Gemini proxy
and `/api/auth` keep their own same-origin policy and are not affected.

### Service tokens (non-browser clients)
`SERVICE_TOKENS="name|scope+scope|token;name2|scope|token2"`, tokens at least 32 characters (`openssl rand -base64 32`).
Scopes: `xapi:read`, `xapi:write`, `marketplace:read`, `marketplace:write`, `mcp`, `relay`. Present as
`Authorization: Bearer <token>` or HTTP Basic `name:token` (what an xAPI client already sends). Bad entries are skipped
and logged by name only. `GET /xapi/about` is public but answers `401` to credentials that are present and wrong.
The `/mcp-relay` WebSocket needs a token with `relay`, or a researcher/admin session from an allowed origin.

| Variable | Meaning |
|---|---|
| `CORS_ALLOWED_ORIGINS` | Extra browser origins that may call the API cross-origin (exact, no wildcard) |
| `SERVICE_TOKENS` | Service credentials as above |

## Client

`services/authService.ts` and `components/LoginScreen.tsx` are the browser side of this flow (request a link, the
server's confirmation page, `/session`, `/logout`, `X-CSRF-Token` on unsafe calls via `services/csrf.ts`). The root
`README.md` describes what a signed-out visitor, a participant and staff can do, and how to set up the hosted LRS
service token.
