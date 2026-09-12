import path from 'node:path';
import {mkdir,mkdtemp,rm,readdir} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical} from './mn-construction-retained-selection.mjs';
import {projectMeDocument,meCheck} from './me-asc-preflight-contract.mjs';

export async function createMeOfflineParser(signal,{browserRoot=path.join(APP_ROOT,'.playwright-browsers')}={}){
 const base=path.join(APP_ROOT,'data/tmp/me-asc-parser');await canonical(base,{create:true,output:true,signal});const scratch=await mkdtemp(path.join(base,'run-'));
 let browser,context;
 try{
  signal?.throwIfAborted();const {chromium}=await import('playwright');
  const installations=(await readdir(browserRoot)).filter(name=>/^chromium-\d+$/.test(name));meCheck(installations.length===1);
  const executablePath=path.join(browserRoot,installations[0],'chrome-win64/chrome.exe');
  const artifactsDir=path.join(scratch,'artifacts');await mkdir(artifactsDir);
  context=await chromium.launchPersistentContext(path.join(scratch,'profile'),{executablePath,headless:true,artifactsDir,downloadsPath:scratch,tracesDir:scratch,env:{...process.env,TMP:scratch,TEMP:scratch,TMPDIR:scratch},args:['--disable-breakpad','--disable-crash-reporter'],timeout:10000,javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});
  browser=context.browser();await context.setOffline(true);await context.route('**/*',route=>route.abort());signal?.throwIfAborted();
  const page=await context.newPage();let closed=false;
  const abort=()=>{void context.close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  return {async parse(raw){
    signal?.throwIfAborted();meCheck(Buffer.isBuffer(raw)&&raw.length<=1048576);
    const html=new TextDecoder('utf-8',{fatal:true}).decode(raw);
    // No navigation, alternate base, embedded document or script execution is needed for form parsing.
    meCheck(!/<\s*(?:base|iframe|frame|object|embed)\b/i.test(html)&&!/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(html));
    await page.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; connect-src \'none\'; form-action \'none\'; frame-src \'none\'">'+html,{waitUntil:'domcontentloaded',timeout:5000});
    const projected=await page.evaluate(projectMeDocument);signal?.throwIfAborted();return projected;
  },async close(){if(closed)return;signal?.removeEventListener('abort',abort);try{await context.close();}finally{try{await browser.close();}finally{meCheck(path.dirname(scratch)===base);await rm(scratch,{recursive:true,force:true});}}closed=true;}};
 }catch{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});meCheck(path.dirname(scratch)===base);await rm(scratch,{recursive:true,force:true});throw Error('Maine offline parser unavailable.');}
}
