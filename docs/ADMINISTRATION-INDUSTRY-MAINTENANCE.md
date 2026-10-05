# Administration industry-maintenance selection

The Administration workspace stores an operator's local maintenance intent for the exact operational segment IDs in `config/industry-segments.json`. It does not alter the separate reporting-evidence taxonomy.

State is retained at `data/administration/industry-maintenance.json` with schema `industry-maintenance-selection@1.0.0`, a monotonic revision, and a sorted industry selection. Writes require both `If-Match` and the same `expectedRevision`; they are serialized and use an exclusive temporary file, file sync, and atomic rename. Memory changes only after the rename succeeds. A malformed retained file makes only this administration endpoint unavailable with HTTP 503; map, status, jobs, and evidence remain available.

Selection does not authorize or dispatch acquisition, enable a connector, schedule refreshes, change production enrollment, mutate jobs/runs, or change historical coverage. Reporting evidence remains visible whether or not its corresponding operational segment is selected.

The Industry Summary displays this operational maintenance intent in a separate section beside, not merged into, reporting/map evidence categories. The Collection planner reads the persisted selection once as its initial explicit multi-industry selection. It does not preview, queue, start, or schedule work automatically. An empty selection remains empty and disables collection preview/start until the operator explicitly selects at least one operational industry. Manual-only and unauthorized sources retain their existing gates.

The once-only planning default fails closed: if the maintenance preference cannot be read during initial Collection loading, no industries are selected. The three-second operations polling loop does not retry that preference or overwrite later operator edits; re-entering/reloading the Collection workspace obtains a fresh persisted default.

## Geography and evidence boundary

Census ZCTAs remain usable statistical map geography without a complete USPS operational ZIP denominator or USPS polygon product. Exact source-reported ZIP5 evidence without a same-code ZCTA remains visible as non-ZCTA ZIP evidence. When no governed retained state or finer geography exists, the application reports state and cardinal/central grouping as unresolved; it does not infer a location from the ZIP digits.

Park, Native, private, or other special-area categories are displayed only if a governed retained overlay supports them. The current ZIP inspector has no such overlay and therefore reports that classification as unresolved. No residual polygons or acreage are invented.

Industry status describes retained dataset evidence. It does not require or imply a complete all-business denominator, complete geocoding, current-operation proof, or nationwide industry completeness. Unknown and unmeasured cells remain distinct from measured zero.
