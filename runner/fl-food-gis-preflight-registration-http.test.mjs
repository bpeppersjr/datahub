import assert from "node:assert/strict";
import test from "node:test";
import { flFoodGisPreflightRegistrationHttp as handle } from "./fl-food-gis-preflight-registration-http.mjs";

const call = async (method = "GET", query = "", headers = {}, reader = async () => ({ ok: true })) => {
  let result;
  await handle({ method, headers }, {}, new URL(`http://local/x${query}`), reader, (_response, status, value) => { result = { status, value }; });
  return result;
};

test("Florida retail prerequisite endpoint is strict, read-only and redacted", async () => {
  assert.deepEqual(await call(), { status: 200, value: { ok: true } });
  assert.equal((await call("POST")).status, 405);
  assert.equal((await call("GET", "?detail=1")).status, 400);
  assert.equal((await call("GET", "", { "content-length": "1" })).status, 400);
  assert.deepEqual(await call("GET", "", {}, async () => { throw Error("C:\\secret\\manifest.json"); }), { status: 503, value: { error: "Florida retail prerequisite status is unavailable." } });
});
