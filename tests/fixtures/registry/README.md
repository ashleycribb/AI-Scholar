# Recorded registry responses

Unmodified JSON responses, recorded 2026-11-15T04:01Z (UTC), used by `services/roundTrip.test.ts` so the
round-trip test runs offline on real registry data:

| File | Request |
|---|---|
| `openalex-<doi>.json` | `GET https://api.openalex.org/works/doi:<doi>` |
| `crossref-<doi>.json` | `GET https://api.crossref.org/works/<doi>` |

DOIs (with `/` written as `_` in file names):

- `10.1162/neco.1997.9.8.1735` — Hochreiter & Schmidhuber, *Long Short-Term Memory* (accented name: Jürgen)
- `10.4992/pacjpa.87.0_ss-039` — 山田 祐樹 et al., 深層学習と心理学 (CJK names and title)
- `10.1038/nmeth.1701` — Petersen, Brunak et al., *SignalP 4.0* (accented name: Søren)
