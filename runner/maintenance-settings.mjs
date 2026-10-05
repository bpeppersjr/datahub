import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./paths.mjs";
import { loadIndustryConfig } from "./industry-segments.mjs";

const SCHEMA = "industry-maintenance-selection@1.0.0";
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const title = (id) => id.split("-").map((part) => part === "care" ? "care" : part[0].toUpperCase() + part.slice(1)).join(" ");

export function validateMaintainedIndustries(value, allowedIds) {
  if (!Array.isArray(value)) throw Object.assign(new Error("maintainedIndustries must be an array."), { statusCode: 400 });
  if (new Set(value).size !== value.length) throw Object.assign(new Error("maintainedIndustries must not contain duplicates."), { statusCode: 400 });
  const allowed = new Set(allowedIds);
  if (value.some((id) => typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id) || !allowed.has(id))) throw Object.assign(new Error("maintainedIndustries contains an unsupported or case-invalid operational industry."), { statusCode: 400 });
  return [...value].sort();
}

export async function createIndustryMaintenanceStore({ file = path.join(DATA_DIR, "administration", "industry-maintenance.json"), configLoader = loadIndustryConfig, io = { mkdir, open, readFile, rename, unlink } } = {}) {
  let config, unavailable = null;
  try { config = await configLoader(); } catch (error) { unavailable = error; }
  const industryIds = Object.keys(config?.industries ?? {}).sort();
  const industries = industryIds.map((id) => ({ id, label: title(id) }));
  let state = { schema_version: SCHEMA, revision: 0, maintained_industries: [] };
  try {
    if (unavailable) throw unavailable;
    const parsed = JSON.parse(await io.readFile(file, "utf8"));
    if (!exactKeys(parsed, ["schema_version", "revision", "maintained_industries"]) || parsed.schema_version !== SCHEMA || !Number.isSafeInteger(parsed.revision) || parsed.revision < 0) throw new Error("Stored industry-maintenance settings have an invalid schema.");
    state = { ...parsed, maintained_industries: validateMaintainedIndustries(parsed.maintained_industries, industryIds) };
  } catch (error) { if (error.code !== "ENOENT") unavailable = error; }
  let writes = Promise.resolve();
  const view = () => {
    if (unavailable) throw Object.assign(new Error("Industry-maintenance settings are unavailable; inspect the retained file."), { statusCode: 503 });
    return { industries, maintainedIndustries: [...state.maintained_industries], revision: state.revision, semantics: "Local maintenance intent for operational config/industry-segments.json IDs only; not acquisition authorization, coverage evidence, production enrollment, or an instruction to dispatch work. Historical reporting evidence remains visible regardless of selection." };
  };
  return { view, update(input, expectedRevision) {
    const task = writes.then(async () => {
      if (unavailable) return view();
      if (!exactKeys(input, ["maintainedIndustries", "expectedRevision"]) || input.expectedRevision !== expectedRevision || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw Object.assign(new Error("A matching integer expectedRevision and no extra fields are required."), { statusCode: 400 });
      if (state.revision !== expectedRevision) throw Object.assign(new Error("Industry-maintenance settings changed; reload before saving."), { statusCode: 409 });
      const next = { schema_version: SCHEMA, revision: state.revision + 1, maintained_industries: validateMaintainedIndustries(input.maintainedIndustries, industryIds) };
      await io.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
      let handle;
      try {
        handle = await io.open(temporary, "wx");
        await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, "utf8");
        await handle.sync();
        await handle.close(); handle = null;
        await io.rename(temporary, file);
        state = next;
        return view();
      } catch (error) {
        await handle?.close().catch(() => {});
        await io.unlink(temporary).catch(() => {});
        throw error;
      }
    });
    writes = task.catch(() => {});
    return task;
  } };
}
