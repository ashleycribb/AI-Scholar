/**
 * The researcher's own records, kept whether or not they joined a study (fix 3).
 * Consent governs research about the participant (study statements and sharing), never whether Explorer keeps
 * the researcher's selections, keep/drop decisions and notes. Those live in the local workspace log.
 */
import { appendWorkspaceRecord, type WorkspaceLogRecord } from './localWorkspaceLog';
import { reportFailed, reportSaved, reportSaving } from './saveStatus';

/** Append a keep/drop decision. Resolves true only after the local write confirmed. */
export async function recordPaperDecision(
  paperId: string,
  decision: 'keep' | 'drop',
  append: typeof appendWorkspaceRecord = appendWorkspaceRecord,
): Promise<boolean> {
  reportSaving('local-decisions');
  try {
    await append({ type: 'paper.decision', paperId, decision, origin: 'researcher' });
    reportSaved('local-decisions');
    return true;
  } catch (err) {
    console.warn('[Local log] Decision not saved:', err);
    reportFailed('local-decisions', 'Your keep/drop decision could not be written to this browser\'s storage.', () => { void recordPaperDecision(paperId, decision, append); });
    return false;
  }
}

export const RESEARCHER_EVENTS_SCHEMA_VERSION = 1 as const;

/** One researcher action, in the plain shape exports use (JSON snapshot today, events.jsonl in the export bundle). */
export interface ResearcherEvent {
  schema: typeof RESEARCHER_EVENTS_SCHEMA_VERSION;
  /** Position in this computer's log (insertion order). */
  seq: number | null;
  /** UTC ISO-8601 with Z. */
  ts: string;
  verb: 'selected' | 'deselected' | 'note-created' | 'note-edited' | 'kept' | 'dropped';
  paper_id: string | null;
  note_id: string | null;
  text: string | null;
  origin: string;
}

/** Plain export view of the local log, in recorded order. Every record type maps; an unknown one throws. */
export function researcherEventsFromLog(records: WorkspaceLogRecord[]): ResearcherEvent[] {
  const ordered = [...records].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return ordered.map(r => {
    const base = { schema: RESEARCHER_EVENTS_SCHEMA_VERSION, seq: r.seq ?? null, ts: r.recordedAt, note_id: null, text: null } as const;
    switch (r.type) {
      case 'queue.add': return { ...base, verb: 'selected', paper_id: r.paperId, origin: r.origin };
      case 'queue.remove': return { ...base, verb: 'deselected', paper_id: r.paperId, origin: r.origin };
      case 'paper.decision': return { ...base, verb: r.decision === 'keep' ? 'kept' : 'dropped', paper_id: r.paperId, origin: r.origin };
      case 'note.created':
      case 'note.edited':
        return { ...base, verb: r.type === 'note.created' ? 'note-created' : 'note-edited', paper_id: r.paperId, note_id: r.noteId, text: r.text, origin: 'researcher' };
      default:
        throw new Error(`No export mapping for workspace log record type ${String((r as { type?: unknown }).type)}`);
    }
  });
}
