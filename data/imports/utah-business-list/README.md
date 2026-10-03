# Utah Business List offline packages

Place an explicitly obtained package at `data/imports/utah-business-list/packages/<package-id>/`. Co*Tive does not purchase, download, discover, or query the source.

The package has exactly `selection.json`, the original delivered `original.xlsx`, and operator-derived `BUSENTITY.jsonl`, `BUSINFO.jsonl`, and `PRINCIPAL.jsonl`. Each JSONL row uses the exact published columns from the official [three-sheet example](https://secure.utah.gov/datarequest/businesses/listExample.html). Convert the three workbook sheets to LF-terminated UTF-8 JSONL without changing headings or values, then bind the original workbook plus every derived file by byte size and SHA-256 in `selection.json`. The selection must name the transformation version, method, and operator and must declare that the JSONL is not source-native and its extraction is not reproducibly verified.

Inspection validates all three derived sheet contracts and Entity ID joins, but emits only a person-free projection of `BUSENTITY`. `Applicant Name`, all `BUSINFO` content, and every `PRINCIPAL` field are excluded. The original workbook is retained and hash-bound but is not parsed by this workflow, so neither source authenticity nor extraction reproducibility is verified. Output is explicitly operator-derived and is ineligible for admission until both are verified. Addresses are administrative registration evidence—not physical operating sites. ZIP5 and ZIP4 are separate. Registration status is not proof of current operation. Inspection writes no release or pointer and performs no national admission.

Run `node scripts/inspect-utah-business-list-package.mjs data/imports/utah-business-list/packages/<package-id>`.
