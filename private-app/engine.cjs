const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function createEngine(directory) {
 const file=path.join(directory,'workspace.json'),raw=JSON.parse(fs.readFileSync(path.join(directory,'captured-records.json'),'utf8'));
 let database=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
 const store=new Map([['partnerdesk.tokens',JSON.stringify({userId:'u1'})]]);
 if(database)store.set('partnerdesk.mock.v4',database);
 const context={window:{WORKOS_CONFIG:{}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},URLSearchParams,setTimeout:(fn)=>setTimeout(fn,0),console};
 vm.createContext(context);
 const source=path.join(__dirname,'engine');
 for(const name of ['api-ext.js','api-ext2.js','api-ext3.js','api-ext4.js','api-ext5.js','api-ext6.js','api-ext7.js','api.js'])vm.runInContext(fs.readFileSync(path.join(source,name),'utf8'),context,{filename:name});
 const api=context.window.api;
 function persist(){const text=store.get('partnerdesk.mock.v4');if(text){fs.writeFileSync(file+'.tmp',text,{mode:0o600});fs.renameSync(file+'.tmp',file);database=text;}}
 let ready=(async()=>{if(!database){await api.importCaptured(raw);persist();}})(),queue=ready;
 const clean=value=>JSON.parse(JSON.stringify(value,(key,value)=>['password','hash','salt'].includes(key)?undefined:value));
 async function dispatch(method,p,body,email) {
   const run=async()=>{
     const before=store.get('partnerdesk.mock.v4');
     try{
       const current=JSON.parse(before);const admin=current.users.find(u=>u.id==='u1');admin.email=email;admin.name='Administrator';delete admin.password;store.set('partnerdesk.mock.v4',JSON.stringify(current));
       // Reload a fresh context per request so every read uses the latest committed database.
       vm.runInContext(fs.readFileSync(path.join(source,'api.js'),'utf8'),context,{filename:'api.js'});
       const handler={GET:'get',POST:'post',PATCH:'patch',PUT:'put',DELETE:'del'}[method];if(!handler)throw Object.assign(new Error('Method not allowed'),{status:405});
       const result=await context.window.api[handler](p,body);persist();return clean(result);
     }catch(e){if(before)store.set('partnerdesk.mock.v4',before);throw e;}
   };
   const result=queue.then(run);queue=result.catch(()=>{});return result;
 }
 return {ready,dispatch};
}
module.exports={createEngine};
