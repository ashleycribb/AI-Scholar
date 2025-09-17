import React from 'react';

interface FormattedSummaryProps {
  text: string;
}

export const FormattedSummary: React.FC<FormattedSummaryProps> = ({ text }) => {
  // Check for bullet points (lines starting with * or -)
  if (text.trim().startsWith('- ') || text.trim().startsWith('* ')) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    return (
      <ul className="list-disc list-inside space-y-1 text-gray-700 leading-relaxed">
        {lines.map((line, index) => (
          <li key={index}>{line.replace(/[-*]\s*/, '')}</li>
        ))}
      </ul>
    );
  }

  // Check for Q&A format (lines with Q: and A:)
  const qaRegex = /((Q|Question):[\s\S]*?(A|Answer):[\s\S]*?)(?=(Q|Question):|$)/gi;
  if (qaRegex.test(text)) {
      const qaPairs = text.match(qaRegex) || [];
      return (
          <div className="space-y-3 text-gray-700 leading-relaxed">
              {qaPairs.map((pair, index) => {
                  const questionMatch = pair.match(/(Q|Question):\s*(.*)/i);
                  const answerMatch = pair.match(/(A|Answer):\s*([\s\S]*)/i);
                  const question = questionMatch ? questionMatch[2].trim() : '';
                  const answer = answerMatch ? answerMatch[2].trim() : '';

                  return (
                      <div key={index}>
                          <p className="font-semibold text-gray-800">{question}</p>
                          <p className="pl-4">{answer}</p>
                      </div>
                  );
              })}
          </div>
      );
  }
  
  // Default to paragraph
  return <p className="text-gray-700 leading-relaxed">{text}</p>;
};