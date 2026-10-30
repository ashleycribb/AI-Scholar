import React, { useState } from 'react';
import type { ResearchPaper } from '../types';
import { formatInstantCitation } from '../services/citationService';
import { Check, Copy, Quote } from 'lucide-react';

interface BibliographicCopyBarProps {
  paper: ResearchPaper;
  className?: string;
}

type QuickStyle = 'apa' | 'chicago' | 'mla' | 'bibtex';

const STYLES: { id: QuickStyle; label: string; tooltip: string }[] = [
  { id: 'apa', label: 'APA 7', tooltip: 'American Psychological Association 7th Edition' },
  { id: 'chicago', label: 'Chicago', tooltip: 'Chicago Manual of Style (Author-Date)' },
  { id: 'mla', label: 'MLA 9', tooltip: 'Modern Language Association 9th Edition' },
  { id: 'bibtex', label: 'BibTeX', tooltip: 'LaTeX Bibliographic Reference' },
];

export const BibliographicCopyBar: React.FC<BibliographicCopyBarProps> = ({ paper, className = '' }) => {
  const [activeStyle, setActiveStyle] = useState<QuickStyle>('apa');
  const [copied, setCopied] = useState(false);

  const formattedText = formatInstantCitation(paper, activeStyle);

  const handleCopy = () => {
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(formattedText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  };

  return (
    <div className={`bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 space-y-2.5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Quote className="w-3.5 h-3.5 text-indigo-600" />
          <span>Bibliographic Citation</span>
        </div>

        {/* Style Selector Tabs */}
        <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs">
          {STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() => {
                setActiveStyle(style.id);
                setCopied(false);
              }}
              title={style.tooltip}
              className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${
                activeStyle === style.id
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Formatted Text Box with 1-Click Copy */}
      <div className="relative group bg-white border border-slate-200/80 rounded-lg p-2.5 transition-all hover:border-slate-300">
        <p className={`text-xs text-slate-800 leading-relaxed pr-9 select-all ${activeStyle === 'bibtex' ? 'font-mono text-[11px] whitespace-pre-wrap' : 'font-serif'}`}>
          {formattedText}
        </p>

        <button
          type="button"
          onClick={handleCopy}
          className={`absolute top-2 right-2 p-1.5 rounded-md border transition-all ${
            copied
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900'
          }`}
          title={copied ? 'Copied to clipboard' : 'Copy formatted citation'}
          aria-label="Copy citation"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {copied && (
        <p className="text-[10px] text-emerald-700 font-medium animate-fade-in flex items-center gap-1">
          <Check className="w-3 h-3" />
          <span>Copied {activeStyle.toUpperCase()} citation to clipboard for bibliography insertion.</span>
        </p>
      )}
    </div>
  );
};
