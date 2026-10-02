# Registered ZIP qualification reader and authenticated route

`runner/zip-evidence-qualification-reader.mjs` connects the bounded positional
index to the existing whitelisted qualification envelope. The fixed route is
`GET /api/business-map/zip-evidence-qualification?zip=00501&category=all`.
`category` is optional and defaults to `all`. No UI changes belong to this slice.
Implementation/testing used the supported Astra fallback, not Spark.

## Read boundary

The reader selects only `config/datasets/zip-active-evidence-index.json` and its
exact immutable manifest path, bytes and SHA-256. It reconciles registration
metadata, claims, artifact totals and ordered inventory digest; qualification
registration hash and source-release pins; and authored mapping identity/version.
The underlying bounded index lookup independently enforces the pinned authored
map and registered source chain. No directory discovery, newest-release fallback,
current-pointer selection, build or full-index verification occurs on request.

Before and after lookup, current coverage and registry pointers and manifests
must still match the qualification source's recorded release IDs, exact pointer
hashes and manifest hashes. A previously valid derivative is not silently treated
as compatible with a newer production release. All bounded metadata reads are
rechecked after the requested source-shard reads. There is no request cache.

Missing registration returns `available:false/status:not-enrolled`; unreadable
registration returns `unavailable`; malformed/drifted registered release evidence
returns `corrupt-release`; current coverage/registry mismatch returns
`incompatible-bindings`. Unavailable results contain no release, counts or rows.
Cancellation propagates, not a fabricated empty result. Diagnostic exceptions and
local paths are never returned.

## Selection semantics and envelope

`all` retains every source row without summing overlapping units. Other accepted
categories filter exact authored `category_ids`; source labels are not joined or
guessed. The map's legacy `currently_in_zip_selector` flag is not a denial of
qualification support: mapped childcare and licensing evidence remain available.
A known category without mapped source support is `unsupported`; a supported
category/ZIP without rows is `absent`; explicit zero-valued source rows are still
`matched`. None means zero active businesses or universal ZIP coverage.

The envelope preserves source-defined observed counts, zero stale eligibility,
null unmeasured eligibility, reference dates/basis fields, source and release
identities, temporal policy version, coverage/registry bindings and taxonomy pins.
Export policy cannot be relaxed from internal to local review. Current operation
remains unverified, business/completeness denominators remain null, and units are
non-additive. The existing whitelist strips source metadata, paths, cookies,
arbitrary nested objects and unrecognized fields. Responses are capped at 256 KiB.

## HTTP lifecycle and security

The route is after the server's existing `prepare` and `authorize` boundary.
Its adapter callback explicitly invokes the same full Host/Origin/bearer guard;
it is not an unconditional authorization success. Allowed browser OPTIONS
preflight validates Host/Origin, requested GET and the authorization header,
performs zero data reads, and returns 204 without requiring a bearer token.
The actual GET still requires bearer authorization. Only empty GET is accepted. Repeated/unknown query fields,
unknown category IDs, malformed ZIP5, nonzero Content-Length and Transfer-Encoding
are rejected before the reader. ZIP+4 is not accepted or joined.

A fixed 30-second deadline aborts the reader and returns a redacted 503 to a
connected client, including when a reader resolves after abort. Disconnect and
pre-aborted/destroyed requests abort without a response. Listeners and timers are
removed, and the abort promise is observed even before the first read. Successes
use `Cache-Control: no-store`. No mutation, export, download, acquisition,
publication, enrollment or production pointer action is reachable from this route.

## Verification

Focused tests exercise exact all/category selection, absent/unsupported/zero
distinctions, restrictive policy, source identity, current pointer/manifest drift,
missing/corrupt registration, override rejection, redaction, deadline and
disconnect behavior. Real loopback fixture HTTP requests exercise disallowed
Host, Origin, bearer, methods and request bodies before any reader call; static
server assertions confirm placement and full-guard callback wiring.

`DATAHUB_TEST_ZIP_QUALIFICATION_READER=1` enables bounded installed reads only,
not a native index scan/build. This opt-in passed for ZIP 00501: all 29 retained
source rows and exactly four authored childcare source rows; false/null claims
were preserved. Default focused fixtures passed separately. No running desktop
was stopped, restarted or otherwise changed during these backend fixture and
read-only validations. Full repository/runtime verification is a later gate.
