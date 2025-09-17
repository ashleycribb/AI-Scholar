import React from 'react';
import { ErrorMessage } from './ErrorMessage';

interface ReferenceListProps {
    citations: string[];
    isLoading: boolean;
    error: string | null;
}

export const ReferenceList: React.FC<ReferenceListProps> = ({ citations, isLoading, error }) => {
    if (!isLoading && !error && citations.length === 0) {
        return null;
    }

    return (
        <div className="mt-10 pt-6 border-t border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">References</h3>
            {isLoading && (
                <div className="flex items-center space-x-2 text-gray-600">
                    <svg
                        className="animate-spin h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Generating citations...</span>
                </div>
            )}
            {error && <ErrorMessage message={error} />}
            {!isLoading && citations.length > 0 && (
                <ol className="space-y-3">
                    {citations.map((citation, index) => (
                        <li 
                            key={index} 
                            className="text-gray-700 leading-relaxed pl-5 -indent-5"
                            dangerouslySetInnerHTML={{ __html: citation }}
                        />
                    ))}
                </ol>
            )}
        </div>
    );
};