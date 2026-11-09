import React,{useEffect,useState} from 'react';
import {Navigate,Outlet} from 'react-router-dom';
import {useAuth} from '../../AuthContext';
import {PHOTO_ENTRY_ROLES} from './photoEntryAuth';

// AuthContext may publish user before its asynchronous profile query finishes.
// Do not bounce a signed-in user through /login while the profile is missing.
export default function PhotoEntryGate(){
  const {user,profile,loading,signOut}=useAuth();const [timedOut,setTimedOut]=useState(false);
  const userId = user?.id;
  useEffect(() => {
    setTimedOut(false);
    if (!userId || profile) return undefined;
    const timer = setTimeout(() => setTimedOut(true), 12000);
    return () => clearTimeout(timer);
  }, [userId, profile]);
  if(loading)return <p role="status" style={{padding:24}}>Loading your photo session…</p>;
  if(!user)return <Navigate to="/photo-login" replace/>;
  if(!profile)return <main style={{maxWidth:440,margin:'40px auto',padding:24,fontFamily:'sans-serif'}}>
    <h1>Vehicle Photos</h1>{timedOut?<><p role="alert">Your account profile could not be loaded. Your saved device draft remains available for this account.</p><button type="button" onClick={()=>window.location.reload()}>Retry profile loading</button> <button type="button" onClick={()=>signOut()}>Sign out</button></>:<p role="status">Loading your agent profile…</p>}
  </main>;
  if(!PHOTO_ENTRY_ROLES.includes(profile.role))return <main style={{padding:24}}><h1>Vehicle Photos</h1><p>Your account does not have photo-entry access.</p><a href="/">Return to dashboard</a></main>;
  return <Outlet/>;
}
