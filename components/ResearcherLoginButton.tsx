

import React from 'react';
import { UserIcon } from './icons/UserIcon';
import { SearchIcon } from './icons/SearchIcon';
import type { AppMode } from '../types';

interface DashboardToggleButtonProps {
    appMode: AppMode;
    onModeChange: (mode: AppMode) => void;
}

export const DashboardToggleButton: React.FC<DashboardToggleButtonProps> = ({ appMode, onModeChange }) => {
    
    if (appMode !== 'search') {
        return (
             <button 
                onClick={() => onModeChange('search')}
                className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground text-xs font-semibold rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-colors duration-200"
                title="Return to Search"
            >
                <SearchIcon className="w-4 h-4" />
                <span>Return to Search</span>
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <button 
                onClick={() => onModeChange('dashboard')}
                className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground text-xs font-semibold rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-colors duration-200"
                title="Open Researcher Dashboard"
            >
                <UserIcon className="w-4 h-4" />
                <span>Researcher Login</span>
            </button>
            <button 
                onClick={() => onModeChange('evaluation')}
                className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground text-xs font-semibold rounded-full hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-colors duration-200"
                title="Begin User Study"
            >
                <UserIcon className="w-4 h-4" />
                <span>Participant Login</span>
            </button>
        </div>
    );
};