function normalizeEvent(e, provider='external'){
  return {provider,external_id:e.id??e.event_id??e.external_id??null,currency:e.currency??e.country??e.ccy??null,title:e.title??e.name??e.event??'Economic event',impact:String(e.impact??e.importance??'MEDIUM').toUpperCase(),event_time:e.event_time??e.date??e.datetime??e.time??null,actual:e.actual??null,forecast:e.forecast??e.consensus??null,previous:e.previous??null,raw_json:e};
}
export async function fetchEconomicCalendar(query={}){
  if(!process.env.ECONOMIC_CALENDAR_URL) return {mode:'demo',events:[],message:'Economic Calendar provider is not connected yet. Configure ECONOMIC_CALENDAR_URL and ECONOMIC_CALENDAR_API_KEY.'};
  const url=new URL(process.env.ECONOMIC_CALENDAR_URL); Object.entries(query).forEach(([k,v])=>{if(v)url.searchParams.set(k,v)});
  const headers={'accept':'application/json'}; if(process.env.ECONOMIC_CALENDAR_API_KEY) headers.authorization=`Bearer ${process.env.ECONOMIC_CALENDAR_API_KEY}`;
  const r=await fetch(url,{headers}); if(!r.ok)throw new Error(`Economic calendar provider error ${r.status}`);
  const j=await r.json(); const list=Array.isArray(j)?j:(j.events||j.data||[]);
  return {mode:'live',events:list.map(x=>normalizeEvent(x,process.env.ECONOMIC_CALENDAR_PROVIDER||'external'))};
}
