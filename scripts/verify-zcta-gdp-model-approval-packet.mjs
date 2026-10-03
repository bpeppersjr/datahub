import fs from "node:fs/promises";
import { verifyZctaGdpModelApprovalPacket } from "../runner/zcta-gdp-model-approval-packet.mjs";
const registration = JSON.parse(await fs.readFile("config/datasets/zcta-gdp-model-approval-packet.json"));
console.log(JSON.stringify(await verifyZctaGdpModelApprovalPacket(registration.retained_release.manifest), null, 2));
