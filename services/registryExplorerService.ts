import type { RegistryOverview, ResearchPaper } from '../types';
import { searchDataCiteAsResearchPapers } from './dataciteService';
import { searchOpenAirePublications } from './openaireService';
import { searchEuropePMC } from './europePmcService';
import { searchDBLP } from './dblpService';
import { searchCORE } from './coreService';
import { searchCrossref } from './crossrefService';
import { searchZenodo } from './zenodoService';
import { searchPubMed } from './pubmedService';
import { searchBioRxiv } from './biorxivService';
import { searchDissertations } from './dissertationService';
import { searchDOAJ } from './doajService';
import { searchERIC } from './ericService';

export const OPEN_REGISTRY_CATALOG: RegistryOverview[] = [
  {
    id: 'crossref',
    name: 'Crossref',
    category: 'PID & Metadata Registries',
    primaryRole: 'Global Digital Object Identifier (DOI) Registration Agency',
    strengths: 'Foundational metadata for >150M journal articles, conference papers, books, and reference lists with open licensing.',
    interfaces: ['REST API (Polite Pool)', 'OAI-PMH', 'Content Negotiation'],
    license: 'CC0 / Open Metadata',
    officialUrl: 'https://crossref.org',
    apiDocsUrl: 'https://api.crossref.org/swagger-ui/index.html',
    status: 'operational'
  },
  {
    id: 'dissertations',
    name: 'Global Theses & Dissertations',
    category: 'Doctoral & Academic Registries',
    primaryRole: 'Open Access Doctoral Dissertations & Graduate Theses',
    strengths: 'Direct indexing of completed PhD dissertations, methodology chapters, and university institutional archives.',
    interfaces: ['Crossref Dissertation Index', 'OATD OAI-PMH', 'DART-Europe'],
    license: 'Open Access / Institutional',
    officialUrl: 'https://oatd.org',
    apiDocsUrl: 'https://oatd.org/oai',
    status: 'operational'
  },
  {
    id: 'pubmed',
    name: 'PubMed / NCBI MEDLINE',
    category: 'Domain-Specific Open Registries',
    primaryRole: 'National Center for Biotechnology Information (NCBI) Biomedical Literature',
    strengths: 'Over 36 million citations from MEDLINE, life science journals, clinical trials, and MeSH controlled vocabulary.',
    interfaces: ['Entrez E-Utilities API', 'FTP Data Dumps'],
    license: 'Public Domain (US Gov)',
    officialUrl: 'https://pubmed.ncbi.nlm.nih.gov',
    apiDocsUrl: 'https://www.ncbi.nlm.nih.gov/books/NBK25501/',
    status: 'operational'
  },
  {
    id: 'biorxiv',
    name: 'bioRxiv & medRxiv',
    category: 'Domain-Specific Open Registries',
    primaryRole: 'Cold Spring Harbor Laboratory Life Sciences & Clinical Preprints',
    strengths: 'Real-time pre-peer-review research findings in biology, clinical trials, oncology, genomics, and infectious disease.',
    interfaces: ['Cold Spring Harbor REST API', 'Crossref Prefix 10.1101'],
    license: 'Open Access / CC',
    officialUrl: 'https://biorxiv.org',
    apiDocsUrl: 'https://api.biorxiv.org/',
    status: 'operational'
  },
  {
    id: 'zenodo',
    name: 'Zenodo (CERN Open Science)',
    category: 'Research Data & Artifact Registries',
    primaryRole: 'Open Science Research Data, Code, and Computational Models',
    strengths: 'Assigns citable DOIs to experimental datasets, replication code, software packages, and monographs.',
    interfaces: ['REST API v1', 'OAI-PMH'],
    license: 'Creative Commons / Open Access',
    officialUrl: 'https://zenodo.org',
    apiDocsUrl: 'https://developers.zenodo.org/',
    status: 'operational'
  },
  {
    id: 'doaj',
    name: 'DOAJ (Directory of Open Access Journals)',
    category: 'PID & Metadata Registries',
    primaryRole: 'Peer-Reviewed Quality Open Access Journals',
    strengths: 'Vetted index of over 20,000 international peer-reviewed journals covering all academic domains.',
    interfaces: ['REST API v2', 'OAI-PMH'],
    license: 'CC0 / Open Access',
    officialUrl: 'https://doaj.org',
    apiDocsUrl: 'https://doaj.org/api/v2/docs',
    status: 'operational'
  },
  {
    id: 'eric',
    name: 'ERIC (Institute of Education Sciences)',
    category: 'Domain-Specific Open Registries',
    primaryRole: 'Education Sciences, Pedagogy & Learning Analytics',
    strengths: 'The primary US Department of Education database for instructional methodologies, educational policy, and learning research.',
    interfaces: ['IES REST API', 'OAI-PMH'],
    license: 'Public Domain',
    officialUrl: 'https://eric.ed.gov',
    apiDocsUrl: 'https://eric.ed.gov/?api',
    status: 'operational'
  },
  {
    id: 'datacite',
    name: 'DataCite',
    category: 'PID & Metadata Registries',
    primaryRole: 'Global DOI Registration for Research Data & Software',
    strengths: 'PID Graph linking datasets, code repositories, instruments, and preprints to publication DOIs.',
    interfaces: ['GraphQL API', 'REST API', 'OAI-PMH', 'Content Negotiation'],
    license: 'CC0 (Public Domain)',
    officialUrl: 'https://datacite.org',
    apiDocsUrl: 'https://support.datacite.org/docs/retrieve-metadata-with-an-api',
    status: 'operational'
  },
  {
    id: 'ror',
    name: 'ROR (Research Organization Registry)',
    category: 'PID & Metadata Registries',
    primaryRole: 'Institutional Persistent Identifiers',
    strengths: 'Disambiguates >100,000 global research organizations and universities across OpenAlex and Crossref.',
    interfaces: ['REST API', 'Data Dumps (JSON)'],
    license: 'CC0 (Public Domain)',
    officialUrl: 'https://ror.org',
    apiDocsUrl: 'https://ror.readme.io/v2/docs/rest-api',
    status: 'operational'
  },
  {
    id: 'orcid',
    name: 'ORCID',
    category: 'PID & Metadata Registries',
    primaryRole: 'Persistent Author & Contributor Identifiers',
    strengths: 'Connects researchers with validated contributions, grants, works, and peer reviews.',
    interfaces: ['Public REST API', 'Member API', 'OAuth 2.0'],
    license: 'Open Access / CC0',
    officialUrl: 'https://orcid.org',
    apiDocsUrl: 'https://info.orcid.org/documentation/api-tutorials/api-tutorial-searching-the-orcid-registry/',
    status: 'operational'
  },
  {
    id: 'opencitations',
    name: 'OpenCitations (COCI)',
    category: 'Linked Data & Citation Graphs',
    primaryRole: 'Open Linked DOI-to-DOI Citation Network',
    strengths: 'Treats citations as first-class open data entities in RDF/SPARQL without paywalls (>1.5B citation links).',
    interfaces: ['REST API', 'SPARQL Endpoint', 'RDF / N-Triples Dumps'],
    license: 'CC0 (Public Domain)',
    officialUrl: 'https://opencitations.net',
    apiDocsUrl: 'https://opencitations.net/index/coci/api/v1',
    status: 'operational'
  },
  {
    id: 'openaire',
    name: 'OpenAIRE Graph',
    category: 'Scholarly Knowledge Graphs',
    primaryRole: 'European Open Science & Grant Lineage',
    strengths: 'Maps multi-funder research grants (Horizon Europe, NIH, Wellcome Trust) to publications and open datasets.',
    interfaces: ['REST API', 'GraphQL API', 'OAI-PMH'],
    license: 'CC-BY',
    officialUrl: 'https://graph.openaire.eu',
    apiDocsUrl: 'https://api.openaire.eu/search',
    status: 'operational'
  },
  {
    id: 'semanticscholar',
    name: 'Semantic Scholar (S2AG)',
    category: 'Scholarly Knowledge Graphs',
    primaryRole: 'AI-Powered Citation Intents & TLDRs',
    strengths: 'Citation intent classification, influential citation metrics, vector embeddings for >200M works.',
    interfaces: ['REST API (Graph v1)', 'Datasets API', 'Recommendations API'],
    license: 'Free Open Access',
    officialUrl: 'https://www.semanticscholar.org',
    apiDocsUrl: 'https://api.semanticscholar.org/api-docs/',
    status: 'operational'
  },
  {
    id: 'core',
    name: 'CORE (Connecting Repositories)',
    category: 'Scholarly Knowledge Graphs',
    primaryRole: 'Full-Text Open Access Repository Aggregator',
    strengths: 'Harvests full-text PDF/XML from thousands of global institutional and subject repositories.',
    interfaces: ['REST API v3', 'FastSync API', 'Data Dumps'],
    license: 'Open Access / CC',
    officialUrl: 'https://core.ac.uk',
    apiDocsUrl: 'https://core.ac.uk/services/api',
    status: 'operational'
  },
  {
    id: 'thelens',
    name: 'The Lens (Lens.org)',
    category: 'Scholarly Knowledge Graphs',
    primaryRole: 'Academic Literature & Global Patent Graph',
    strengths: 'PatCite indexing linking scientific papers to international patent filings for commercial impact tracking.',
    interfaces: ['Scholar REST API', 'Patent REST API', 'Bulk Releases'],
    license: 'Freemium / Open Public',
    officialUrl: 'https://www.lens.org',
    apiDocsUrl: 'https://docs.api.lens.org/',
    status: 'operational'
  },
  {
    id: 'europepmc',
    name: 'Europe PMC / PubMed Central',
    category: 'Domain-Specific Open Registries',
    primaryRole: 'Biomedical & Life Sciences Literature',
    strengths: 'MeSH indexing, open access full text XML, clinical study links, and grant acknowledgments.',
    interfaces: ['REST Web Services', 'OAI-PMH', 'SOAP API'],
    license: 'Open Access / Public Domain',
    officialUrl: 'https://europepmc.org',
    apiDocsUrl: 'https://europepmc.org/RestfulWebService',
    status: 'operational'
  },
  {
    id: 'dblp',
    name: 'DBLP Computer Science Bibliography',
    category: 'Domain-Specific Open Registries',
    primaryRole: 'Manually Curated CS Conferences & Journals',
    strengths: 'Authoritative computer science venue tracking, author disambiguation, and clean electronic editions.',
    interfaces: ['JSON/XML Search API', 'SPARQL Endpoint', 'OAI-PMH'],
    license: 'CC0 (Public Domain)',
    officialUrl: 'https://dblp.org',
    apiDocsUrl: 'https://dblp.org/faq/1350147.html',
    status: 'operational'
  },
  {
    id: 'orkg',
    name: 'ORKG (Open Research Knowledge Graph)',
    category: 'Linked Data & Citation Graphs',
    primaryRole: 'Semantic Research Findings & Tabular Benchmarks',
    strengths: 'Deconstructs paper contributions into structured properties, benchmarks, and comparison tables.',
    interfaces: ['REST API', 'SPARQL Endpoint'],
    license: 'CC-BY / CC0',
    officialUrl: 'https://orkg.org',
    apiDocsUrl: 'https://orkg.org/about/19/API',
    status: 'operational'
  },
  {
    id: 'wikidata',
    name: 'Wikidata & Scholia',
    category: 'Linked Data & Citation Graphs',
    primaryRole: 'Community-Curated CC0 Knowledge Graph',
    strengths: 'Dynamic SPARQL profiling of scholars, co-authorship maps, citation trees, and topics.',
    interfaces: ['SPARQL Endpoint', 'Wikidata REST API', 'Scholia UI'],
    license: 'CC0 (Public Domain)',
    officialUrl: 'https://scholia.toolforge.org',
    apiDocsUrl: 'https://query.wikidata.org/',
    status: 'operational'
  }
];

/**
 * Unified Federated Search across selected open scholarly registries
 */
export const searchMultiRegistries = async (
  query: string,
  selectedRegistries: string[] = ['crossref', 'dissertations', 'pubmed', 'biorxiv', 'zenodo', 'datacite', 'openaire', 'europepmc', 'dblp', 'core', 'doaj', 'eric']
): Promise<{ papers: ResearchPaper[]; countsByRegistry: Record<string, number> }> => {
  const promises: Promise<{ registry: string; papers: ResearchPaper[] }>[] = [];

  if (selectedRegistries.includes('crossref')) {
    promises.push(
      searchCrossref(query, 6)
        .then(res => ({ registry: 'Crossref', papers: res.papers }))
        .catch(() => ({ registry: 'Crossref', papers: [] }))
    );
  }

  if (selectedRegistries.includes('dissertations')) {
    promises.push(
      searchDissertations(query, 6)
        .then(res => ({ registry: 'Theses & Dissertations', papers: res.papers }))
        .catch(() => ({ registry: 'Theses & Dissertations', papers: [] }))
    );
  }

  if (selectedRegistries.includes('pubmed')) {
    promises.push(
      searchPubMed(query, 6)
        .then(res => ({ registry: 'PubMed', papers: res.papers }))
        .catch(() => ({ registry: 'PubMed', papers: [] }))
    );
  }

  if (selectedRegistries.includes('biorxiv')) {
    promises.push(
      searchBioRxiv(query, 6)
        .then(res => ({ registry: 'bioRxiv / medRxiv', papers: res.papers }))
        .catch(() => ({ registry: 'bioRxiv / medRxiv', papers: [] }))
    );
  }

  if (selectedRegistries.includes('zenodo')) {
    promises.push(
      searchZenodo(query, 6)
        .then(res => ({ registry: 'Zenodo (CERN)', papers: res.papers }))
        .catch(() => ({ registry: 'Zenodo (CERN)', papers: [] }))
    );
  }

  if (selectedRegistries.includes('datacite')) {
    promises.push(
      searchDataCiteAsResearchPapers(query, 6)
        .then(res => ({ registry: 'DataCite', papers: res.papers }))
        .catch(() => ({ registry: 'DataCite', papers: [] }))
    );
  }

  if (selectedRegistries.includes('openaire')) {
    promises.push(
      searchOpenAirePublications(query, 6)
        .then(res => ({ registry: 'OpenAIRE Graph', papers: res.papers }))
        .catch(() => ({ registry: 'OpenAIRE Graph', papers: [] }))
    );
  }

  if (selectedRegistries.includes('europepmc')) {
    promises.push(
      searchEuropePMC(query, 6)
        .then(res => ({ registry: 'Europe PMC', papers: res.papers }))
        .catch(() => ({ registry: 'Europe PMC', papers: [] }))
    );
  }

  if (selectedRegistries.includes('dblp')) {
    promises.push(
      searchDBLP(query, 6)
        .then(res => ({ registry: 'DBLP', papers: res.papers }))
        .catch(() => ({ registry: 'DBLP', papers: [] }))
    );
  }

  if (selectedRegistries.includes('core')) {
    promises.push(
      searchCORE(query, 6)
        .then(res => ({ registry: 'CORE', papers: res.papers }))
        .catch(() => ({ registry: 'CORE', papers: [] }))
    );
  }

  if (selectedRegistries.includes('doaj')) {
    promises.push(
      searchDOAJ(query, 6)
        .then(res => ({ registry: 'DOAJ', papers: res.papers }))
        .catch(() => ({ registry: 'DOAJ', papers: [] }))
    );
  }

  if (selectedRegistries.includes('eric')) {
    promises.push(
      searchERIC(query, 6)
        .then(res => ({ registry: 'ERIC (Education)', papers: res.papers }))
        .catch(() => ({ registry: 'ERIC (Education)', papers: [] }))
    );
  }

  const results = await Promise.all(promises);
  const countsByRegistry: Record<string, number> = {};
  const allPapers: ResearchPaper[] = [];

  results.forEach(r => {
    countsByRegistry[r.registry] = r.papers.length;
    allPapers.push(...r.papers);
  });

  return { papers: allPapers, countsByRegistry };
};
