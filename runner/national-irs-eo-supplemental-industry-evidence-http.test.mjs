import assert from "node:assert/strict";
import test from "node:test";
import {
  nationalIrsEoSupplementalIndustryJurisdictionHttp as jurisdiction,
  nationalIrsEoSupplementalIndustrySummaryHttp as summary,
  nationalIrsEoSupplementalIndustryZipHttp as zip,
} from "./national-irs-eo-supplemental-industry-evidence-http.mjs";

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
  assert.deepEqual(
    await call(summary, {
      reader: async () => {
        throw Error("C:\\private");
      },
    }),
    {
      status: 503,
      value: {
        error:
          "IRS EO supplemental industry summary is unavailable or incompatible.",
      },
    },
  );
});

test("ZIP requires one exact ZIP and redacts failures", async () => {
  let seen;
  assert.deepEqual(
    await call(zip, {
      query: "?zip=55001",
      reader: async (input) => ((seen = input), { ok: true }),
    }),
    { status: 200, value: { ok: true } },
  );
  assert.equal(seen.zip5, "55001");
  for (const query of [
    "",
    "?zip=501",
    "?zip=55001&zip=55002",
    "?zip=55001&x=1",
  ])
    assert.equal((await call(zip, { query })).status, 400);
  assert.equal(
    (
      await call(zip, {
        query: "?zip=55001",
        reader: async () => {
          throw Error("secret");
        },
      })
    ).status,
    503,
  );
});

test("jurisdiction accepts exactly one governed selector and redacts failures", async () => {
  let seen;
  await call(jurisdiction, {
    query: "?state=MN",
    reader: async (input) => ((seen = input), { ok: true }),
  });
  assert.equal(seen.state, "MN");
  await call(jurisdiction, {
    query: "?scope=territory%3A72",
    reader: async (input) => ((seen = input), { ok: true }),
  });
  assert.equal(seen.scopeId, "territory:72");
  for (const query of [
    "",
    "?state=mn",
    "?state=MN&scope=state%3A27",
    "?scope=unknown",
    "?scope=state%3A27&x=1",
  ])
    assert.equal((await call(jurisdiction, { query })).status, 400);
  assert.deepEqual(
    await call(jurisdiction, {
      query: "?state=MN",
      reader: async () => {
        throw Error("C:\\secret");
      },
    }),
    {
      status: 503,
      value: {
        error:
          "IRS EO supplemental industry jurisdiction evidence is unavailable or incompatible.",
      },
    },
  );
});
