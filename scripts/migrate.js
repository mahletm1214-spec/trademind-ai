import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false});
await pool.query(`create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())`);
const dir=path.resolve('migrations');
for(const file of (await fs.readdir(dir)).filter(f=>f.endsWith('.sql')).sort()){
  const exists=await pool.query('select 1 from schema_migrations where id=$1',[file]);
  if(exists.rowCount) continue;
  const sql=await fs.readFile(path.join(dir,file),'utf8');
  const client=await pool.connect();
  try{await client.query('begin');await client.query(sql);await client.query('insert into schema_migrations(id) values($1)',[file]);await client.query('commit');console.log(`applied ${file}`)}catch(e){await client.query('rollback');throw e}finally{client.release()}
}
await pool.end();
