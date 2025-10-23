// Fix: Replaced triple-slash directive with a global declaration for 'chrome' to resolve type errors.
declare const chrome: any;

import type { ResearchPaper } from '../../types';

function createPaperIdFromUrl(url: string): string {
    const arxivIdMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/([^/]+)/);
    if (arxivIdMatch) return `arxiv:${arxivIdMatch[1].replace(/v\d+$/, '')}`;
    return `url:${url}`;
}

function parseArxivPage(): ResearchPaper {
    const title = (document.querySelector('meta[name="citation_title"]')?.getAttribute('content') || document.title).replace(/\[\d{4}\.\d{5}(v\d)?\]\s/g, '').trim();
    const authors = Array.from(document.querySelectorAll('meta[name="citation_author"]'))
        .map(meta => meta.getAttribute('content'))
        .join(', ');
    const abstract = document.querySelector('blockquote.abstract')?.textContent?.replace('Abstract:', '').trim() || '';
    const year = parseInt(document.querySelector('meta[name="citation_date"]')?.getAttribute('content')?.split('/')[0] || '0', 10);
    const pdfURL = document.querySelector('meta[name="citation_pdf_url"]')?.getAttribute('content') || '';
    const sourceURL = document.querySelector('meta[name="citation_abstract_html_url"]')?.getAttribute('content') || window.location.href;

    return {
        title,
        authors,
        year,
        abstract,
        sourceURL,
        pdfURL,
        citations: 0, // arXiv doesn't provide this directly
    };
}

function injectButton() {
    const downloadLinkContainer = document.querySelector('.extra-services .full-text');
    if (!downloadLinkContainer || document.querySelector('.are-save-button')) {
        return;
    }
    
    const paper = parseArxivPage();
    const paperId = createPaperIdFromUrl(window.location.href);

    const button = document.createElement('button');
    button.className = 'are-save-button';
    button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
        <span>Save to Explorer</span>
    `;

    chrome.runtime.sendMessage({ action: 'getPaperStatus', paperId }, (response) => {
        if (response?.exists) {
            button.classList.add('are-saved');
            button.querySelector('span')!.textContent = 'Saved';
            button.disabled = true;
        }
    });

    button.addEventListener('click', async () => {
        button.disabled = true;
        button.querySelector('span')!.textContent = 'Saving...';
        
        chrome.runtime.sendMessage({ action: 'savePaper', paper }, (response) => {
            if (response?.success) {
                button.classList.add('are-saved');
                button.querySelector('span')!.textContent = 'Saved';
            } else {
                button.querySelector('span')!.textContent = 'Error!';
                setTimeout(() => {
                    button.disabled = false;
                    button.querySelector('span')!.textContent = 'Save to Explorer';
                }, 2000);
            }
        });
    });

    // Add button next to the PDF link
    downloadLinkContainer.querySelector('ul')?.insertAdjacentElement('afterend', button);
}

// Run the script
injectButton();