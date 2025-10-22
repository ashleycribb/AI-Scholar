/// <reference types="chrome" />

import type { ResearchPaper } from '../../types';

function createPaperId(title: string, sourceURL?: string): string {
    if (sourceURL) {
        const arxivIdMatch = sourceURL.match(/arxiv\.org\/(?:abs|pdf)\/([^/]+)/);
        if (arxivIdMatch) return `arxiv:${arxivIdMatch[1].replace(/v\d+$/, '')}`;
        return `url:${sourceURL}`;
    }
    return `title:${title.toLowerCase().replace(/\s+/g, '-')}`;
}

function parseScholarResult(resultEl: HTMLElement): ResearchPaper {
    const titleEl = resultEl.querySelector('.gs_rt a');
    const title = titleEl?.textContent || '';
    
    const authorLine = resultEl.querySelector('.gs_a')?.textContent || '';
    const [authors, journalYear] = authorLine.split(' - ');
    const yearMatch = journalYear?.match(/\b(\d{4})\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

    const abstract = resultEl.querySelector('.gs_rs')?.textContent || '';
    
    const sourceURL = titleEl?.getAttribute('href') || undefined;

    const citationEl = Array.from(resultEl.querySelectorAll('.gs_fl a')).find(a => a.textContent?.includes('Cited by'));
    const citations = citationEl ? parseInt(citationEl.textContent?.replace('Cited by', '').trim() || '0', 10) : 0;

    const pdfLinkEl = resultEl.querySelector('.gs_or_ggsm a');
    const pdfURL = pdfLinkEl?.getAttribute('href') || undefined;

    return { title, authors: authors.trim(), year, abstract, sourceURL, pdfURL, citations };
}

function injectButtons() {
    const results = document.querySelectorAll('.gs_r.gs_or.gs_scl');
    results.forEach(result => {
        const resultEl = result as HTMLElement;
        if (resultEl.querySelector('.are-save-button')) {
            return; // Already injected
        }

        const paper = parseScholarResult(resultEl);
        if (!paper.title) return;
        
        const paperId = createPaperId(paper.title, paper.sourceURL);
        
        const button = document.createElement('button');
        button.className = 'are-save-button';
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
            <span>Save</span>
        `;
        
        chrome.runtime.sendMessage({ action: 'getPaperStatus', paperId }, (response) => {
            if (response?.exists) {
                button.classList.add('are-saved');
                button.querySelector('span')!.textContent = 'Saved';
                button.disabled = true;
            }
        });
        
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            button.disabled = true;
            button.querySelector('span')!.textContent = 'Saving...';
            
            chrome.runtime.sendMessage({ action: 'savePaper', paper }, (response) => {
                if (response?.success) {
                    button.classList.add('are-saved');
                    button.querySelector('span')!.textContent = 'Saved';
                } else {
                     button.querySelector('span')!.textContent = 'Error';
                     setTimeout(() => {
                        button.disabled = false;
                        button.querySelector('span')!.textContent = 'Save';
                    }, 2000);
                }
            });
        });

        const linksContainer = resultEl.querySelector('.gs_fl');
        if (linksContainer) {
            linksContainer.appendChild(button);
        }
    });
}

// Google Scholar uses AJAX, so we need to observe changes to the DOM
const observer = new MutationObserver((mutations) => {
    // A simple check to see if new results might have been loaded
    if (document.querySelector('.gs_r.gs_or.gs_scl:not(:has(.are-save-button))')) {
        injectButtons();
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial injection
injectButtons();