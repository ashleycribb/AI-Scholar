import React, { useState } from 'react';

interface FeedbackFormProps {
  onSubmit: (feedback: { category: string; text: string }) => void;
}

export const FeedbackForm: React.FC<FeedbackFormProps> = ({ onSubmit }) => {
  const [category, setCategory] = useState('feature_suggestion');
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onSubmit({ category, text });
      setText('');
      setCategory('feature_suggestion');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    }
  };
  
  if (submitted) {
      return (
          <div className="text-center py-8">
              <h3 className="text-xl font-semibold text-green-700">Thank you!</h3>
              <p className="text-gray-600 mt-2">Your feedback has been sent.</p>
          </div>
      )
  }

  return (
    <div className="w-full max-w-lg mx-auto">
        <p className="text-gray-600 mb-6 text-center">
          We'd love to hear your thoughts! What can we improve? Is there a feature you're missing?
        </p>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="feedback-category" className="block text-sm font-medium text-gray-700 mb-1">
                Feedback Type
              </label>
              <select
                id="feedback-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="feature_suggestion">Feature Suggestion</option>
                <option value="bug_report">Bug Report</option>
                <option value="general_feedback">General Feedback</option>
              </select>
            </div>
            <div>
              <label htmlFor="feedback-text" className="block text-sm font-medium text-gray-700 mb-1">
                Your Message
              </label>
              <textarea
                id="feedback-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Please be as detailed as possible..."
                required
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={!text.trim()}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Send via Email
            </button>
          </div>
        </form>
      </div>
  );
};
