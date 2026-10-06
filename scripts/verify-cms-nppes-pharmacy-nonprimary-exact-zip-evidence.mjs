import { verifyCmsNppesPharmacyNonprimaryExactZipAdmission as verify } from "../runner/cms-nppes-pharmacy-nonprimary-exact-zip-evidence.mjs";
if (process.argv.length !== 2)
  throw Error("This verifier accepts no source or output overrides.");
const c = new AbortController();
for (const s of ["SIGINT", "SIGTERM"]) process.once(s, () => c.abort());
const r = await verify({ signal: c.signal });
console.log(
  JSON.stringify(
    {
      status: r.status,
      dimension_id: r.dimension_id,
      summary: r.summary,
      claims: r.claims,
    },
    null,
    2,
  ),
);
