import React from 'react';

interface FormattedSummaryProps {
  text: string;
}

export const FormattedSummary: React.FC<FormattedSummaryProps> = ({ text }) => {
  // Check for bullet points (lines starting with * or -)
  if (text.trim().startsWith('- ') || text.trim().startsWith('* ')) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    return (
      <ul className="space-y-3">
        {lines.map((line, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-900 flex-shrink-0"></span>
            <span className="text-slate-600 leading-relaxed">{line.replace(/[-*]\s*/, '')}</span>
          </li>
        ))}
      </ul>
    );
  }

  // Check for Q&A format (lines with Q: and A:)
  const qaRegex = /((Q|Question):[\s\S]*?(A|Answer):[\s\S]*?)(?=(Q|Question):|$)/gi;
  if (qaRegex.test(text)) {
      const qaPairs = text.match(qaRegex) || [];
      return (
          <div className="space-y-6">
              {qaPairs.map((pair, index) => {
                  const questionMatch = pair.match(/(Q|Question):\s*(.*)/i);
                  const answerMatch = pair.match(/(A|Answer):\s*([\s\S]*)/i);
                  const question = questionMatch ? questionMatch[2].trim() : '';
                  const answer = answerMatch ? answerMatch[2].trim() : '';

                  return (
                      <div key={index} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <p className="font-bold text-slate-900 mb-2 flex items-start gap-2">
                              <span className="text-slate-400 font-mono text-xs mt-1">Q.</span>
                              {question}
                          </p>
                          <p className="text-slate-600 leading-relaxed pl-6 relative">
                              <span className="absolute left-0 top-0 text-slate-400 font-mono text-xs mt-1">A.</span>
                              {answer}
                          </p>
                      </div>
                  );
              })}
          </div>
      );
  }
  
  // Default to paragraph
  return <p className="text-slate-600 leading-relaxed first-letter:text-3xl first-letter:font-black first-letter:mr-1 first-letter:float-left first-letter:leading-none">{text}</p>;
};
