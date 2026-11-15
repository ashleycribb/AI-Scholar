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
