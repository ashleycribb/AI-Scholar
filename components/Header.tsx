import React from 'react';
import { AboutIcon } from './icons/AboutIcon';
import { HelpButton } from './HelpButton';
import { AboutButton } from './AboutButton';
import { DashboardToggleButton } from './ResearcherLoginButton';
import type { AppMode } from '../types';

interface HeaderProps {
    onOpenAbout: () => void;
    onOpenHelp: () => void;
    appMode: AppMode;
    onModeChange: (mode: AppMode) => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenAbout, onOpenHelp, appMode, onModeChange }) => {
    return (
        <header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
            <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-3">
                    <AboutIcon className="w-8 h-8 text-primary" />
                    <h1 className="text-xl font-bold text-foreground">AI Research Explorer</h1>
                </div>
                <nav className="flex items-center gap-2">
                    <AboutButton onClick={onOpenAbout} />
                    <HelpButton onClick={onOpenHelp} />
                    <DashboardToggleButton appMode={appMode} onModeChange={onModeChange} />
                </nav>
            </div>
        </header>
    );
};
