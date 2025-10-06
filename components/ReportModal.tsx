import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';
import { FormattedReport } from './FormattedReport';
import { ExportIcon } from './icons/ExportIcon';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  content: string | null;
  error: string | null;
}

declare global {
    interface Window {
        jspdf: any;
    }
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, isLoading, content, error }) => {
  if (!isOpen) {
    return null;
  }

  const handleExport = () => {
    if (!content) return;
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;
    let y = margin;

    // Helper to write text and handle page breaks
    const writeText = (text: string, options: any, isTitle = false, isListItem = false) => {
        const textMargin = isListItem ? margin + 5 : margin;
        const textWidth = doc.internal.pageSize.width - margin - textMargin;
        const lines = doc.splitTextToSize(text, textWidth);

        lines.forEach((line: string, index: number) => {
            if (y > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }
            const lineText = isListItem && index === 0 ? `• ${line}` : line;
            doc.text(lineText, textMargin, y, options);
            y += isTitle ? 8 : 7;
        });
    };
    
    const sections = content.split(/(?=##\s)/).filter(section => section.trim() !== '');

    sections.forEach(section => {
        const lines = section.trim().split('\n');
        const titleLine = lines.shift() || '';
        const title = titleLine.replace(/##\s*/, '').trim();
        
        if (y > pageHeight - margin - 20) {
            doc.addPage();
            y = margin;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        writeText(title, {}, true);
        y += 4;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);

        lines.forEach(line => {
            if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
                const itemText = line.replace(/[-*]\s*/, '').trim();
                writeText(itemText, {}, false, true);
            } else if (line.trim()){
                writeText(line.trim(), {}, false, false);
            } else {
                y += 5; // Add space for empty lines between paragraphs
            }
        });

        y += 10;
    });
    
    doc.save('Research_Gap_Analysis_Report.pdf');
  };

  return (
    <div
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white rounded-t-xl z-10">
          <h2 id="report-modal-title" className="text-xl font-bold text-gray-800">
            Research Gap Analysis Report
          </h2>
          <div className="flex items-center gap-2">
            {content && !isLoading && (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 text-white text-xs font-semibold rounded-full hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                aria-label="Export report as PDF"
              >
                <ExportIcon className="w-4 h-4" />
                <span>Export as PDF</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <main className="p-6 overflow-y-auto">
          {isLoading && <LoadingSpinner />}
          {error && <ErrorMessage message={error} />}
          {content && !isLoading && <FormattedReport text={content} />}
        </main>
      </div>
    </div>
  );
};