import React, { useState } from 'react';
import { 
  X, 
  BookOpen, 
  Building2, 
  Check, 
  Copy, 
  Download, 
  ExternalLink, 
  FileText, 
  GraduationCap, 
  HelpCircle, 
  Key, 
  Layers, 
  Library, 
  Mail, 
  Network, 
  Search, 
  ShieldCheck, 
  Sparkles, 
  Users, 
  Zap, 
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Send
} from 'lucide-react';

interface LibraryConnectionGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProspectus?: () => void;
}

type GuideTab = 'benefits' | 'steps' | 'templates' | 'faq';

export const LibraryConnectionGuideModal: React.FC<LibraryConnectionGuideModalProps> = ({
  isOpen,
  onClose,
  onOpenProspectus
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('benefits');
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<'subject_librarian' | 'systems_librarian' | 'library_dean'>('subject_librarian');

  if (!isOpen) return null;

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTemplateId(id);
    setTimeout(() => setCopiedTemplateId(null), 2500);
  };

  const handleDownloadChecklist = () => {
    const checklistContent = `# Doctoral Student Checklist: Inviting Your University Library to Connect with Scholar Explorer MCP

## Overview
As a doctoral researcher, connecting your home university library to the Scholar Explorer Model Context Protocol (MCP) server allows you to search across your institution's subscription databases (JSTOR, ProQuest, EBSCO, ScienceDirect, etc.) directly in Scholar Explorer without manual proxy logins or fragmented tabs.

---

## Phase 1: Preparation & Identification
- [ ] Identify your Department / College Subject Liaison Librarian (e.g., Education, Computer Science, Health Sciences).
- [ ] Identify the Electronic Resources or Systems Librarian at your campus library.
- [ ] Document your institution's discovery platform (e.g., Ex Libris Primo, EBSCO EDS, OCLC WorldCat, OpenAthens, or EZproxy).
- [ ] Note the key paywalled databases most critical to your dissertation literature review (e.g., ProQuest Dissertations & Theses Global, IEEE Xplore, ScienceDirect).

## Phase 2: Generating the Proposal
- [ ] Open Scholar Explorer > Databases & MCP > Campus Library MCP Prospectus.
- [ ] Fill in your institution's details using the Blank Standard Academic Library Template.
- [ ] Download the official markdown proposal and the technical \`mcp-config.json\` specification file.
- [ ] Print or save the fillable Institutional Intake & Technical Specification Sheet (Section 7 of the prospectus).

## Phase 3: Initial Outreach
- [ ] Send an introductory email to your Subject Liaison Librarian proposing a brief 15-minute consultation.
- [ ] Attach or link the official Scholar Explorer Institutional Prospectus.
- [ ] Highlight the doctoral research impact: comprehensive literature reviews, zero credential exposure, and increased utilization of university subscription investments.

## Phase 4: Technical Intake Consultation
- [ ] Meet with the Systems Librarian or Electronic Resources team.
- [ ] Share the MCP connector architecture (standard Read-Only OpenSearch / OpenURL Link Resolver endpoints).
- [ ] Confirm proxy authentication method (campus EZproxy prefix or OpenAthens redirect).
- [ ] Have the library lead complete the 1-page Institutional Intake Sheet.

## Phase 5: Verification & Dissertation Literature Search
- [ ] Test sample search queries inside Scholar Explorer with your institutional connector active.
- [ ] Verify full-text PDF resolution through your campus EZproxy / OpenAthens SSO.
- [ ] Begin compiling discovery snapshots directly into your dissertation workspace.

---
*Scholar Explorer Doctoral Literature Review Framework*
*Boise State University Educational Technology Doctoral Research Initiative*
*Principal Investigator: Ashley E. Cribb (ashley.e.cribb@gmail.com)*
`;

    const blob = new Blob([checklistContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'doctoral-library-mcp-outreach-checklist.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const templates = {
    subject_librarian: {
      title: 'To Your Subject / Department Liaison Librarian',
      target: 'Subject Specialist / Department Liaison Librarian',
      subject: 'Doctoral Research Inquiry: Connecting Library Database Subscriptions via Model Context Protocol (MCP)',
      body: `Dear [Librarian Name],

I hope this email finds you well. I am currently a doctoral student in [Department / Program Name] at [Your University/College Name], conducting dissertation research on [Your Research Topic / Dissertation Focus].

As part of my doctoral literature review workflow, I am utilizing the Scholar Explorer research framework—an open academic literature synthesis tool developed as part of design-based doctoral research in educational technology. 

Scholar Explorer features a standardized Model Context Protocol (MCP) server designed to safely interface with university library discovery systems (such as [Primo / EDS / WorldCat / EZproxy]). Connecting our library would allow doctoral researchers and students like myself to:
1. Search our university-subscribed electronic databases (e.g., [ProQuest Dissertations, JSTOR, ScienceDirect]) directly alongside open scholarly repositories.
2. Resolve full-text articles seamlessly through our campus EZproxy/OpenAthens authentication without manual credential entry.
3. Accelerate rigorous, comprehensive literature synthesis while honoring institutional license agreements and student privacy.

I have prepared an official Institutional Prospectus and Technical Intake Specification outlining the security architecture (read-only queries, zero student credential storage, FERPA compliance).

Could we schedule a brief 15-minute conversation or could you connect me with our Electronic Resources / Systems Librarian to discuss enabling this connection for our doctoral cohort?

I would be delighted to share the technical prospectus and demonstrate how it works.

Thank you very much for your time and continuous support of graduate student scholarship at [Your University/College Name].

Warm regards,

[Your Name]
Doctoral Student / Candidate
[Department / College Name]
[Your University / College Name]
[Your Email Address]
[Your Phone Number or Office Location]`
    },
    systems_librarian: {
      title: 'To Systems Librarian / Electronic Resources Manager',
      target: 'Systems Librarian / Electronic Resources Coordinator',
      subject: 'Technical Intake: Model Context Protocol (MCP) Integration for Electronic Resources at [University Name]',
      body: `Dear [Systems Librarian / Electronic Resources Lead Name],

I am writing to you as a doctoral researcher in [Department / School] at [Your University/College Name]. 

We are currently evaluating scholarly literature synthesis tools for doctoral dissertation research and are seeking to connect our library's electronic resource discovery layer to the Scholar Explorer Model Context Protocol (MCP) server.

Technical Integration Overview:
• Protocol: Model Context Protocol (MCP), an open, standardized RPC architecture for connecting scholarly knowledge tools.
• Discovery Systems Supported: Ex Libris Alma/Primo REST APIs, EBSCO Discovery Service (EDS) API, OCLC WorldCat Discovery API, OpenAthens, or standard EZproxy link resolution.
• Security & Privacy: Zero student credential harvesting. All authentication routes through our campus SSO/EZproxy login URL directly in the user's local browser context. Read-only API queries with rate limiting (30 req/min).
• Student Benefit: Enables doctoral researchers to conduct multi-database searches across licensed subscriptions without bouncing between fragmented vendor portals.

We have a complete Technical Intake Specification and boilerplate \`mcp-config.json\` file ready for review, including data governance and FERPA compliance details.

Would you be open to a brief review of the specification, or having our research team provide a test sandbox connection?

Thank you for your guidance and support of graduate research infrastructure.

Sincerely,

[Your Name]
Doctoral Candidate, [Department Name]
[University / College Name]
[Your Contact Information]`
    },
    library_dean: {
      title: 'To Dean of Libraries / Library Director',
      target: 'Dean of Libraries / Associate University Librarian',
      subject: 'Doctoral Research Partnership: Enhancing Subscription Access via Model Context Protocol (MCP)',
      body: `Dear Dean [Last Name],

I am a doctoral researcher in the [Doctoral Program Name] at [Your University/College Name]. I am writing to propose a high-impact, zero-cost opportunity to enhance graduate and doctoral student access to our university's vast electronic database subscriptions.

Through an educational technology research initiative led by doctoral researcher Ashley E. Cribb (Boise State University) in collaboration with UNCW, the Scholar Explorer platform provides a unified research environment powered by the Model Context Protocol (MCP).

Connecting [Library Name]'s collections via MCP offers substantial institutional advantages:
• Maximizes Subscription ROI: Elevates discovery of high-value electronic subscriptions (ProQuest, Elsevier, JSTOR, Wiley) by embedding them directly into students' active synthesis workspaces.
• Empowers Graduate Research: Greatly reduces literature review friction for doctoral dissertations and faculty grant proposals.
• Rigorous Data Governance: Adheres strictly to institutional vendor contracts, requires no proprietary software installation, and enforces read-only student privacy.

We have prepared an Institutional Prospectus and Fillable Technical Intake Specification for [Library Name]. 

We would be honored to partner with [Library Name] as an institutional pilot. May I share the full prospectus with your office and the systems team?

Thank you for your visionary leadership and dedication to scholarly excellence.

Respectfully yours,

[Your Name]
Doctoral Researcher
[Department / College Name]
[Your University / College Name]`
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-guide-modal-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-start justify-between flex-shrink-0">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center flex-shrink-0 shadow-inner">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="library-guide-modal-title" className="text-lg font-black tracking-tight text-white">
                  Doctoral Student Guide: Connecting Your University Library
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-400/20 text-indigo-300 border border-indigo-400/30">
                  MCP Protocol
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                A step-by-step roadmap for graduate researchers and doctoral students to invite their campus libraries to integrate institutional subscriptions with Scholar Explorer.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 bg-slate-50 flex-shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('benefits')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'benefits'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Benefits for Doctoral Students</span>
          </button>

          <button
            onClick={() => setActiveTab('steps')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'steps'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Step-by-Step Outreach Plan</span>
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'templates'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Outreach Email Templates</span>
          </button>

          <button
            onClick={() => setActiveTab('faq')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'faq'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Security & Library FAQs</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-grow space-y-6 text-slate-700 text-xs">
          {/* TAB 1: BENEFITS */}
          {activeTab === 'benefits' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Highlight Hero Card */}
              <div className="bg-gradient-to-br from-indigo-50 via-white to-indigo-50/40 border border-indigo-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-extrabold text-indigo-950">
                      Transform Your Dissertation Literature Review Workflow
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Doctoral research requires comprehensive search coverage across hundreds of thousands of peer-reviewed works. Connecting your university library via the Model Context Protocol (MCP) bridges your campus's expensive, paywalled electronic subscriptions directly into your synthesis environment.
                    </p>
                  </div>
                </div>
              </div>

              {/* 6 Key Benefits Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2 hover:border-indigo-200 transition-colors">
                  <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-xs">
                    <BookOpen className="w-4 h-4" />
                    <span>Direct Access to Paywalled Subscriptions</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Search <strong>ProQuest Dissertations & Theses, JSTOR, ScienceDirect, Wiley, IEEE Xplore, and EBSCOhost</strong> simultaneously without constantly opening 10 separate library tabs or vendor portals.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2 hover:border-indigo-200 transition-colors">
                  <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-xs">
                    <Zap className="w-4 h-4" />
                    <span>Instant Full-Text & Link Resolving</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Automatically resolves OpenURL, Ex Libris Alma/Primo, or EBSCO EDS full-text links using your university's EZproxy or OpenAthens prefix for one-click access to PDFs.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2 hover:border-indigo-200 transition-colors">
                  <div className="flex items-center gap-2 text-blue-700 font-extrabold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Zero Credential Exposure & Full Privacy</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Your campus username and password are <strong>never stored or transmitted</strong> to any external AI or third party. Authentication routes directly through your official campus login portal in your local browser.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2 hover:border-indigo-200 transition-colors">
                  <div className="flex items-center gap-2 text-purple-700 font-extrabold text-xs">
                    <Layers className="w-4 h-4" />
                    <span>Deep Dissertation Literature Synthesis</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Bundle licensed articles into Scholar Explorer Discovery Snapshots for rigorous thematic analysis, methodology cross-comparison, claims auditing, and automated bibliography formatting.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2 hover:border-indigo-200 transition-colors">
                  <div className="flex items-center gap-2 text-amber-700 font-extrabold text-xs">
                    <Building2 className="w-4 h-4" />
                    <span>Maximizes University Investment ROI</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    University libraries spend millions annually on database licenses. Connecting MCP increases usage of licensed collections by integrating them into modern doctoral AI and research workflows.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2 hover:border-indigo-200 transition-colors">
                  <div className="flex items-center gap-2 text-rose-700 font-extrabold text-xs">
                    <Network className="w-4 h-4" />
                    <span>Standard Open Architecture (No Lock-In)</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    Built on Anthropic & open community Model Context Protocol (MCP) standards. Libraries maintain full control over API rate limits, access scopes, and discovery endpoints.
                  </p>
                </div>
              </div>

              {/* Action Callout */}
              <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="font-extrabold text-white text-xs">Ready to prepare your proposal?</h4>
                  <p className="text-slate-300 text-[11px] mt-0.5">
                    Generate the official Blank Standard Academic Library Template in one click.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenProspectus?.();
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-md"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Open Prospectus Generator</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STEPS */}
          {activeTab === 'steps' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    5-Step Doctoral Outreach Action Plan
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Follow this proven roadmap to initiate a pilot connection with your university library.
                  </p>
                </div>
                <button
                  onClick={handleDownloadChecklist}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Action Checklist</span>
                </button>
              </div>

              <div className="space-y-4">
                {/* Step 1 */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex gap-3.5 items-start">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="space-y-1 flex-grow">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-slate-900 text-xs">
                        Identify Your Campus Library Liaison & Technical Leads
                      </h4>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                        Phase 1
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      Visit your library's directory and find your <strong>Subject Specialist Librarian</strong> (assigned to your academic department or college) as well as the <strong>Electronic Resources Librarian</strong> or <strong>Systems Librarian</strong>.
                    </p>
                    <div className="pt-1.5 text-[11px] text-slate-500 font-medium">
                      💡 <em>Tip: Subject librarians are natural advocates for doctoral students; reaching out to them first is the most effective approach.</em>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex gap-3.5 items-start">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="space-y-1 flex-grow">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-slate-900 text-xs">
                        Generate Your Official Institutional Prospectus
                      </h4>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                        Phase 2
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      Open the <strong>Campus Library MCP Prospectus</strong> tool in Scholar Explorer. Using the Blank Standard Academic Library Template, input your institution's name, library name, and contact details to generate the official Markdown proposal and <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">mcp-config.json</code> configuration.
                    </p>
                    <div className="pt-1.5 flex gap-2">
                      <button
                        onClick={() => {
                          onClose();
                          onOpenProspectus?.();
                        }}
                        className="text-xs font-bold text-indigo-700 hover:underline flex items-center gap-1"
                      >
                        <span>Open Prospectus Tool</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex gap-3.5 items-start">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="space-y-1 flex-grow">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-slate-900 text-xs">
                        Send the Formal Academic Outreach Email
                      </h4>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                        Phase 3
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      Use one of our tested email outreach templates (available in the next tab) to write to your Subject Librarian or Systems Librarian. Emphasize that this is part of your doctoral dissertation research and highlight that the connection requires zero software installation on their servers.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex gap-3.5 items-start">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    4
                  </div>
                  <div className="space-y-1 flex-grow">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-slate-900 text-xs">
                        Complete the Technical Intake Specification
                      </h4>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                        Phase 4
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      Share Section 7 of the prospectus (the <strong>Institutional Intake & Technical Specification Sheet</strong>) with their Systems team. They will provide the campus EZproxy prefix or API discovery credentials (Alma Primo, EBSCO EDS, or OpenAthens).
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white flex gap-3.5 items-start">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    5
                  </div>
                  <div className="space-y-1 flex-grow">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-slate-900 text-xs">
                        Verify Full-Text Access in Scholar Explorer
                      </h4>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono">
                        Phase 5 (Active)
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      Save the active connector in Scholar Explorer. When you search topics, results will include licensed works with direct campus link resolver buttons, allowing you to access full-text PDFs instantly.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EMAIL TEMPLATES */}
          {activeTab === 'templates' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Pre-Drafted Outreach Email Templates
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tailored templates customized for different library leadership roles.
                  </p>
                </div>

                {/* Template Selector Buttons */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setSelectedTemplate('subject_librarian')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedTemplate === 'subject_librarian'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Subject Liaison
                  </button>
                  <button
                    onClick={() => setSelectedTemplate('systems_librarian')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedTemplate === 'systems_librarian'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Systems Lead
                  </button>
                  <button
                    onClick={() => setSelectedTemplate('library_dean')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedTemplate === 'library_dean'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Library Dean
                  </button>
                </div>
              </div>

              {/* Selected Template Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                      {templates[selectedTemplate].target}
                    </span>
                    <h4 className="text-xs font-black text-slate-900 mt-1">
                      Subject: {templates[selectedTemplate].subject}
                    </h4>
                  </div>
                  <button
                    onClick={() => handleCopyText(selectedTemplate, `Subject: ${templates[selectedTemplate].subject}\n\n${templates[selectedTemplate].body}`)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm flex-shrink-0"
                  >
                    {copiedTemplateId === selectedTemplate ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Email Text</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-4 font-mono text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed max-h-[340px] overflow-y-auto">
                  {templates[selectedTemplate].body}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Replace all bracketed fields <code className="text-indigo-700 font-bold font-mono">[Your Name]</code> with your personal details before sending.</span>
                  <a
                    href={`mailto:?subject=${encodeURIComponent(templates[selectedTemplate].subject)}&body=${encodeURIComponent(templates[selectedTemplate].body)}`}
                    className="font-bold text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    <span>Open in Email App</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FAQS */}
          {activeTab === 'faq' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Frequently Asked Questions by University Libraries
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Clear answers to technical, legal, and privacy questions commonly raised by librarians.
                </p>
              </div>

              <div className="space-y-3">
                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-1.5">
                  <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Does Scholar Explorer store student university passwords or proxy credentials?</span>
                  </h4>
                  <p className="text-slate-600 text-[11px] leading-relaxed pl-6">
                    <strong>No.</strong> Scholar Explorer never accesses, processes, or stores student passwords or single-sign-on credentials. When a student accesses a paywalled paper, the link resolver redirects the user's local browser tab directly through their institution's official login page (such as Microsoft Entra / Azure AD or OpenAthens).
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-1.5">
                  <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span>Does connecting via MCP violate electronic resource vendor contracts?</span>
                  </h4>
                  <p className="text-slate-600 text-[11px] leading-relaxed pl-6">
                    <strong>No.</strong> The Model Context Protocol integration uses the library's existing authorized OpenSearch APIs, Link Resolvers (OpenURL), and EZproxy prefixes. Only authorized matriculated students, staff, and faculty of the subscribing institution are granted access, exactly as if they were browsing the library catalog directly.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-1.5">
                  <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-2">
                    <Network className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                    <span>Does the library need to install software on their campus servers?</span>
                  </h4>
                  <p className="text-slate-600 text-[11px] leading-relaxed pl-6">
                    <strong>No server installations are required.</strong> The MCP connector is a lightweight client interface that queries existing Discovery APIs (such as Ex Libris Primo REST APIs, EBSCO EDS API, or WorldCat Discovery) or wraps around the existing campus EZproxy URL pattern.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-1.5">
                  <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>What discovery platforms are supported?</span>
                  </h4>
                  <p className="text-slate-600 text-[11px] leading-relaxed pl-6">
                    Scholar Explorer supports <strong>Ex Libris Alma / Primo</strong>, <strong>EBSCO Discovery Service (EDS)</strong>, <strong>OCLC WorldCat Discovery</strong>, <strong>OpenAthens</strong>, and custom <strong>EZproxy / OpenSearch</strong> link resolvers.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-1.5">
                  <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <span>Who is leading this research project?</span>
                  </h4>
                  <p className="text-slate-600 text-[11px] leading-relaxed pl-6">
                    The project is led by <strong>Ashley E. Cribb</strong>, a doctoral student in Educational Technology at <strong>Boise State University</strong> and staff member at the <strong>University of North Carolina Wilmington (UNCW)</strong>. The study operates under design-based research methodology aimed at improving doctoral literature review comprehension.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          <div className="text-[11px] text-slate-500">
            <span>Scholar Explorer Doctoral Literature Review Framework • MCP Integration Toolkit</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg transition-colors"
            >
              Close Guide
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenProspectus?.();
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Launch Prospectus Generator</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
