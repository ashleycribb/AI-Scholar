
import React, { useState } from 'react';
import { ThumbsUpIcon } from './icons/ThumbsUpIcon';
import { ThumbsDownIcon } from './icons/ThumbsDownIcon';

interface SummaryFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: { rating: 'good' | 'bad' | null; comments: string }) => void;
}

export const SummaryFeedbackModal: React.FC<SummaryFeedbackModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [rating, setRating] = useState<'good' | 'bad' | null>(null);
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ rating, comments });
    setSubmitted(true);
    setTimeout(() => {
        onClose();
        // Reset state for next time modal opens
        setSubmitted(false);
        setRating(null);
        setComments('');
    }, 2000);
  };

  const handleClose = () => {
    // Reset state if closed without submitting
    setRating(null);
    setComments('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-feedback-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-gray-200 relative">
          <h2 id="summary-feedback-title" className="text-xl font-bold text-gray-800 text-center">Summary Feedback</h2>
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 p-2 text-gray-400 hover:bg-gray-100 rounded-full"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>

        <main className="p-6">
          {submitted ? (
            <div className="text-center py-8">
              <h3 className="text-xl font-semibold text-green-700">Thank you!</h3>
              <p className="text-gray-600 mt-2">Your feedback helps us improve.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 text-center">How was the quality of the AI-generated summary?</label>
                  <div className="flex justify-center gap-4">
                     <button
                        type="button"
                        onClick={() => setRating('good')}
                        className={`p-3 rounded-full border-2 transition-colors ${rating === 'good' ? 'bg-green-100 border-green-500 text-green-600' : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-green-400'}`}
                        aria-pressed={rating === 'good'}
                    >
                        <ThumbsUpIcon className="w-6 h-6" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setRating('bad')}
                        className={`p-3 rounded-full border-2 transition-colors ${rating === 'bad' ? 'bg-red-100 border-red-500 text-red-600' : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-red-400'}`}
                        aria-pressed={rating === 'bad'}
                    >
                        <ThumbsDownIcon className="w-6 h-6" />
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="summary-comments" className="block text-sm font-medium text-gray-700 mb-1">
                    Any additional comments? (optional)
                  </label>
                  <textarea
                    id="summary-comments"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., The summary was too generic, it missed key points..."
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                >
                  Submit Feedback
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
};
