// Test-only Node preload; production app entry points never import this module.
import { gatedTransport } from "./oh-childcare-gated-transport.mjs";
if (process.env.OH_CHILDCARE_FIXTURE_PRELOAD === "1") {
  const fixture = await gatedTransport();
  globalThis.fetch = fixture.options.fetchImpl;
}
