/**
 * Open export bundle (20-year data design, fix 6).
 *
 * One .zip a researcher can keep for decades and read without this app:
 *
 *   <name>.s3a        the S3A snapshot, written by the S3A engine itself (no TypeScript S3A encoding)
 *   events.jsonl      every recorded action from the local workspace log, one JSON object per line, oldest first
 *   works.jsonl       one line per paper in the selection queue: its facts (services/paperFacts.ts)
 *   aliases.csv       work_id,scheme,value for every known identifier of those papers
 *   references.bib    BibTeX for the same papers (missing fields are omitted, never invented)
 *   notes.md          the researcher's notes as plain Markdown
 *   SCHEMA.md         what each file contains, with versions
 *   manifest.sha256   SHA-256 of every other file, in `sha256sum -c` format
 *
 * Text is NFC-normalized UTF-8 with "\n" line ends; timestamps are UTC ISO-8601 ("…Z").
 */
import { strToU8, strFromU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { ResearchPaper } from '../types';
import { aliasRows, withWorkId } from '../utils/workIds';
import { exportToBibTeX } from '../utils/sourceExport';
import { scholarPackPaperKey } from '../utils/scholarPackKey';
import { canonicalInput, sha256Hex } from './derivedCache';
import { paperFacts, PAPER_FACTS_SCHEMA_VERSION } from './paperFacts';
import { rebuildWorkspace, WORKSPACE_LOG_SCHEMA_VERSION, type WorkspaceLogRecord } from './localWorkspaceLog';

export const EXPORT_BUNDLE_SCHEMA_VERSION = 1 as const;
export const MANIFEST_FILE = 'manifest.sha256';
export const BUNDLE_TEXT_FILES = ['events.jsonl', 'works.jsonl', 'aliases.csv', 'references.bib', 'notes.md', 'SCHEMA.md'] as const;

export interface ExportBundleInput {
  /** Local workspace log records (as read: upcast to the current schema). */
  records: WorkspaceLogRecord[];
  /** Papers in the selection queue, in queue order. */
  queue: ResearchPaper[];
  /** The .s3a file produced by the engine (exportS3ASession / exportS3ASnapshotFromPayload). */
  s3a: { filename: string; bytes: Uint8Array };
  now?: Date;
}

export interface ExportBundle {
  zip: Uint8Array;
  files: Record<string, Uint8Array>;
  manifest: Array<{ sha256: string; name: string }>;
}

const nfc = (s: string) => s.normalize('NFC');

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** One JSON object per line: keys sorted, NFC strings, trailing newline. */
export function toJsonl(rows: unknown[]): string {
  return rows.map(r => canonicalInput(r)).join('\n') + (rows.length ? '\n' : '');
}

export function worksJsonl(queue: ResearchPaper[]): string {
  return toJsonl(queue.map(p => {
    const facts = paperFacts(withWorkId(p));
    return { schemaVersion: PAPER_FACTS_SCHEMA_VERSION, work_id: facts.id, s3a_paper_key: scholarPackPaperKey(p).key, ...facts };
  }));
}

export function eventsJsonl(records: WorkspaceLogRecord[]): string {
  const ordered = [...records].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return toJsonl(ordered);
}

export function aliasesCsv(queue: ResearchPaper[]): string {
  const rows = aliasRows(queue).map(r => [r.work_id, r.scheme, r.value].map(v => csvCell(nfc(v))).join(','));
  return ['work_id,scheme,value', ...rows].join('\n') + '\n';
}

export function notesMarkdown(records: WorkspaceLogRecord[], queue: ResearchPaper[]): string {
  const { notes } = rebuildWorkspace(records);
  const titles = new Map<string, string>();
  for (const r of records) if (r.type === 'queue.add') titles.set(r.paperId, r.paper.title);
  for (const p of queue) titles.set(p.id, p.title);
  const list = Object.values(notes).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.noteId.localeCompare(b.noteId));
  const out = ['# Research notes', ''];
  if (list.length === 0) out.push('_No notes were written._', '');
  for (const n of list) {
    const about = n.paperId ? `paper ${n.paperId}${titles.get(n.paperId) ? ` — ${titles.get(n.paperId)}` : ''}` : 'project notes';
    out.push(`## ${n.noteId}`, '', `About: ${about}  `, `Created: ${n.createdAt}  `, `Last edited: ${n.updatedAt}`, '', nfc(n.text).replace(/\r\n?/g, '\n'), '');
  }
  return out.join('\n');
}

export function schemaMarkdown(s3aName: string, exportedAt: string): string {
  return `# Scholar Explorer export bundle

Bundle format version: ${EXPORT_BUNDLE_SCHEMA_VERSION}
Exported at (UTC): ${exportedAt}

All text files are UTF-8, NFC-normalized, with "\\n" line ends. Every timestamp is UTC ISO-8601 ending in "Z".
\`${MANIFEST_FILE}\` lists the SHA-256 of every other file; check it with \`sha256sum -c ${MANIFEST_FILE}\`.

## Files

### ${s3aName}
S3A snapshot written by the S3A engine (WebAssembly build) through its own API. Tile 12 holds one record per staged
paper: \`paper_id\` = 64-bit FNV-1a (\`hash_iri\`) of the paper's \`s3a_paper_key\` (see works.jsonl), a hash of the
DOI, year, citation count and flags (SOURCE_OPENALEX = 8, SOURCE_CROSSREF = 16, RESEARCHER_APPROVED = 32,
HAS_OA_URL_REF = 64). Human action records are present only for sessions where the researcher consented to
recording; the engine refuses them otherwise.

**Limitation:** the engine has no API to store a paper's readable title, authors or abstract, so the .s3a file does
not contain them. They are in works.jsonl and references.bib, joined by \`s3a_paper_key\`. The .s3a may also list
papers that were staged in this session and later removed from the queue; works.jsonl is the queue.

### events.jsonl
Every action recorded in this browser's local workspace log, oldest first, one JSON object per line with sorted keys.
Current record schemaVersion: ${WORKSPACE_LOG_SCHEMA_VERSION}. Older records appear upcast, with \`migratedFrom\`.
Types: \`queue.add\` (paperId, paper facts, origin), \`queue.remove\` (paperId), \`note.created\` / \`note.edited\`
(noteId, paperId or null, full text), \`paper.decision\` (paperId, keep | drop). Each has \`seq\` and \`recordedAt\`.
History of schema versions: docs/data/MIGRATIONS.md in the Scholar Explorer source.

### works.jsonl
One line per paper in the selection queue, in queue order: \`schemaVersion\` (paper facts version
${PAPER_FACTS_SCHEMA_VERSION}), \`work_id\` (doi:…, openalex:W…, arxiv:…, pmid:…, pmcid:…, a source's stable id, or
fp:… fingerprint), \`s3a_paper_key\`, and the facts the sources reported (title, authors, year, abstract, journal,
doi, aliases, links, counts). A field that no source reported is absent; nothing is filled in. No AI output.

### aliases.csv
\`work_id,scheme,value\`: every normalized identifier known for each work (scheme: doi, openalex, arxiv, pmid, pmcid,
source, fingerprint).

### references.bib
BibTeX for the works, keyed by work id. Missing year, author or venue is left out, never guessed.

### notes.md
The researcher's notes (latest text of each note), with creation and last-edit times.
`;
}

/** Builds the bundle. File bytes and the manifest are deterministic for the same input and time. */
export async function buildExportBundle(input: ExportBundleInput): Promise<ExportBundle> {
  const exportedAt = (input.now ?? new Date()).toISOString();
  const s3aName = input.s3a.filename.endsWith('.s3a') ? input.s3a.filename : `${input.s3a.filename}.s3a`;
  if (!(input.s3a.bytes instanceof Uint8Array) || input.s3a.bytes.length === 0) throw new Error('The S3A engine produced no .s3a bytes.');
  const files: Record<string, Uint8Array> = {
    [s3aName]: input.s3a.bytes,
    'events.jsonl': strToU8(eventsJsonl(input.records)),
    'works.jsonl': strToU8(worksJsonl(input.queue)),
    'aliases.csv': strToU8(aliasesCsv(input.queue)),
    'references.bib': strToU8(exportToBibTeX(input.queue.map(p => withWorkId(p)))),
    'notes.md': strToU8(notesMarkdown(input.records, input.queue)),
    'SCHEMA.md': strToU8(schemaMarkdown(s3aName, exportedAt)),
  };
  const names = Object.keys(files).sort();
  const manifest = await Promise.all(names.map(async name => ({ name, sha256: await sha256Bytes(files[name]) })));
  const manifestText = manifest.map(m => `${m.sha256}  ${m.name}`).join('\n') + '\n';
  const all: Record<string, Uint8Array> = { ...files, [MANIFEST_FILE]: strToU8(manifestText) };
  const mtime = new Date(exportedAt);
  const zippable: Zippable = {};
  for (const name of [...names, MANIFEST_FILE]) {
    zippable[name] = [all[name], { level: name.endsWith('.s3a') ? 0 : 6, mtime }];
  }
  return { zip: zipSync(zippable), files: all, manifest };
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

export interface BundleCheck {
  ok: boolean;
  files: Record<string, Uint8Array>;
  /** Files whose SHA-256 differs from the manifest. */
  mismatched: string[];
  /** Files named in the manifest but absent from the zip. */
  missing: string[];
  /** Files in the zip not covered by the manifest. */
  unlisted: string[];
}

/** Unzips a bundle and checks every file against manifest.sha256. */
export async function verifyExportBundle(zip: Uint8Array): Promise<BundleCheck> {
  const files = unzipSync(zip);
  const manifestBytes = files[MANIFEST_FILE];
  if (!manifestBytes) return { ok: false, files, mismatched: [], missing: [MANIFEST_FILE], unlisted: Object.keys(files) };
  const listed = new Map<string, string>();
  for (const line of strFromU8(manifestBytes).split('\n')) {
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (m) listed.set(m[2], m[1]);
  }
  const mismatched: string[] = []; const missing: string[] = [];
  for (const [name, hash] of listed) {
    if (!files[name]) missing.push(name);
    else if ((await sha256Bytes(files[name])) !== hash) mismatched.push(name);
  }
  const unlisted = Object.keys(files).filter(n => n !== MANIFEST_FILE && !listed.has(n));
  return { ok: mismatched.length === 0 && missing.length === 0 && unlisted.length === 0, files, mismatched, missing, unlisted };
}
