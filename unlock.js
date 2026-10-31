(() => {
 const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 const base64=value=>{const a=new Uint8Array(value);let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);};
 const encoder=new TextEncoder(),decoder=new TextDecoder(),stateName='partnerdesk.encrypted-state.v1';
 let activeKey=null,activeParams=null,queue=Promise.resolve(),pending=0,saveFailed=false,storage=new Map();
 const status=document.querySelector('#save-status');
 async function decrypt(envelope,key,context){return JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv),...(context?{additionalData:encoder.encode(context)}:{})},key,bytes(envelope.ciphertext))));}
 function persist(){const snapshot=JSON.stringify([...storage]);pending++;status.textContent='Saving…';queue=queue.catch(()=>{}).then(async()=>{try{const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('partnerdesk-state-v1')},activeKey,encoder.encode(snapshot));localStorage.setItem(stateName,JSON.stringify({...activeParams,iv:base64(iv),ciphertext:base64(encrypted)}));saveFailed=false;}catch{saveFailed=true;}finally{pending--;status.textContent=saveFailed?'Storage full or unavailable — changes are not saved':pending?'Saving…':'Saved in this browser';}});}
 document.querySelector('#signin').onsubmit=async event=>{
   event.preventDefault();const button=document.querySelector('#submit'),message=document.querySelector('#error');button.disabled=true;button.textContent='Opening workspace…';message.textContent='';
   try{
     const response=await fetch('workspace.enc.json',{cache:'no-store'});if(!response.ok)throw new Error('The workspace file could not be loaded. Please refresh.');
     const envelope=await response.json(),password=document.querySelector('#password').value,email=document.querySelector('#email').value.trim().toLowerCase();
     const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
     const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(envelope.salt),iterations:envelope.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
     let payload;try{payload=await decrypt(envelope,key);}catch{throw new Error('Email or password is incorrect.');}
     if(payload.email!==email)throw new Error('Email or password is incorrect.');
     const saved=localStorage.getItem(stateName);
     if(saved){const savedEnvelope=JSON.parse(saved);const savedKey=savedEnvelope.salt&&savedEnvelope.salt!==envelope.salt?await crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(savedEnvelope.salt),iterations:savedEnvelope.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']):key;storage=new Map(await decrypt(savedEnvelope,savedKey,'partnerdesk-state-v1'));}else storage=new Map();
     activeKey=key;activeParams={salt:envelope.salt,iterations:envelope.iterations};
     window.PDStore={getItem:k=>storage.get(k)||null,setItem:(k,v)=>{storage.set(k,String(v));persist();},removeItem:k=>{storage.delete(k);persist();}};
     document.querySelector('#password').value='';document.querySelector('#gate').hidden=true;document.querySelector('#workspace').hidden=false;
     document.querySelector('#app').srcdoc=payload.html;document.title='PartnerDesk · Private workspace';
   }catch(error){message.textContent=error.message||'Unable to open the workspace.';}finally{button.disabled=false;button.textContent='Sign in';}
 };
 document.querySelector('#lock').onclick=async()=>{await queue;if(saveFailed){status.textContent='Changes could not be saved. Free browser storage before locking.';return;}location.reload();};
 window.addEventListener('beforeunload',event=>{if(pending||saveFailed){event.preventDefault();event.returnValue='';}});
})();
