
import React, { useState, useEffect } from 'react';
import type { Organization } from '../types';
import { searchOrganizations } from '../services/rorService';
import { BuildingIcon } from './icons/BuildingIcon';
import { SearchIcon } from './icons/SearchIcon';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';
import { AddIcon } from './icons/AddIcon';

interface OrganizationFinderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectOrganization: (org: Organization) => void;
}

export const OrganizationFinderModal: React.FC<OrganizationFinderModalProps> = ({ isOpen, onClose, onSelectOrganization }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Organization[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Debounce search
    useEffect(() => {
        const handler = setTimeout(() => {
            if (query.length > 2) {
                handleSearch();
            } else {
                setResults([]);
            }
        }, 500);

        return () => clearTimeout(handler);
    }, [query]);

    const handleSearch = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const orgs = await searchOrganizations(query);
            setResults(orgs);
        } catch (err) {
            setError('Failed to search organizations. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all border"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="p-5 border-b border-border sticky top-0 bg-card rounded-t-xl z-10 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-100 text-indigo-600 p-2 rounded-full">
                            <BuildingIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">Find Institution</h2>
                            <p className="text-sm text-muted-foreground">Search the Research Organization Registry (ROR).</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted-foreground hover:bg-accent rounded-full"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>

                <main className="p-6 overflow-y-auto">
                    <div className="relative mb-6">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Enter institution name (e.g. 'Harvard', 'Max Planck')..."
                            className="w-full pl-10 pr-4 h-11 bg-background border border-input rounded-md focus:ring-2 focus:ring-ring transition-all"
                            autoFocus
                        />
                        <SearchIcon className="w-5 h-5 text-muted-foreground absolute left-3 top-3" />
                    </div>

                    {isLoading && <LoadingSpinner message="Searching ROR..." />}
                    {error && <ErrorMessage message={error} />}

                    {!isLoading && results.length > 0 && (
                        <div className="space-y-3">
                            {results.map((org) => (
                                <div key={org.id} className="flex items-center justify-between p-4 bg-muted/50 border border-border rounded-lg hover:border-primary/50 transition-colors group">
                                    <div>
                                        <h4 className="font-bold text-foreground">{org.name}</h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs px-2 py-0.5 bg-background border rounded text-muted-foreground">{org.country}</span>
                                            {org.types && org.types.map(t => (
                                                <span key={t} className="text-xs px-2 py-0.5 bg-background border rounded text-muted-foreground lowercase">{t}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onSelectOrganization(org)}
                                        className="flex items-center gap-1.5 h-8 px-3 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90"
                                    >
                                        <AddIcon className="w-3 h-3" /> Select
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {!isLoading && query.length > 2 && results.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            No organizations found for "{query}".
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};
