import React from 'react';

interface StudyInviteBannerProps {
  studyId: string;
  /** Called only from a user click. Opens the consent modal with this study id. */
  onJoin: (studyId: string) => void;
  onDismiss: () => void;
}

/**
 * Non-modal banner shown when the page was opened from a study invite link.
 * Nothing is recorded and no modal is open until the user clicks "Join study".
 */
export const StudyInviteBanner: React.FC<StudyInviteBannerProps> = ({ studyId, onJoin, onDismiss }) => (
  <div
    role="region"
    aria-label="Research study invitation"
    data-testid="study-invite-banner"
    className="w-full bg-indigo-50 border-b border-indigo-200 text-indigo-900 text-xs sm:text-sm"
  >
    <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span>
        You were invited to research study <span className="font-mono font-semibold">{studyId}</span>.
        Nothing is recorded unless you join.
      </span>
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => onJoin(studyId)}
          className="px-3 py-1 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
        >
          Join study
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-2 py-1 rounded-md text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
        >
          Not now
        </button>
      </span>
    </div>
  </div>
);
