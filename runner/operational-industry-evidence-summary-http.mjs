const STATES=new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"]);
export async function operationalIndustryEvidenceSummaryHttp(request,response,url,reader,json){
 if(request.method!=="GET"){json(response,405,{error:"Method not allowed."});return}
 if(Number(request.headers?.["content-length"]??0)>0||[...url.searchParams.keys()].some(key=>key!=="state")||url.searchParams.getAll("state").length!==1||!STATES.has(url.searchParams.get("state"))){json(response,400,{error:"Supply exactly one 50-state or D.C. postal abbreviation on an empty GET."});return}
 try{json(response,200,await reader({state:url.searchParams.get("state")}))}catch{json(response,503,{error:"Operational industry evidence is unavailable or incompatible."})}
}
