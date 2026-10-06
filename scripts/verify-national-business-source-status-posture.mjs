import { verifyNationalBusinessSourceStatusPosture } from "../runner/national-business-source-status-posture.mjs";
try { const value = await verifyNationalBusinessSourceStatusPosture(); process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
