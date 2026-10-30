/**
 * Emailed one-click source approval.
 *
 *   GET  /api/sources/approve-token?id=&token=   shows a confirmation page (changes nothing, so mail scanners
 *                                                and link previewers that fetch the URL cannot approve a source)
 *   POST /api/sources/approve-token              id + token in the body; approves only on a valid token
 *
 * The token is the only credential here: it is checked against the digest stored for that exact source,
 * is single use and expires (server/approvalTokens.ts). Every failure shows the same message. Everything
 * interpolated into the pages goes through escapeHtml.
 */
import express, { Router } from "express";
import { escapeHtml } from "./approvalTokens";
import { approveSourceWithToken, peekSourceForApproval } from "./sourceRegistry";

const INVALID = "This approval link is not valid. It may have expired, already been used, or been copied incorrectly.";

function page(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 60px 20px; background: #f8fafc; color: #0f172a;">
<div style="max-width: 520px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
${bodyHtml}
</div></body></html>`;
}

const asString = (v: unknown) => (typeof v === "string" ? v : undefined);

export function createSourceApprovalRouter(): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    next();
  });

  router.get("/approve-token", (req, res) => {
    const id = asString(req.query.id);
    const token = asString(req.query.token);
    const source = peekSourceForApproval(id, token);
    if (!source) {
      return res.status(400).type("html").send(page("Approval link", `<h1 style="font-size: 22px; margin: 0 0 12px;">Link not valid</h1><p style="color:#475569;">${escapeHtml(INVALID)}</p>`));
    }
    res.type("html").send(page("Approve source", `
<h1 style="font-size: 22px; margin: 0 0 12px;">Approve this source?</h1>
<p style="font-size: 15px; color: #475569; line-height: 1.5; margin: 0 0 24px;"><strong>${escapeHtml(source.name)}</strong> will be added to the Scholar Explorer search registry for all users.</p>
<form method="post" action="/api/sources/approve-token">
<input type="hidden" name="id" value="${escapeHtml(id)}">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit" style="padding: 12px 28px; background: #0f172a; color: white; border: 0; border-radius: 10px; font-weight: 700; font-size: 14px; cursor: pointer;">Approve</button>
</form>`));
  });

  router.post("/approve-token", express.urlencoded({ extended: false, limit: "4kb" }), (req, res) => {
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const source = approveSourceWithToken(asString(body.id), asString(body.token));
    if (!source) {
      return res.status(400).type("html").send(page("Approval link", `<h1 style="font-size: 22px; margin: 0 0 12px;">Link not valid</h1><p style="color:#475569;">${escapeHtml(INVALID)}</p>`));
    }
    res.type("html").send(page("Source approved", `
<div style="font-size: 48px; margin-bottom: 16px;">&#10003;</div>
<h1 style="color: #059669; font-size: 24px; font-weight: 800; margin: 0 0 12px;">Source approved</h1>
<p style="font-size: 15px; color: #475569; line-height: 1.5; margin: 0 0 24px;"><strong>${escapeHtml(source.name)}</strong> is now part of the Scholar Explorer search registry.</p>
<a href="/" style="display: inline-block; padding: 12px 28px; background: #0f172a; color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">Return to Scholar Explorer</a>`));
  });

  return router;
}
