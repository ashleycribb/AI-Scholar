import React, { useSyncExternalStore } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { CHANNEL_LABELS, failedChannels, getSaveStatus, subscribeSaveStatus, type ChannelStatus, type SaveChannel } from '../services/saveStatus';

export const NOT_SAVED_LABEL = 'Not saved';

export interface SaveStatusViewProps {
  failures: Array<{ channel: SaveChannel; status: ChannelStatus }>;
}

/** One "Not saved" row with Retry per failing write. Renders nothing when every write confirmed or none was tried. */
export const SaveStatusView: React.FC<SaveStatusViewProps> = ({ failures }) => {
  if (failures.length === 0) return null;
  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 max-w-sm" data-save-status="error">
      {failures.map(({ channel, status }) => (
        <div key={channel} role="alert" data-save-channel={channel} className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-lg">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-rose-700 shrink-0" />
          <div className="flex-1 text-xs text-rose-900">
            <p className="font-semibold">{NOT_SAVED_LABEL}: {CHANNEL_LABELS[channel]}</p>
            {status.message && <p className="mt-0.5">{status.message}</p>}
          </div>
          {status.retry && (
            <button
              type="button"
              onClick={status.retry}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

/** Live banner bound to services/saveStatus.ts. */
export const SaveStatusBanner: React.FC = () => {
  const s = useSyncExternalStore(subscribeSaveStatus, getSaveStatus, getSaveStatus);
  return <SaveStatusView failures={failedChannels(s)} />;
};
