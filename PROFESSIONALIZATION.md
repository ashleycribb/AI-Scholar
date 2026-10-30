# Scholar Explorer: Production Research Service Baseline

Scholar Explorer is a literature-review workspace first. External AI agents are additional clients of the same research services, evidence graph, and traceability layer; they must not replace the student-facing web application.

## Research integrity baseline
- Preserve source identity (DOI, OpenAlex ID, PMID, arXiv ID, URL) and distinguish metadata from extracted evidence.
- Prefer the version of record when available; visibly flag retractions, corrections, preprints, and uncertain metadata.
- Never treat citation count as a proxy for truth or methodological quality.
- Store claim-to-evidence relationships as supports, contradicts, inconclusive, or contextual; preserve conflicting evidence.
- Require source locators/evidence notes for claim-level support when available.
- Record agent actions through the xAPI traceability profile without storing private chain-of-thought.
- Keep human and agent activity attributable and reviewable; preserve corrections instead of silently overwriting history.

## Production operations
- Set SCHOLAR_CONTACT_EMAIL to an institutional/service address. Do not hard-code personal addresses.
- Set OPENALEX_API_KEY when production usage requires it.
- Use caching, bounded concurrency, timeouts, and retry/backoff for scholarly APIs.
- Return partial federated results when one registry is unavailable and expose source health to users.
- Keep API secrets server-side. Never place institutional proxy credentials in browser storage or xAPI statements.
- Back up research_provenance.sqlite, sql_lrs.sqlite, and tensor_lrs.duckdb according to institutional retention policy.

## Agent contract
Agents should discover -> inspect -> verify -> extract atomic claims -> link evidence -> synthesize. A synthesis must be reconstructable from the provenance graph and scholarly identifiers.
