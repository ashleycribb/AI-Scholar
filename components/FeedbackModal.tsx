import React, { useState } from 'react';
import { CustomDropdown } from './CustomDropdown';

interface FeedbackFormProps {
  onSubmit: (feedback: { category: string; text: string }) => void;
}

const feedbackCategories = [
    { id: 'feature_suggestion', name: 'Feature Suggestion' },
    { id: 'bug_report', name: 'Bug Report' },
    { id: 'general_feedback', name: 'General Feedback' },
];

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
              <h3 className="text-xl font-semibold text-primary">Thank you!</h3>
              <p className="text-muted-foreground mt-2">Your feedback has been sent.</p>
          </div>
      )
  }

  return (
    <div className="w-full max-w-lg mx-auto">
        <p className="text-muted-foreground mb-6 text-center text-sm">
          We'd love to hear your thoughts! What can we improve? Is there a feature you're missing?
        </p>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="feedback-category" className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">
                Feedback Type
              </label>
              <CustomDropdown
                value={category}
                options={feedbackCategories}
                onChange={(val) => setCategory(val)}
                formatLabel={(n) => n}
                className="w-full"
                triggerClassName="w-full h-11 px-4 bg-background border border-input rounded-xl justify-between"
              />
            </div>
            <div>
              <label htmlFor="feedback-text" className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">
                Your Message
              </label>
              <textarea
                id="feedback-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                className="w-full px-4 py-3 bg-background text-foreground border border-input rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                placeholder="Please be as detailed as possible..."
                required
              />
            </div>
          </div>
          <div className="mt-8 flex justify-center">
            <button
              type="submit"
              disabled={!text.trim()}
              className="h-12 px-10 bg-slate-900 text-white text-[12px] font-black uppercase tracking-widest rounded-full hover:bg-slate-800 disabled:opacity-30 transition-all shadow-lg active:scale-95"
            >
              Send Feedback
            </button>
          </div>
        </form>
      </div>
  );
};
