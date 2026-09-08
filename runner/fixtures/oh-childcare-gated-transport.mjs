import { ohioPreflightUrl } from "../oh-childcare-preflight.mjs";
import { ohioPayload } from "./oh-childcare.mjs";
import { evidence } from "./oh-childcare-acquisition.mjs";
import notices from "./oh-childcare-publisher-notices.json" with { type: "json" };
import bodies from "./oh-childcare-availability.json" with { type: "json" };

export async function gatedTransport(change = () => {}) {
  const source = await evidence(), calls = [];
  return { calls, options: {
    now: () => new Date("2026-09-08T07:05:00.000Z"),
    sleep: async (_ms, { signal } = {}) => { signal?.throwIfAborted(); },
    fetchImpl: async (url, options) => {
      calls.push(url); const notice = bodies.find((value) => value.url === url);
      const kind = notice ? "notice" : ["layer", "item", "statuses", "centers", "selected"].find((k) => ohioPreflightUrl(k) === url);
      let payload;
      if (kind && kind !== "notice") {
        payload = ohioPayload(kind);
        if (kind === "item") Object.assign(payload, notices);
        if (kind === "selected") payload.count = 3;
        if (kind === "centers") payload.count = 110;
        if (kind === "statuses") payload.features[2].attributes.source_count = 3;
      } else if (!notice) payload = structuredClone(source.observations.find((value) => value.url === url).payload);
      const override = await change({ url, kind, payload, options, call: calls.length });
      return override ?? (notice ? new Response(Buffer.from(notice.body_base64, "base64"), { status: notice.http_status }) : Response.json(payload));
    },
  } };
}
