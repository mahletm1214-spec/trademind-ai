function demoReview(payload){
  const missing=[];
  if(!payload.htf_bias) missing.push('HTF bias');
  if(!payload.draw_on_liquidity) missing.push('draw on liquidity');
  if(!payload.liquidity_sweep) missing.push('liquidity sweep');
  if(!payload.structure) missing.push('MSS/CHOCH/BOS');
  if(!payload.pd_array) missing.push('PD Array');
  if(!payload.invalidation) missing.push('invalidation');
  const score=Math.max(0,100-missing.length*12);
  return {mode:'demo',review:{process_score:score,model_adherence:payload.ict_model?80:null,risk_discipline:payload.risk_pct!=null?(Number(payload.risk_pct)<=2?90:45):null,summary:missing.length?`Structured review found ${missing.length} missing confirmation item(s).`:'Structured checklist is complete enough for a post-review.',missing_confirmations:missing,recurring_leaks:[]}};
}

function extractJson(text){
  try{return JSON.parse(text)}catch{}
  const match=String(text||'').match(/\{[\s\S]*\}/); if(match) try{return JSON.parse(match[0])}catch{}
  return {summary:String(text||'').slice(0,4000),missing_confirmations:[],recurring_leaks:[]};
}

export async function aiReview(payload){
  if(!process.env.AI_API_KEY) return demoReview(payload);
  const provider=process.env.AI_PROVIDER||'openai';
  if(provider==='openai'){
    const base=process.env.AI_API_URL||'https://api.openai.com/v1/responses';
    const input=`You are TradeMind AI, an ICT trading journal performance coach. Analyze only the supplied journal data. Do not give live trade signals, price predictions, entries, or execution instructions. Return JSON with process_score (0-100), model_adherence (0-100 or null), risk_discipline (0-100 or null), summary, missing_confirmations (array), recurring_leaks (array), next_review_focus (array).\n\nDATA:\n${JSON.stringify(payload)}`;
    const body={model:process.env.AI_MODEL||'gpt-5.6-luna',input,temperature:0.2,text:{format:{type:'json_object'}}};
    const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.AI_API_KEY}`},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`AI provider error ${r.status}`);
    const j=await r.json();
    const text=j.output_text || j.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('') || j.choices?.[0]?.message?.content || '';
    return {mode:'live',provider,review:extractJson(text)};
  }
  if(process.env.AI_API_URL){
    const r=await fetch(process.env.AI_API_URL,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.AI_API_KEY}`},body:JSON.stringify(payload)});
    if(!r.ok) throw new Error(`AI provider error ${r.status}`);
    return {mode:'live',provider,review:await r.json()};
  }
  throw new Error('Unsupported AI provider. Set AI_PROVIDER and AI_API_URL.');
}
