export async function zipInspectorHttp(request, response, url, view, json) {
  const keys = [...url.searchParams.keys()];
  const categories = url.searchParams.getAll("category");
  const category = categories[0] ?? "all";
  const headers=request.headers??{};
  if (request.method !== "GET" || keys.some((key) => key !== "zip" && key !== "category")
    || url.searchParams.getAll("zip").length !== 1 || categories.length > 1
    || !/^\d{5}$/.test(url.searchParams.get('zip')??'') || !/^[a-z][a-z0-9-]{1,79}$/.test(category)
    || headers['transfer-encoding']!==undefined || headers['content-length']!==undefined&&headers['content-length']!=='0') {
    response.setHeader?.('Connection','close');
    json(response, 400, { error: "ZIP inspector requires one exact ZIP option and at most one valid category." });
    return;
  }
  const controller = new AbortController();
  let clientGone=false,rejectAbort;
  const disconnected = () => { if (!response.writableEnded) {clientGone=true;controller.abort();} };
  const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('ZIP read aborted.'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});aborted.catch(()=>{});
  const timer=setTimeout(()=>controller.abort(),120000);
  request.once?.("aborted", disconnected);
  response.once?.("close", disconnected);
  try {
    if(request.aborted||response.destroyed)disconnected();controller.signal.throwIfAborted();request.resume?.();
    const result=await Promise.race([view({ zip: url.searchParams.get("zip"), categoryId: category, signal: controller.signal }),aborted]);controller.signal.throwIfAborted();
    if(Buffer.byteLength(JSON.stringify(result))>2_000_000)throw Error('ZIP response bound.');
    if(!response.writableEnded&&!response.destroyed){response.setHeader?.('Cache-Control','no-store');json(response,200,result);}
  } catch (error) {
    if (!clientGone && !response.destroyed && !response.writableEnded) json(response, error.statusCode === 400 ? 400 : 503, { error: error.statusCode === 400 ? error.message : "Selected ZIP evidence is unavailable or mismatched." });
  } finally {
    clearTimeout(timer);controller.signal.removeEventListener('abort',rejectAbort);
    request.removeListener?.("aborted", disconnected);
    response.removeListener?.("close", disconnected);
  }
}
