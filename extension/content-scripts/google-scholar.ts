
import type { ResearchPaper, PaperAnalysis } from '../../types';

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

// --- CO-PILOT UI INJECTION ---
let coPilotPanel: HTMLElement | null = null;
let currentPaper: ResearchPaper | null = null;

const coPilotIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.5 21.75l-.398-1.178a3.375 3.375 0 00-2.456-2.456L12.5 17.25l1.178-.398a3.375 3.375 0 002.456-2.456L16.5 13.5l.398 1.178a3.375 3.375 0 002.456 2.456l1.178.398-1.178.398a3.375 3.375 0 00-2.456 2.456z" /></svg>`;

function createCoPilotPanel() {
    if (document.getElementById('are-copilot-panel')) return;
    
    coPilotPanel = document.createElement('div');
    coPilotPanel.id = 'are-copilot-panel';
    coPilotPanel.className = 'are-copilot-panel';
    coPilotPanel.innerHTML = `
        <div class="are-copilot-header">
            <h2 id="are-copilot-title">AI Co-Pilot</h2>
            <button class="are-copilot-close-btn" title="Close"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div class="are-copilot-content" id="are-copilot-content"><div class="are-loading">Select a paper to analyze.</div></div>
    `;
    document.body.appendChild(coPilotPanel);
    coPilotPanel.querySelector('.are-copilot-close-btn')?.addEventListener('click', () => coPilotPanel?.classList.remove('visible'));
}

function showCoPilotPanelForPaper(paper: ResearchPaper) {
    currentPaper = paper;
    if (!coPilotPanel) createCoPilotPanel();
    coPilotPanel?.classList.add('visible');
    const content = coPilotPanel!.querySelector('#are-copilot-content') as HTMLElement;
    content.innerHTML = `<div class="are-loading">Analyzing with AI...</div>`;
    
    chrome.runtime.sendMessage({ action: 'getAiAnalysisForPaper', paper: currentPaper }, response => {
        if (response?.success) {
            renderCoPilotContent(response.data.summary, response.data.analysis);
        } else {
            content.innerHTML = `<p>Error fetching analysis.</p>`;
        }
    });
}

function renderCoPilotContent(summary: string, analysis: PaperAnalysis) {
    const content = coPilotPanel!.querySelector('#are-copilot-content') as HTMLElement;
    const findingsHTML = analysis.keyFindings.map(item => `<li>${item}</li>`).join('');
    const limitationsHTML = analysis.limitations.map(item => `<li>${item}</li>`).join('');
    content.innerHTML = `
        <div class="are-copilot-section"><h3>Summary</h3><p>${summary}</p></div>
        <div class="are-copilot-section"><h3>Analysis</h3><p><strong>Research Question:</strong> ${analysis.researchQuestion}</p><p><strong>Methodology:</strong> ${analysis.methodology}</p></div>
        <div class="are-copilot-section"><h3>Key Findings</h3><ul>${findingsHTML}</ul></div>
        <div class="are-copilot-section"><h3>Limitations</h3><ul>${limitationsHTML}</ul></div>
        <div class="are-copilot-section" id="are-tools-section">
            <h3>Tools</h3>
            <div id="are-pdf-tool"><button class="are-copilot-tool-button" id="are-find-pdf-btn">Find Open Access PDF</button></div>
            <div id="are-suggestions-tool" style="margin-top: 10px;"><button class="are-copilot-tool-button" id="are-get-suggestions-btn">Generate Search Ideas</button></div>
        </div>
    `;
    document.getElementById('are-find-pdf-btn')?.addEventListener('click', handleFindPdf);
    document.getElementById('are-get-suggestions-btn')?.addEventListener('click', handleGetSuggestions);
}

function handleFindPdf(e: Event) {
    const button = e.target as HTMLButtonElement;
    button.disabled = true;
    button.textContent = 'Searching...';
    chrome.runtime.sendMessage({ action: 'findOpenAccessForPaper', paper: currentPaper }, response => {
        const toolDiv = document.getElementById('are-pdf-tool')!;
        if (response?.success && response.pdfUrl) {
            toolDiv.innerHTML = `<a href="${response.pdfUrl}" target="_blank" rel="noopener noreferrer" class="are-copilot-tool-button">Open PDF</a>`;
        } else {
            toolDiv.innerHTML = `<p style="font-size: 0.875rem; text-align: center;">No open access PDF found.</p>`;
        }
    });
}

function handleGetSuggestions(e: Event) {
     const button = e.target as HTMLButtonElement;
     button.disabled = true;
     button.textContent = 'Generating...';
    chrome.runtime.sendMessage({ action: 'getSuggestionsForPaper', paper: currentPaper }, response => {
        const toolDiv = document.getElementById('are-suggestions-tool')!;
        if (response?.success && response.suggestions.length > 0) {
            const suggestionsHTML = response.suggestions.map((s: string) => `<li><button data-query="${s}">${s}</button></li>`).join('');
            toolDiv.innerHTML = `<ul class="are-copilot-suggestion-list">${suggestionsHTML}</ul>`;
            toolDiv.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const query = btn.dataset.query;
                    window.open(`https://scholar.google.com/scholar?q=${encodeURIComponent(query!)}`, '_blank');
                });
            });
        } else {
            toolDiv.innerHTML = `<p style="font-size: 0.875rem; text-align: center;">Could not generate suggestions.</p>`;
        }
    });
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