# Scholar Explorer data migrations

Every stored record carries a `schemaVersion`. Records are never edited in place (the local workspace log is
append-only), so older records are **upcast when read** by code that is versioned with the app. Code that meets a
version newer than it understands refuses to read it instead of guessing.

## Local workspace log (`IndexedDB scholar_explorer_local / workspace_events`)

Code: `services/localWorkspaceLog.ts` → `migrateWorkspaceRecords`.

### v1 → v2 (data fix 4: permanent work ids)

v1 (data fix 1) stored `paperId` as whatever id the search source used: OpenAlex `W…`, `crossref:<DOI>`,
`pubmed:<n>`, `arxiv:<id>`, and for Google Scholar, CORE, DOAJ, Europe PMC and others sometimes a random id.

v2 stores the permanent work id from `utils/workIds.ts`:

| Priority | Scheme | Normalized form | Work id |
|---|---|---|---|
| 1 | DOI | lower case, no `https://doi.org/` or `doi:` | `doi:10.7717/peerj.4375` |
| 2 | OpenAlex | `W` + digits, no URL | `openalex:W2741809807` |
| 3 | arXiv | `2101.00001` or `hep-th/9901001`, no version | `arxiv:2101.00001` |
| 4 | PubMed | digits | `pmid:29456894` |
| 5 | PubMed Central | `PMC` + digits | `pmcid:PMC5815332` |
| 6 | Source's own stable id | `core:…`, `eric:…`, `dblp:…`, `gs:…` | `core:123456` |
| 7 | Fingerprint | hash of NFC title + first author's surname + year | `fp:…` |

Upcast rules:

1. `queue.add`: the stored paper snapshot gets its work id and `aliases` (`withWorkId`). `paperId` becomes the work
   id; the v1 id is kept as `paper.sourceId`.
2. `queue.remove`, `paper.decision`, note records: `paperId` is mapped through the ids learned from the v1
   `queue.add` records. An id never seen in a `queue.add` is converted if it is itself a recognizable identifier
   (`W…`, `crossref:<DOI>`, `arxiv:…`, `pubmed:<n>`), and otherwise kept unchanged.
3. The upcast record has `schemaVersion: 2` and `migratedFrom: 1`. The stored v1 record is unchanged.

Two v1 queue entries for the same work (for example the Crossref and the OpenAlex copy) rebuild as one queue entry,
because they share a DOI alias.

### v2 → v3 (data fix 5: facts only)

v2 `queue.add` records saved the whole paper object as shown, including model output: match scores
(`semanticScore`, `keywordMatch`, `rawSemanticSimilarity`, …), `scoreExplanation`, `semanticHighlights`,
`laymanSummary`, `keyConcepts`, `knowledgeGraph`, validation results and UI flags.

v3 saves only the fields listed in `services/paperFacts.ts` (`PAPER_FACT_FIELDS`): ids and aliases, title, authors,
year, abstract, venue, links, citation counts, open-access and retraction flags, references and extracted structure.
A missing value is left out, never filled in (no default year or author).

Upcast rule: a v1/v2 `queue.add` paper is reduced to its facts with `paperFacts`; `migratedFrom` records the version
it was written with. Other record types are unchanged by this step.

Model output now lives in the derived cache (`IndexedDB scholar_explorer_derived / derived`,
`services/derivedCache.ts`). Each entry names its `model`, `modelRevision` (null when the provider does not pin
one), the SHA-256 `inputHash` of exactly what was sent to the model, and `createdAt`. The cache can be deleted at any
time; nothing in it is the researcher's data.

## Server copy (`PUT /xapi/activities/state`, state id `workspace`)

Since data fix 5 the document carries `schemaVersion: 1` and `queue` holds fact-only papers (same whitelist).

## Import (data fix 7)

`importExportBundle` (`services/importBundle.ts`) restores a full export into an **empty** profile only. It checks
the SHA-256 manifest, that every record has a UTC `recordedAt` and a unique `seq`, that every record's version and
type are known, and that `works.jsonl` lists exactly the queue that `events.jsonl` rebuilds. Records keep their
original `seq`, `recordedAt`, `schemaVersion` and `migratedFrom`; all text is stored NFC. Anything wrong: nothing is
written. Exporting again gives byte-identical files (`services/roundTrip.test.ts`).
