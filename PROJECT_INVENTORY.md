# ScholarExplorer: Comprehensive Project Inventory

This document provides a complete structured inventory of the files and directories that make up the **ScholarExplorer** application—an AI-powered academic and scientific literature scout featuring direct integrations with OpenAlex, Google Scholar, Semantic Scholar, Crossref, and other academic services, along with an Model Context Protocol (MCP) server core, literature verification tools, local agent components, and a dedicated browser extension.

---

## 📂 Codebase Directory Map

```text
/ (Root)
├── App.tsx                        # Main React SPA component containing layouts and routing
├── index.html                     # SPA HTML template
├── index.tsx                      # Frontend entry point
├── server.ts                      # Full-stack Node.js Express server with proxy and MCP mounts
├── types.ts                       # Shared TypeScript interfaces & types (ResearchPaper, etc.)
├── package.json                   # Project dependencies and deployment scripts
├── vite.config.ts                 # React/SPA Vite configuration
├── metadata.json                  # Application capabilities & iframe permissions settings
├── .env.example                   # Required environment variable templates for keys & secrets
│
├── 📁 services/                   # Business logic, third-party API clients, and AI integration
│   ├── apiService.ts              # Core proxy query routing & paper aggregation pipeline
│   ├── geminiService.ts           # Gemini AI generation, structured extraction, & query parser
│   ├── mcpService.ts              # MCP Client connection and transport lifecycle management
│   ├── mcp-server-impl.ts         # High-level MCP Server exposing research tools via SSE
│   ├── openalexService.ts         # OpenAlex service handling raw/deinverted indices & works metadata
│   ├── semanticScholarService.ts  # Citation graphs, connected paper linkages, & citation counts
│   ├── arxivService.ts            # arXiv integration for fetching preprints
│   ├── crossrefService.ts         # DOI lookup and publisher details querying
│   ├── unpaywallService.ts        # Open Access PDF direct URL lookup
│   ├── deepResearchService.ts     # Multi-step automated research loop & syntheses
│   ├── validationService.ts       # Scientific rigor checking, bias discovery, & claims verification
│   ├── [Other Core Services...]   # Citation, entailment, search weighting, and RAG systems
│
├── 📁 components/                 # React UI elements, widgets, and modal panels
│   ├── PaperDetails.tsx           # Detailed card selector, citation formatter, tabbed overview
│   ├── InitialSearchScreen.tsx    # Clean, distraction-free search query entry desk
│   ├── HelpButton.tsx             # Floating user manual panel & UI guide
│   ├── KnowledgeGraphDisplay.tsx  # Dynamic relational entities and research topic linkages
│   ├── 📁 icons/                 # Rich custom semantic & academic styling interface icons
│   └── [Interactive Dashboards..] # Bibliography, chat panel, connections visualizer, charts
│
├── 📁 utils/                      # Helper libraries and specialized math/search matrices
│   ├── bm25.ts                    # Client-side BM25 document ranking index for text searches
│   ├── embeddings.ts              # Semantic similarity vector helpers
│   ├── cache.ts                   # In-memory LRU data cacher with custom TTL support
│   └── toon.ts                    # Math utility wrappers & visual asset helpers
│
├── 📁 extension/                  # Full-featured Chrome/Firefox browser companion extension
│   ├── background.ts              # Service worker pipeline, tabs sync, and context menus
│   ├── popup.tsx                  # Popover UI for saving papers and extracting metadata
│   ├── manifest.json              # Web extension permissions and manifest structures
│   └── 📁 content-scripts/        # Page scripts for injecting floating overlays on Google Scholar
│
└── 📁 local_engine/               # Hybrid Python workspace housing agent models
    ├── 📁 nanobots/               # Py scripts representing context ingestors & logging queries
    └── 📁 knowledge_base/         # Local indexes (JSON) detailing curated instructional files
```

---

## 📝 Complete File Inventory & Descriptions

### 1. Root Directory

Files matching configurations and standard entry points of the full-stack web application.

- **`App.tsx`**: Main component. Builds the unified layout, managing workspace selections, active paper inspections, local libraries, chat side-drawers, and layout routing.
- **`server.ts`**: Full-stack Express backend server acting as a server-side client for proxying sensitive keys to OpenAlex (`/api/openalex/*`), Google Scholar (`/api/scholar` via SerpAPI), and mounting SSE transports for Model Context Protocol servers.
- **`types.ts`**: Unified TypeScript records declaring domain boundaries (`ResearchPaper`, `AdvancedSearchOptions`, `AuthorProfile`, `AnalysisResult`).
- **`index.html`**: Entry page containing meta tags, container mounts, and typography configurations.
- **`index.css`**: Tailwind stylesheet importing the theme, custom animation states, and typography fonts (Inter, Space Grotesk, JetBrains Mono).
- **`metadata.json`**: Describes application settings, metadata fields, frame permissions (camer/microphone/geolocation), and system capabilities.
- **`.env.example`**: Clean blueprint instructing developers where to mount secret API Keys (`GEMINI_API_KEY`, `OPENALEX_API_KEY`, `SERPAPI_KEY`) without committing secrets.
- **`vite.config.ts`**: Bundling configuration file for development, production building, and reverse-proxy port mappings.
- **`vite.extension.config.ts`**: Builds and pipes extension scripts into the `dist-extension` deployment asset directory.
- **`copy-extension-assets.js`**: Helper automating synchronization of chrome configurations with built script runtimes.

---

### 2. Services (`/services`)

Our logic powerhouse layer. Keeps key calls, API queries, and structured generation tasks fully decoupled from presentation layouts.

- **`apiService.ts`**: Orchestrates federated search calls. Blends results from multiple channels (arXiv, OpenAlex, Crossref), calculates combined relevance weights, uses caching strategies, and implements text search refinement.
- **`geminiService.ts`**: Uses the `@google/genai` library server-side to execute structured entity extractions, synthesize detailed project reports, and parsing raw conversational triggers into structured `AdvancedSearchOptions`.
- **`mcpService.ts`**: Manages client connections, message packet forwarding, and reconnection policies to the platform-wide context servers.
- **`mcp-server-impl.ts`**: Express SSE-compatible server adapter exposing powerful discovery tools (retraining, query execution, paper details) as server-native functions to any connectable LLM agent.
- **`openalexService.ts`**: Direct gateway to the OpenAlex academic API. Handles DOI matching, deinverting dense inverted abstract vectors into human-readable texts, and structuring authorship parameters.
- **`unpaywallService.ts`**: Queries Open Access indices to recover direct, copyright-compliant links to full PDF resources.
- **`semanticScholarService.ts`**: Integrates deep academic graphs to map citation networks and trace literature influence indices.
- **`arxivService.ts`**: Connects directly to the arXiv repository to query, cache, and surface computer science preprints.
- **`crossrefService.ts`**: Queries DOIs against Crossref endpoints to cross-verify publishers, metadata profiles, and verify publication metadata.
- **`deepResearchService.ts`**: Runs iterative, automated, multi-query literature search sessions that drill down deep into specific themes, mapping findings into structured syntheses.
- **`validationService.ts`**: Core component for scientific assessment. Scans abstracts for methodology descriptions, potential cohorts, outcome disclosures, and indicators of bias.
- **`embeddingService.ts`**: Interface for calculating document embeddings for vector analyses.
- **`entailmentService.ts`**: Models textual relationships to trace whether claims extracted from literature logically support or contradict primary theories.
- **`storageService.ts`**: Abstracts client/server data persistence, coordinating local sync states and database pipelines.
- **`arxivService.ts` / `doajService.ts` / `rorService.ts`**: Specialized indexing conduits for DOAJ (Directory of Open Access Journals) and ROR (Research Organization Registry) to lookup publishers and institution registries.

---

### 3. Core UI Components (`/components`)

Modular, highly styled React components centered on information density, typography layout, responsive margins, and aesthetic interactive details.

- **`InitialSearchScreen.tsx`**: Distraction-free homepage featuring beautiful display typography, animated entry transitions, and clear search input.
- **`PaperDetails.tsx`**: High-information split-panel overlay. Houses the overview, bibliography generators, citation format converters, and toggles detailed metrics.
- **`KnowledgeGraphDisplay.tsx`**: Render visual clusters mapping related papers, foundational theories, and entity linkages on an interactive grid.
- **`PaperAnalysisDashboard.tsx`**: Render graphs illustrating publication count distributions, citation volumes, and co-authorship maps.
- **`DetailsPanel.tsx` / `ResultsDisplay.tsx`**: Organizes and displays tabular, paginated, and tagged listings of retrieved papers with color-coded access indicators.
- **`WorkspacePanel.tsx` / `ProjectWorkspace.tsx`**: Space for saving, comparing, categorizing, and synthesising notes on multi-paper projects.
- **`ConnectedPapersModal.tsx`**: Overlay showing citation lineage charts (upstream dependencies and downstream references).
- **`ChatPanel.tsx` / `PaperChat.tsx`**: Interface for chatting directly with individual documents, leveraging cached paper texts.
- **`BibliographyGenerator.tsx`**: Instant text citation formatter for APA, Harvard, MLA, and Chicago styles.
- **`icons/`**: A library of custom-built, React icon wrappers (`ArxivIcon.tsx`, `DoiIcon.tsx`, `OpenAccessIcon.tsx`, etc.) to keep layout aesthetics beautifully aligned and lightweight.

---

### 4. Utilities (`/utils`)

High-performance mathematical and search index operations optimized for running in the main render loops.

- **`bm25.ts`**: Client-side implementation of the BM25 probabilistic search model. Enables instant search filtering across hundreds of retrieved abstracts directly in the UI.
- **`embeddings.ts`**: Fast utility computations for vector similarities, cosine-distances, and clustering calculations.
- **`cache.ts`**: A robust, time-aware TTL caching interface preventing redundant heavy queries against academic servers.
- **`math.ts`**: Implements numerical formulas for statistical distributions, ranking calculations, and coordinate offsets for graph views.
- **`toon.ts`**: Graphic transitions assistance and animation physics definitions.

---

### 5. Browser Extension (`/extension`)

Companion browser runtime enabling users to scout paper information on top of everyday browsing without interrupting workflows.

- **`manifest.json`**: Describes injection protocols, safe host pattern rules, and scripts declarations.
- **`background.ts`**: Coordinates page message routing, syncs active sessions, and registers sidebar launchers.
- **`popup.tsx`**: A responsive sidebar popover displaying quick abstracts, finding open-access preprints, and offering one-click saves.
- **`content-scripts/arxiv.ts` / `google-scholar.ts`**: Custom runtime injections extending standard Google Scholar or arXiv rows with instant indicators (OA check, bias scanning, citation scores).
- **`lib/db.ts` / `unpaywall.ts` / `gemini.ts`**: Localized clients enabling the extension to operate fully autonomous lookups.

---

### 6. Relational Backend Microservices

Complementary modules that provide isolated environment execution pathways.

- **`📁 backend/`**: Secondary server environment specifying full TS routes and controllers.
- **`📁 agent-backend/`**: Purpose-built environment detailing agent routing tools and orchestration logic.
- **`📁 local_engine/`**: Local Python processes housing:
  - **`nanobots/ingestor.py` / `logician.py`**: Specialized parsers designed to ingest local datasets and execute inference computations.
  - **`knowledge_base/manual.json`**: Structured context files to seed local context.
