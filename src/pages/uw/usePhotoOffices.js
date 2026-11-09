import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../../supabaseClient';
export default function usePhotoOffices(){
  const [offices,setOffices]=useState([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try{const result=await supabase.rpc('vpl_photo_offices');if(result.error)throw result.error;setOffices(result.data || []);}
    catch(failure){setError(failure.message || 'Could not load offices.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{refresh();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[refresh]);
  return {offices,loading,error,refresh};
}
export function photoOfficeLabel(office){
  const code=office.office_code;const name=String(office.office_name || '').replace(new RegExp(`^${code}\\s*[-–:]?\\s*`,'i'),'');
  return name ? `${code} — ${name}` : code;
}
