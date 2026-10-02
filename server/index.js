import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import crypto from 'node:crypto';
import { aiReview } from './services/ai.js';
import { fetchEconomicCalendar } from './services/economic-calendar.js';
import { hashPassword, verifyPassword, tokenHash, newToken, expiryDate, sessionDays } from './services/auth.js';
const { Pool } = pg;
const app=express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY==='true' ? 1 : false);
app.use(cors({origin:process.env.CORS_ORIGIN?.split(',').filter(Boolean)||true,credentials:true}));
app.use(express.json({limit:'1mb',strict:true}));
app.use((req,res,next)=>{
  const id=crypto.randomUUID(); req.requestId=id; res.setHeader('X-Request-ID',id);
  if(req.path.startsWith('/api/')) res.setHeader('Cache-Control','no-store');
  next();
});
app.use(express.static('public'));

const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined}):null;
const requireDb=(req,res,next)=>{if(!pool)return res.status(503).json({error:'DATABASE_URL is not configured'});next()};
async function currentUser(req){
  if(!pool)return null;
  const raw=req.headers.authorization||''; if(!raw.startsWith('Bearer '))return null;
  const token=raw.slice(7); if(!token)return null;
  const r=await pool.query(`select p.id,p.email,p.display_name,p.timezone,a.role from auth_sessions s join profiles p on p.id=s.user_id join auth_users a on a.id=p.id where s.token_hash=$1 and s.expires_at>now()`,[tokenHash(token)]);
  return r.rows[0]||null;
}
async function auth(req,res,next){try{const u=await currentUser(req);if(!u)return res.status(401).json({error:'Authentication required'});req.user=u;next()}catch(e){res.status(500).json({error:'Authentication check failed'})}}
function safeUser(u){return {id:u.id,email:u.email,display_name:u.display_name,timezone:u.timezone,role:u.role}};
app.get('/api/health', async(req,res)=>{let db='not-configured';if(pool){try{await pool.query('select 1');db='ok'}catch(e){db='error'}}res.json({ok:true,db,ai:!!process.env.AI_API_KEY,economicCalendar:!!process.env.ECONOMIC_CALENDAR_URL,auth:!!pool});});
app.get('/api/ready', async(req,res)=>{if(!pool)return res.status(503).json({ready:false,reason:'database_not_configured'});try{await pool.query('select 1');res.json({ready:true})}catch(e){res.status(503).json({ready:false,reason:'database_unavailable'})}});
app.post('/api/auth/register',requireDb,async(req,res)=>{try{const {email,password,display_name='ICT Trader',timezone='UTC'}=req.body||{};if(!email||!password||password.length<8)return res.status(400).json({error:'Email and password (8+ characters) are required'});const clean=String(email).trim().toLowerCase();const exists=await pool.query('select id from profiles where email=$1',[clean]);if(exists.rowCount)return res.status(409).json({error:'Email already registered'});const p=await pool.query('insert into profiles(email,display_name,timezone) values($1,$2,$3) returning *',[clean,display_name,timezone]);const hp=hashPassword(password);await pool.query('insert into auth_users(id,password_hash,password_salt) values($1,$2,$3)',[p.rows[0].id,hp.hash,hp.salt]);const token=newToken();const exp=expiryDate();await pool.query('insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,$3)',[p.rows[0].id,tokenHash(token),exp]);res.status(201).json({user:safeUser({...p.rows[0],role:'USER'}),token,expires_at:exp});}catch(e){res.status(500).json({error:'Registration failed'})}});
app.post('/api/auth/login',requireDb,async(req,res)=>{try{const {email,password}=req.body||{};const r=await pool.query(`select p.*,a.password_hash,a.password_salt,a.role from profiles p join auth_users a on a.id=p.id where p.email=$1`,[String(email||'').trim().toLowerCase()]);if(!r.rowCount||!verifyPassword(password||'',r.rows[0].password_hash,r.rows[0].password_salt))return res.status(401).json({error:'Invalid email or password'});const token=newToken(),exp=expiryDate();await pool.query('insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,$3)',[r.rows[0].id,tokenHash(token),exp]);await pool.query('update auth_users set last_login_at=now() where id=$1',[r.rows[0].id]);res.json({user:safeUser(r.rows[0]),token,expires_at:exp,session_days:sessionDays});}catch(e){res.status(500).json({error:'Login failed'})}});
app.post('/api/auth/logout',requireDb,async(req,res)=>{const raw=req.headers.authorization||'';if(raw.startsWith('Bearer '))await pool.query('delete from auth_sessions where token_hash=$1',[tokenHash(raw.slice(7))]);res.json({ok:true})});
app.get('/api/auth/me',requireDb,auth,(req,res)=>res.json({user:req.user}));
app.get('/api/trades',requireDb,auth,async(req,res)=>{const r=await pool.query('select * from trades where user_id=$1 order by created_at desc limit 200',[req.user.id]);res.json({data:r.rows});});
app.post('/api/trades',requireDb,auth,async(req,res)=>{const t=req.body||{};const r=await pool.query(`insert into trades(user_id,symbol,direction,entry,stop,target,outcome,ict_model,htf_bias,draw_on_liquidity,liquidity_sweep,structure,pd_array,kill_zone,notes,opened_at,risk_pct,invalidation,realized_r,pnl,closed_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) returning *`,[req.user.id,t.symbol||'ICT-SETUP',t.direction||'LONG',t.entry||null,t.stop||null,t.target||null,t.outcome||'PLANNED',t.ict_model||null,t.htf_bias||null,t.draw_on_liquidity||null,t.liquidity_sweep||null,t.structure||null,t.pd_array||null,t.kill_zone||null,t.notes||null,t.opened_at||new Date(),t.risk_pct||null,t.invalidation||null,t.realized_r!=null?Number(t.realized_r):null,t.pnl!=null?Number(t.pnl):null,t.closed_at||(['WIN','LOSS','BREAKEVEN'].includes(String(t.outcome||'').toUpperCase())?new Date():null)]);res.status(201).json(r.rows[0]);});

app.get('/api/goals',requireDb,auth,async(req,res)=>{const r=await pool.query('select * from goals where user_id=$1 order by status asc, deadline nulls last, created_at desc',[req.user.id]);res.json({data:r.rows});});
app.post('/api/goals',requireDb,auth,async(req,res)=>{try{const b=req.body||{};if(!String(b.title||'').trim())return res.status(400).json({error:'Goal title is required'});const r=await pool.query(`insert into goals(user_id,title,goal_type,target_value,current_value,unit,deadline,status,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[req.user.id,String(b.title).trim(),b.goal_type||'PROCESS',b.target_value??null,b.current_value??0,b.unit||'',b.deadline||null,b.status||'ACTIVE',b.notes||'']);res.status(201).json({data:r.rows[0]});}catch(e){res.status(500).json({error:'Goal save failed'})}});
app.patch('/api/goals/:id',requireDb,auth,async(req,res)=>{try{const b=req.body||{};const r=await pool.query(`update goals set title=coalesce($1,title),target_value=coalesce($2,target_value),current_value=coalesce($3,current_value),unit=coalesce($4,unit),deadline=coalesce($5,deadline),status=coalesce($6,status),notes=coalesce($7,notes),updated_at=now() where id=$8 and user_id=$9 returning *`,[b.title||null,b.target_value??null,b.current_value??null,b.unit||null,b.deadline||null,b.status||null,b.notes||null,req.params.id,req.user.id]);if(!r.rowCount)return res.status(404).json({error:'Goal not found'});res.json({data:r.rows[0]});}catch(e){res.status(500).json({error:'Goal update failed'})}});
app.get('/api/backtests',requireDb,auth,async(req,res)=>{const r=await pool.query('select * from backtests where user_id=$1 order by tested_at desc,created_at desc limit 100',[req.user.id]);res.json({data:r.rows});});
app.post('/api/backtests',requireDb,auth,async(req,res)=>{try{const b=req.body||{};const n=Math.max(0,Number(b.sample_size||0));const w=Math.max(0,Number(b.wins||0)),l=Math.max(0,Number(b.losses||0)),be=Math.max(0,Number(b.breakeven||0));const wr=(w+l)?w/(w+l)*100:null;const r=await pool.query(`insert into backtests(user_id,model,sample_size,wins,losses,breakeven,win_rate,total_r,avg_r,notes,tested_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[req.user.id,String(b.model||'Custom ICT Model'),n,w,l,be,wr,b.total_r!=null?Number(b.total_r):null,b.avg_r!=null?Number(b.avg_r):null,b.notes||'',b.tested_at||new Date()]);res.status(201).json({data:r.rows[0]});}catch(e){res.status(500).json({error:'Backtest save failed'})}});
app.get('/api/analytics/performance',requireDb,auth,async(req,res)=>{
  try{
    const days=Math.max(0,Math.min(Number(req.query.days||0),3650));
    const since=days?new Date(Date.now()-days*86400000):null;
    const params=[req.user.id];
    let where=`where user_id=$1 and outcome in ('WIN','LOSS','BREAKEVEN')`;
    if(since){params.push(since);where+=` and coalesce(closed_at,created_at)>=$2`;}
    const q=await pool.query(`select id,coalesce(closed_at,created_at) as trade_time,outcome,coalesce(realized_r,0)::float8 as r,coalesce(pnl,0)::float8 as pnl,coalesce(ict_model,'Unspecified') as model,coalesce(kill_zone,'Unspecified') as kill_zone,coalesce(direction,'Unspecified') as direction,coalesce(draw_on_liquidity,'Unspecified') as liquidity,coalesce(structure,'Unspecified') as structure from trades ${where} order by coalesce(closed_at,created_at) asc,created_at asc`,params);
    const rows=q.rows;
    let cumR=0,peak=0,maxDD=0,totalPnl=0, wins=0,losses=0,be=0;
    const equity=rows.map(x=>{const r=Number(x.r)||0;cumR+=r;totalPnl+=Number(x.pnl)||0;if(x.outcome==='WIN')wins++;if(x.outcome==='LOSS')losses++;if(x.outcome==='BREAKEVEN')be++;peak=Math.max(peak,cumR);const dd=cumR-peak;maxDD=Math.min(maxDD,dd);return {date:x.trade_time,r, pnl:Number(x.pnl)||0,cumulative_r:+cumR.toFixed(4),cumulative_pnl:+totalPnl.toFixed(2),drawdown_r:+dd.toFixed(4),outcome:x.outcome};});
    const decided=wins+losses; const positive=rows.filter(x=>Number(x.r)>0).reduce((a,x)=>a+Number(x.r),0); const negative=rows.filter(x=>Number(x.r)<0).reduce((a,x)=>a+Number(x.r),0);
    const avgR=rows.length?cumR/rows.length:0; const avgWin=wins?rows.filter(x=>x.outcome==='WIN').reduce((a,x)=>a+Number(x.r),0)/wins:0; const avgLoss=losses?rows.filter(x=>x.outcome==='LOSS').reduce((a,x)=>a+Number(x.r),0)/losses:0;
    const expectancy=rows.length?cumR/rows.length:0; const pf=negative<0?positive/Math.abs(negative):positive>0?null:0;
    async function breakdown(column){const q=await pool.query(`select coalesce(nullif(${column},''),'Unspecified') as label,count(*)::int trades,count(*) filter(where outcome='WIN')::int wins,count(*) filter(where outcome='LOSS')::int losses,round(coalesce(sum(realized_r),0),2)::float8 total_r,round(coalesce(avg(realized_r),0),2)::float8 avg_r from trades ${where} group by 1 order by trades desc,label`,params);return q.rows.map(x=>({...x,win_rate:(x.wins+x.losses)?+(x.wins/(x.wins+x.losses)*100).toFixed(1):0,expectancy:x.avg_r}));}
    res.json({data:{filters:{days},summary:{trades:rows.length,wins,losses,breakeven:be,win_rate:decided?+(wins/decided*100).toFixed(1):0,total_r:+cumR.toFixed(2),total_pnl:+totalPnl.toFixed(2),avg_r:+avgR.toFixed(2),expectancy:+expectancy.toFixed(2),profit_factor:pf===null?null:+pf.toFixed(2),avg_win:+avgWin.toFixed(2),avg_loss:+avgLoss.toFixed(2),max_drawdown_r:+maxDD.toFixed(2),current_r:+cumR.toFixed(2)},equity,breakdowns:{models:await breakdown('ict_model'),kill_zones:await breakdown('kill_zone'),directions:await breakdown('direction')}}});
  }catch(e){res.status(500).json({error:'Performance analytics failed'})}
});
// V32 production hardening: security headers and bounded auth rate guard.
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(),microphone=(),geolocation=()');res.setHeader('Cross-Origin-Resource-Policy','same-origin');next()});
const authAttempts=new Map();
setInterval(()=>{const cutoff=Date.now()-15*60*1000;for(const [k,v] of authAttempts)if(v.start<cutoff)authAttempts.delete(k)},5*60*1000).unref();
function authRateGuard(req,res,next){const key=(req.ip||'unknown')+'|'+String(req.body?.email||'').trim().toLowerCase();const now=Date.now(),win=15*60*1000;const a=authAttempts.get(key)||{start:now,count:0};if(now-a.start>win){a.start=now;a.count=0}a.count++;authAttempts.set(key,a);if(a.count>12)return res.status(429).json({error:'Too many authentication attempts. Try again later.'});next()}
app.use('/api/auth/login',authRateGuard);
app.use('/api/auth/register',authRateGuard);

app.get('/api/analytics',requireDb,auth,async(req,res)=>{const r=await pool.query(`select count(*)::int trades,count(*) filter(where outcome='WIN')::int wins,count(*) filter(where outcome='LOSS')::int losses,count(*) filter(where outcome='BREAKEVEN')::int breakeven,count(*) filter(where outcome in ('WIN','LOSS'))::int decided,round(case when count(*) filter(where outcome in ('WIN','LOSS'))>0 then (count(*) filter(where outcome='WIN')::numeric / count(*) filter(where outcome in ('WIN','LOSS'))::numeric)*100 else 0 end,1)::float win_rate,round(coalesce(avg(risk_pct),0),2)::float avg_risk,count(*) filter(where risk_pct is not null and risk_pct>2)::int oversized,count(*) filter(where htf_bias is null or htf_bias='')::int missing_bias from trades where user_id=$1`,[req.user.id]);const m=await pool.query(`select coalesce(ict_model,'Unspecified') model,count(*)::int trades,count(*) filter(where outcome='WIN')::int wins,count(*) filter(where outcome='LOSS')::int losses from trades where user_id=$1 group by 1 order by trades desc`,[req.user.id]);res.json({data:{summary:r.rows[0],models:m.rows}})});
app.post('/api/ai/review',auth,async(req,res)=>{try{const result=await aiReview({...req.body,user_id:req.user.id});if(pool&&result)await pool.query('insert into ai_reviews(user_id,trade_id,review_type,input_json,output_json) values($1,$2,$3,$4,$5)',[req.user.id,req.body.trade_id||null,req.body.review_type||'pre_trade',req.body,result]);res.json(result)}catch(e){res.status(502).json({error:e.message})}});
app.get('/api/economic-calendar',auth,async(req,res)=>{try{
  const result=await fetchEconomicCalendar(req.query);
  if(pool && result.mode==='live' && result.events.length){
    for(const e of result.events){
      if(!e.event_time) continue;
      await pool.query(`insert into economic_events(provider,external_id,currency,title,impact,event_time,actual,forecast,previous,raw_json) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(provider,external_id) do update set currency=excluded.currency,title=excluded.title,impact=excluded.impact,event_time=excluded.event_time,actual=excluded.actual,forecast=excluded.forecast,previous=excluded.previous,raw_json=excluded.raw_json`,[e.provider,e.external_id,e.currency,e.title,['LOW','MEDIUM','HIGH'].includes(e.impact)?e.impact:'MEDIUM',e.event_time,e.actual,e.forecast,e.previous,e.raw_json]);
    }
  }
  res.json(result);
}catch(e){res.status(502).json({error:e.message})}}); 
app.get('/api/economic-calendar/db',requireDb,auth,async(req,res)=>{const from=req.query.from||new Date(Date.now()-86400000).toISOString();const to=req.query.to||new Date(Date.now()+7*86400000).toISOString();const currency=req.query.currency;const q=currency?await pool.query('select * from economic_events where event_time between $1 and $2 and currency=$3 order by event_time',[from,to,currency]):await pool.query('select * from economic_events where event_time between $1 and $2 order by event_time',[from,to]);res.json({mode:'database',events:q.rows});});
app.get('/api/trades/:id',requireDb,auth,async(req,res)=>{const r=await pool.query('select * from trades where id=$1 and user_id=$2',[req.params.id,req.user.id]);if(!r.rowCount)return res.status(404).json({error:'Trade not found'});res.json(r.rows[0]);});
app.post('/api/trades/:id/ai-review',requireDb,auth,async(req,res)=>{try{const t=await pool.query('select * from trades where id=$1 and user_id=$2',[req.params.id,req.user.id]);if(!t.rowCount)return res.status(404).json({error:'Trade not found'});const eventQ=await pool.query('select * from economic_events where event_time between coalesce($1,now())-interval \'4 hours\' and coalesce($1,now())+interval \'4 hours\' order by abs(extract(epoch from (event_time-coalesce($1,now())))) limit 10',[t.rows[0].opened_at]);const result=await aiReview({...t.rows[0],economic_events:eventQ.rows});await pool.query('insert into ai_reviews(user_id,trade_id,review_type,input_json,output_json) values($1,$2,$3,$4,$5)',[req.user.id,req.params.id,'trade_post_review',{trade:t.rows[0],economic_events:eventQ.rows},result]);res.json(result);}catch(e){res.status(502).json({error:e.message})}});
app.get('/api/reports/summary',requireDb,auth,async(req,res)=>{
  try{
    const days=Math.max(0,Math.min(Number(req.query.days||30),3650));
    const since=new Date(Date.now()-days*86400000);
    const q=await pool.query(`select outcome,coalesce(realized_r,0)::float8 r,coalesce(pnl,0)::float8 pnl,coalesce(ict_model,'Unspecified') model,coalesce(kill_zone,'Unspecified') kill_zone,coalesce(direction,'Unspecified') direction,coalesce(closed_at,created_at) trade_time from trades where user_id=$1 and outcome in ('WIN','LOSS','BREAKEVEN') and coalesce(closed_at,created_at)>=$2 order by coalesce(closed_at,created_at) asc`,[req.user.id,since]);
    const rows=q.rows,wins=rows.filter(x=>x.outcome==='WIN').length,losses=rows.filter(x=>x.outcome==='LOSS').length,decided=wins+losses,totalR=rows.reduce((a,x)=>a+Number(x.r||0),0),totalPnl=rows.reduce((a,x)=>a+Number(x.pnl||0),0);
    const by=key=>Object.entries(rows.reduce((m,x)=>(m[x[key]]=(m[x[key]]||0)+1,m),{})).sort((a,b)=>b[1]-a[1]).map(([label,trades])=>({label,trades}));
    const reflection=await pool.query(`select reflection_date,learned,good,avoid,next,ai_insight from daily_reflections where user_id=$1 and reflection_date >= $2::date order by reflection_date desc limit 14`,[req.user.id,since]);
    res.json({data:{period_days:days,summary:{trades:rows.length,wins,losses,breakeven:rows.filter(x=>x.outcome==='BREAKEVEN').length,win_rate:decided?+(wins/decided*100).toFixed(1):0,total_r:+totalR.toFixed(2),total_pnl:+totalPnl.toFixed(2),avg_r:rows.length?+(totalR/rows.length).toFixed(2):0},models:by('model').slice(0,8),kill_zones:by('kill_zone').slice(0,8),directions:by('direction'),reflections:reflection.rows}});
  }catch(e){res.status(500).json({error:'Report generation failed'})}
});
app.get('/api/economic-calendar/correlation',requireDb,auth,async(req,res)=>{
  try{
    const days=Math.max(1,Math.min(Number(req.query.days||30),365));
    const q=await pool.query(`select t.id,t.symbol,t.outcome,t.realized_r,t.pnl,t.opened_at,t.closed_at,e.id event_id,e.currency,e.title,e.impact,e.event_time,round(abs(extract(epoch from (coalesce(t.opened_at,t.created_at)-e.event_time))/60)::numeric,1)::float8 minutes_away from trades t join economic_events e on e.event_time between coalesce(t.opened_at,t.created_at)-interval '4 hours' and coalesce(t.opened_at,t.created_at)+interval '4 hours' where t.user_id=$1 and coalesce(t.opened_at,t.created_at)>=now()-($2::int*interval '1 day') and t.outcome in ('WIN','LOSS','BREAKEVEN') order by t.opened_at desc,minutes_away asc limit 500`,[req.user.id,days]);
    const grouped={HIGH:[],MEDIUM:[],LOW:[]}; for(const x of q.rows){if(grouped[x.impact])grouped[x.impact].push(x)}
    const summarize=a=>({events:a.length,trades:new Set(a.map(x=>x.id)).size,avg_r:a.length?+(a.reduce((s,x)=>s+Number(x.realized_r||0),0)/a.length).toFixed(2):0,wins:a.filter(x=>x.outcome==='WIN').length,losses:a.filter(x=>x.outcome==='LOSS').length});
    res.json({data:{days,near_event_trades:q.rows,by_impact:Object.fromEntries(Object.entries(grouped).map(([k,v])=>[k,summarize(v)]))}});
  }catch(e){res.status(500).json({error:'Calendar correlation failed'})}
});
app.get('/api/personal-engine',requireDb,auth,async(req,res)=>{const r=await pool.query(`select count(*)::int trades,count(*) filter(where outcome='WIN')::int wins,count(*) filter(where outcome='LOSS')::int losses,round(coalesce(avg(risk_pct),0),2)::float avg_risk,count(*) filter(where htf_bias is null or htf_bias='')::int missing_bias,count(*) filter(where liquidity_sweep is null or liquidity_sweep='')::int missing_sweep from trades where user_id=$1`,[req.user.id]);const leaks=await pool.query(`select leak, count(*)::int frequency from (select unnest(array_remove(array[case when htf_bias is null or htf_bias='' then 'Missing HTF bias' end,case when liquidity_sweep is null or liquidity_sweep='' then 'Missing liquidity sweep' end,case when structure is null or structure='' then 'Missing structure confirmation' end,case when risk_pct is not null and risk_pct>2 then 'Risk above 2%' end],null)) leak from trades where user_id=$1) x group by leak order by frequency desc`,[req.user.id]);res.json({data:{summary:r.rows[0],recurring_leaks:leaks.rows}})});
app.get('/api/reflections',requireDb,auth,async(req,res)=>{
  try{
    const h=await pool.query(`select * from daily_reflections where user_id=$1 order by reflection_date desc limit 30`,[req.user.id]);
    const latest=h.rows[0]||null;
    const t=await pool.query(`select count(*)::int count from trades where user_id=$1 and coalesce(closed_at,created_at)::date=$2`,[req.user.id,latest?.reflection_date||new Date().toISOString().slice(0,10)]);
    const focus=await pool.query(`select leak,count(*)::int frequency from (select unnest(array_remove(array[case when htf_bias is null or htf_bias='' then 'HTF bias' end,case when draw_on_liquidity is null or draw_on_liquidity='' then 'Draw on liquidity' end,case when liquidity_sweep is null or liquidity_sweep='' then 'Liquidity sweep' end,case when structure is null or structure='' then 'Structure confirmation' end,case when risk_pct is not null and risk_pct>2 then 'Risk discipline' end],null)) leak from trades where user_id=$1) x group by leak order by frequency desc limit 1`,[req.user.id]);
    res.json({data:{latest,history:h.rows,latest_trade_count:t.rows[0].count,focus:focus.rows[0]?.leak||null}});
  }catch(e){res.status(500).json({error:'Reflection load failed'})}
});
app.post('/api/reflections',requireDb,auth,async(req,res)=>{
  try{const b=req.body||{};const d=b.reflection_date||new Date().toISOString().slice(0,10);const r=await pool.query(`insert into daily_reflections(user_id,reflection_date,happened,learned,good,avoid,next) values($1,$2,$3,$4,$5,$6,$7) on conflict(user_id,reflection_date) do update set happened=excluded.happened,learned=excluded.learned,good=excluded.good,avoid=excluded.avoid,next=excluded.next,updated_at=now() returning *`,[req.user.id,d,b.happened||'',b.learned||'',b.good||'',b.avoid||'',b.next||'']);res.json({data:r.rows[0]});}catch(e){res.status(500).json({error:'Reflection save failed'})}
});
app.post('/api/reflections/insight',requireDb,auth,async(req,res)=>{
  try{
    const r=await pool.query(`select * from daily_reflections where user_id=$1 order by reflection_date desc limit 1`,[req.user.id]);
    if(!r.rowCount)return res.status(400).json({error:'Save a reflection first'});
    const t=await pool.query(`select outcome,ict_model,kill_zone,direction,risk_pct,realized_r,pnl,htf_bias,draw_on_liquidity,liquidity_sweep,structure,pd_array,closed_at from trades where user_id=$1 order by coalesce(closed_at,created_at) desc limit 30`,[req.user.id]);
    const result=await aiReview({methodology:'ICT',review_type:'daily_reflection',reflection:r.rows[0],recent_trades:t.rows,instruction:'Return a concise process-focused daily coaching summary. Identify what to repeat, what to change, one ICT process focus, and one reflection question. Do not provide live trade signals, entries, targets, or price predictions.'});
    const insight=typeof result==='string'?result:(result?.summary||result?.message||JSON.stringify(result));
    await pool.query(`update daily_reflections set ai_insight=$1,updated_at=now() where id=$2 and user_id=$3`,[insight,r.rows[0].id,req.user.id]);res.json({data:{insight}});
  }catch(e){res.status(502).json({error:e.message})}
});
app.get('/api/personal-profile',requireDb,auth,async(req,res)=>{
  try{
    const base=await pool.query(`select count(*)::int trades, count(*) filter(where outcome='WIN')::int wins, count(*) filter(where outcome='LOSS')::int losses, count(*) filter(where outcome='BREAKEVEN')::int breakeven, round(coalesce(avg(risk_pct),0),2)::float avg_risk, count(*) filter(where htf_bias is not null and htf_bias<>'')::int bias_logged from trades where user_id=$1`,[req.user.id]);
    const groups=async(column)=>{const q=await pool.query(`select coalesce(nullif(${column},''),'Unspecified') value,count(*)::int count from trades where user_id=$1 group by 1 order by count desc,value limit 6`,[req.user.id]);return q.rows};
    const models=await groups('ict_model'), killZones=await groups('kill_zone'), directions=await groups('direction'), liquidity=await groups('draw_on_liquidity'), structures=await groups('structure');
    const leaks=await pool.query(`select leak,count(*)::int frequency from (select unnest(array_remove(array[case when htf_bias is null or htf_bias='' then 'HTF bias not logged' end,case when draw_on_liquidity is null or draw_on_liquidity='' then 'Draw on liquidity not logged' end,case when liquidity_sweep is null or liquidity_sweep='' then 'Liquidity sweep not logged' end,case when structure is null or structure='' then 'Structure confirmation not logged' end,case when pd_array is null or pd_array='' then 'PD array not logged' end,case when risk_pct is not null and risk_pct>2 then 'Risk above 2%' end],null)) leak from trades where user_id=$1) x group by leak order by frequency desc limit 8`,[req.user.id]);
    const b=base.rows[0], decided=(b.wins||0)+(b.losses||0);
    res.json({data:{n:b.trades,wins:b.wins,losses:b.losses,known:decided,winRate:decided?Math.round(b.wins/decided*100):0,adherence:b.trades?Math.round((b.bias_logged/b.trades)*100):0,avgRisk:b.avg_risk,biasCoverage:b.trades?Math.round((b.bias_logged/b.trades)*100):0,topKillZone:killZones[0]?.value||null,topDirection:directions[0]?.value||null,topLiquidity:liquidity[0]?.value||null,topStructure:structures[0]?.value||null,modelBreakdown:models,killZoneBreakdown:killZones,directionBreakdown:directions,leaks:leaks.rows.map(x=>[x.leak,`${x.frequency} trade(s)`,x.frequency/Math.max(1,b.trades)]),generatedAt:new Date().toISOString()}});
  }catch(e){res.status(500).json({error:'Personal profile analysis failed'})}
});
app.use('/api', (req,res)=>res.status(404).json({error:'API route not found',request_id:req.requestId}));
app.use((err,req,res,next)=>{
  console.error(JSON.stringify({level:'error',request_id:req.requestId,error:err?.message||'unknown_error',path:req.path}));
  if(res.headersSent) return next(err);
  res.status(err?.status||500).json({error:'Internal server error',request_id:req.requestId});
});
const port=Number(process.env.PORT||3000);
const server=app.listen(port,()=>console.log(`TradeMind V32 API running on ${port}`));
const shutdown=async()=>{server.close(async()=>{if(pool)await pool.end();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
process.on('unhandledRejection',err=>console.error(JSON.stringify({level:'error',event:'unhandledRejection',error:err?.message||String(err)})));
process.on('uncaughtException',err=>{console.error(JSON.stringify({level:'error',event:'uncaughtException',error:err?.message||String(err)}));shutdown()});
