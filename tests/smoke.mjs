const base=process.env.BASE_URL||'http://127.0.0.1:3000';
async function get(path){const r=await fetch(base+path);if(!r.ok)throw new Error(`${path} -> ${r.status}`);return r.json()}
const health=await get('/api/health');
if(!health.ok)throw new Error('health not ok');
console.log('PASS /api/health',health);
