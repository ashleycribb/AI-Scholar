import { z } from 'zod';
import type { ResearchPaper } from '../types';

/**
 * Validation for messages arriving on the extension <-> web app
 * BroadcastChannel. Anything on the channel is untrusted input: validate the
 * shape, bound the sizes and only allow http(s) URLs before it reaches app
 * state or is rendered.
 */

export const MAX_PAPERS_PER_MESSAGE = 5000;
const MAX_ID = 512;
const MAX_TITLE = 1000;
const MAX_AUTHORS = 5000;
const MAX_ABSTRACT = 50_000;
const MAX_URL = 2048;

const httpUrl = z
    .string()
    .max(MAX_URL)
    .refine((value) => {
        try {
            const { protocol } = new URL(value);
            return protocol === 'http:' || protocol === 'https:';
        } catch {
            return false;
        }
    }, 'URL must be http(s)');

export const ResearchPaperSchema = z
    .object({
        id: z.string().min(1).max(MAX_ID),
        title: z.string().max(MAX_TITLE),
        authors: z.string().max(MAX_AUTHORS),
        // Page scrapers can yield NaN/garbage years; normalise to 0 ("unknown") instead of dropping the paper.
        year: z.number().finite().catch(0),
        abstract: z.string().max(MAX_ABSTRACT),
        // Non-http(s) URLs (javascript:, data:, file:, ...) are stripped, not trusted; the paper itself is kept.
        sourceURL: httpUrl.optional().catch(undefined),
        pdfURL: httpUrl.optional().catch(undefined),
    })
    .passthrough()
    // Keep unknown extra fields (the extension may send openalex_id, doi, ...), but copy into a
    // fresh object without prototype-related keys. Depending on the zod version, passthrough can
    // otherwise assign `__proto__` and silently change the parsed paper's prototype.
    .transform((paper) => {
        const clean: Record<string, unknown> = {};
        for (const key of Object.keys(paper)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            clean[key] = (paper as Record<string, unknown>)[key];
        }
        return clean as typeof paper;
    });

export const ExtensionMessageSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('paper_saved_to_workspace'),
        paper: ResearchPaperSchema,
    }),
    z.object({
        type: z.literal('paper_removed'),
        paperId: z.string().min(1).max(MAX_ID),
    }),
    z.object({
        type: z.literal('all_papers_response'),
        papers: z.array(ResearchPaperSchema).max(MAX_PAPERS_PER_MESSAGE),
    }),
]);

export type ExtensionMessage =
    | { type: 'paper_saved_to_workspace'; paper: ResearchPaper }
    | { type: 'paper_removed'; paperId: string }
    | { type: 'all_papers_response'; papers: ResearchPaper[] };

/**
 * Returns the validated message, or null if it is malformed, oversized, of an
 * unknown type, or sent from a different origin. Never throws.
 */
export const parseExtensionMessage = (
    data: unknown,
    origin?: string,
    expectedOrigin?: string
): ExtensionMessage | null => {
    // BroadcastChannel is same-origin by spec, so this is defence in depth.
    // An empty origin is what some engines report for channel messages.
    if (origin && expectedOrigin && origin !== expectedOrigin) {
        return null;
    }
    const result = ExtensionMessageSchema.safeParse(data);
    if (!result.success) {
        return null;
    }
    return result.data as unknown as ExtensionMessage;
};

// ---------------------------------------------------------------------------
// Other directions on the same channel
// ---------------------------------------------------------------------------

const WebAppMessageSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('web_app_favorite_toggled'),
        paper: ResearchPaperSchema,
        isFavorite: z.boolean(),
    }),
    z.object({ type: z.literal('request_all_papers') }),
]);

export type WebAppMessage =
    | { type: 'web_app_favorite_toggled'; paper: ResearchPaper; isFavorite: boolean }
    | { type: 'request_all_papers' };

/** Validates web app -> extension background messages. Never throws. */
export const parseWebAppMessage = (data: unknown): WebAppMessage | null => {
    const result = WebAppMessageSchema.safeParse(data);
    return result.success ? (result.data as unknown as WebAppMessage) : null;
};

const PopupMessageSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('paper_saved'), paper: ResearchPaperSchema }),
    z.object({ type: z.literal('paper_removed'), paperId: z.string().min(1).max(MAX_ID) }),
]);

export type PopupMessage =
    | { type: 'paper_saved'; paper: ResearchPaper }
    | { type: 'paper_removed'; paperId: string };

/** Validates channel messages consumed by the extension popup. Never throws. */
export const parsePopupMessage = (data: unknown): PopupMessage | null => {
    const result = PopupMessageSchema.safeParse(data);
    return result.success ? (result.data as unknown as PopupMessage) : null;
};
