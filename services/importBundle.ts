/**
 * Import an export bundle into an empty profile (data fix 7). The bundle's checksums must verify, its events must be
 * valid records, and the works it lists must be exactly the queue those events rebuild; otherwise nothing is
 * written. The .s3a file is not read back: the local log (events.jsonl) is the source of truth.
 */
import { strFromU8 } from 'fflate';
import { verifyExportBundle } from './exportBundle';
import { importWorkspaceRecords, rebuildWorkspace, WorkspaceImportError, type RebuiltWorkspace, type WorkspaceLogRecord } from './localWorkspaceLog';
import { withWorkId } from '../utils/workIds';

function parseJsonl(name: string, text: string): Array<Record<string, unknown>> {
  return text.split('\n').filter(l => l.trim() !== '').map((line, i) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new WorkspaceImportError(`${name} line ${i + 1} is not valid JSON.`);
    }
  });
}

export async function importExportBundle(
  zip: Uint8Array,
  deps: { importRecords?: typeof importWorkspaceRecords } = {},
): Promise<RebuiltWorkspace & { imported: WorkspaceLogRecord[] }> {
  const check = await verifyExportBundle(zip);
  if (!check.ok) {
    const parts = [
      check.mismatched.length ? `changed: ${check.mismatched.join(', ')}` : '',
      check.missing.length ? `missing: ${check.missing.join(', ')}` : '',
      check.unlisted.length ? `not in manifest: ${check.unlisted.join(', ')}` : '',
    ].filter(Boolean);
    throw new WorkspaceImportError(`The bundle failed its SHA-256 check (${parts.join('; ')}). Nothing was imported.`);
  }
  const events = check.files['events.jsonl'];
  const works = check.files['works.jsonl'];
  if (!events || !works) throw new WorkspaceImportError('The bundle has no events.jsonl or works.jsonl. Nothing was imported.');
  const records = parseJsonl('events.jsonl', strFromU8(events));
  const listed = parseJsonl('works.jsonl', strFromU8(works)).map(w => String(w.work_id));
  const rebuilt = rebuildWorkspace(records as unknown as WorkspaceLogRecord[]);
  const rebuiltIds = rebuilt.queue.map(p => withWorkId(p).id);
  if (rebuiltIds.join('\n') !== listed.join('\n')) {
    throw new WorkspaceImportError('works.jsonl does not match the queue that events.jsonl rebuilds. Nothing was imported.');
  }
  const imported = await (deps.importRecords ?? importWorkspaceRecords)(records);
  return { ...rebuildWorkspace(imported), imported };
}
