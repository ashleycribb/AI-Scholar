
import React from 'react';
import type { AnalysisResult, SummaryLength, SummaryStyle } from '../types';
import { AnalysisInsights } from './AnalysisInsights';
import { SearchSummary } from './SearchSummary';
import { CustomDropdown } from './CustomDropdown';

interface AnalysisDisplayProps {
  summary: string;
  analysis: AnalysisResult | null;
  summaryLength: SummaryLength;
  onLengthChange: (length: SummaryLength) => void;
  summaryStyle: SummaryStyle;
  onStyleChange: (style: SummaryStyle) => void;
  onRegenerateSummary: () => void;
}

export const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({ 
    summary, 
    analysis, 
    summaryLength,
    onLengthChange,
    summaryStyle,
    onStyleChange,
    onRegenerateSummary
}) => {
  return (
    <div className="space-y-8">
      {summary && (
        <div>
            <SearchSummary summary={summary} />
            <div className="flex gap-4 mt-4 text-[10px] uppercase font-black tracking-widest text-slate-400 justify-end items-center">
                <div className="flex items-center gap-2">
                    <span>Length:</span>
                    <CustomDropdown
                        value={summaryLength}
                        options={[
                            { id: 'short', name: 'Short' },
                            { id: 'medium', name: 'Medium' },
                            { id: 'detailed', name: 'Detailed' }
                        ]}
                        onChange={(val) => { onLengthChange(val as SummaryLength); setTimeout(onRegenerateSummary, 0); }}
                        formatLabel={(n) => n}
                        triggerClassName="bg-white border border-slate-200"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span>Style:</span>
                    <CustomDropdown
                        value={summaryStyle}
                        options={[
                            { id: 'paragraph', name: 'Paragraph' },
                            { id: 'bullets', name: 'Bullets' },
                            { id: 'qa', name: 'Q&A' }
                        ]}
                        onChange={(val) => { onStyleChange(val as SummaryStyle); setTimeout(onRegenerateSummary, 0); }}
                        formatLabel={(n) => n}
                        triggerClassName="bg-white border border-slate-200"
                    />
                </div>
            </div>
        </div>
      )}
      
      {analysis && <AnalysisInsights analysis={analysis} />}
    </div>
  );
};
