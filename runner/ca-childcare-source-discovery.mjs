import {createHash} from "node:crypto";
import {readFileSync, lstatSync} from "node:fs";
import path from "node:path";
import discovery from "../config/source-discoveries/ca-childcare-2026-10-07.json" with { type: "json" };
import {APP_ROOT} from "./paths.mjs";
const SHA=/^[a-f0-9]{64}$/;
const hash=value=>createHash("sha256").update(value).digest("hex");
function verifyReceipt(binding){
  if(!binding||typeof binding.manifest_path!=="string"||path.isAbsolute(binding.manifest_path)||!SHA.test(binding.manifest_sha256))throw Error("California childcare source discovery rejected.");
  const file=path.resolve(APP_ROOT,binding.manifest_path),relative=path.relative(APP_ROOT,file);
  if(!relative||relative.startsWith("..")||path.isAbsolute(relative))throw Error("California childcare source discovery rejected.");
  const stat=lstatSync(file),bytes=readFileSync(file),manifest=JSON.parse(bytes);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||hash(bytes)!==binding.manifest_sha256||manifest.claims?.production_admission!==false||manifest.claims?.current_pointer_written!==false)throw Error("California childcare source discovery rejected.");
}
export function readCaChildcareSourceDiscovery(){const migration=discovery.migration_evidence;if(discovery.state!=="CA"||discovery.industry!=="childcare"||discovery.observed_at!=="2026-11-11"||discovery.decision!=="official-source-migration-preflights-validated-reporting-not-enrolled"||discovery.official_sources.length!==4||discovery.access.supported_bulk_export_verified!==true||discovery.access.supported_api_verified!==true||discovery.access.record_acquisition_authorized!==false||discovery.scope.residential_provider_privacy_review_required!==true||discovery.scope.retained_application_evidence!=="reporting-contract-implemented-but-no-enrollment-binding-installed"||migration?.catalog_last_updated!=="2026-11-11"||migration.current_distribution!=="ArcGIS GeoService"||migration.arcgis_item_id!=="db31b0884a074cff9260facb3f2ade45"||migration.legacy_childcare_distributions_still_listed!==true||migration.provider_rows_acquired!==0||migration.receipts?.length!==3||new Set(migration.receipts.map(row=>row.evidence_class)).size!==3||discovery.claims.provider_rows_acquired!==0||discovery.claims.provider_reporting_enrolled!==false||discovery.claims.production_admission!==false)throw Error("California childcare source discovery rejected.");for(const binding of migration.receipts)verifyReceipt(binding);return structuredClone(discovery);}
