
// Fix: Replaced triple-slash directive with a global declaration for 'chrome' to resolve type errors.
declare const chrome: any;

import type { ResearchPaper } from '../../types';
import { createCoPilotPanel, showCoPilotPanelForPaper, coPilotIconSvg } from './ui-utils';

// --- UTILITY FUNCTIONS ---
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
    const id = createPaperId(title, sourceURL);

    return { id, title, authors: authors.trim(), year, abstract, sourceURL, pdfURL, citations };
}

// --- MAIN INJECTION LOGIC ---
function injectButtons() {
    createCoPilotPanel(); // Create the shared panel once
    const results = document.querySelectorAll('.gs_r.gs_or.gs_scl');
    results.forEach(result => {
        const resultEl = result as HTMLElement;
        const linksContainer = resultEl.querySelector('.gs_fl');
        if (!linksContainer || resultEl.querySelector('.are-save-button')) return;

        const paper = parseScholarResult(resultEl);
        if (!paper.title) return;
        
        const paperId = createPaperId(paper.title, paper.sourceURL);
        
        // Inject Save Button
        const saveButton = document.createElement('button');
        saveButton.className = 'are-save-button';
        saveButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg><span>Save</span>`;
        chrome.runtime.sendMessage({ action: 'getPaperStatus', paperId }, res => {
            if (res?.exists) {
                saveButton.classList.add('are-saved');
                saveButton.querySelector('span')!.textContent = 'Saved';
                saveButton.disabled = true;
            }
        });
        saveButton.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            saveButton.disabled = true;
            saveButton.querySelector('span')!.textContent = 'Saving...';
            chrome.runtime.sendMessage({ action: 'savePaper', paper }, res => {
                if (res?.success) {
                    saveButton.classList.add('are-saved');
                    saveButton.querySelector('span')!.textContent = 'Saved';
                } else {
                     saveButton.querySelector('span')!.textContent = 'Error';
                     setTimeout(() => { saveButton.disabled = false; saveButton.querySelector('span')!.textContent = 'Save'; }, 2000);
                }
            });
        });
        linksContainer.appendChild(saveButton);

        // Inject Co-Pilot Button
        const coPilotButton = document.createElement('button');
        coPilotButton.className = 'are-copilot-trigger';
        coPilotButton.innerHTML = `${coPilotIconSvg} <span>AI Co-Pilot</span>`;
        coPilotButton.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            showCoPilotPanelForPaper(paper);
        });
        linksContainer.appendChild(coPilotButton);
    });
}

// Google Scholar uses AJAX, so we need to observe changes to the DOM
const observer = new MutationObserver(() => {
    if (document.querySelector('.gs_r.gs_or.gs_scl:not(:has(.are-save-button))')) {
        injectButtons();
    }
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial injection
injectButtons();