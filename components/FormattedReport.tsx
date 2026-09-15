import React from 'react';
import Markdown from 'react-markdown';

interface FormattedReportProps {
  text: string;
}

export const FormattedReport: React.FC<FormattedReportProps> = ({ text }) => {
  return (
    <div className="prose prose-blue max-w-none">
      <Markdown>{text}</Markdown>
    </div>
  );
};
