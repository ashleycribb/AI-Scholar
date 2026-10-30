import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';

const localEngineDir = path.join(process.cwd(), 'local_engine');
if (!fs.existsSync(localEngineDir)) fs.mkdirSync(localEngineDir, { recursive: true });
const db = new DatabaseSync(path.join(localEngineDir, 'research_provenance.sqlite'));

db.exec(`
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY, session_uuid TEXT NOT NULL, workspace_id TEXT,
  claim_text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unverified',
  confidence REAL, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS claim_evidence (
  id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, source_id TEXT NOT NULL,
  source_type TEXT NOT NULL, relation TEXT NOT NULL, strength REAL,
  evidence_note TEXT, locator TEXT, verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, FOREIGN KEY(claim_id) REFERENCES claims(id)
);
CREATE INDEX IF NOT EXISTS idx_claim_session ON claims(session_uuid);
CREATE INDEX IF NOT EXISTS idx_evidence_claim ON claim_evidence(claim_id);
`);

export function recordClaim(input: any) {
  const now = new Date().toISOString();
  const id = input.id || `claim-${randomUUID()}`;
  db.prepare(`INSERT INTO claims (id,session_uuid,workspace_id,claim_text,status,confidence,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, input.sessionUuid, input.workspaceId || null, input.claimText,
      input.status || 'unverified', input.confidence ?? null, input.createdBy || 'Scholar Explorer Agent', now, now);
  return getClaimProvenance(id);
}

export function linkClaimEvidence(input: any) {
  const id = input.id || `evidence-${randomUUID()}`;
  const now = new Date().toISOString();
  const allowed = new Set(['supports','contradicts','inconclusive','contextual']);
  if (!allowed.has(input.relation)) throw new Error('relation must be supports, contradicts, inconclusive, or contextual');
  db.prepare(`INSERT INTO claim_evidence (id,claim_id,source_id,source_type,relation,strength,evidence_note,locator,verified,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, input.claimId, input.sourceId, input.sourceType || 'scholarly-work', input.relation,
      input.strength ?? null, input.evidenceNote || null, input.locator || null, input.verified ? 1 : 0, now);
  return getClaimProvenance(input.claimId);
}

export function getClaimProvenance(claimId: string) {
  const claim = db.prepare(`SELECT * FROM claims WHERE id = ?`).get(claimId) as any;
  if (!claim) return null;
  const evidence = db.prepare(`SELECT * FROM claim_evidence WHERE claim_id = ? ORDER BY created_at`).all(claimId) as any[];
  return { ...claim, evidence: evidence.map(e => ({ ...e, verified: Boolean(e.verified) })) };
}

export function getResearchGraph(sessionUuid: string) {
  const claims = db.prepare(`SELECT id FROM claims WHERE session_uuid = ? ORDER BY created_at`).all(sessionUuid) as any[];
  return { sessionUuid, claims: claims.map(c => getClaimProvenance(c.id)), exportedAt: new Date().toISOString() };
}
