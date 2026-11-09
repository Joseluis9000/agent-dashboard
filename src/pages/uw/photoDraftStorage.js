const DATABASE = 'gp-vehicle-photo-drafts';
const STORE = 'drafts';
export class DraftConflictError extends Error {
  constructor() { super('This draft changed in another tab. Keep this page open and download a backup; reopen the photo page to recover the latest draft.'); this.name='DraftConflictError'; }
}
function openDatabase() {
  return new Promise((resolve,reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Local drafts are unavailable in this browser. Keep the page open or download a backup.')); return; }
    const request = indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=> { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE,{keyPath:'key'}); };
    request.onerror=()=>reject(request.error || new Error('Could not open local photo storage.'));
    request.onblocked=()=>reject(new Error('Close other photo tabs and retry local storage.'));
    request.onsuccess=()=>resolve(request.result);
  });
}
export function photoDraftKey(ownerId,scope) {
  if (!ownerId || !['mobile','library'].includes(scope)) throw new Error('A signed-in agent is required for local drafts.');
  return `${ownerId}:${scope}`;
}
export async function loadPhotoDraft(ownerId,scope) {
  const key=photoDraftKey(ownerId,scope);const db=await openDatabase();
  return new Promise((resolve,reject)=> {
    const transaction=db.transaction(STORE,'readonly');let result=null;
    transaction.objectStore(STORE).get(key).onsuccess=(event)=>{result=event.target.result || null;};
    transaction.oncomplete=()=>{db.close();resolve(result?.ownerId===ownerId ? result : null);};
    transaction.onerror=transaction.onabort=()=>{db.close();reject(transaction.error || new Error('Could not restore local draft.'));};
  });
}
export async function writePhotoDraft(ownerId,scope,snapshot,expectedRevision) {
  const key=photoDraftKey(ownerId,scope);const db=await openDatabase();
  return new Promise((resolve,reject)=> {
    let failure=null;let revision=0;
    const transaction=db.transaction(STORE,'readwrite');const store=transaction.objectStore(STORE);
    const request=store.get(key);
    request.onsuccess=()=> {
      const existing=request.result;
      if ((existing?.revision || 0)!==expectedRevision) { failure=new DraftConflictError();transaction.abort();return; }
      revision=expectedRevision+1;
      store.put({key,ownerId,scope,version:1,revision,updatedAt:new Date().toISOString(),snapshot});
    };
    transaction.oncomplete=()=>{db.close();resolve(revision);};
    transaction.onerror=transaction.onabort=()=>{db.close();reject(failure || transaction.error || new Error('The device could not save the draft. Storage may be full or disabled.'));};
  });
}
export async function deletePhotoDraft(ownerId,scope,expectedRevision) {
  const key=photoDraftKey(ownerId,scope);const db=await openDatabase();
  return new Promise((resolve,reject)=> {
    let failure=null;const transaction=db.transaction(STORE,'readwrite');const store=transaction.objectStore(STORE);
    const request=store.get(key);
    request.onsuccess=()=> {
      if ((request.result?.revision || 0)!==expectedRevision) {failure=new DraftConflictError();transaction.abort();return;}
      store.delete(key);
    };
    transaction.oncomplete=()=>{db.close();resolve();};
    transaction.onerror=transaction.onabort=()=>{db.close();reject(failure || transaction.error || new Error('Could not clear the local draft.'));};
  });
}
