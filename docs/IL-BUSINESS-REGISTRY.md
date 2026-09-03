# Illinois Business Registry offline connector

The `il-business-registry` connector is an implemented, offline-only ingestion path for the Illinois Secretary of State corporation and LLC bulk-data files. It publishes organization-level registration evidence for selected Goodstanding or Reinstated records. It does not scrape, crawl, query, or download from the Illinois SOS website.

No production release exists yet. The dataset remains `implemented-offline-awaiting-operator-supplied-official-files`, every generated artifact is `local-review-only`, and the national registry does not depend on it.

## Required input set

Supply all five official files from one daily run:

| Input | Source layout | Width | Persisted fields |
|---|---|---:|---|
| Corporation Master | `corporation_master` | 160 | file number, dates, jurisdiction/intent, status, entity type |
| Corporation Company Name | `corporation_name` | 197 | file number, legal name |
| Corporation Annual Report | `corporation_annual` | 126 | file number, current report run date, current paid date |
| LLC Master | `llc_master` | 136 | file number, status/dates/type codes, records-office address, source flags |
| LLC Name | `llc_name` | 128 | file number, legal name |

Each argument may point to an extracted fixed-width file or to one ZIP containing exactly one regular file. Resolved real paths must remain inside the datahub folder. ZIP members with nested paths, traversal names, multiple files, or excessive declared size are rejected.

The connector requires the official `RUN DATE = CCYYMMDD FILE:<name>` header, fixed-width data rows, and `END OF FILE RECORD COUNT=` trailer. All five run dates must match. Header/trailer counts, unique file numbers, and corporation master/name/annual and LLC master/name joins must reconcile exactly.

## Run

Place the official inputs under `downloads/illinois/` inside datahub, then run:

```powershell
npm run il-business:build
```

Override individual paths when the official filenames differ:

```powershell
npm run il-business:build -- `
  --corporation-master downloads/illinois/corp-master.zip `
  --corporation-name downloads/illinois/corp-name.zip `
  --corporation-annual downloads/illinois/corp-annual.zip `
  --llc-master downloads/illinois/llc-master.zip `
  --llc-name downloads/illinois/llc-name.zip
```

Verify a published local release with:

```powershell
npm run il-business:verify
```

The default quality floor is 500,000 selected organizations. Lowering it is available for controlled fixtures and source evaluation, but a real release should not be accepted without reconciling the observed counts to the source and current Illinois SOS expectations.

## Selection and semantics

- Corporations are selected only when the status code is `00` (Goodstanding) or `01` (Reinstated) and the documented type is `4` (domestic BCA), `5` (not-for-profit), or `6` (foreign BCA).
- LLCs are selected only when the status code is `00` or `01`.
- Entity kind plus the exact eight-digit SOS file number is a source-preserving provisional identity. The files describe a modified modulus-11 check digit but do not publish the algorithm, so the connector validates numeric syntax, uniqueness, and cross-file joins without claiming it recomputed the digit.
- Corporation annual-report run and paid dates are preserved. A mailed-but-unpaid combination is flagged as a possible NGS case, but the published rule's ambiguous month condition is deliberately not guessed.
- An LLC records-office address is administrative evidence, not a physical operating site. It may contribute to ZIP coverage only when street, city, recognized US state/territory code, and valid ZIP are present. ZIP5 and ZIP+4 remain separate fields.
- Corporation president and secretary regions are read past but never persisted. Agent, manager/member, assumed-name, stock, finance, and other person-linked datasets are outside this connector.

## Publication and verification

A successful run creates five privacy-minimized selected-source gzip artifacts, sixteen normalized organization partitions, a Census-ZBP-unioned ZIP coverage artifact, source summary, input/run metadata, and a manifest. The source release ID is bound to the common source run date and the ordered SHA-256 values of all five exact input files.

The independent verifier checks every artifact checksum and byte count, source artifact privacy fields and identities, normalized partition assignment, source status and provenance, separate postal fields, non-site semantics, ZIP totals, quality gates, and release identity before `current.json` is changed atomically.

## Source and use boundary

The implementation follows the Illinois SOS [Data Transparency page](https://www.ilsos.gov/data/bus-serv-home.html), [corporation layout specification](https://www.ilsos.gov/content/dam/data/bs/proc_corp_data.pdf), and [LLC layout specification](https://www.ilsos.gov/content/dam/data/bs/proc_llc_data.pdf), version 004 dated 2024-04-04. The landing page expressly prohibits automated queries, so this connector has no allowed hosts and makes zero network requests.

Before scheduled downloads or broader redistribution, obtain written Illinois SOS confirmation and complete a reuse review. Until then, manually supplied files and all derived outputs remain local-review-only.
