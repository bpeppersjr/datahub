import { publishZctaGdpModelApprovalPacket } from "../runner/zcta-gdp-model-approval-packet.mjs";
console.log(JSON.stringify(await publishZctaGdpModelApprovalPacket(), null, 2));
