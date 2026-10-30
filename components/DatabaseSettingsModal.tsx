import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Lock, 
  Server, 
  Send,
  AlertTriangle,
  HardDrive,
  Trash2,
  Compass,
  UserCheck,
  FileText,
  Key,
  HelpCircle,
  Sparkles,
  Download,
  ShieldAlert,
  User,
  Bot
} from 'lucide-react';
import { 
  getLrsCredentials, 
  saveLrsCredentials, 
  getExplorerCredentials,
  saveExplorerCredentials,
  getUserMode,
  saveUserMode,
  getExplorerDeviceId,
  regenerateExplorerDeviceId,
  clearPastExplorerSearches,
  DEFAULT_LRS_ENDPOINT, 
  getRejectedStatements,
  getResearchLoggingConsent,
  setResearchLoggingConsent,
  type LrsCredentials,
  type RejectedStatementItem,
  type UserRoleMode
} from '../services/lrsCredentialsService';
import { 
  downloadS3ADataFile, 
  emitStatement,
  isRecordingActive,
  getConsentState,
  setConsent,
  getStudyId,
  getHumanActivityLog,
  getAiActivityLog,
  S3A_ENGINE_VERSION
} from '../services/s3aWasmService';
import { testLrsConnection, deleteStatementsByActor, LrsError } from '../services/lrsClient';
import { 
  getLrsSyncState, 
  subscribeLrsSync, 
  flushOutbox, 
  type LrsSyncState 
} from '../services/s3aOutboxService';

interface DatabaseSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onStartResearchProject?: () => void;
  onOpenConsentModal?: () => void;
  onOpenJoinStudy?: () => void;
  onConsentChange?: (active: boolean) => void;
}

export const DatabaseSettingsModal: React.FC<DatabaseSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onStartResearchProject,
  onOpenConsentModal,
  onOpenJoinStudy,
  onConsentChange
}) => {
  const [activeTab, setActiveTab] = useState<'mode' | 'researcher_db' | 'explorer_db' | 'privacy'>('mode');
  
  // User Mode
  const [userMode, setUserMode] = useState<UserRoleMode>('explorer');
  const [deviceId, setDeviceId] = useState<string>('');

  // Researcher Credentials
  const [endpoint, setEndpoint] = useState<string>(DEFAULT_LRS_ENDPOINT);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Explorer Credentials (separate username/password)
  const [explorerEndpoint, setExplorerEndpoint] = useState<string>(DEFAULT_LRS_ENDPOINT);
  const [explorerUsername, setExplorerUsername] = useState<string>('');
  const [explorerPassword, setExplorerPassword] = useState<string>('');
  const [showExplorerPassword, setShowExplorerPassword] = useState<boolean>(false);

  // Sync state & outbox
  const [syncState, setSyncState] = useState<LrsSyncState>(getLrsSyncState());
  const [rejectedStatements, setRejectedStatements] = useState<RejectedStatementItem[]>([]);
  const [showRejected, setShowRejected] = useState<boolean>(false);

  // Testing
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    version?: string;
    error?: string;
    target?: string;
  } | null>(null);

  // Deletion
  const [deletingData, setDeletingData] = useState<boolean>(false);
  const [deletionStatus, setDeletionStatus] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [researchConsent, setResearchConsent] = useState<boolean>(false);
  const [downloadingData, setDownloadingData] = useState<boolean>(false);

  // Live Research Tracing State from WASM Engine
  const [recordingActive, setRecordingActive] = useState<boolean>(false);
  const [consentState, setConsentState] = useState<'none' | 'granted' | 'withdrawn'>('none');
  const [studyId, setStudyId] = useState<string>('');
  const [showLogModal, setShowLogModal] = useState<'human' | 'ai' | null>(null);
  const [humanLogs, setHumanLogs] = useState<any[]>([]);
  const [aiLogs, setAiLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState<boolean>(false);
  const [isWithdrawingConsent, setIsWithdrawingConsent] = useState<boolean>(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  // Load state from IndexedDB & WASM Engine on open
  useEffect(() => {
    if (isOpen) {
      getUserMode().then(setUserMode);
      getExplorerDeviceId().then(setDeviceId);
      getResearchLoggingConsent().then(setResearchConsent);

      isRecordingActive().then(setRecordingActive).catch(() => {});
      getConsentState().then(setConsentState).catch(() => {});
      getStudyId().then(setStudyId).catch(() => {});

      getLrsCredentials().then(creds => {
        setEndpoint(creds.endpoint || DEFAULT_LRS_ENDPOINT);
        setUsername(creds.username || '');
        setPassword(creds.password || '');
      });

      getExplorerCredentials().then(expCreds => {
        setExplorerEndpoint(expCreds.endpoint || DEFAULT_LRS_ENDPOINT);
        setExplorerUsername(expCreds.username || '');
        setExplorerPassword(expCreds.password || '');
      });

      getRejectedStatements().then(setRejectedStatements);
      setTestResult(null);
      setSaveStatus(null);
      setDeletionStatus(null);
      setShowDeleteConfirm(false);
      setShowWithdrawConfirm(false);
      setIsWithdrawingConsent(false);
      setConsentError(null);
      setShowLogModal(null);
    }
  }, [isOpen]);

  // Subscribe to sync state changes
  useEffect(() => {
    const unsub = subscribeLrsSync(setSyncState);
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleTestConnection = async (target: 'researcher' | 'explorer') => {
    setTesting(true);
    setTestResult(null);
    try {
      const ep = target === 'researcher' ? endpoint : explorerEndpoint;
      const u = target === 'researcher' ? username : explorerUsername;
      const p = target === 'researcher' ? password : explorerPassword;
      const res = await testLrsConnection(ep, u, p);
      setTestResult({
        success: true,
        version: res.version || '1.0.3',
        target
      });
    } catch (err: any) {
      let msg = err?.message || 'Connection refused';
      if (err instanceof LrsError) {
        if (err.status === 401) msg = 'Auth error: Invalid username or password (401 Unauthorized)';
        else if (err.status === 403) msg = 'Policy error: Access forbidden (403)';
        else msg = err.serverMessage || `HTTP ${err.status}`;
      }
      setTestResult({
        success: false,
        error: msg,
        target
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      // Save researcher credentials
      const researcherCreds: LrsCredentials = {
        endpoint: endpoint.trim() || DEFAULT_LRS_ENDPOINT,
        username: username.trim(),
        password
      };
      await saveLrsCredentials(researcherCreds);

      // Save explorer credentials
      const expCreds: LrsCredentials = {
        endpoint: explorerEndpoint.trim() || DEFAULT_LRS_ENDPOINT,
        username: explorerUsername.trim(),
        password: explorerPassword
      };
      await saveExplorerCredentials(expCreds);

      // Save mode
      await saveUserMode(userMode);

      setSaveStatus('Settings securely saved to IndexedDB!');

      // Trigger flush
      flushOutbox().catch(() => {});
      if (onSaved) onSaved();

      setTimeout(() => {
        setSaveStatus(null);
        onClose();
      }, 900);
    } catch (err: any) {
      setSaveStatus(`Failed to save: ${err.message}`);
    }
  };

  const handleFlushNow = async () => {
    await flushOutbox();
    const rej = await getRejectedStatements();
    setRejectedStatements(rej);
  };

  const handleDeleteMyData = async () => {
    setDeletingData(true);
    setDeletionStatus(null);
    setShowDeleteConfirm(false);
    try {
      const expCreds = await getExplorerCredentials();
      const currentId = deviceId || await getExplorerDeviceId();

      // Call server delete-by-actor endpoint
      const result = await deleteStatementsByActor(currentId, expCreds);

      // Clear local past search history
      await clearPastExplorerSearches();

      // Make a fresh device id in IndexedDB
      const freshId = await regenerateExplorerDeviceId();
      setDeviceId(freshId);

      setDeletionStatus(`Deleted ${result.deletedCount ?? 0} statement(s) from the server. Generated new anonymous device ID.`);
    } catch (err: any) {
      setDeletionStatus(`Data deletion error: ${err.message || 'Server unreachable'}`);
    } finally {
      setDeletingData(false);
    }
  };

  const handleToggleConsent = async () => {
    const nextVal = !researchConsent;
    setResearchConsent(nextVal);
    await setResearchLoggingConsent(nextVal);
  };

  const handleConfirmWithdrawConsent = async () => {
    setIsWithdrawingConsent(true);
    setConsentError(null);
    try {
      const sId = studyId && studyId.trim() ? studyId.trim() : 'study-participant';
      await setConsent(false, 1, sId);

      // Re-read recording_active() and consent_state() to update the badges
      const active = await isRecordingActive();
      const state = await getConsentState();
      setRecordingActive(active);
      setConsentState(state);
      setResearchConsent(active);

      if (onConsentChange) {
        onConsentChange(active);
      }

      setShowWithdrawConfirm(false);
    } catch (err: any) {
      setConsentError(err?.message || 'Failed to withdraw consent in engine.');
    } finally {
      setIsWithdrawingConsent(false);
    }
  };

  const handleOpenHumanLog = async () => {
    setIsLoadingLogs(true);
    setShowLogModal('human');
    try {
      // Only record the viewed-log event when recording_active() is true
      const active = await isRecordingActive();
      if (active) {
        emitStatement('viewed-log', {
          id: 'https://ashecribb.dev/xapi/activities/participant-activity-log',
          name: 'Viewed Participant Research Activity Log'
        }).catch(() => {});
      }
      const logs = await getHumanActivityLog();
      setHumanLogs(logs);
    } catch (e) {
      console.warn('Failed to load human activity log:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleOpenAiLog = async () => {
    setIsLoadingLogs(true);
    setShowLogModal('ai');
    try {
      // Only record the viewed-log event when recording_active() is true
      const active = await isRecordingActive();
      if (active) {
        emitStatement('viewed-log', {
          id: 'https://ashecribb.dev/xapi/activities/ai-activity-log',
          name: 'Viewed AI Assistant Activity Log'
        }).catch(() => {});
      }
      const logs = await getAiActivityLog();
      setAiLogs(logs);
    } catch (e) {
      console.warn('Failed to load AI activity log:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleDownloadData = async () => {
    setDownloadingData(true);
    try {
      await downloadS3ADataFile();
    } finally {
      setDownloadingData(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-emerald-400 shadow-xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Database &amp; Mode Settings</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Engine {S3A_ENGINE_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                S3A Sovereign LRS Server &amp; User Experience Modes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('mode')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'mode'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>User Mode ({userMode === 'explorer' ? 'Explorer' : 'Researcher'})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('researcher_db')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'researcher_db'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Researcher LRS</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('explorer_db')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'explorer_db'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Explorer LRS</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'privacy'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Privacy &amp; Data</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
          {/* Status Indicator Bar */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                {syncState.status === 'connected' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </>
                ) : syncState.status === 'auth_error' ? (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                ) : (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                )}
              </span>
              <div>
                <span className="font-bold text-slate-900 capitalize">
                  {syncState.status === 'connected' 
                    ? 'Connected' 
                    : syncState.status === 'auth_error'
                      ? 'Auth Error'
                      : `Offline (${syncState.queuedCount} queued)`}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  {syncState.status === 'connected'
                    ? `Ready for xAPI 1.0.3 statements${syncState.serverVersion ? ` (xAPI v${syncState.serverVersion})` : ''}`
                    : syncState.status === 'auth_error'
                      ? 'Invalid credentials. Statements are safely held in IndexedDB outbox.'
                      : 'Server unreachable. Statements are safely held in IndexedDB outbox.'}
                </span>
              </div>
            </div>

            {syncState.queuedCount > 0 && (
              <button
                type="button"
                onClick={handleFlushNow}
                disabled={syncState.isFlushing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncState.isFlushing ? 'animate-spin' : ''}`} />
                <span>Flush Queue ({syncState.queuedCount})</span>
              </button>
            )}
          </div>

          {/* TAB 1: User Mode Selection */}
          {activeTab === 'mode' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Choose Experience Mode</h4>
                <p className="text-slate-500 text-xs">
                  Scholar Explorer operates in two distinct modes depending on your workflow. Default for new users is Explorer.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Explorer Mode Option */}
                <div 
                  onClick={() => setUserMode('explorer')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    userMode === 'explorer'
                      ? 'border-slate-900 bg-slate-900/5 ring-1 ring-slate-900'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Compass className="w-5 h-5 text-indigo-600" />
                      <span className="font-bold text-slate-900 text-sm">Explorer Mode</span>
                    </div>
                    {userMode === 'explorer' && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Fast search, AI assistance, and metadata export (BibTeX, RIS, CSV). Telemetry is anonymous with device ID and automatic PII scrubbing.
                  </p>
                  <div className="mt-3 text-[10px] text-slate-500 font-mono">
                    Actor: Anonymous Device ID ({deviceId ? deviceId.slice(0, 8) + '...' : 'generating...'})
                  </div>
                </div>

                {/* Researcher Mode Option */}
                <div 
                  onClick={() => setUserMode('researcher')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    userMode === 'researcher'
                      ? 'border-slate-900 bg-slate-900/5 ring-1 ring-slate-900'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-emerald-600" />
                      <span className="font-bold text-slate-900 text-sm">Researcher Mode</span>
                    </div>
                    {userMode === 'researcher' && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Full sovereign research environment with persistent S3A WASM sessions, formal provenance audit ledgers, and committee review.
                  </p>
                  <div className="mt-3 text-[10px] text-slate-500 font-mono">
                    Actor: Researcher ID with registered session UUID
                  </div>
                </div>
              </div>

              {/* Start a Research Project quick-link if in Explorer mode */}
              {userMode === 'explorer' && onStartResearchProject && (
                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-indigo-950 block">Ready for a structured project?</span>
                    <span className="text-[11px] text-indigo-800">
                      Switch to Researcher mode to create a sovereign session ledger. You can optionally import your past searches.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onStartResearchProject();
                    }}
                    className="px-3 py-2 bg-indigo-900 hover:bg-indigo-800 text-white font-semibold rounded-lg shrink-0 transition-colors shadow-2xs"
                  >
                    Start a research project
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Researcher LRS Settings */}
          {activeTab === 'researcher_db' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Researcher Database (S3A LRS)</h4>
                <p className="text-slate-500 text-xs">
                  The S3A LRS server is the authoritative database of record. Human and AI researcher actions are recorded as xAPI 1.0.3 statements.
                </p>
              </div>

              {/* LRS Endpoint */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  LRS Endpoint URL
                </label>
                <input
                  type="url"
                  required
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder={DEFAULT_LRS_ENDPOINT}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                />
                <p className="mt-1 text-[11px] text-slate-500 font-mono">
                  Default: {DEFAULT_LRS_ENDPOINT}
                </p>
              </div>

              {/* Username & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Researcher LRS Username / Key
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Optional username"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Researcher LRS Password / Secret
                    {!password && (
                      <span className="text-amber-600 font-normal text-[11px] ml-1.5">
                        (Unset - configure password)
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={password ? "••••••••" : "Enter researcher LRS password"}
                      className="w-full px-3 py-2 pr-9 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Test Connection Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleTestConnection('researcher')}
                  disabled={testing}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                  <span>{testing ? 'Testing GET /about...' : 'Test Connection'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Explorer LRS Settings */}
          {activeTab === 'explorer_db' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Explorer Mode LRS Configuration</h4>
                <p className="text-slate-500 text-xs">
                  Explorer mode uses its own separate LRS credentials for usage telemetry (searches, AI prompts, source views, and exports).
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Explorer LRS Endpoint URL
                </label>
                <input
                  type="url"
                  required
                  value={explorerEndpoint}
                  onChange={(e) => setExplorerEndpoint(e.target.value)}
                  placeholder={DEFAULT_LRS_ENDPOINT}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                />
                <p className="mt-1 text-[11px] text-slate-500 font-mono">
                  Default: {DEFAULT_LRS_ENDPOINT}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Explorer LRS Username
                  </label>
                  <input
                    type="text"
                    value={explorerUsername}
                    onChange={(e) => setExplorerUsername(e.target.value)}
                    placeholder="explorer"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Explorer LRS Password
                    {!explorerPassword && (
                      <span className="text-amber-600 font-normal text-[11px] ml-1.5">
                        (Unset - configure password)
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type={showExplorerPassword ? 'text' : 'password'}
                      value={explorerPassword}
                      onChange={(e) => setExplorerPassword(e.target.value)}
                      placeholder={explorerPassword ? "••••••••" : "Enter explorer LRS password"}
                      className="w-full px-3 py-2 pr-9 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowExplorerPassword(!showExplorerPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showExplorerPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleTestConnection('explorer')}
                  disabled={testing}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                  <span>{testing ? 'Testing GET /about...' : 'Test Explorer Connection'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: Privacy & "What we record" & "Delete my data" */}
          {activeTab === 'privacy' && (
            <div className="space-y-4">
              {/* Research Tracing Section (Requirement 5: visible only after consent_state() !== 'none') */}
              {consentState !== 'none' ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {recordingActive ? (
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                          <ShieldAlert className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Research Tracing</h4>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Live status read directly from S3A snapshot engine: <code className="text-slate-700 font-mono">recording_active()</code>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        recordingActive
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-200 text-slate-700 border-slate-300'
                      }`}>
                        {recordingActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        consentState === 'granted'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        Consent: {consentState}
                      </span>
                    </div>
                  </div>

                  {/* Live Indicator Text (Requirement 2 & 3) */}
                  <div className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2.5 ${
                    recordingActive
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${recordingActive ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'}`} />
                    <span>
                      {recordingActive
                        ? 'Recording on — your research activity is being traced for this study.'
                        : 'Recording off — your papers and claims still save, but your activity is not being traced.'}
                    </span>
                  </div>

                  {/* Enrolled Study ID */}
                  {studyId && (
                    <div className="flex items-center justify-between text-xs px-3 py-2 bg-white rounded-lg border border-slate-200">
                      <span className="text-slate-500 font-medium">Enrolled Study ID:</span>
                      <span className="font-mono font-bold text-slate-800">{studyId}</span>
                    </div>
                  )}

                  {/* Participant Action Buttons */}
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    {consentState === 'granted' && (
                      <>
                        <button
                          type="button"
                          onClick={handleOpenHumanLog}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
                        >
                          <User className="w-3.5 h-3.5" />
                          <span>View my activity log</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleOpenAiLog}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          <span>View the AI's activity log</span>
                        </button>

                        {!showWithdrawConfirm && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowWithdrawConfirm(true);
                              setConsentError(null);
                            }}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-2xs ml-auto"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Withdraw consent</span>
                          </button>
                        )}
                      </>
                    )}

                    {consentState === 'withdrawn' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenConsentModal) {
                            onOpenConsentModal();
                          }
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Re-enroll / Change Consent</span>
                      </button>
                    )}
                  </div>

                  {/* Withdraw Consent Confirmation */}
                  {showWithdrawConfirm && (
                    <div className="mt-3 p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-amber-950">
                            Confirm Consent Withdrawal
                          </p>
                          <p className="text-xs text-amber-900 leading-relaxed">
                            Your earlier activity is marked as withdrawn, not deleted. Use Delete my data to remove it.
                          </p>
                        </div>
                      </div>

                      {consentError && (
                        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-800 flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{consentError}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleConfirmWithdrawConsent}
                          disabled={isWithdrawingConsent}
                          className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
                        >
                          <ShieldAlert className={`w-3.5 h-3.5 ${isWithdrawingConsent ? 'animate-spin' : ''}`} />
                          <span>{isWithdrawingConsent ? 'Withdrawing...' : 'Confirm Withdrawal'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowWithdrawConfirm(false);
                            setConsentError(null);
                          }}
                          disabled={isWithdrawingConsent}
                          className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* When consent_state() === 'none', hide Research Tracing and show Join a study */
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Research Study Participation</h4>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        If you are participating in an academic study, join using the Study ID provided by your Principal Investigator to review the activity tracing consent agreement.
                      </p>
                    </div>
                  </div>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenJoinStudy) {
                          onOpenJoinStudy();
                        } else if (onOpenConsentModal) {
                          onOpenConsentModal();
                        }
                      }}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Join a study</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Download My Data (.s3a) */}
              <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-indigo-950 font-bold">
                    <Download className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs">Download My Data (.s3a)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadData}
                    disabled={downloadingData}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    <Download className={`w-3.5 h-3.5 ${downloadingData ? 'animate-bounce' : ''}`} />
                    <span>{downloadingData ? 'Exporting...' : 'Download my data (.s3a)'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-indigo-900/80 leading-relaxed">
                  {researchConsent
                    ? 'Exports your complete research session, papers, notes, saved results, and provenance logs from the S3A WASM engine as a portable binary file (.s3a).'
                    : 'Exports your own papers, notes, and saved results only from the S3A WASM engine as a portable binary file (.s3a).'}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">What We Record</h4>
                <p className="text-slate-600 text-xs leading-relaxed">
                  In plain language: Scholar Explorer records search queries, AI assistant prompts, AI responses, viewed OpenAlex papers, and citation export counts to improve literature discovery.
                </p>
              </div>

              <div className="space-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Privacy Protections Enforced</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-600">
                  <li><strong>PII Scrubbing:</strong> Email addresses, phone numbers, and sequences of 6+ digits are automatically replaced with <code className="bg-slate-200 px-1 py-0.2 rounded font-mono">[redacted]</code> before recording.</li>
                  <li><strong>No Personal Identity:</strong> Explorer telemetry uses only a random UUID v4 device ID. Your name, email, and IP address are never attached.</li>
                  <li><strong>No PDFs or Full Text:</strong> Only standard OpenAlex activity IRIs and paper metadata are referenced.</li>
                  <li><strong>Local Storage Isolation:</strong> Credentials and offline outbox buffers exist solely in your browser's IndexedDB.</li>
                </ul>
              </div>

              {/* Current Device ID */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold block">Anonymous Device ID:</span>
                  <span className="font-mono text-xs font-bold text-slate-800">{deviceId || 'Not initialized'}</span>
                </div>
              </div>

              {/* Delete my data button */}
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-rose-900 font-bold">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>Delete My Data</span>
                </div>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  This calls the S3A LRS server's delete-by-actor endpoint to remove all stored telemetry statements for your device ID, then creates a new device ID.
                </p>
                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deletingData}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete My Data</span>
                  </button>
                ) : (
                  <div className="p-3 bg-white border border-rose-300 rounded-lg space-y-2">
                    <p className="text-xs font-semibold text-rose-900">
                      Permanently delete telemetry statements for device <code className="bg-rose-100 px-1 py-0.5 rounded font-mono text-[10px]">{deviceId}</code> from the LRS server?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDeleteMyData}
                        disabled={deletingData}
                        className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-md text-xs transition-colors flex items-center gap-1 shadow-2xs disabled:opacity-50"
                      >
                        <Trash2 className={`w-3.5 h-3.5 ${deletingData ? 'animate-spin' : ''}`} />
                        <span>{deletingData ? 'Deleting from server...' : 'Yes, Delete My Data'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={deletingData}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-md text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {deletionStatus && (
                  <div className="mt-2 text-xs font-semibold text-rose-900 bg-white p-2.5 rounded-lg border border-rose-200">
                    {deletionStatus}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Test Result Display (Common) */}
          {testResult && (
            <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
              testResult.success 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs">
                {testResult.success ? (
                  <div>
                    <span className="font-bold">LRS Server Online ({testResult.target?.toUpperCase()}):</span>
                    <div className="text-[11px] text-emerald-800 font-mono mt-0.5">
                      X-Experience-API-Version: {testResult.version}
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="font-bold">Connection Test Failed ({testResult.target?.toUpperCase()}):</span>
                    <div className="text-[11px] text-rose-800 font-mono mt-0.5">
                      {testResult.error}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rejected Statements (HTTP 400 Profile Violations) */}
          {rejectedStatements.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Rejected Statements ({rejectedStatements.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRejected(!showRejected)}
                  className="text-[11px] text-amber-800 underline font-semibold"
                >
                  {showRejected ? 'Hide details' : 'Review reasons'}
                </button>
              </div>
              <p className="text-[11px] text-amber-800">
                Statements returned HTTP 400 from the LRS server. They were kept for review without retrying.
              </p>
              {showRejected && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto font-mono text-[10px] text-amber-900 bg-white p-2 rounded-lg border border-amber-200">
                  {rejectedStatements.map((item, idx) => (
                    <div key={idx} className="pb-1.5 border-b border-amber-100 last:border-b-0">
                      <span className="font-bold text-slate-800">ID: {item.statementId}</span>
                      <div className="text-rose-700">{item.reason}</div>
                      <div className="text-slate-400">{item.rejectedAt}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <div>
              {saveStatus && (
                <span className="text-xs font-semibold text-emerald-600">
                  {saveStatus}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-slate-600 hover:text-slate-900 font-semibold rounded-lg hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleSave()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-xs transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Log Modal (Read-Only) */}
      {showLogModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  {showLogModal === 'human' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {showLogModal === 'human' ? 'My Research Activity Log' : "AI Assistant Activity Log"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Read-only study provenance records • Viewing recorded as study event
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLogModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 flex-1 text-xs">
              {isLoadingLogs ? (
                <div className="py-12 text-center text-slate-500">Loading activity log...</div>
              ) : showLogModal === 'human' ? (
                humanLogs.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">No human research actions recorded yet in this session.</div>
                ) : (
                  <div className="space-y-2">
                    {humanLogs.map((log, idx) => (
                      <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-900">{log.verbName}</span>
                          <span className="text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-slate-700 text-xs">{log.actionDesc}</p>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-100">
                          <span>Actor: {log.actor}</span>
                          <span>ID: {log.statementId?.substring(0, 8)}...</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                aiLogs.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">No AI agent actions recorded yet in this session.</div>
                ) : (
                  <div className="space-y-2">
                    {aiLogs.map((log, idx) => (
                      <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-indigo-700">Agent: [{log.agentSlug}]</span>
                          <span className="text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-600 text-[11px]">
                          <span>Confidence: {(log.confidence * 100).toFixed(0)}%</span>
                          {log.humanIndex !== null && <span>Linked to Human Step #{log.humanIndex}</span>}
                          {log.blockedByPolicy && <span className="text-rose-600 font-bold">Blocked by Policy</span>}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-100">
                          Statement: {log.statementId?.substring(0, 8)}...
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowLogModal(null)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold"
              >
                Close Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
