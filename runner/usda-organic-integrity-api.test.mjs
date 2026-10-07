import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import test from "node:test";

import {
  inspectUsdaOrganicIntegrityApiArchive,
  requestUsdaOrganicIntegrityApiArchive,
  USDA_INTEGRITY_API_ACKNOWLEDGEMENT,
} from "./usda-organic-integrity-api.mjs";

function storedZip(parts) {
  const local = [], central = []; let offset = 0;
  for (const [name, content] of parts) {
    const n = Buffer.from(name), data = Buffer.from(content), checksum = crc32(data), l = Buffer.alloc(30 + n.length), c = Buffer.alloc(46 + n.length);
    l.writeUInt32LE(0x04034b50,0); l.writeUInt16LE(20,4); l.writeUInt16LE(0x0800,6); l.writeUInt32LE(checksum,14); l.writeUInt32LE(data.length,18); l.writeUInt32LE(data.length,22); l.writeUInt16LE(n.length,26); n.copy(l,30);
    c.writeUInt32LE(0x02014b50,0); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt16LE(0x0800,8); c.writeUInt32LE(checksum,16); c.writeUInt32LE(data.length,20); c.writeUInt32LE(data.length,24); c.writeUInt16LE(n.length,28); c.writeUInt32LE(offset,42); n.copy(c,46);
    local.push(l,data); central.push(c); offset += l.length + data.length;
  }
  const directory=Buffer.concat(central), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(parts.length,8); end.writeUInt16LE(parts.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}

const archive = storedZip([["operations.xml", "<?xml version=\"1.0\"?><operations><operation id=\"1\"/></operations>"]]);

test("credential-gated all-operations request retains no key and validates the bounded XML archive", async () => {
  const calls=[];
  const result=await requestUsdaOrganicIntegrityApiArchive({apiKey:"fixture_key_123",acknowledgement:USDA_INTEGRITY_API_ACKNOWLEDGEMENT,fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return new Response(archive,{status:200,headers:{"content-type":"application/zip","content-length":String(archive.length)}})}});
  assert.equal(calls.length,1); assert.match(calls[0].url,/GetAllOperationsPublicData\?api_key=fixture_key_123$/); assert.equal(calls[0].options.redirect,"error");
  assert.equal(result.receipt.archive.entry_count,1); assert.equal(result.receipt.request_count,1); assert.equal(result.receipt.credential_reference,"DATA_GOV_API_KEY"); assert.equal(result.receipt.credential_value_retained,false); assert.equal(result.receipt.production_admission,false);
  assert.equal(JSON.stringify(result.receipt).includes("fixture_key_123"),false);
});

test("default denial and malformed responses make no unsafe success claim",async()=>{
  let calls=0; const fetchImpl=async()=>{calls++;return new Response(archive,{headers:{"content-type":"application/zip"}})};
  await assert.rejects(requestUsdaOrganicIntegrityApiArchive({apiKey:"fixture_key_123",fetchImpl}),/acknowledgement/); assert.equal(calls,0);
  await assert.rejects(requestUsdaOrganicIntegrityApiArchive({apiKey:"short",acknowledgement:USDA_INTEGRITY_API_ACKNOWLEDGEMENT,fetchImpl}),/credential/); assert.equal(calls,0);
  await assert.rejects(requestUsdaOrganicIntegrityApiArchive({apiKey:"fixture_key_123",acknowledgement:USDA_INTEGRITY_API_ACKNOWLEDGEMENT,fetchImpl:async()=>new Response("no",{headers:{"content-type":"text/plain"}})}),/content type/);
  await assert.rejects(inspectUsdaOrganicIntegrityApiArchive(storedZip([["../escape.xml","<x/>"]])),/unsafe/);
  await assert.rejects(inspectUsdaOrganicIntegrityApiArchive(storedZip([["records.txt","text"]])),/non-XML/);
});

test("cancellation and response limits are enforced without credential disclosure",async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(requestUsdaOrganicIntegrityApiArchive({apiKey:"fixture_key_123",acknowledgement:USDA_INTEGRITY_API_ACKNOWLEDGEMENT,signal:controller.signal,fetchImpl:async()=>{throw Error("must not fetch")}}),{name:"AbortError"});
  let cancelled=false;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(32));},cancel(){cancelled=true;}});
  await assert.rejects(requestUsdaOrganicIntegrityApiArchive({apiKey:"fixture_key_123",acknowledgement:USDA_INTEGRITY_API_ACKNOWLEDGEMENT,maximumArchiveBytes:16,fetchImpl:async()=>new Response(body,{headers:{"content-type":"application/zip"}})}),/byte limit/);assert.equal(cancelled,true);
});
