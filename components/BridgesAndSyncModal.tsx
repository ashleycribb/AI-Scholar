import React, { useState, useEffect, useCallback } from 'react';
import { X, HardDrive, RefreshCw, CheckCircle2, XCircle, Library, Database, AlertCircle } from 'lucide-react';
import { testLrsConnection, postStatements, LrsError } from '../services/lrsClient';
import { 
  getLrsCredentials, 
  getExplorerCredentials, 
  getUserMode, 
  getExplorerDeviceId, 
  enqueueOutboxStatement, 
  removeStatementsFromOutbox, 
  recordRejectedStatement, 
  generateUuidV4, 
  normalizeLrsEndpoint,
  getOutboxQueueCount
} from '../services/lrsCredentialsService';
import { flushOutbox, hexToDashedUuid } from '../services/s3aOutboxService';
import type { S3ASnapshotPayload } from '../services/s3aBridgeService';
import type { ResearchPaper, UserSettings } from '../types';

interface BridgesAndSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePapers?: ResearchPaper[];
  activeSessionId?: string;
  currentResearchState?: S3ASnapshotPayload;
  settings: UserSettings;
  onSaveSettings: (settings: Partial<UserSettings>) => void;
  onOpenDatabaseSettings?: () => void;
}

export const BridgesAndSyncModal: React.FC<BridgesAndSyncModalProps> = ({
  isOpen,
  onClose,
  activePapers = [],
  activeSessionId,
  currentResearchState,
  settings,
  onSaveSettings,
  onOpenDatabaseSettings,
}) => {
  const [s3aOnline, setS3aOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState<boolean>(false);
  const [lrsVersion, setLrsVersion] = useState<string>('');
  const [activeEndpoint, setActiveEndpoint] = useState<string>('');
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncStatusText, setSyncStatusText] = useState<string | null>(null);
  const [rejectedErrors, setRejectedErrors] = useState<{ title: string; reason: string }[]>([]);
  const [outboxCount, setOutboxCount] = useState<number>(0);

  // Check shared LRS connection state via GET {endpoint}/about in the browser
  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const mode = await getUserMode();
      const creds = mode === 'explorer' ? await getExplorerCredentials() : await getLrsCredentials();
      setActiveEndpoint(creds.endpoint);

      const res = await testLrsConnection(creds.endpoint, creds.username, creds.password);
      const versionStr = res.version || '1.0.3';
      setLrsVersion(versionStr);

      // Online when it returns version 1.0.3 (or includes 1.0.3)
      const isOnline = versionStr.includes('1.0.3') || versionStr === '1.0.3';
      setS3aOnline(isOnline);
    } catch (err: any) {
      setS3aOnline(false);
      setLrsVersion('');
    } finally {
      setChecking(false);
      try {
        const count = await getOutboxQueueCount();
        setOutboxCount(count);
      } catch {
        // IDB access fallback
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSyncStatusText(null);
      setRejectedErrors([]);
      checkHealth();
    }
  }, [isOpen, checkHealth]);

  // Sync active papers now:
  // Build xAPI statements in browser with verb "saved", current actor mode, add to IndexedDB outbox, flush outbox.
  const handleSyncActivePapers = async () => {
    // Collect active papers from props or current research state
    let papersToSync: { id: string; title: string; authors?: string; year?: number | string; abstract?: string; doi?: string; openalex_id?: string; citations?: number; isOpenAccess?: boolean }[] = [];

    if (activePapers && activePapers.length > 0) {
      papersToSync = activePapers;
    } else if (currentResearchState?.papers && currentResearchState.papers.length > 0) {
      papersToSync = currentResearchState.papers.map((p, idx) => ({
        id: `paper-${idx}`,
        title: p.title,
        authors: typeof p.authors === 'string' ? p.authors : (Array.isArray(p.authors) ? p.authors.join(', ') : ''),
        year: p.year,
        abstract: p.abstract,
        doi: p.doi
      }));
    }

    if (papersToSync.length === 0) {
      setSyncStatusText('No active papers in current session to sync.');
      return;
    }

    setSyncing(true);
    setSyncStatusText(null);
    setRejectedErrors([]);

    try {
      const mode = await getUserMode();
      const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://scholar-explorer.local';

      // Build actor based on current mode (Researcher or Explorer device-id)
      let actor: any;
      let creds: any;
      if (mode === 'explorer') {
        const deviceId = await getExplorerDeviceId();
        creds = await getExplorerCredentials();
        actor = {
          objectType: 'Agent',
          name: `explorer-${deviceId.slice(0, 8)}`,
          account: {
            homePage: `${origin}/explorer`,
            name: deviceId
          }
        };
      } else {
        creds = await getLrsCredentials();
        actor = {
          objectType: 'Agent',
          name: creds.username || 'Scholar Researcher',
          account: {
            homePage: origin,
            name: creds.username || 'researcher-local'
          }
        };
      }

      const sessionRegistration = hexToDashedUuid(activeSessionId || generateUuidV4());
      const nowIso = new Date().toISOString();

      // Build xAPI statements with verb "saved"
      const statements: any[] = [];
      const paperItems: { paper: typeof papersToSync[0]; statement: any }[] = [];

      for (const p of papersToSync) {
        const stmtId = generateUuidV4();
        const objId = p.doi
          ? `https://doi.org/${p.doi.replace(/^https?:\/\/doi\.org\//, '')}`
          : (p.openalex_id || `https://openalex.org/W${p.id}`);

        const stmt = {
          id: stmtId,
          actor,
          verb: {
            id: 'https://w3id.org/xapi/dod-isd/verbs/saved',
            display: {
              'en-US': 'saved'
            }
          },
          object: {
            id: objId,
            objectType: 'Activity',
            definition: {
              name: {
                'en-US': p.title || 'Untitled Research Paper'
              },
              ...(p.abstract ? { description: { 'en-US': p.abstract } } : {}),
              type: 'http://activitystrea.ms/schema/1.0/article'
            }
          },
          context: {
            registration: sessionRegistration,
            contextActivities: {
              category: [
                {
                  id: 'https://ashecribb.dev/xapi/profiles/scholar-profile-v1',
                  objectType: 'Activity'
                }
              ]
            },
            extensions: {
              'https://ashecribb.dev/xapi/extensions/year': p.year ?? 0,
              'https://ashecribb.dev/xapi/extensions/citations': p.citations ?? 0,
              'https://ashecribb.dev/xapi/extensions/open-access': !!p.isOpenAccess,
              'https://ashecribb.dev/xapi/extensions/authors': p.authors || ''
            }
          },
          timestamp: nowIso
        };

        statements.push(stmt);
        paperItems.push({ paper: p, statement: stmt });
      }

      // Add each statement to the existing IndexedDB outbox
      const queuedDbItems: { id: number; statement: any; title: string }[] = [];
      for (const item of paperItems) {
        const dbKey = await enqueueOutboxStatement(item.statement, sessionRegistration);
        queuedDbItems.push({ id: dbKey, statement: item.statement, title: item.paper.title });
      }

      const totalPapers = statements.length;
      let syncedCount = 0;
      let queuedCount = totalPapers;
      const rejectedList: { title: string; reason: string }[] = [];
      const url = `${normalizeLrsEndpoint(creds.endpoint)}statements`;

      // Flush the outbox
      try {
        await postStatements(statements, creds);
        // A paper only counts as saved once the server answers 200 or 204
        syncedCount = totalPapers;
        queuedCount = 0;
        await removeStatementsFromOutbox(queuedDbItems.map(q => q.id));

        console.log(`[LRS Sync] URL: ${url} | Status: 200 | Count: ${syncedCount}`);
      } catch (err: any) {
        const errStatus = err instanceof LrsError ? err.status : (err?.status || 0);
        console.log(`[LRS Sync Attempt] URL: ${url} | Status: ${errStatus} | Count: ${totalPapers} | Error: ${err?.message || err}`);

        // On 400/403/409 for a batch, retry the statements one by one and show any rejected ones with the server's error text
        if (err instanceof LrsError && (err.status === 400 || err.status === 403 || err.status === 409)) {
          for (const item of queuedDbItems) {
            try {
              await postStatements([item.statement], creds);
              syncedCount++;
              queuedCount--;
              await removeStatementsFromOutbox([item.id]);
              console.log(`[LRS Sync Single] URL: ${url} | Status: 200 | Count: 1 | Paper: ${item.title}`);
            } catch (singleErr: any) {
              const singleStatus = singleErr instanceof LrsError ? singleErr.status : 400;
              const errorText = singleErr instanceof LrsError 
                ? (singleErr.serverMessage || `HTTP ${singleErr.status}`)
                : (singleErr?.message || 'Rejected by server');

              console.log(`[LRS Sync Single Rejected] URL: ${url} | Status: ${singleStatus} | Count: 1 | Paper: ${item.title} | Error: ${errorText}`);

              await recordRejectedStatement(item.statement, errorText, item.id);
              await removeStatementsFromOutbox([item.id]);
              queuedCount--;
              rejectedList.push({
                title: item.title,
                reason: errorText
              });
            }
          }
        } else {
          // Network failure or 5xx: keep in offline outbox!
          // Synced remains 0, queued remains totalPapers
        }
      }

      setSyncStatusText(`Synced ${syncedCount} / queued ${queuedCount}`);
      setRejectedErrors(rejectedList);

      const remainingOutbox = await getOutboxQueueCount();
      setOutboxCount(remainingOutbox);

      // Trigger background sync if needed
      flushOutbox().catch(() => {});
    } catch (err: any) {
      setSyncStatusText(`Sync error: ${err?.message || 'Failed to process sync'}`);
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  const isOffline = s3aOnline !== true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Bridges & Sync</h2>
              <p className="text-xs text-slate-500">Connect research database & reference libraries</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* S3A Local Research Lab / LRS Bridge Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-bold text-slate-900">S3A Local Research Lab</span>
              </div>
              
              {/* Shared LRS Status Badge: Online (green) or Offline (red) */}
              <div className="flex items-center gap-1.5">
                {checking ? (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Checking...
                  </span>
                ) : s3aOnline ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Online
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                    <XCircle className="w-3.5 h-3.5" /> Offline
                  </span>
                )}
                
                {/* Refresh icon re-runs checkHealth */}
                <button 
                  onClick={checkHealth} 
                  disabled={checking} 
                  title="Test Connection (GET /xapi/about)"
                  className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Target description as requested */}
            <p className="text-xs text-slate-600 leading-relaxed">
              Saves your session and selected papers to your S3A research database as xAPI statements. Works offline; syncs when connected.
            </p>

            {/* Endpoint summary */}
            <div className="text-[11px] font-mono text-slate-500 bg-white/70 px-2.5 py-1.5 rounded border border-slate-200 flex items-center justify-between">
              <span className="truncate max-w-[280px]" title={activeEndpoint}>
                {activeEndpoint || 'https://34.74.163.88.sslip.io/xapi'}
              </span>
              {lrsVersion && (
                <span className="text-[10px] text-emerald-600 font-semibold shrink-0">v{lrsVersion}</span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSyncActivePapers}
                disabled={isOffline || syncing}
                title={isOffline ? "Set LRS endpoint in Database settings" : "Sync active session papers to S3A research database"}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                <span>{syncing ? 'Syncing...' : 'Sync Active Papers Now'}</span>
              </button>

              <button
                onClick={checkHealth}
                disabled={checking}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Test Connection
              </button>
            </div>

            {/* If Offline: show tooltip notice and optional link to Database settings */}
            {isOffline && (
              <div className="flex items-center justify-between text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Set LRS endpoint in Database settings</span>
                </div>
                {onOpenDatabaseSettings && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenDatabaseSettings();
                    }}
                    className="underline font-semibold hover:text-amber-900"
                  >
                    Configure
                  </button>
                )}
              </div>
            )}

            {/* Sync result text (Synced N / queued M) */}
            {syncStatusText && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                {syncStatusText}
              </div>
            )}

            {/* Rejected statements list with server error text */}
            {rejectedErrors.length > 0 && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                <div className="font-semibold text-rose-900">Rejected by server:</div>
                {rejectedErrors.map((rej, i) => (
                  <div key={i} className="text-[11px] text-rose-700">
                    <span className="font-medium">• {rej.title}:</span> {rej.reason}
                  </div>
                ))}
              </div>
            )}

            {/* Outbox queue badge if items pending */}
            {outboxCount > 0 && (
              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                <span>Offline outbox queue:</span>
                <span className="font-mono font-semibold text-slate-700">{outboxCount} statement(s) pending</span>
              </div>
            )}
          </div>

          {/* Cloud Reference Library (Scholar Bridge) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Library className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-bold text-slate-900">Reference Manager Bridge</span>
              </div>
              {onOpenDatabaseSettings && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenDatabaseSettings();
                  }}
                  className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-semibold"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Database Settings</span>
                </button>
              )}
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Export bibliographic citations and annotations to your personal reference library.
            </p>
            <div className="text-xs text-slate-500">
              User ID: <span className="font-mono text-slate-700">{settings.scholarBridgeUserId || 'Not configured'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
