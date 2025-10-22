
import React from 'react';
import type { GroundingSource } from '../types';
import { MapPinIcon } from './icons/MapPinIcon';

interface GroundingSourcesProps {
    sources: GroundingSource[];
}

export const GroundingSources: React.FC<GroundingSourcesProps> = ({ sources }) => {
    return (
        <div className="mt-2 pt-2 border-t border-gray-300/80">
            <h4 className="text-xs font-semibold text-gray-600 mb-1">
                Sources from Google Maps
            </h4>
            <ul className="space-y-1">
                {sources.map((source, index) => (
                    <li key={index}>
                        <a 
                            href={source.uri} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:underline"
                        >
                            <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{source.title}</span>
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
};
