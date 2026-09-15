import React, { useState, useMemo, useEffect } from 'react';
import type { SearchSourceInfo, DiscoveredSource, SourceProposalResult, LibraryMcpProspectusConfig } from '../types';
import { 
  Database, Search, Plus, Check, ExternalLink, BookOpen, 
  GraduationCap, Activity, Cpu, ShieldCheck, Sparkles, X, Globe, Layers,
  Mail, Send, RefreshCw, FileCode, Printer, Copy, CheckCircle2,
  Building2, Server, Download, AlertCircle, ArrowRight
} from 'lucide-react';
import { 
  fetchSourcesRegistry, 
  testSourceEndpoint, 
  proposeSourceByEmail, 
  approveSource, 
  rejectSource, 
  addCustomDiscoveredSource,
  generateLibraryProspectus 
} from '../services/sourceDiscoveryService';

interface DatabaseFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSource: (source: SearchSourceInfo) => void;
  existingSources: SearchSourceInfo[];
}

interface DatabaseMetadata extends SearchSourceInfo {
  category: 'dissertations' | 'biomedical' | 'cs_tech' | 'social_edu' | 'multidisciplinary' | 'open_data';
  categoryLabel: string;
  recordCount: string;
  officialUrl: string;
  badge: string;
  status: 'active' | 'integrated';
  recommendedFor: string[];
}

export const ALL_SCHOLAR_DATABASES: DatabaseMetadata[] = [
  {
    id: 'dissertations',
    name: 'Global Theses & Dissertations',
    description: 'Direct index of completed Ph.D. dissertations, master theses, and university institutional archives worldwide (OATD, DART-Europe, Crossref dissertations).',
    category: 'dissertations',
    categoryLabel: 'Doctoral Theses & Dissertations',
    recordCount: '6.5M+ Dissertations',
    officialUrl: 'https://oatd.org',
    badge: 'Essential for PhD',
    status: 'active',
    recommendedFor: ['dissertation', 'thesis', 'phd', 'doctoral', 'literature review', 'prior art', 'methodology']
  },
  {
    id: 'crossref',
    name: 'Crossref Metadata Registry',
    description: 'The foundational DOI registration authority indexing 155M+ scholarly journal articles, books, conference proceedings, licenses, and funder acknowledgments.',
    category: 'multidisciplinary',
    categoryLabel: 'Multidisciplinary Flagship',
    recordCount: '155M+ Works',
    officialUrl: 'https://crossref.org',
    badge: 'Global Authority',
    status: 'active',
    recommendedFor: ['doi', 'journal', 'books', 'conference', 'peer review', 'general', 'funder']
  },
  {
    id: 'pubmed',
    name: 'PubMed / NCBI MEDLINE',
    description: 'The gold-standard biomedical database comprising >36M citations for biomedical literature from MEDLINE, life science journals, and clinical trials.',
    category: 'biomedical',
    categoryLabel: 'Biomedical & Life Sciences',
    recordCount: '36M+ Citations',
    officialUrl: 'https://pubmed.ncbi.nlm.nih.gov',
    badge: 'Clinical Gold Standard',
    status: 'active',
    recommendedFor: ['medicine', 'biomedical', 'clinical', 'health', 'biology', 'genetics', 'oncology', 'epidemiology', 'mesh']
  },
  {
    id: 'biorxiv',
    name: 'bioRxiv & medRxiv',
    description: 'Cold Spring Harbor Laboratory preprints delivering cutting-edge, pre-peer-reviewed breakthroughs in biological, health, and medical sciences.',
    category: 'biomedical',
    categoryLabel: 'Biomedical & Life Sciences',
    recordCount: '250K+ Preprints',
    officialUrl: 'https://biorxiv.org',
    badge: 'Pre-Print Server',
    status: 'active',
    recommendedFor: ['biology', 'preprints', 'medicine', 'covid', 'genomics', 'immunology', 'neuroscience']
  },
  {
    id: 'zenodo',
    name: 'Zenodo (CERN Open Science)',
    description: 'Multidisciplinary repository assigning citable DOIs to experimental datasets, replication code, software packages, models, and monographs.',
    category: 'open_data',
    categoryLabel: 'Open Research Data & Code',
    recordCount: '4M+ Datasets & Code',
    officialUrl: 'https://zenodo.org',
    badge: 'CERN / Open Science',
    status: 'active',
    recommendedFor: ['data', 'dataset', 'code', 'software', 'benchmark', 'replication', 'cern', 'experiments']
  },
  {
    id: 'openalex',
    name: 'OpenAlex',
    description: 'Massive open catalog of the global research system (>250M works, 90M authors, 100K institutions) with topic classification and citation networks.',
    category: 'multidisciplinary',
    categoryLabel: 'Multidisciplinary Flagship',
    recordCount: '250M+ Works',
    officialUrl: 'https://openalex.org',
    badge: 'Comprehensive',
    status: 'active',
    recommendedFor: ['all', 'multidisciplinary', 'citations', 'institutions', 'authors', 'topics']
  },
  {
    id: 'semanticscholar',
    name: 'Semantic Scholar (AI Graph)',
    description: 'Allen Institute for AI knowledge graph offering automated paper TLDRs, citation intent classification, and dense vector embeddings.',
    category: 'cs_tech',
    categoryLabel: 'Computer Science & AI',
    recordCount: '210M+ Works',
    officialUrl: 'https://semanticscholar.org',
    badge: 'AI Powered',
    status: 'active',
    recommendedFor: ['artificial intelligence', 'machine learning', 'computer science', 'embeddings', 'tldr', 'citations']
  },
  {
    id: 'arxiv',
    name: 'arXiv',
    description: 'The definitive open-access preprint archive for physics, mathematics, computer science, quantitative biology, quantitative finance, and statistics.',
    category: 'cs_tech',
    categoryLabel: 'Computer Science & AI',
    recordCount: '2.4M+ Preprints',
    officialUrl: 'https://arxiv.org',
    badge: 'STEM Pre-Print',
    status: 'active',
    recommendedFor: ['physics', 'mathematics', 'computer science', 'deep learning', 'nlp', 'statistics', 'quantum']
  },
  {
    id: 'dblp',
    name: 'DBLP Computer Science',
    description: 'Authoritative, human-curated computer science bibliography tracking premier ACM, IEEE, and international conferences and journals.',
    category: 'cs_tech',
    categoryLabel: 'Computer Science & AI',
    recordCount: '7M+ Publications',
    officialUrl: 'https://dblp.org',
    badge: 'Curated CS Venue',
    status: 'active',
    recommendedFor: ['computer science', 'conferences', 'acm', 'ieee', 'software engineering', 'systems', 'algorithms']
  },
  {
    id: 'eric',
    name: 'ERIC (Education Sciences)',
    description: 'US Department of Education Institute of Education Sciences (IES) database for instructional theories, curriculum research, and learning analytics.',
    category: 'social_edu',
    categoryLabel: 'Education & Social Sciences',
    recordCount: '1.5M+ Records',
    officialUrl: 'https://eric.ed.gov',
    badge: 'US Dept of Education',
    status: 'active',
    recommendedFor: ['education', 'pedagogy', 'curriculum', 'learning', 'teaching', 'school', 'higher education', 'educational leadership']
  },
  {
    id: 'doaj',
    name: 'DOAJ (Directory of Open Access Journals)',
    category: 'multidisciplinary',
    categoryLabel: 'Multidisciplinary Flagship',
    recordCount: '20K+ Peer Journals',
    officialUrl: 'https://doaj.org',
    badge: 'Vetted Open Access',
    description: 'Rigorous community-curated index of peer-reviewed open access journals, guaranteeing high-standard publication integrity.',
    status: 'active',
    recommendedFor: ['open access', 'peer review', 'journals', 'humanities', 'global south', 'multidisciplinary']
  },
  {
    id: 'core',
    name: 'CORE (Connecting Repositories)',
    description: 'The world’s largest aggregator of open access research papers, harvesting full texts from thousands of institutional and subject repositories.',
    category: 'multidisciplinary',
    categoryLabel: 'Multidisciplinary Flagship',
    recordCount: '260M+ Full Texts',
    officialUrl: 'https://core.ac.uk',
    badge: 'Repository Aggregator',
    status: 'active',
    recommendedFor: ['full text', 'institutional repository', 'green open access', 'manuscript', 'postprints']
  },
  {
    id: 'datacite',
    name: 'DataCite GraphQL PID Graph',
    description: 'Global DOI registry for experimental datasets, software repositories, computational instruments, and research samples linked to ORCID profiles.',
    category: 'open_data',
    categoryLabel: 'Open Research Data & Code',
    recordCount: '50M+ Research Objects',
    officialUrl: 'https://datacite.org',
    badge: 'PID Graph',
    status: 'active',
    recommendedFor: ['datacite', 'datasets', 'software', 'instruments', 'graphql', 'orcid', 'identifiers']
  },
  {
    id: 'europepmc',
    name: 'Europe PMC / PubMed Central',
    description: 'European bio-informational hub providing full-text life sciences articles, MeSH annotations, clinical trial links, and funder grant references.',
    category: 'biomedical',
    categoryLabel: 'Biomedical & Life Sciences',
    recordCount: '44M+ Articles',
    officialUrl: 'https://europepmc.org',
    badge: 'European Hub',
    status: 'active',
    recommendedFor: ['europe pmc', 'biomedical', 'horizon europe', 'erc', 'who', 'wellcome trust', 'mesh']
  },
  {
    id: 'openaire',
    name: 'OpenAIRE Graph',
    description: 'European Open Science infrastructure mapping multi-funder research grants (Horizon Europe, NIH, NSF, Wellcome Trust) to publications and open data.',
    category: 'social_edu',
    categoryLabel: 'Education & Social Sciences',
    recordCount: '150M+ Linked Graph',
    officialUrl: 'https://graph.openaire.eu',
    badge: 'Grant Lineage',
    status: 'active',
    recommendedFor: ['grants', 'openaire', 'horizon europe', 'nsf', 'nih', 'funding', 'open science']
  }
];

type CategoryFilter = 'all' | 'dissertations' | 'biomedical' | 'cs_tech' | 'social_edu' | 'multidisciplinary' | 'open_data';
type ModalTab = 'curated' | 'discovery' | 'library_mcp';

export const DatabaseFinderModal: React.FC<DatabaseFinderModalProps> = ({
  isOpen,
  onClose,
  onAddSource,
  existingSources
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('curated');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');

  // Discovered Sources State
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);
  const [approvedSources, setApprovedSources] = useState<DiscoveredSource[]>([]);
  const [recipientEmail, setRecipientEmail] = useState('ashley.e.cribb@gmail.com');
  const [isLoadingRegistry, setIsLoadingRegistry] = useState(false);
  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [proposingSourceId, setProposingSourceId] = useState<string | null>(null);
  const [activeProposalModal, setActiveProposalModal] = useState<SourceProposalResult | null>(null);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

  // New Repository Manual Form
  const [showAddRepoForm, setShowAddRepoForm] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoUrl, setNewRepoUrl] = useState('');
  const [newRepoCategory, setNewRepoCategory] = useState<DiscoveredSource['category']>('multidisciplinary');
  const [newRepoDesc, setNewRepoDesc] = useState('');

  // Standard Blank Prospectus Template
  const BLANK_TEMPLATE_CONFIG: LibraryMcpProspectusConfig = {
    institutionName: '[Name of University, College, or School]',
    libraryName: '[Target Library / Learning Commons Name]',
    deanName: '[Dean of Libraries / Systems Librarian / Director]',
    deanEmail: '[library-leadership@institution.edu]',
    discoveryPlatform: 'alma_primo',
    ezproxyPrefix: '[https://login.proxy.institution.edu/login?url=]',
    targetDatabases: ['[ProQuest Dissertations]', '[JSTOR]', '[EBSCOhost]', '[ScienceDirect]', '[PubMed Link Resolver]'],
    mcpTransport: 'sse',
    authType: 'sso_saml',
    investigatorName: 'Ashley E. Cribb',
    investigatorEmail: 'ashley.e.cribb@gmail.com',
    doctoralInstitution: 'Doctoral Student / Candidate in Educational Technology, Boise State University',
    employmentInstitution: 'Staff Member, University of North Carolina Wilmington (UNCW)'
  };

  // University Library MCP State - Standard Blank Template
  const [libraryConfig, setLibraryConfig] = useState<LibraryMcpProspectusConfig>(BLANK_TEMPLATE_CONFIG);
  const [prospectusMarkdown, setProspectusMarkdown] = useState<string>('');
  const [mcpConfigJson, setMcpConfigJson] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'document' | 'raw_markdown'>('document');

  // Load Discovered Sources
  const loadRegistry = async () => {
    setIsLoadingRegistry(true);
    try {
      const data = await fetchSourcesRegistry();
      setDiscoveredSources(data.discovered);
      setApprovedSources(data.approved);
      if (data.recipientEmail) setRecipientEmail(data.recipientEmail);
    } catch (err) {
      console.warn('Could not load sources registry:', err);
    } finally {
      setIsLoadingRegistry(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRegistry();
      handleGenerateProspectus(libraryConfig);
    }
  }, [isOpen]);

  const handleGenerateProspectus = async (cfgToUse?: LibraryMcpProspectusConfig) => {
    try {
      const config = cfgToUse || libraryConfig;
      const res = await generateLibraryProspectus(config);
      setProspectusMarkdown(res.markdown);
      setMcpConfigJson(res.mcpServerConfigJson);
    } catch (err) {
      console.error('Failed to generate prospectus:', err);
    }
  };

  const handleResetToBlank = () => {
    setLibraryConfig(BLANK_TEMPLATE_CONFIG);
    handleGenerateProspectus(BLANK_TEMPLATE_CONFIG);
  };

  const handleTestEndpoint = async (source: DiscoveredSource) => {
    setTestingSourceId(source.id);
    try {
      const res = await testSourceEndpoint(source.id);
      setNotificationMsg(res.online 
        ? `✓ ${source.name} endpoint is ONLINE (${res.latencyMs}ms, HTTP ${res.status})`
        : `⚠ ${source.name} ping failed: ${res.error || 'Check endpoint'}`
      );
      await loadRegistry();
    } catch (err: any) {
      setNotificationMsg(`Connection error: ${err.message}`);
    } finally {
      setTestingSourceId(null);
    }
  };

  const handleProposeSource = async (source: DiscoveredSource) => {
    setProposingSourceId(source.id);
    try {
      const res = await proposeSourceByEmail(source.id, recipientEmail);
      setActiveProposalModal(res);
      setNotificationMsg(`Proposal generated for ${recipientEmail}. Email preview ready.`);
      await loadRegistry();
    } catch (err: any) {
      setNotificationMsg(`Error proposing source: ${err.message}`);
    } finally {
      setProposingSourceId(null);
    }
  };

  const handleApproveSource = async (source: DiscoveredSource) => {
    try {
      const res = await approveSource(source.id);
      setNotificationMsg(`✓ "${source.name}" approved! It is now active in student searches.`);
      // Immediately connect to search sources
      onAddSource({
        id: res.source.id,
        name: res.source.name,
        description: res.source.description,
        isCustomApproved: true,
        officialUrl: res.source.officialUrl,
        endpointUrl: res.source.endpointUrl,
        recordCount: res.source.recordCount,
        badge: 'Open Repository'
      });
      await loadRegistry();
    } catch (err: any) {
      setNotificationMsg(`Approval failed: ${err.message}`);
    }
  };

  const handleRejectSource = async (source: DiscoveredSource) => {
    try {
      await rejectSource(source.id);
      setNotificationMsg(`Source dismissed: ${source.name}`);
      await loadRegistry();
    } catch (err: any) {
      setNotificationMsg(`Rejection failed: ${err.message}`);
    }
  };

  const handleCreateCustomRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoName || !newRepoUrl) return;
    try {
      await addCustomDiscoveredSource({
        name: newRepoName,
        endpointUrl: newRepoUrl,
        officialUrl: newRepoUrl,
        category: newRepoCategory,
        categoryLabel: newRepoCategory.replace('_', ' ').toUpperCase(),
        description: newRepoDesc || 'Custom open database submitted for literature review inclusion.',
        protocol: 'REST',
        license: 'Open Access / Institutional Repository'
      });
      setNewRepoName('');
      setNewRepoUrl('');
      setNewRepoDesc('');
      setShowAddRepoForm(false);
      setNotificationMsg('New open source added to discovery queue for verification!');
      await loadRegistry();
    } catch (err: any) {
      setNotificationMsg(`Error creating source: ${err.message}`);
    }
  };

  const handleCopyProspectus = () => {
    navigator.clipboard.writeText(prospectusMarkdown);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handlePrintProspectus = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${libraryConfig.institutionName} Library MCP Prospectus</title>
          <style>
            body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.6; color: #0f172a; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { font-size: 20pt; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 16px; }
            h2 { font-size: 14pt; margin-top: 24px; color: #1e293b; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
            h3 { font-size: 12pt; margin-top: 18px; }
            pre { background: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 9pt; overflow-x: auto; border: 1px solid #cbd5e1; }
            code { font-family: monospace; font-size: 9pt; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div style="font-size: 10pt; color: #64748b; margin-bottom: 12px; font-weight: bold; text-transform: uppercase;">Institutional Integration Prospectus</div>
          <pre style="white-space: pre-wrap; font-family: system-ui, sans-serif; background: none; border: none; padding: 0; font-size: 10.5pt; line-height: 1.6;">${prospectusMarkdown}</pre>
          <script>window.onload = function() { window.print(); }</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleDownloadMcpConfig = () => {
    const blob = new Blob([mcpConfigJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scholar-library-mcp-${libraryConfig.institutionName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredDatabases = useMemo(() => {
    return ALL_SCHOLAR_DATABASES.filter(db => {
      if (selectedCategory !== 'all' && db.category !== selectedCategory) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = db.name.toLowerCase().includes(q);
      const matchDesc = db.description.toLowerCase().includes(q);
      const matchKeywords = db.recommendedFor.some(k => k.includes(q) || q.includes(k));
      return matchName || matchDesc || matchKeywords;
    });
  }, [searchQuery, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="db-finder-modal-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col transform transition-all border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="p-6 border-b border-slate-100 bg-slate-50/70 flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md flex-shrink-0">
              <Database className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="db-finder-modal-title" className="text-xl font-black text-slate-900 tracking-tight">
                  Scholarly Databases & Library MCP Hub
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Doctoral Literature System
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Expand student literature search by connecting global open databases, discovering new repositories with automated email approvals, and connecting institutional campus libraries via the Model Context Protocol (MCP).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Global Notification Banner */}
        {notificationMsg && (
          <div className="bg-slate-900 text-white px-6 py-2.5 text-xs font-semibold flex items-center justify-between animate-fadeIn">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              {notificationMsg}
            </span>
            <button 
              onClick={() => setNotificationMsg(null)}
              className="text-slate-400 hover:text-white text-xs underline ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Primary View Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 bg-white">
          <button
            onClick={() => setActiveTab('curated')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'curated'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Curated Databases ({ALL_SCHOLAR_DATABASES.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('discovery')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'discovery'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span>Open Source Harvester & Proposals</span>
            {discoveredSources.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-bold">
                {discoveredSources.length} New
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('library_mcp')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'library_mcp'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span>University Library MCP Connector</span>
            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-100 text-emerald-800 font-bold">
              Prospectus
            </span>
          </button>
        </div>

        {/* TAB 1: CURATED SCHOLARLY DATABASES */}
        {activeTab === 'curated' && (
          <div className="flex flex-col flex-grow overflow-hidden">
            {/* Search & Categories Bar */}
            <div className="p-5 border-b border-slate-100 bg-white space-y-4">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by field of study, topic, or database name (e.g., 'Dissertation', 'Oncology', 'Education', 'Deep Learning')..."
                  className="w-full pl-12 pr-4 h-11 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-900"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Discipline Category Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {[
                  { id: 'all', label: 'All Databases', icon: Globe },
                  { id: 'dissertations', label: 'Ph.D. Dissertations', icon: GraduationCap },
                  { id: 'multidisciplinary', label: 'Multidisciplinary', icon: Layers },
                  { id: 'biomedical', label: 'Biomedical & Health', icon: Activity },
                  { id: 'cs_tech', label: 'Computer Science & AI', icon: Cpu },
                  { id: 'social_edu', label: 'Education & Social', icon: BookOpen },
                  { id: 'open_data', label: 'Open Data & Code', icon: Sparkles },
                ].map(cat => {
                  const Icon = cat.icon;
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id as CategoryFilter)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                        isActive 
                          ? 'bg-slate-900 text-white shadow-sm' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Database Cards */}
            <main className="p-6 overflow-y-auto flex-grow space-y-4 bg-slate-50/50">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Showing {filteredDatabases.length} Curated Scholarly Repositories
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Free & Open Access
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredDatabases.map((db) => {
                  const isAdded = existingSources.some(s => s.id === db.id);

                  return (
                    <div 
                      key={db.id} 
                      className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                              {db.categoryLabel}
                            </span>
                            <h3 className="text-base font-black text-slate-900 leading-tight">
                              {db.name}
                            </h3>
                          </div>
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 whitespace-nowrap">
                            {db.badge}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                          {db.description}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                            {db.recordCount}
                          </span>
                          <a 
                            href={db.officialUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-slate-900 inline-flex items-center gap-0.5 text-[10px] font-medium"
                          >
                            Portal <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                          </a>
                        </div>

                        <button
                          onClick={() => onAddSource(db)}
                          disabled={isAdded}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isAdded
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                              : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-sm'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Connected</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add to Search</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </main>
          </div>
        )}

        {/* TAB 2: OPEN SOURCE HARVESTER & EMAIL PROPOSALS */}
        {activeTab === 'discovery' && (
          <div className="flex flex-col flex-grow overflow-hidden bg-slate-50/40">
            <div className="p-6 bg-white border-b border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    Automated Open Repository Discovery & Review
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    The harvester crawls open science registries (OpenDOAR, re3data, OpenAlex) for candidate academic databases. Propose new sources to PI email (<strong className="text-slate-800">{recipientEmail}</strong>) or approve directly to activate for student searches.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={loadRegistry}
                    disabled={isLoadingRegistry}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRegistry ? 'animate-spin' : ''}`} />
                    Refresh Index
                  </button>
                  <button
                    onClick={() => setShowAddRepoForm(!showAddRepoForm)}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {showAddRepoForm ? 'Cancel Entry' : 'Submit Open DB'}
                  </button>
                </div>
              </div>

              {/* Email Recipient Input Setting */}
              <div className="pt-3 border-t border-slate-100 flex items-center gap-3 text-xs">
                <span className="font-bold text-slate-500 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Approval Notification Target:
                </span>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="h-8 px-3 rounded-md bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:bg-white focus:ring-1 focus:ring-slate-900 w-64"
                  placeholder="ashley.e.cribb@gmail.com"
                />
                <span className="text-[11px] text-slate-400">Emails formatted with inclusion justification and 1-click token links</span>
              </div>

              {/* Add Custom Repository Form */}
              {showAddRepoForm && (
                <form onSubmit={handleCreateCustomRepo} className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-fadeIn">
                  <div className="text-xs font-bold text-slate-800">Submit New Open Access Repository / OAI-PMH Endpoint:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Repository Name (e.g. HAL Science)"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value)}
                      required
                      className="h-9 px-3 rounded-lg bg-white border border-slate-200 text-xs font-medium"
                    />
                    <input
                      type="url"
                      placeholder="API Search Endpoint / Base URL"
                      value={newRepoUrl}
                      onChange={(e) => setNewRepoUrl(e.target.value)}
                      required
                      className="h-9 px-3 rounded-lg bg-white border border-slate-200 text-xs font-medium"
                    />
                    <select
                      value={newRepoCategory}
                      onChange={(e) => setNewRepoCategory(e.target.value as any)}
                      className="h-9 px-3 rounded-lg bg-white border border-slate-200 text-xs font-medium"
                    >
                      <option value="multidisciplinary">Multidisciplinary</option>
                      <option value="dissertations">Dissertations & Theses</option>
                      <option value="social_edu">Education & Social</option>
                      <option value="biomedical">Biomedical & Health</option>
                      <option value="cs_tech">Computer Science & AI</option>
                      <option value="open_data">Open Data & Code</option>
                      <option value="institutional_repo">Institutional Repository</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="Short description or justification for doctoral review..."
                    value={newRepoDesc}
                    onChange={(e) => setNewRepoDesc(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-white border border-slate-200 text-xs font-medium"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddRepoForm(false)}
                      className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-indigo-600"
                    >
                      Add to Discovery Queue
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Candidate Discovered Sources List */}
            <main className="p-6 overflow-y-auto flex-grow space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {discoveredSources.length} Candidate Sources Pending Review / Ready for Proposal
                </span>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                  {approvedSources.length} Approved & Live in Search
                </span>
              </div>

              <div className="space-y-4">
                {discoveredSources.map((source) => {
                  const isApproved = source.status === 'approved_active';
                  const isTesting = testingSourceId === source.id;
                  const isProposing = proposingSourceId === source.id;

                  return (
                    <div 
                      key={source.id} 
                      className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow transition-all space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1 max-w-2xl">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                              {source.categoryLabel}
                            </span>
                            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                              Protocol: {source.protocol}
                            </span>
                            {source.pingStatus && (
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                                source.pingStatus === 'online' 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${source.pingStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                {source.pingStatus.toUpperCase()} {source.pingLatencyMs ? `(${source.pingLatencyMs}ms)` : ''}
                              </span>
                            )}
                            {source.status === 'proposed' && (
                              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                Email Proposed to {source.emailRecipient}
                              </span>
                            )}
                          </div>

                          <h4 className="text-base font-black text-slate-900 leading-tight">
                            {source.name}
                          </h4>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {source.description}
                          </p>
                          {source.notes && (
                            <p className="text-[11px] text-slate-500 italic">
                              Research Value: {source.notes}
                            </p>
                          )}
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className="text-xs font-black text-slate-900 block">{source.recordCount}</span>
                          <span className="text-[10px] text-slate-400 block">{source.license}</span>
                          <a 
                            href={source.officialUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-slate-900 inline-flex items-center gap-0.5 text-[10px] font-semibold mt-1"
                          >
                            Explore Portal <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                          </a>
                        </div>
                      </div>

                      {/* Technical Endpoint Info */}
                      <div className="bg-slate-50 rounded-lg p-2.5 text-[11px] font-mono text-slate-600 flex items-center justify-between overflow-x-auto gap-2 border border-slate-100">
                        <span className="truncate flex-grow">
                          <strong className="text-slate-400 font-sans uppercase text-[9px] mr-1">Endpoint:</strong>
                          {source.endpointUrl}
                        </span>
                        <button
                          onClick={() => handleTestEndpoint(source)}
                          disabled={isTesting}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-sans font-bold text-slate-700 whitespace-nowrap flex-shrink-0 flex items-center gap-1"
                        >
                          <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                          {isTesting ? 'Pinging...' : 'Test API'}
                        </button>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {/* Send Email Proposal */}
                          <button
                            onClick={() => handleProposeSource(source)}
                            disabled={isProposing}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5 transition-all"
                            title={`Send structured inclusion proposal email to ${recipientEmail}`}
                          >
                            <Mail className="w-3.5 h-3.5 text-slate-500" />
                            <span>{isProposing ? 'Dispatching...' : 'Email Proposal to Gmail'}</span>
                          </button>

                          <button
                            onClick={() => handleRejectSource(source)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                          >
                            Dismiss
                          </button>
                        </div>

                        {/* Approve and include */}
                        <button
                          onClick={() => handleApproveSource(source)}
                          disabled={isApproved}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                            isApproved
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                          }`}
                        >
                          {isApproved ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Active in Student Search</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Approve & Include in Search</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {discoveredSources.length === 0 && (
                  <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-3">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                    <h4 className="text-base font-bold text-slate-800">All Discovered Sources Evaluated</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      All candidate repositories have been reviewed. Click "Submit Open DB" to add a new institutional repository or re-run the discovery crawler.
                    </p>
                  </div>
                )}
              </div>
            </main>
          </div>
        )}

        {/* TAB 3: UNIVERSITY LIBRARY MCP CONNECTOR */}
        {activeTab === 'library_mcp' && (
          <div className="flex flex-col flex-grow overflow-hidden bg-slate-50/50">
            {/* Header / Subtitle */}
            <div className="p-5 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  Institutional University Library MCP Prospectus
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generate formal integration proposals for University, College, and School Libraries to connect campus electronic subscriptions (JSTOR, ProQuest, EBSCO) via Model Context Protocol (MCP).
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs mr-2">
                  <button
                    onClick={() => setViewMode('document')}
                    className={`px-2.5 py-1 rounded-md font-bold transition-all ${viewMode === 'document' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    Formatted View
                  </button>
                  <button
                    onClick={() => setViewMode('raw_markdown')}
                    className={`px-2.5 py-1 rounded-md font-bold transition-all ${viewMode === 'raw_markdown' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    Raw Markdown
                  </button>
                </div>

                <button
                  onClick={handleCopyProspectus}
                  className="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-sm"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copied!' : 'Copy Markdown'}</span>
                </button>
                <button
                  onClick={handlePrintProspectus}
                  className="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  onClick={handleDownloadMcpConfig}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Download MCP JSON Config</span>
                </button>
              </div>
            </div>

            {/* Blank Standard Template Header Banner */}
            <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Template Mode:
                </span>
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1.5">
                  📄 Standard Blank Academic Library Template
                </span>
              </div>

              <button
                onClick={handleResetToBlank}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <span>Reset to Blank Defaults</span>
              </button>
            </div>

            {/* Investigator Credentials & Research Context Banner */}
            <div className="px-6 py-3 bg-indigo-50/70 border-b border-indigo-100 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-indigo-950 uppercase tracking-wider text-[10px] bg-indigo-200/70 px-2 py-0.5 rounded">
                    Principal Investigator
                  </span>
                  <span className="font-black text-slate-900">Ashley E. Cribb</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-indigo-900 font-semibold">Doctoral Student in EdTech, Boise State University</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-teal-900 font-semibold">Staff Member, UNC Wilmington</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600 font-mono">ashley.e.cribb@gmail.com</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  <span className="font-semibold text-indigo-800">
                    Universal fillable template for any university, college, or school library
                  </span>
                </div>
              </div>
            </div>

            {/* Customization Inputs Drawer */}
            <div className="px-6 py-4 bg-slate-100/70 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  University / College / School Name
                </label>
                <input
                  type="text"
                  value={libraryConfig.institutionName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLibraryConfig(prev => ({ ...prev, institutionName: val }));
                  }}
                  onBlur={() => handleGenerateProspectus()}
                  placeholder="[Name of University, College, or School]"
                  className="w-full h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Library / Learning Commons Name
                </label>
                <input
                  type="text"
                  value={libraryConfig.libraryName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLibraryConfig(prev => ({ ...prev, libraryName: val }));
                  }}
                  onBlur={() => handleGenerateProspectus()}
                  placeholder="[Target Library / Learning Commons Name]"
                  className="w-full h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Attention: Dean / Systems Librarian
                </label>
                <input
                  type="text"
                  value={libraryConfig.deanName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLibraryConfig(prev => ({ ...prev, deanName: val }));
                  }}
                  onBlur={() => handleGenerateProspectus()}
                  placeholder="[Dean of Libraries / Systems Librarian / Director]"
                  className="w-full h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Dean / Library Contact Email
                </label>
                <input
                  type="text"
                  value={libraryConfig.deanEmail}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLibraryConfig(prev => ({ ...prev, deanEmail: val }));
                  }}
                  onBlur={() => handleGenerateProspectus()}
                  placeholder="[library-leadership@institution.edu]"
                  className="w-full h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  EZproxy / SSO / OpenAthens Prefix
                </label>
                <input
                  type="text"
                  value={libraryConfig.ezproxyPrefix}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLibraryConfig(prev => ({ ...prev, ezproxyPrefix: val }));
                  }}
                  onBlur={() => handleGenerateProspectus()}
                  placeholder="[https://login.proxy.institution.edu/login?url=]"
                  className="w-full h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Primary Discovery System
                </label>
                <select
                  value={libraryConfig.discoveryPlatform}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setLibraryConfig(prev => ({ ...prev, discoveryPlatform: val }));
                    handleGenerateProspectus({ ...libraryConfig, discoveryPlatform: val });
                  }}
                  className="w-full h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium"
                >
                  <option value="alma_primo">Ex Libris Alma / Primo</option>
                  <option value="ebsco_eds">EBSCO Discovery Service (EDS)</option>
                  <option value="oclc_worldcat">OCLC WorldCat Discovery</option>
                  <option value="openathens">OpenAthens API</option>
                  <option value="ezproxy_custom">Custom EZproxy / OpenSearch</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Target Electronic Databases (Comma Separated)
                </label>
                <input
                  type="text"
                  value={libraryConfig.targetDatabases?.join(', ') || ''}
                  onChange={(e) => {
                    const val = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                    setLibraryConfig(prev => ({ ...prev, targetDatabases: val }));
                  }}
                  onBlur={() => handleGenerateProspectus()}
                  placeholder="[ProQuest Dissertations], [JSTOR], [EBSCOhost], [ScienceDirect], [PubMed Link Resolver]"
                  className="w-full h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium"
                />
              </div>
            </div>

            {/* Document Viewer */}
            <main className="p-6 overflow-y-auto flex-grow">
              {viewMode === 'raw_markdown' ? (
                <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                    <span className="text-xs font-mono text-emerald-400">prospectus.md (Raw Markdown)</span>
                    <button
                      onClick={handleCopyProspectus}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1"
                    >
                      {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {isCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                    {prospectusMarkdown}
                  </pre>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-6">
                  {/* Document Header */}
                  <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded">
                          Official Institutional Prospectus & Specification
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Design-Based Research (DBR)
                        </span>
                      </div>
                      <h2 className="text-xl font-black text-slate-900 leading-tight">
                        Connecting {libraryConfig.institutionName || '[Name of University / College / School]'} Subscriptions via Model Context Protocol (MCP)
                      </h2>
                      <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                        <div>
                          <strong>Author & Principal Investigator:</strong> Ashley E. Cribb (ashley.e.cribb@gmail.com)
                        </div>
                        <div>
                          <strong>Doctoral Affiliation:</strong> Doctoral Student / Candidate in Educational Technology, Boise State University
                        </div>
                        <div>
                          <strong>Professional Employment:</strong> Staff Member, University of North Carolina Wilmington (UNCW)
                        </div>
                        <div>
                          <strong>Target Recipient:</strong> {libraryConfig.deanName || '[Dean / Systems Librarian]'} • {libraryConfig.libraryName || '[Target Library / Learning Commons]'}
                        </div>
                      </div>
                    </div>

                    <a
                      href={`mailto:${libraryConfig.deanEmail || ''}?subject=${encodeURIComponent(`Institutional Proposal: Connecting ${libraryConfig.institutionName || 'University Library'} to Scholar Explorer via MCP`)}&body=${encodeURIComponent(`Dear ${libraryConfig.deanName || 'Library Leadership'},\n\nI am writing to share an institutional integration prospectus for connecting ${libraryConfig.libraryName || 'your library'}'s electronic subscriptions to the Scholar Explorer doctoral research platform using the Model Context Protocol (MCP).\n\nPlease find our proposal attached, or view our technical documentation at https://scholar-explorer.com.\n\nSincerely,\nAshley E. Cribb\nPrincipal Investigator\nDoctoral Student, Boise State University\nStaff Member, University of North Carolina Wilmington`)}`}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm self-start flex-shrink-0"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Draft Email to Library Lead</span>
                    </a>
                  </div>

                  {/* Standard Invitation Notice */}
                  <div className="bg-indigo-50 border-l-4 border-indigo-600 p-3.5 rounded-r-lg text-xs text-indigo-950 space-y-1">
                    <div className="font-bold uppercase tracking-wider text-[10px] text-indigo-800">
                      Standard Institutional Library Invitation & Intake Specification
                    </div>
                    <p className="leading-relaxed">
                      This proposal is a standard academic institutional invitation submitted by doctoral researcher <strong>Ashley E. Cribb</strong> (Doctoral Student at <strong>Boise State University</strong>, and Staff Member at <strong>UNC Wilmington</strong>), inviting target university, college, and school libraries to connect authorized electronic collections to the Scholar Explorer research framework via the Model Context Protocol (MCP).
                    </p>
                  </div>

                  {/* Rendered Prospectus Sections */}
                  <div className="space-y-4 text-xs leading-relaxed">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 m-0">1. Executive Overview</h4>
                      <p className="m-0 text-slate-600">
                        Doctoral candidates frequently face fragmented literature searches between commercial discovery systems and open repositories. 
                        Scholar Explorer bridges this gap by enabling <strong>{libraryConfig.libraryName || '[University Library]'}</strong> to connect its authorized electronic collections ({libraryConfig.targetDatabases?.join(', ') || '[JSTOR, ProQuest, EBSCOhost]'}) via a lightweight, read-only <strong>Model Context Protocol (MCP) server</strong>.
                      </p>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 m-0">2. FERPA, Privacy & Security Guarantee</h4>
                      <ul className="m-0 pl-4 space-y-1 text-slate-600">
                        <li><strong>Zero Student Credentials Stored:</strong> Authentication is handled strictly via campus SAML/EZproxy ticket pass-through.</li>
                        <li><strong>Strictly Read-Only Access:</strong> The MCP server cannot circulate items, alter patron accounts, or incur fees.</li>
                        <li><strong>Publisher Licensing Compliance:</strong> Full texts are opened directly on publisher platforms through authorized proxy links ({libraryConfig.ezproxyPrefix || '[EZproxy URL]'}).</li>
                        <li><strong>Zero Commercial AI Model Training:</strong> Doctoral search queries are ephemeral and never utilized to train foundation models.</li>
                        <li><strong>Auditable Learning Analytics:</strong> Optional xAPI 1.0.3 telemetry to institutional Learning Record Stores (LRS).</li>
                      </ul>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 m-0">3. Standardized Library MCP Tools</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="bg-white p-2.5 rounded border border-slate-200">
                          <strong className="text-slate-900 block font-sans font-bold">search_library_catalog</strong>
                          Queries {libraryConfig.discoveryPlatform} index for peer-reviewed holdings
                        </div>
                        <div className="bg-white p-2.5 rounded border border-slate-200">
                          <strong className="text-slate-900 block font-sans font-bold">check_fulltext_access</strong>
                          Resolves institutional rights for any DOI / ISBN
                        </div>
                        <div className="bg-white p-2.5 rounded border border-slate-200">
                          <strong className="text-slate-900 block font-sans font-bold">resolve_proxy_link</strong>
                          Prefixes URLs with {libraryConfig.ezproxyPrefix || '[EZproxy URL]'}
                        </div>
                        <div className="bg-white p-2.5 rounded border border-slate-200">
                          <strong className="text-slate-900 block font-sans font-bold">harvest_institutional_theses</strong>
                          Fetches {libraryConfig.institutionName || '[Institution]'} theses via OAI-PMH
                        </div>
                      </div>
                    </div>

                    {/* Section 7: Institutional Intake & Specification Sheet */}
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-300 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 m-0">
                          7. Institutional Intake & Technical Specification Sheet
                        </h4>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          (To be completed by participating Library)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 m-0">
                        Please provide or verify the following institutional parameters to establish the MCP connection:
                      </p>

                      <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2.5 text-xs font-mono">
                        <div>
                          <strong className="font-sans text-slate-700">1. Institution Official Name:</strong>{' '}
                          <span className="text-slate-900 font-bold">{libraryConfig.institutionName || '___________________________________________________'}</span>
                        </div>
                        <div>
                          <strong className="font-sans text-slate-700">2. Library / Learning Commons:</strong>{' '}
                          <span className="text-slate-900 font-bold">{libraryConfig.libraryName || '___________________________________________________'}</span>
                        </div>
                        <div>
                          <strong className="font-sans text-slate-700">3. Dean of Libraries / Director:</strong>{' '}
                          <span className="text-slate-900 font-bold">{libraryConfig.deanName || '___________________________________________________'}</span>
                        </div>
                        <div>
                          <strong className="font-sans text-slate-700">4. Systems Librarian / Technical Lead:</strong>{' '}
                          <span className="text-slate-500">Name: ________________________ Email: ________________________</span>
                        </div>
                        <div>
                          <strong className="font-sans text-slate-700">5. Primary Discovery System:</strong>{' '}
                          <span className="text-slate-800 font-sans">[ {libraryConfig.discoveryPlatform === 'alma_primo' ? '✓' : ' '} ] Ex Libris Alma/Primo  [ {libraryConfig.discoveryPlatform === 'ebsco_eds' ? '✓' : ' '} ] EBSCO EDS  [ {libraryConfig.discoveryPlatform === 'oclc_worldcat' ? '✓' : ' '} ] OCLC WorldCat  [ {libraryConfig.discoveryPlatform === 'openathens' ? '✓' : ' '} ] OpenAthens</span>
                        </div>
                        <div>
                          <strong className="font-sans text-slate-700">6. Campus Authentication / Proxy Prefix URL:</strong>{' '}
                          <span className="text-slate-900">{libraryConfig.ezproxyPrefix || '___________________________________________________'}</span>
                        </div>
                        <div>
                          <strong className="font-sans text-slate-700">7. Authorized Electronic Database Subscriptions:</strong>{' '}
                          <span className="text-slate-800 font-sans">
                            {libraryConfig.targetDatabases?.length ? libraryConfig.targetDatabases.join(' • ') : '[ ] ProQuest  [ ] JSTOR  [ ] ScienceDirect  [ ] EBSCOhost  [ ] IEEE Xplore'}
                          </span>
                        </div>
                        <div className="pt-2 border-t border-slate-200">
                          <strong className="font-sans text-slate-700">8. Institutional Pilot Authorization Signature:</strong>{' '}
                          <span className="text-slate-400">Signature: __________________________________ Date: ____________</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900 text-slate-100 p-4 rounded-xl space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 m-0">
                        Deployment Configuration (mcp-config.json)
                      </h4>
                      <pre className="text-[11px] font-mono text-emerald-300 bg-slate-950 p-3 rounded-lg overflow-x-auto m-0">
                        {mcpConfigJson}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>
        )}

        {/* Modal Footer */}
        <footer className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium text-[11px]">
            {activeTab === 'curated' && 'All added databases participate in federated search deduplication.'}
            {activeTab === 'discovery' && `Approving any source adds it immediately to the active search registry.`}
            {activeTab === 'library_mcp' && `Institutional prospectus ready to send to ${libraryConfig.institutionName} library leadership.`}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg text-xs hover:bg-slate-800 transition-all"
          >
            Done
          </button>
        </footer>
      </div>

      {/* Email Proposal Preview Modal */}
      {activeProposalModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setActiveProposalModal(null)}
        >
          <div 
            className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Mail className="w-5 h-5 text-indigo-400" />
                <div>
                  <h4 className="text-sm font-black tracking-tight">Source Proposal Email Dispatched</h4>
                  <p className="text-[11px] text-slate-400">Recipient: {activeProposalModal.emailRecipient}</p>
                </div>
              </div>
              <button 
                onClick={() => setActiveProposalModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <div className="font-bold text-slate-800">Subject:</div>
                <div className="font-medium text-slate-600">{activeProposalModal.emailSubject}</div>
              </div>

              <div>
                <div className="font-bold text-slate-800 mb-1">Proposal Content Preview:</div>
                <pre className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px] font-sans text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {activeProposalModal.emailText}
                </pre>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                <span>One-click approval token generated. You can also approve this source immediately below.</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <a
                href={activeProposalModal.mailtoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5 text-indigo-600" />
                <span>Open in Email App (Draft)</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveProposalModal(null)}
                  className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    await handleApproveSource(activeProposalModal.source);
                    setActiveProposalModal(null);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>Approve & Include Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
