import React from 'react';
import { ExportIcon } from './icons/ExportIcon';

interface ExportButtonProps {
  data: object;
  filename?: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ data, filename = 'research_analysis.json' }) => {
  const handleExportClick = () => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export data:", error);
      alert("An error occurred while trying to export the data.");
    }
  };

  return (
    <button
      onClick={handleExportClick}
      className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-full hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
      aria-label="Export analysis results"
    >
      <ExportIcon className="w-4 h-4" />
      <span>Export Results</span>
    </button>
  );
};
