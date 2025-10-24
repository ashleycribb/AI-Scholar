
import React, { useState } from 'react';
import { InfoIcon } from './icons/InfoIcon';

interface SemanticSearchToggleProps {
  searchMode: 'semantic' | 'keyword';
  onSearchModeChange: (mode: 'semantic' | 'keyword') => void;
}

export const SemanticSearchToggle: React.FC<SemanticSearchToggleProps> = ({ searchMode, onSearchModeChange }) => {
    const [isTooltipVisible, setIsTooltipVisible] = useState(false);

    return (
        <div className="flex items-center justify-center gap-4 py-2">
            <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${searchMode === 'keyword' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Keyword
                </span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={searchMode === 'semantic'}
                    onClick={() => onSearchModeChange(searchMode === 'semantic' ? 'keyword' : 'semantic')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                        searchMode === 'semantic' ? 'bg-primary' : 'bg-input'
                    }`}
                >
                    <span
                        aria-hidden="true"
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            searchMode === 'semantic' ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                </button>
                <span className={`text-sm font-medium ${searchMode === 'semantic' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    Semantic
                </span>
            </div>
            <div className="relative">
                <button
                    type="button"
                    onMouseEnter={() => setIsTooltipVisible(true)}
                    onMouseLeave={() => setIsTooltipVisible(false)}
                    className="text-muted-foreground hover:text-foreground"
                >
                    <InfoIcon className="w-5 h-5" />
                </button>
                {isTooltipVisible && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-foreground text-background text-xs rounded-md shadow-lg z-10">
                        <strong>Semantic Search:</strong> Understands the meaning behind your query, not just keywords, to find more contextually relevant results.
                    </div>
                )}
            </div>
        </div>
    );
};