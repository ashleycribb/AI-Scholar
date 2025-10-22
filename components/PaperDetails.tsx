import React from 'react';
import type { ResearchPaper } from '../types';
import { StarIcon } from './icons/StarIcon';
import { VerificationIcon } from './icons/VerificationIcon';
import { PdfIcon } from './icons/PdfIcon';
import { ScholarIcon } from './icons/ScholarIcon';
import { WarningIcon } from './icons/WarningIcon';
import { LinkValidIcon } from './icons/LinkValidIcon';
import { LinkInvalidIcon } from './icons/LinkInvalidIcon';
import { PaywallIcon } from './icons/PaywallIcon';
import { TagIcon } from './icons/TagIcon';
import { DoiIcon } from './icons/DoiIcon';
import { SearchIcon } from './icons/SearchIcon';

interface PaperDetailsProps {
    paper: ResearchPaper;
    isFavorite: boolean;
    onToggleFavorite: (paper: ResearchPaper) => void;
    onVerifyPaper: (paper: ResearchPaper) => void;
    isVerifying: boolean;
    onConceptClick: (concept: string) => void;
    onFindDoi: (paper: ResearchPaper) => void;
}

interface VerificationStatusDisplayProps {
    paper: ResearchPaper;
    onVerify: (paper: ResearchPaper) => void;
    isVerifying: boolean;
}

const VerificationStatusDisplay: React.FC<VerificationStatusDisplayProps> = ({ paper, onVerify, isVerifying }) => {
    const status = paper.verification;
    if (!status || status.state === 'unverified') {
        return (
            <button onClick={() => onVerify(paper)} disabled={isVerifying} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600">
                <VerificationIcon type="unverified" className="w-4 h-4" />
                <span>Verify Source</span>
            </button>
        );
    }
    if (status.state === 'verifying') {
        return <div className="flex items-center gap-1 text-xs text-gray-500"><svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Verifying...</span></div>;
    }
    if (status.state === 'verified') {
        let linkStatusElement: React.ReactNode = null;
        if (status.linkState === 'valid') linkStatusElement = <div className="flex items-center gap-1 font-medium bg-green-100 text-green-800 px-2 py-0.5 rounded-full"><LinkValidIcon className="w-3.5 h-3.5" /><span>Link OK</span></div>;
        else if (status.linkState === 'invalid') linkStatusElement = <div className="flex items-center gap-1 font-medium bg-red-100 text-red-800 px-2 py-0.5 rounded-full" title={status.reason}><LinkInvalidIcon className="w-3.5 h-3.5" /><span>Link Broken</span></div>;
        else if (status.linkState === 'paywalled') linkStatusElement = <div className="flex items-center gap-1 font-medium bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full" title={status.reason}><PaywallIcon className="w-3.5 h-3.5" /><span>Paywall</span></div>;
        
        return (
            <div className="flex items-center gap-1.5 text-xs text-green-700" title={`Verified via ${status.source || 'web search'}`}>
                <VerificationIcon type="verified" className="w-4 h-4" /><span className="font-semibold">Verified</span>{linkStatusElement}
            </div>
        );
    }
    if (status.state === 'not_found') return <div className="flex items-center gap-1 text-xs text-red-600" title={status.reason}><WarningIcon className="w-4 h-4" /><span>Not Found</span></div>;
    if (status.state === 'error') return <div className="flex items-center gap-1 text-xs text-red-600" title={status.reason}><WarningIcon className="w-4 h-4" /><span>Error</span></div>;
    return null;
};

const DoiDisplay: React.FC<{ paper: ResearchPaper; onFindDoi: () => void }> = ({ paper, onFindDoi }) => {
    const { doi, doiState } = paper;

    if (doiState === 'loading') {
        return (
            <div className="flex items-center gap-1 text-xs text-gray-500">
                <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Finding DOI...</span>
            </div>
        );
    }

    if (doiState === 'error') {
        return (
            <div className="flex items-center gap-1 text-xs text-red-600" title="Could not find DOI">
                <WarningIcon className="w-4 h-4" />
                <span>DOI lookup failed</span>
            </div>
        );
    }

    if (doi) {
        return (
            <a href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800">
                <DoiIcon className="w-4 h-4" />
                <span>{doi}</span>
            </a>
        );
    }
    
    if (doiState === 'loaded' && !doi) {
        return <span className="text-xs text-gray-500 italic">DOI not found</span>;
    }

    return (
        <button onClick={onFindDoi} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800">
            <SearchIcon className="w-4 h-4" />
            <span>Find DOI</span>
        </button>
    );
};


export const PaperDetails: React.FC<PaperDetailsProps> = ({ 
    paper, isFavorite, onToggleFavorite, onVerifyPaper, isVerifying, onConceptClick, onFindDoi
}) => {
    const googleScholarSearchUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=0,34&q=${encodeURIComponent(`"${paper.title}"`)}`;
    
    const renderKeyConcepts = () => {
        if (!paper.keyConceptsState || paper.keyConceptsState === 'idle' || paper.keyConceptsState === 'loading') {
            if (paper.abstract.length < 150) return null;
            return (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>Extracting concepts...</span>
                </div>
            );
        }
    
        if (paper.keyConceptsState === 'error') {
            return <p className="text-sm text-red-500">Could not extract concepts.</p>;
        }
    
        if (paper.keyConceptsState === 'loaded' && paper.keyConcepts && paper.keyConcepts.length > 0) {
            return (
                <div className="flex flex-wrap gap-2">
                    {paper.keyConcepts.map((concept) => (
                        <button 
                            key={concept} 
                            onClick={() => onConceptClick(concept)}
                            className="px-2.5 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded-full hover:bg-blue-200 hover:text-blue-800 transition-colors"
                        >
                            {concept}
                        </button>
                    ))}
                </div>
            );
        }
        
        return <p className="text-sm text-gray-500 italic">No distinct concepts identified.</p>;
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex-grow">
                <div className="flex justify-between items-start">
                    <h3 className="text-lg font-bold text-gray-800 flex-grow pr-2">{paper.title}</h3>
                    <button onClick={() => onToggleFavorite(paper)} aria-label="Toggle favorite" className="p-2 rounded-full hover:bg-yellow-100 flex-shrink-0">
                        <StarIcon className={`w-6 h-6 transition-colors ${isFavorite ? 'text-yellow-500' : 'text-gray-400'}`} />
                    </button>
                </div>
                <div className="flex items-center justify-between mt-1">
                    <p className="text-sm text-gray-600">{paper.authors} ({paper.year})</p>
                    {paper.citations !== undefined && (
                        <p className="text-sm font-semibold text-blue-600">
                            {paper.citations.toLocaleString()} Citations
                        </p>
                    )}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex items-center gap-4">
                        <a href={googleScholarSearchUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800">
                            <ScholarIcon className="w-4 h-4" /> Google Scholar
                        </a>
                        {paper.pdfURL && <a href={paper.pdfURL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"><PdfIcon className="w-4 h-4" /> PDF</a>}
                        <DoiDisplay paper={paper} onFindDoi={() => onFindDoi(paper)} />
                    </div>
                    <div className="flex items-center gap-3">
                         <VerificationStatusDisplay paper={paper} onVerify={onVerifyPaper} isVerifying={isVerifying} />
                    </div>
                </div>

                <div className="mt-4">
                    <h4 className="font-semibold text-gray-700">Abstract</h4>
                    <p className="mt-1 text-sm text-gray-700 leading-relaxed">{paper.abstract}</p>
                </div>

                <div className="mt-4">
                    <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <TagIcon className="w-4 h-4 text-gray-500" />
                        Key Concepts
                    </h4>
                    {renderKeyConcepts()}
                </div>
            </div>
        </div>
    );
};
