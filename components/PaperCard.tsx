import React from 'react';
import type { ResearchPaper } from '../types';

interface PaperCardProps {
    paper: ResearchPaper;
    isOrigin: boolean;
    isSelected: boolean;
    onSelectPaper: (paper: ResearchPaper) => void;
}

export const PaperCard: React.FC<PaperCardProps> = ({ 
    paper, isOrigin, isSelected, onSelectPaper
}) => {
    const cardClasses = `p-3 rounded-md cursor-pointer transition-colors duration-200 border-l-4 ${
        isSelected
        ? 'bg-blue-100 border-blue-500'
        : 'bg-white hover:bg-gray-100 border-transparent'
    }`;
    
    return (
        <div onClick={() => onSelectPaper(paper)} className={cardClasses}>
             {isOrigin && (
                <p className="text-xs font-bold uppercase text-purple-600 mb-1">
                    Origin Paper
                </p>
            )}
            <h3 className="text-sm font-bold text-gray-800 truncate">{paper.title}</h3>
            <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-gray-500 truncate flex-grow pr-2">{paper.authors}</p>
                <p className="text-xs text-gray-500 font-medium flex-shrink-0">{paper.year}</p>
            </div>
        </div>
    );
};
