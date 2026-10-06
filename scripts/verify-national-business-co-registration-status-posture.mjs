import { verifyNationalBusinessCoRegistrationStatusPosture } from "../runner/national-business-co-registration-status-posture.mjs";
try { const value = await verifyNationalBusinessCoRegistrationStatusPosture(); process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
