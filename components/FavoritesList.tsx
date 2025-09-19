import React, { useState } from 'react';
import type { ResearchPaper } from '../types';
import { StarIcon } from './icons/StarIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

interface FavoritesListProps {
  favoritePapers: ResearchPaper[];
  onToggleFavorite: (paper: ResearchPaper) => void;
}

export const FavoritesList: React.FC<FavoritesListProps> = ({ favoritePapers, onToggleFavorite }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    if (favoritePapers.length === 0) {
        return null;
    }
    
    return (
        <div className="my-6 bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-sm">
            <button 
                onClick={() => setIsExpanded(!isExpanded)} 
                className="flex justify-between items-center w-full text-left"
                aria-expanded={isExpanded}
            >
                <h3 className="text-lg font-semibold text-blue-800">
                    Literature Review Seed List ({favoritePapers.length})
                </h3>
                <ChevronDownIcon className={`w-5 h-5 text-blue-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            {isExpanded && (
                <div className="mt-3">
                    <p className="text-sm text-gray-600 mb-3">Your next search will be influenced by these papers to find similar results.</p>
                    <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-2">
                        {favoritePapers.map((paper, index) => (
                            <li key={index} className="flex items-center justify-between p-2 rounded-md hover:bg-blue-100 group">
                                <span className="text-sm text-gray-800 flex-grow pr-4" title={paper.title}>{paper.title}</span>
                                <button 
                                    onClick={() => onToggleFavorite(paper)} 
                                    aria-label={`Remove ${paper.title} from favorites`}
                                    className="flex-shrink-0 p-1 rounded-full hover:bg-yellow-100"
                                >
                                    <StarIcon className="w-5 h-5 text-yellow-500" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};