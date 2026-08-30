# HUD-USPS ZIP-to-county connector

This connector acquires a complete selected-quarter **ZIP-to-county** response (`type=2`, `query=All`) from the official HUD USER USPS Crosswalk API. It preserves every county split and all four address ratios.

## Credential

Register for the USPS Crosswalk dataset in a HUD USER account, create a token, and provide it only through the environment or a local secret store:

```powershell
$env:HUD_USPS_API_TOKEN = "<token from HUD USER>"
npm run hud-usps:build -- --year 2026 --quarter 1
Remove-Item Env:HUD_USPS_API_TOKEN
```

The token is transmitted only in the `Authorization: Bearer` header. It is never placed in a URL, output, log, manifest, fixture, or configuration file. HTTP 401 and 403 responses produce redacted remediation messages.

Verify a published release with:

```powershell
npm run hud-usps:verify
```

## Semantics

- A ZIP in the file is recorded as `observed-in-quarterly-address-crosswalk`, not as proof of inclusion in the complete current USPS master list.
- All ZIP-to-county rows and residential, business, other, and total address ratios are retained.
- A primary county is supplied for convenient business allocation using the largest business ratio, falling back to total ratio. It does not replace the one-to-many crosswalk.
- The selected year and quarter are mandatory; the connector does not silently request “latest.”
- The source response is reconciled against the checksummed Census county index before publication.

HUD documents two important exclusions: PO Box-only ZIPs do not appear, and less than one percent of active ZIPs can be absent when their address records cannot be geocoded. Consequently, this source improves current ZIP evidence but cannot finish the “every valid ZIP” denominator by itself.

The connector has offline conformance coverage in [`runner/fixtures/hud-usps-zip-county-q1-2026.json`](../runner/fixtures/hud-usps-zip-county-q1-2026.json). A live release requires an authorized user token.
