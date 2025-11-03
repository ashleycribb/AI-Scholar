import React from 'react';

export const ExtensionPromo: React.FC = () => {
    // This URL should be replaced with the actual Chrome Web Store URL once published.
    const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/your-extension-name-here/YOUR_EXTENSION_ID_HERE';

    return (
        <div className="mt-8 text-center max-w-2xl mx-auto">
            <div className="p-4 bg-muted/50 rounded-lg border">
                <h3 className="text-lg font-semibold text-foreground">Supercharge Your Research</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    Install the AI Research Explorer browser extension to save and analyze papers directly from Google Scholar or arXiv.
                </p>
                <button 
                    disabled
                    className="mt-4 inline-block px-5 h-10 leading-10 bg-primary text-primary-foreground font-semibold rounded-md disabled:bg-primary/50 disabled:cursor-not-allowed"
                >
                    Get the Chrome Extension (coming soon)
                </button>
            </div>
        </div>
    );
};