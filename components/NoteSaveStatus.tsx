import React from 'react';
import { Check, RotateCcw, AlertTriangle } from 'lucide-react';
import {
    appendWorkspaceRecord,
    type NoteRecord,
    type NewWorkspaceLogRecord,
    type WorkspaceLogRecord,
} from '../services/localWorkspaceLog';

/**
 * Note save state. 'saved' is only ever set after the local IndexedDB write
 * has confirmed; any failure is 'error' and is shown as "Not saved" + Retry.
 */
export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error';

export const NOTE_SAVED_LABEL = 'Saved on this computer';
export const NOTE_NOT_SAVED_LABEL = 'Not saved';
export const NOTE_SAVING_LABEL = 'Saving…';

export interface SaveNoteInput {
    noteId: string;
    paperId?: string | null;
    text: string;
    /** Whether a note record already exists for this note id. */
    exists: boolean;
    /** Text of the last confirmed save, if any. */
    lastSavedText: string | null;
    append?: (entry: NewWorkspaceLogRecord) => Promise<WorkspaceLogRecord>;
}

export type SaveNoteResult =
    | { state: 'saved'; record: NoteRecord }
    | { state: 'unchanged' }
    | { state: 'error'; error: unknown };

/** Append a note.created / note.edited record holding the full text; resolves 'saved' only after the write confirms. */
export async function saveNoteLocally(input: SaveNoteInput): Promise<SaveNoteResult> {
    if (input.exists && input.lastSavedText === input.text) return { state: 'unchanged' };
    const append = input.append ?? appendWorkspaceRecord;
    try {
        const record = await append({
            type: input.exists ? 'note.edited' : 'note.created',
            noteId: input.noteId,
            paperId: input.paperId ?? null,
            text: input.text,
        });
        return { state: 'saved', record: record as NoteRecord };
    } catch (error) {
        return { state: 'error', error };
    }
}

export interface NoteSaveStatusProps {
    state: NoteSaveState;
    exists: boolean;
    onSave: () => void;
    onRetry: () => void;
}

/** Save button plus status. Never says "saved" unless the local write confirmed. */
export const NoteSaveStatus: React.FC<NoteSaveStatusProps> = ({ state, exists, onSave, onRetry }) => {
    if (state === 'error') {
        return (
            <span className="inline-flex items-center gap-2" role="alert" data-note-save-state="error">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {NOTE_NOT_SAVED_LABEL}
                </span>
                <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                </button>
            </span>
        );
    }
    const label = state === 'saving'
        ? NOTE_SAVING_LABEL
        : state === 'saved'
            ? NOTE_SAVED_LABEL
            : exists ? 'Save Note' : 'Create Note';
    return (
        <button
            type="button"
            onClick={onSave}
            disabled={state === 'saving'}
            data-note-save-state={state}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs disabled:opacity-60"
            title="Save research note on this computer (append-only local log)"
        >
            <Check className="w-3.5 h-3.5" />
            <span>{label}</span>
        </button>
    );
};
