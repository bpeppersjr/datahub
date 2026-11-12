import assert from "node:assert/strict";
import test from "node:test";
import {
  nationalStateRegistrationLicenseSupplementalJurisdictionHttp as jurisdiction,
  nationalStateRegistrationLicenseSupplementalSummaryHttp as summary,
  nationalStateRegistrationLicenseSupplementalZipHttp as zip,
} from "./national-state-registration-license-supplemental-evidence-http.mjs";
async function call(
  handler,
  {
    method = "GET",
    query = "",
    headers = {},
    reader = async () => ({ ok: true }),
  } = {},
) {
  let result;
  const listeners = new Map(),
    request = {
      method,
      headers,
      once: (name, fn) => listeners.set(name, fn),
      removeListener: (name) => listeners.delete(name),
      resume() {},
    },
    response = {
      writableEnded: false,
      destroyed: false,
      setHeader() {},
      once: (name, fn) => listeners.set(`response:${name}`, fn),
      removeListener: (name) => listeners.delete(`response:${name}`),
    };
  await handler(
    request,
    response,
    new URL(`http://local/x${query}`),
    reader,
    (_response, status, value) => {
      result = { status, value };
    },
  );
  return result;
}
test("summary is empty-GET only and redacts failures", async () => {
  assert.deepEqual(await call(summary), { status: 200, value: { ok: true } });
  for (const options of [
    { method: "POST" },
    { query: "?x=1" },
    { headers: { "content-length": "1" } },
  ])
    assert.equal((await call(summary, options)).status, 400);
  assert.equal(
    (
      await call(summary, {
        reader: async () => {
          throw Error("C:\\private");
        },
      })
    ).status,
    503,
  );
});
test("ZIP requires one exact ZIP and redacts failures", async () => {
  let seen;
  await call(zip, {
    query: "?zip=98101",
    reader: async (input) => ((seen = input), { ok: true }),
  });
  assert.equal(seen.zip5, "98101");
  for (const query of [
    "",
    "?zip=9810",
    "?zip=98101&zip=98102",
    "?zip=98101&x=1",
  ])
    assert.equal((await call(zip, { query })).status, 400);
  assert.deepEqual(
    await call(zip, {
      query: "?zip=98101",
      reader: async () => {
        throw Error("secret");
      },
    }),
    {
      status: 503,
      value: {
        error:
          "State registration/license supplemental ZIP evidence is unavailable or incompatible.",
      },
    },
  );
});
test("jurisdiction accepts one governed selector and redacts failures", async () => {
  let seen;
  await call(jurisdiction, {
    query: "?state=WA",
    reader: async (input) => ((seen = input), { ok: true }),
  });
  assert.equal(seen.state, "WA");
  await call(jurisdiction, {
    query: "?scope=multi-state-material",
    reader: async (input) => ((seen = input), { ok: true }),
  });
  assert.equal(seen.scopeId, "multi-state-material");
  for (const query of [
    "",
    "?state=wa",
    "?state=WA&scope=state%3A53",
    "?scope=unknown",
    "?scope=state%3A53&x=1",
  ])
    assert.equal((await call(jurisdiction, { query })).status, 400);
  assert.equal(
    (
      await call(jurisdiction, {
        query: "?state=WA",
        reader: async () => {
          throw Error("secret");
        },
      })
    ).status,
    503,
  );
});
