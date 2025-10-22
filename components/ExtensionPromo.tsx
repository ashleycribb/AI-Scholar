import React from 'react';

export const ExtensionPromo: React.FC = () => {
    // In a real app, you might check if the extension is installed.
    // For now, we'll just always show the promo.
    return (
        <div className="mt-8 text-center max-w-2xl mx-auto">
            <div className="p-4 bg-muted/50 rounded-lg border">
                <h3 className="text-lg font-semibold text-foreground">Supercharge Your Research</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    Install the AI Research Explorer browser extension to save papers directly from any academic website like Google Scholar or arXiv.
                </p>
                <button 
                    onClick={() => alert("To install the extension, you would typically be directed to the Chrome Web Store. For this demo, all necessary files have been provided in the 'extension' directory.")}
                    className="mt-4 px-5 h-10 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90"
                >
                    Get the Chrome Extension
                </button>
            </div>
        </div>
    );
};
