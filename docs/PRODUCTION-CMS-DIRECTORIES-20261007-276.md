# Production successor plan 276

Run `production-cms-directories-20261007-276` is a planning-only successor retaining the childcare registry, Minnesota credential registry, CMS hospital, and CMS nursing-home selections. Its immutable plan is `data/reconciliations/production-plans/production-cms-directories-20261007-276.json`, confirmation SHA-256 `b833a7918b5ba73d196c7310365a93238177b7c6ee37f71091fe78cf848c33e0`, and file SHA-256 `54ec5c23bae30094944b962b48cbf22e14a0bbc0f077a7c3dbcb3709cf8de6c5`.

The read-only preflight returned `READY`, revalidated all pins, retained `national-12g`, and found 75,460,657,152 available disk bytes against 13,309,329,011 required bytes. It described eight stages, zero acquisition stages, zero network stages, and no writes. This receipt does not authorize or execute production.

The administration maintenance backlog is now `state-access-maintenance-backlog@2.10.0` and reports thirty-four governed childcare source discoveries. Oklahoma exposes the official licensed-provider locator and monitoring summaries but no supported bulk/API contract. Oregon exposes a daily child-care safety portal; its quarterly licensing dashboard remains aggregate context and is not substituted for entity rows. Search automation, provider acquisition, production admission, and current-operation claims remain disabled, and no provider rows were acquired.

Focused Node tests passed 10/10. ESLint completed with zero errors and seven pre-existing warnings. Web and desktop production builds passed with the existing chunk-size warning. The required clean restart sequence passed: `stop-collector.bat`, desktop control-plane smoke, and `launch-datahub.bat`; exactly one listener was present on `127.0.0.1:4300`, and `/api/health` returned HTTP 200 with `{"ok":true}`.
