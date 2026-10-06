import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { GOVERNED_SOURCE_REFRESH_DESCRIPTORS, validateGovernedSourceRefreshDescriptor } from "./governed-source-refresh-registry.mjs";

export const AUTOMATIC_REFRESH_AUTHORIZATION_FILE = path.join(APP_ROOT, "config", "automatic-refresh-authorizations.json");
const allowedReasons = new Set(["AUTOMATIC_REFRESH_NOT_REVIEWED", "GOVERNED_SOURCE_HOLD", "MANUAL_SELECTION_REQUIRED"]);
const invalid = (message) => Object.assign(new Error(message), { code: "AUTOMATIC_REFRESH_AUTHORIZATION_INVALID", statusCode: 503 });

export async function loadAutomaticRefreshAuthorizations(config, { file = AUTOMATIC_REFRESH_AUTHORIZATION_FILE } = {}) {
  const resolved = assertInsideApp(path.resolve(APP_ROOT, file));
  let document;
  try { document = JSON.parse(await readFile(resolved, "utf8")); } catch { throw invalid("Automatic-refresh authorization contract is unavailable or malformed."); }
  if (!document || document.schema_version !== "automatic-refresh-authorizations@1.0.0" || !document.sources || Array.isArray(document.sources)
    || Object.keys(document).sort().join("|") !== "schema_version|sources") throw invalid("Automatic-refresh authorization contract has an unsupported schema.");
  const configured = Object.keys(config.sources).sort(), declared = Object.keys(document.sources).sort();
  if (configured.join("|") !== declared.join("|")) throw invalid("Automatic-refresh authorization contract does not exactly cover the industry source catalog.");
  const governedByScript = new Map(Object.entries(GOVERNED_SOURCE_REFRESH_DESCRIPTORS).map(([id, descriptor]) => [descriptor.builder, id]));
  const result = [];
  for (const sourceId of configured) {
    const source = config.sources[sourceId], decision = document.sources[sourceId];
    if (!decision || Object.keys(decision).sort().join("|") !== "authorized|governed_source_id|reason_code|script"
      || decision.script !== source.script || decision.authorized !== false || !allowedReasons.has(decision.reason_code)
      || (decision.governed_source_id !== null && typeof decision.governed_source_id !== "string")) throw invalid(`Automatic-refresh authorization is invalid for ${sourceId}.`);
    const governedSourceId = governedByScript.get(source.script) ?? null;
    if (decision.governed_source_id !== governedSourceId) throw invalid(`Automatic-refresh governed binding is invalid for ${sourceId}.`);
    if (governedSourceId) {
      const hold = await validateGovernedSourceRefreshDescriptor(governedSourceId);
      if (hold.status !== "HOLD" || hold.dispatchAvailable !== false || hold.autonomousAcquisitionAuthorized !== false
        || decision.reason_code !== "GOVERNED_SOURCE_HOLD") throw invalid(`Automatic-refresh HOLD binding is invalid for ${sourceId}.`);
    }
    if (source.manual_selection_required === true && decision.reason_code !== "MANUAL_SELECTION_REQUIRED") throw invalid(`Manual-only source ${sourceId} has an invalid automatic-refresh reason.`);
    result.push(Object.freeze({ sourceId, script: source.script, automaticRefreshAuthorized: false, reasonCode: decision.reason_code, governedSourceId }));
  }
  return Object.freeze(result);
}

export async function assertAutomaticRefreshAuthorized(config, plan, { loader = loadAutomaticRefreshAuthorizations } = {}) {
  const decisions = await loader(config);
  const byId = new Map(decisions.map((item) => [item.sourceId, item]));
  const blockers = [...new Set(plan.tasks.map((task) => byId.get(task.sourceId)).filter((item) => !item?.automaticRefreshAuthorized))];
  if (blockers.length) {
    const error = Object.assign(new Error(`Automatic refresh is not authorized for: ${blockers.map((item) => `${item.sourceId} (${item.reasonCode})`).join(", ")}.`), {
      code: "AUTOMATIC_REFRESH_NOT_AUTHORIZED", statusCode: 409, blockers,
    });
    throw error;
  }
  return decisions;
}
