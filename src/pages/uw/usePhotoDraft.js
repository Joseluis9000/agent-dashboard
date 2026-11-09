import { useCallback,useEffect,useRef,useState } from 'react';
import {loadPhotoDraft,writePhotoDraft,deletePhotoDraft,DraftConflictError} from './photoDraftStorage';

export default function usePhotoDraft({ownerId,scope,snapshot,onRestore}) {
  const [ready,setReady]=useState(false);const [status,setStatus]=useState('Restoring local draft…');
  const [storageError,setStorageError]=useState('');const [retry,setRetry]=useState(0);
  const revision=useRef(0);const writes=useRef(Promise.resolve());const paused=useRef(false);
  const mounted=useRef(true);const restore=useRef(onRestore);restore.current=onRestore;
  const conflict=useRef(false);const failedOpen=useRef(false);const sequence=useRef(0);
  useEffect(()=> {
    let alive=true;mounted.current=true;
    loadPhotoDraft(ownerId,scope).then((record)=> {
      if(!alive)return;
      revision.current=record?.revision || 0;
      if(record?.snapshot && record.version===1)restore.current(record.snapshot);
      setStatus(record?'Local draft restored for this agent.':'Local draft ready.');
    }).catch((error)=>{if(alive){failedOpen.current=true;setStorageError(error.message);setStatus('Not saved locally.');}})
      .finally(()=>{if(alive)setReady(true);});
    return()=>{alive=false;mounted.current=false;};
  },[ownerId,scope]);
  useEffect(()=> {
    if(!ready || paused.current || conflict.current)return;
    if(!snapshot.items.length && !Object.entries(snapshot.details).some(([key,value])=>key!=='office'&&Boolean(value)))return;
    const queued=++sequence.current;
    setStatus('Saving local draft…');
    writes.current=writes.current.catch(()=>{}).then(async()=> {
      if(paused.current || conflict.current)return;
      // Do not overwrite a draft that could not be loaded on startup.
      if(failedOpen.current){
        const existing=await loadPhotoDraft(ownerId,scope);
        if(existing)throw new DraftConflictError();
        failedOpen.current=false;
      }
      revision.current=await writePhotoDraft(ownerId,scope,snapshot,revision.current);
      if(mounted.current && queued===sequence.current){setStatus('Draft saved on this device.');setStorageError('');}
    }).catch((error)=> {
      if(error instanceof DraftConflictError)conflict.current=true;
      if(mounted.current && (queued===sequence.current || error instanceof DraftConflictError)){setStorageError(error.message);setStatus('Not saved locally.');}
    });
  },[ready,snapshot,ownerId,scope,retry]);
  const discard=useCallback(async()=> {
    paused.current=true;await writes.current.catch(()=>{});
    try {
      if(conflict.current)throw new DraftConflictError();
      if(!failedOpen.current)await deletePhotoDraft(ownerId,scope,revision.current);
      revision.current=0;
    }catch(error){paused.current=false;throw error;}
  },[ownerId,scope]);
  const retrySave=()=>{if(!conflict.current)setRetry((value)=>value+1);};
  return {ready,status,storageError,discard,retrySave};
}
