const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const {createEngine}=require('./engine.cjs');
const scrypt = promisify(crypto.scrypt);
const json = (res, status, value) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const error = (status,message) => Object.assign(new Error(message),{status});
async function passwordHash(password, salt) {return (await scrypt(password, salt, 64)).toString('hex');}
function createApp({directory=path.join(__dirname,'data'), secure=false}={}) {
  fs.mkdirSync(directory,{recursive:true});
  const engine=createEngine(directory);
  const file=path.join(directory,'database.json'), sessions=new Map(), failures=new Map();
  const captured=JSON.parse(fs.readFileSync(path.join(directory,'captured-records.json'),'utf8'));
  let db=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,account:null,records:captured.records.map(r=>({...r,id:r['Lead number'],deleted:false,localNotes:[],localActivities:[]})),audit:[]};
  function save() {const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(db),{mode:0o600});fs.renameSync(temporary,file);}
  function commit(action) {const before=JSON.stringify(db);try {action();save();}catch(e){db=JSON.parse(before);throw e;}}
  function audit(action,id) {db.audit.push({id:crypto.randomUUID(),at:new Date().toISOString(),actor:db.account.email,action,recordId:id});}
  function session(req) {const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pd_session='))?.slice(11);const key=token&&crypto.createHash('sha256').update(token).digest('hex');const s=key&&sessions.get(key);if(!s||s.expires<Date.now()){if(key)sessions.delete(key);return null;}return {...s,key};}
  async function body(req) {let text='';for await(const part of req){text+=part;if(Buffer.byteLength(text)>100000)throw error(413,'Request is too large.');}try{return JSON.parse(text||'{}');}catch{throw error(400,'Invalid request.');}}
  const publicFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const incoming=new URL(req.url,'http://localhost'), method=req.method;
      let pathname=incoming.pathname;
      if(pathname.startsWith('/private-backend/api/')) {
        const apiPath=pathname.slice('/private-backend/api'.length);
        pathname=apiPath==='/auth/login'?'/api/login':apiPath==='/auth/logout'?'/api/logout':'/api/engine'+apiPath;
      }

      if(!pathname.startsWith('/api/')) {
        const name=pathname==='/'?'index.html':pathname.slice(1);
        if(method!=='GET'||name.includes('/')||!/^[-a-zA-Z0-9_.]+$/.test(name)||!['.html','.js','.css','.svg','.webmanifest'].includes(path.extname(name)))throw error(404,'Not found.');
        const file=path.join(__dirname,'public',name);if(!fs.existsSync(file))throw error(404,'Not found.');
        const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
        res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store'});return res.end(fs.readFileSync(file));
      }
      const s=session(req);
      if(!['GET','HEAD'].includes(method)) {
        const origin=req.headers.origin;
        if(!origin||new URL(origin).host!==req.headers.host||!['http:','https:'].includes(new URL(origin).protocol))throw error(403,'Open this app directly before making changes.');
        if(!String(req.headers['content-type']||'').startsWith('application/json'))throw error(415,'JSON is required.');
      }
      if(pathname==='/api/session'&&method==='GET')return json(res,200,{setupRequired:!db.account,user:s?{email:db.account.email}:null,csrf:s?.csrf});
      if(['/api/setup','/api/login'].includes(pathname)&&method==='POST') {
        const ip=req.socket.remoteAddress, attempt=failures.get(ip);
        if(attempt&&attempt.until>Date.now()&&attempt.count>=5)throw error(429,'Too many attempts. Try again in 15 minutes.');
        const b=await body(req), email=String(b.email||'').trim().toLowerCase(), password=String(b.password||'');
        if(pathname==='/api/setup') {
          if(db.account)throw error(409,'An administrator already exists.');
          if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))throw error(403,'Create the administrator on the host computer.');
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>256)throw error(400,'Use a valid email and a password of 12–256 characters.');
          const salt=crypto.randomBytes(32).toString('hex'),hash=await passwordHash(password,salt);
          if(db.account)throw error(409,'An administrator already exists.');
          commit(()=>{db.account={email,salt,hash};audit('Administrator created',null);});
          return json(res,201,{ok:true});
        }
        if(!db.account)throw error(409,'Create your administrator first.');
        if(password.length>256)throw error(400,'Invalid sign-in.');
        const hash=await passwordHash(password,db.account.salt);
        if(email!==db.account.email||!crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(db.account.hash,'hex'))) {
          failures.set(ip,{count:attempt&&attempt.until>Date.now()?attempt.count+1:1,until:Date.now()+15*60000});throw error(401,'Email or password is incorrect.');
        }
        failures.delete(ip);if(s)sessions.delete(s.key);
        const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex');
        sessions.set(crypto.createHash('sha256').update(token).digest('hex'),{csrf,expires:Date.now()+8*3600000});
        res.setHeader('Set-Cookie',`pd_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`);
        return json(res,200,{user:await engine.dispatch('GET','/auth/me',undefined,db.account.email),csrf});
      }
      if(!s)throw error(401,'Sign in to view your records.');
      if(!['GET','HEAD'].includes(method)&&req.headers['x-csrf-token']!==s.csrf)throw error(403,'Refresh this page and try again.');
      if(pathname==='/api/logout'&&method==='POST'){sessions.delete(s.key);res.setHeader('Set-Cookie','pd_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
      if(pathname==='/api/captured'&&method==='GET')return json(res,200,captured);
      if(pathname.startsWith('/api/engine/')) {
        const apiPath=pathname.slice('/api/engine'.length);
        if(method==='GET'&&/\/(status|assign|convert|notes|restore|seen|bulk-delete|bulk-reassign|reschedule)(?:\/|$)/.test(apiPath))throw error(405,'This operation requires a protected write request.');
        if((apiPath.startsWith('/auth/')&&apiPath!=='/auth/me')||apiPath.startsWith('/public/')||(method!=='GET'&&(/^\/users(?:\/|$)/.test(apiPath)||apiPath.startsWith('/profiles'))))throw error(403,'Only the existing administrator account can sign in. Account creation and credential changes are disabled.');
        const result=await engine.dispatch(method,apiPath+incoming.search,['GET','HEAD'].includes(method)?undefined:await body(req),db.account.email);
        return json(res,200,result);
      }
      if(pathname==='/api/records'&&method==='GET')return json(res,200,{records:db.records,fullHistories:captured.fullHistories,expandedFields:captured.expandedFields,currentTotal:captured.currentTotal});
      if(pathname==='/api/audit'&&method==='GET')return json(res,200,db.audit);
      if(pathname==='/api/backup'&&method==='GET') {res.setHeader('Content-Disposition','attachment; filename="partnerdesk-records-backup.json"');return json(res,200,{version:db.version,exportedAt:new Date().toISOString(),records:db.records,audit:db.audit});}
      const match=pathname.match(/^\/api\/records\/([^/]+)(?:\/(notes|restore))?$/);
      if(match) {
        const id=decodeURIComponent(match[1]),r=db.records.find(x=>x.id===id);if(!r)throw error(404,'Record not found.');
        const at=new Date().toISOString();
        if(method==='DELETE'&&!match[2]){commit(()=>{r.deleted=true;r.deletedAt=at;audit('Moved lead to trash',id);});return json(res,200,{ok:true});}
        if(method==='POST'&&match[2]==='restore'){commit(()=>{r.deleted=false;delete r.deletedAt;audit('Restored lead',id);});return json(res,200,{ok:true});}
        if(r.deleted)throw error(409,'Restore this lead before editing it.');
        if(method==='POST'&&match[2]==='notes'){const b=await body(req),text=String(b.text||'').trim();if(!text||text.length>20000)throw error(400,'Write a note of 1–20,000 characters.');commit(()=>{r.localNotes.push({id:crypto.randomUUID(),body:text,createdAt:at,author:db.account.email});audit('Added note',id);});return json(res,201,{ok:true});}
        if(method==='PATCH'&&!match[2]) {
          const b=await body(req),fields=['Company','Contact','Email','Phone','Country','Status','Assigned to','Service'],changes={};
          for(const k of fields)if(Object.hasOwn(b,k)){if(typeof b[k]!=='string'||b[k].length>1000)throw error(400,'Invalid '+k);changes[k]=b[k].trim();}
          if(Object.hasOwn(changes,'Company')&&!changes.Company)throw error(400,'Company is required.');
          commit(()=>{const old=Object.fromEntries(Object.keys(changes).map(k=>[k,r[k]]));Object.assign(r,changes);r.localActivities.push({at,actor:db.account.email,description:'Lead details updated',before:old,after:changes});r.localUpdatedAt=at;audit('Updated lead details',id);});return json(res,200,{ok:true});
        }
      }
      throw error(404,'Not found.');
    }catch(e){if(!res.headersSent)json(res,e.status||500,{message:e.status?e.message:'Unable to save or read this request.'});else res.end();}
  });
}
if(require.main===module){const port=Number(process.env.PORT||3033);createApp().listen(port,'127.0.0.1',()=>console.log(`Detailed private PartnerDesk: http://localhost:${port}`));}
module.exports={createApp};
