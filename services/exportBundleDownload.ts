/**
 * Builds the open export bundle from this browser's data and (in the app) downloads it.
 * The .s3a inside comes from the S3A engine (exportS3ASnapshotFromPayload); everything else from the local log.
 */
import type { ResearchPaper } from '../types';
import { buildExportBundle, type ExportBundle } from './exportBundle';
import { readWorkspaceLog } from './localWorkspaceLog';
import { convertPapersToS3APayload, exportS3ASnapshotFromPayload } from './s3aBridgeService';

export interface CreateBundleArgs {
  queue: ResearchPaper[];
  query: string;
  querySettings?: Record<string, unknown>;
  services?: string[];
  fileName?: string;
  now?: Date;
}

export async function createExportBundle(
  args: CreateBundleArgs,
  deps: { readLog?: typeof readWorkspaceLog } = {},
): Promise<ExportBundle & { filename: string; warnings: string[] }> {
  const now = args.now ?? new Date();
  const records = await (deps.readLog ?? readWorkspaceLog)();
  const payload = convertPapersToS3APayload(args.queue, args.query, args.querySettings, args.services);
  const s3a = await exportS3ASnapshotFromPayload(payload, args.fileName || args.query, { download: false });
  const bundle = await buildExportBundle({ records, queue: args.queue, s3a, now });
  return { ...bundle, filename: s3a.filename.replace(/\.s3a$/, '') + '-export.zip', warnings: s3a.warnings };
}

export function downloadBytes(bytes: Uint8Array, filename: string, type = 'application/zip'): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
