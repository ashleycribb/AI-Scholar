const h=n=>{const t=n.match(/arxiv\.org\/(?:abs|pdf)\/([^/]+)/);return t?`arxiv:${t[1].replace(/v\d+$/,"")}`:`url:${n}`},f=()=>{var c,d,u,g,m,p,v;const n=(((c=document.querySelector('meta[name="citation_title"]'))==null?void 0:c.getAttribute("content"))||document.title).replace(/\[\d{4}\.\d{5}(v\d)?\]\s/g,"").trim(),t=Array.from(document.querySelectorAll('meta[name="citation_author"]')).map(y=>y.getAttribute("content")).join(", "),o=((u=(d=document.querySelector("blockquote.abstract"))==null?void 0:d.textContent)==null?void 0:u.replace("Abstract:","").trim())||"",e=parseInt(((m=(g=document.querySelector('meta[name="citation_date"]'))==null?void 0:g.getAttribute("content"))==null?void 0:m.split("/")[0])||"0",10),a=((p=document.querySelector('meta[name="citation_pdf_url"]'))==null?void 0:p.getAttribute("content"))||"",i=((v=document.querySelector('meta[name="citation_abstract_html_url"]'))==null?void 0:v.getAttribute("content"))||window.location.href;return{id:h(i),title:n,authors:t,year:e,abstract:o,sourceURL:i,pdfURL:a,citations:0}};let r=null,s=null;const L='<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.5 21.75l-.398-1.178a3.375 3.375 0 00-2.456-2.456L12.5 17.25l1.178-.398a3.375 3.375 0 002.456-2.456L16.5 13.5l.398 1.178a3.375 3.375 0 002.456 2.456l1.178.398-1.178.398a3.375 3.375 0 00-2.456 2.456z" /></svg>';function b(){var n;document.getElementById("are-copilot-panel")||(r=document.createElement("div"),r.id="are-copilot-panel",r.className="are-copilot-panel",r.innerHTML=`
        <div class="are-copilot-header">
            <h2 id="are-copilot-title">AI Co-Pilot</h2>
            <button class="are-copilot-close-btn" title="Close">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        <div class="are-copilot-content" id="are-copilot-content">
            <div class="are-loading">Select a paper to analyze.</div>
        </div>
    `,document.body.appendChild(r),(n=r.querySelector(".are-copilot-close-btn"))==null||n.addEventListener("click",()=>{r==null||r.classList.remove("visible")}))}function S(){r||b(),r==null||r.classList.add("visible");const n=r.querySelector("#are-copilot-content");n.innerHTML='<div class="are-loading">Analyzing with AI...</div>',chrome.runtime.sendMessage({action:"getAiAnalysisForPaper",paper:s},t=>{t!=null&&t.success?w(t.data.summary,t.data.analysis):n.innerHTML="<p>Error fetching analysis.</p>"})}function w(n,t){var i,l;const o=r.querySelector("#are-copilot-content"),e=t.keyFindings.map(c=>`<li>${c}</li>`).join(""),a=t.limitations.map(c=>`<li>${c}</li>`).join("");o.innerHTML=`
        <div class="are-copilot-section">
            <h3>Summary</h3>
            <p>${n}</p>
        </div>
        <div class="are-copilot-section">
            <h3>Analysis</h3>
            <p><strong>Research Question:</strong> ${t.researchQuestion}</p>
            <p><strong>Methodology:</strong> ${t.methodology}</p>
        </div>
        <div class="are-copilot-section">
            <h3>Key Findings</h3>
            <ul>${e}</ul>
        </div>
        <div class="are-copilot-section">
            <h3>Limitations</h3>
            <ul>${a}</ul>
        </div>
        <div class="are-copilot-section" id="are-tools-section">
            <h3>Tools</h3>
            <div id="are-pdf-tool">
                <button class="are-copilot-tool-button" id="are-find-pdf-btn">Find Open Access PDF</button>
            </div>
            <div id="are-suggestions-tool" style="margin-top: 10px;">
                 <button class="are-copilot-tool-button" id="are-get-suggestions-btn">Generate Search Ideas</button>
            </div>
        </div>
    `,(i=document.getElementById("are-find-pdf-btn"))==null||i.addEventListener("click",x),(l=document.getElementById("are-get-suggestions-btn"))==null||l.addEventListener("click",q)}function x(n){const t=n.target;t.disabled=!0,t.textContent="Searching...",chrome.runtime.sendMessage({action:"findOpenAccessForPaper",paper:s},o=>{const e=document.getElementById("are-pdf-tool");o!=null&&o.success&&o.pdfUrl?e.innerHTML=`<a href="${o.pdfUrl}" target="_blank" rel="noopener noreferrer" class="are-copilot-tool-button">Open PDF</a>`:e.innerHTML='<p style="font-size: 0.875rem; text-align: center;">No open access PDF found.</p>'})}function q(n){const t=n.target;t.disabled=!0,t.textContent="Generating...",chrome.runtime.sendMessage({action:"getSuggestionsForPaper",paper:s},o=>{const e=document.getElementById("are-suggestions-tool");if(o!=null&&o.success&&o.suggestions.length>0){const a=o.suggestions.map(i=>`<li><button data-query="${i}">${i}</button></li>`).join("");e.innerHTML=`
                <ul class="are-copilot-suggestion-list">${a}</ul>
            `,e.querySelectorAll("button").forEach(i=>{i.addEventListener("click",()=>{const l=i.dataset.query;window.open(`https://scholar.google.com/scholar?q=${encodeURIComponent(l)}`,"_blank")})})}else e.innerHTML='<p style="font-size: 0.875rem; text-align: center;">Could not generate suggestions.</p>'})}function M(){var a;const n=document.querySelector(".extra-services .full-text");if(!n||document.querySelector(".are-save-button"))return;const t=f(),o=h(window.location.href),e=document.createElement("button");e.className="are-save-button",e.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg><span>Save to Explorer</span>',chrome.runtime.sendMessage({action:"getPaperStatus",paperId:o},i=>{i!=null&&i.exists&&(e.classList.add("are-saved"),e.querySelector("span").textContent="Saved",e.disabled=!0)}),e.addEventListener("click",async()=>{e.disabled=!0,e.querySelector("span").textContent="Saving...",chrome.runtime.sendMessage({action:"savePaper",paper:t},i=>{i!=null&&i.success?(e.classList.add("are-saved"),e.querySelector("span").textContent="Saved"):(e.querySelector("span").textContent="Error!",setTimeout(()=>{e.disabled=!1,e.querySelector("span").textContent="Save to Explorer"},2e3))})}),(a=n.querySelector("ul"))==null||a.insertAdjacentElement("afterend",e)}function k(){var o;const n=document.querySelector(".extra-services .full-text");if(!n||document.querySelector(".are-copilot-trigger"))return;const t=document.createElement("button");t.className="are-copilot-trigger",t.innerHTML=`${L} <span>AI Co-Pilot</span>`,t.addEventListener("click",()=>{s=f(),S()}),(o=n.querySelector("ul"))==null||o.insertAdjacentElement("afterend",t)}M();k();b();
