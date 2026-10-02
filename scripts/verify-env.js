import 'dotenv/config';
const production=process.env.NODE_ENV==='production';
const required=['DATABASE_URL'];
if(production) required.push('CORS_ORIGIN');
const missing=required.filter(k=>!process.env[k]);
if(missing.length){console.error(`Missing required env: ${missing.join(', ')}`);process.exit(1)}
if(production && String(process.env.CORS_ORIGIN).includes('*')){console.error('CORS_ORIGIN must not be * in production');process.exit(1)}
if(production && process.env.DATABASE_SSL==='false' && !/localhost|127\.0\.0\.1|db(?=[:/]|$)/i.test(process.env.DATABASE_URL)){console.warn('WARNING: DATABASE_SSL=false for a non-local database host.')}
console.log('Environment baseline OK');
console.log(`NODE_ENV: ${process.env.NODE_ENV||'development'}`);
console.log(`AI configured: ${Boolean(process.env.AI_API_KEY)}`);
console.log(`Economic calendar configured: ${Boolean(process.env.ECONOMIC_CALENDAR_URL)}`);
