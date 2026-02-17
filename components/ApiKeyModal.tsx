
import React, { useState } from 'react';
import { setApiKey } from '../utils/apiKey';

interface ApiKeyModalProps {
    onSave: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onSave }) => {
    const [key, setKey] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSave = () => {
        if (!key.trim()) {
            setError('Please enter a valid API Key.');
            return;
        }
        setApiKey(key.trim());
        onSave();
    };

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-2xl w-full max-w-md border border-border">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-foreground mb-4">Enter Gemini API Key</h2>
                    <p className="text-muted-foreground mb-4">
                        To use the AI Research Explorer, you need to provide your own Google Gemini API Key.
                        Your key is stored locally in your browser and is never sent to our servers.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label htmlFor="apiKey" className="block text-sm font-medium text-foreground mb-1">
                                API Key
                            </label>
                            <input
                                type="password"
                                id="apiKey"
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                placeholder="AIzaSy..."
                            />
                        </div>

                        {error && <p className="text-destructive text-sm">{error}</p>}

                        <div className="flex justify-end gap-2 mt-6">
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 text-sm font-medium text-primary hover:underline flex items-center"
                            >
                                Get a Key
                            </a>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium transition-colors"
                            >
                                Save Key
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
