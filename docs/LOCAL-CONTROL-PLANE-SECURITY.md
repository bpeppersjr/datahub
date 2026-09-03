# Local control-plane security

Co*Tive Collector's runner is a loopback-only authenticated control plane. Its bearer token is a per-launch capability: it is generated in memory, is not printed, and is not written to job, run, log, manifest, or artifact files.

## Desktop launch

The Electron main process creates a 256-bit token, passes it only to the runner child process, and makes the loopback runner URL and token available to the sandboxed renderer through one minimal sender-checked preload IPC method. The renderer attaches the token to each runner request. Record downloads and benchmark-label downloads use authenticated fetches rather than unauthenticated direct runner links.

The desktop never sends its token to a pre-existing listener. It refuses to start when port 4300 is occupied, waits for its own runner child to announce readiness over the parent-child IPC channel, and only then makes an authenticated readiness request. The renderer is loaded only after that proof succeeds. Top-level navigation and token IPC are restricted to the exact bundled application document and its main frame.

## Browser development

Use the coordinated launcher:

```powershell
npm run dev:web
```

It creates a fresh token and starts the UI and runner with the same in-memory environment. The token is injected into the local development bundle for that one session. Stop and restart the complete command together; do not start `dev:ui` separately and expect it to authenticate to an unrelated runner.

The supervisor launches the two Node services directly, stops the peer if either service fails, and waits for both processes to exit during coordinated shutdown. This avoids leaving an npm-wrapper descendant listening after the launcher has stopped.

For a deliberate service-only integration, set a random value of at least 32 bytes in `DATAHUB_CONTROL_TOKEN` before starting `npm run runner`, and send it as `Authorization: Bearer <token>`. Keep that value out of `.env`, source files, command output, screenshots, job JSON, and logs. A runner started without a supplied token generates an undisclosed one, leaving only liveness usable to external callers.

`DATAHUB_ALLOWED_ORIGINS` can contain a comma-separated exact-origin allowlist. The coordinated launcher sets it to its exact `localhost` and `127.0.0.1` development origins. Wildcards and arbitrary localhost ports are not accepted.

## Request boundary

The only unauthenticated route is:

- `GET /api/health`, which returns only `{ "ok": true }`.

`GET /api/status` and every configuration, job, run, output, dataset, map, benchmark, label, activity, and settings route require the bearer token. Before routing, the server also:

- refuses non-loopback listener configuration;
- validates the `Host` header against the exact runner port to resist local DNS rebinding;
- accepts only configured exact origins;
- validates preflight origins and permits the `Authorization` header; and
- applies `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.

Authorization failures are generic and never echo the configured token. Authentication protects the local control surface; it does not relax connector host allowlists, source policies, export restrictions, secret handling, or the rule that all runtime artifacts remain inside `datahub`.

The automated Electron security smoke currently exercises the compiled desktop renderer through source-mode Electron. A packaged-artifact smoke remains a release-proof item once an installer/package target is added; packaged app, preload, runner, and resource paths are not yet covered by automation.
