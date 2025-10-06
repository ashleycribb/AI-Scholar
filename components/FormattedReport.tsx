import React from 'react';

interface FormattedReportProps {
  text: string;
}

export const FormattedReport: React.FC<FormattedReportProps> = ({ text }) => {
  const sections = text.split(/(?=##\s)/).filter(section => section.trim() !== '');

  return (
    <div className="prose prose-blue max-w-none">
      {sections.map((section, index) => {
        const lines = section.trim().split('\n');
        const titleLine = lines.shift() || '';
        const title = titleLine.replace(/##\s*/, '').trim();
        const content = lines.join('\n');

        const listItems = content.split('\n').filter(line => line.trim().startsWith('* ') || line.trim().startsWith('- '));

        return (
          <div key={index} className="mb-6">
            <h2 className="text-xl font-bold text-gray-800 border-b pb-2 mb-3">{title}</h2>
            {listItems.length > 0 ? (
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                {listItems.map((item, itemIndex) => (
                  <li key={itemIndex} className="pl-2">
                    {item.replace(/[-*]\s*/, '')}
                  </li>
                ))}
              </ul>
            ) : (
                <p className="text-gray-700">{content}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};
