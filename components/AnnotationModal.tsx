

import React, { useState } from 'react';
import type { GoldStandardPaper } from '../types';

interface AnnotationModalProps {
    paper: GoldStandardPaper;
    onClose: () => void;
    onSave: (updatedPaper: GoldStandardPaper) => void;
}

export const AnnotationModal: React.FC<AnnotationModalProps> = ({ paper, onClose, onSave }) => {
    const [localPaper, setLocalPaper] = useState<GoldStandardPaper>(JSON.parse(JSON.stringify(paper)));

    const handleSave = () => {
        onSave(localPaper);
        onClose();
    };

    const handleFieldChange = (field: keyof GoldStandardPaper, value: any) => {
        setLocalPaper(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border">
                <header className="p-4 border-b flex justify-between items-center flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Annotate Gold Standard Paper</h2>
                        <p className="text-sm text-muted-foreground truncate" title={localPaper.title}>{localPaper.title}</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-2 text-muted-foreground hover:bg-accent rounded-full"
                        aria-label="Close"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>
                <main className="p-6 overflow-y-auto space-y-6">
                    {/* Display-only fields */}
                    <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                        <div>
                            <h4 className="text-sm font-medium text-muted-foreground">Source</h4>
                            <p className="text-foreground">{localPaper.source || 'N/A'}</p>
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-muted-foreground">Abstract</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">{localPaper.abstract}</p>
                        </div>
                    </div>

                    {/* Editable fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Boolean flags */}
                        <div className="space-y-4 p-4 border rounded-lg">
                            <h3 className="font-semibold text-foreground">Verification Labels</h3>
                            {['crossref_verified', 'peer_reviewed', 'open_access', 'author_verified'].map(key => (
                                <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input
                                        type="checkbox"
                                        checked={!!localPaper[key as keyof GoldStandardPaper]}
                                        onChange={e => handleFieldChange(key as keyof GoldStandardPaper, e.target.checked)}
                                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                                    />
                                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </label>
                            ))}
                        </div>

                        {/* Score and Label */}
                        <div className="space-y-6 p-4 border rounded-lg">
                            <div>
                                <label htmlFor="score" className="font-semibold text-foreground block mb-2">
                                    Factual Accuracy Score: <span className="font-bold text-primary">{localPaper.factual_accuracy_score}</span>
                                </label>
                                <input
                                    type="range"
                                    id="score"
                                    min="0"
                                    max="100"
                                    value={localPaper.factual_accuracy_score}
                                    onChange={e => handleFieldChange('factual_accuracy_score', parseInt(e.target.value, 10))}
                                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div>
                                <label htmlFor="label" className="font-semibold text-foreground block mb-1">Overall Label</label>
                                <select
                                    id="label"
                                    value={localPaper.label}
                                    onChange={e => handleFieldChange('label', e.target.value as GoldStandardPaper['label'])}
                                    className="w-full h-10 px-3 bg-background border border-input rounded-md focus:ring-2 focus:ring-ring"
                                >
                                    <option value="verified">Verified</option>
                                    <option value="inconclusive">Inconclusive</option>
                                    <option value="refuted">Refuted</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                         <label htmlFor="notes" className="font-semibold text-foreground block mb-1">Notes</label>
                         <textarea
                            id="notes"
                            value={localPaper.notes}
                            onChange={e => handleFieldChange('notes', e.target.value)}
                            rows={3}
                            placeholder="Add any relevant notes about this paper's verification..."
                            className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-ring text-sm"
                        />
                    </div>
                </main>
                <footer className="p-4 border-t flex justify-end gap-2 flex-shrink-0 bg-muted/50">
                    <button onClick={onClose} className="h-9 px-4 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent">Cancel</button>
                    <button onClick={handleSave} className="h-9 px-4 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Save Annotations</button>
                </footer>
            </div>
        </div>
    );
};