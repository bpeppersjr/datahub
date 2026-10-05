export async function stateExactZipEvidenceMapHttp(request,response,url,reader,json){
 if(request.method!=="GET"){json(response,405,{error:"Method not allowed."});return}
 if([...url.searchParams.keys()].some(key=>key!=="dimension")||url.searchParams.getAll("dimension").length!==1||!/^[a-z0-9_]+$/.test(url.searchParams.get("dimension")??"")){json(response,400,{error:"Supply exactly one valid source dimension ID."});return}
 try{json(response,200,await reader({dimensionId:url.searchParams.get("dimension")}))}
 catch(error){if(error?.message==="State exact-ZIP disposition rejected: dimension."){json(response,400,{error:"Unknown source dimension ID."});return}json(response,503,{error:"State exact-ZIP evidence map is unavailable."})}
}
