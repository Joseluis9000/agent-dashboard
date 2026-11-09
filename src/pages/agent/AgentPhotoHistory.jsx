import React from 'react';
import {useAuth} from '../../AuthContext';
import VehiclePhotoLibrary from '../uw/VehiclePhotoLibrary';

export default function AgentPhotoHistory(){
  const {user}=useAuth();
  return <VehiclePhotoLibrary key={user?.id || 'signed-out'} personalOnly />;
}
