export function photoStampLines({source,capturedAt,addedAt,location}){
  const stampTime=source==='live_camera'?capturedAt:addedAt;
  const time=new Date(stampTime);
  if(Number.isNaN(time.getTime()))throw new Error('Could not record the photo time. Check the device clock.');
  if(!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || !Number.isFinite(location.accuracy_m))throw new Error('A device location is required to stamp this photo.');
  const iso=time.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');
  return [
    source==='live_camera'?`Captured (device): ${iso}`:`Added to app (device): ${iso}`,
    `${source==='live_camera'?'GPS':'Device GPS when added'}: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} | +/-${Math.round(location.accuracy_m)} m`,
    source==='live_camera'?'Device-reported time and location':'Existing image: original capture time/location not verified',
  ];
}
// Append a footer so no part of the vehicle image is covered by the stamp.
export function stampPhotoCanvas(imageCanvas,stamp){
  const lines=photoStampLines(stamp);const width=Math.max(640,imageCanvas.width);const imageHeight=Math.round(imageCanvas.height*width/imageCanvas.width);
  const fontSize=Math.max(13,Math.round(width*0.015));const padding=Math.max(10,Math.round(width*0.012));
  const lineHeight=Math.round(fontSize*1.5);const footerHeight=padding*2+lineHeight*lines.length;
  const output=document.createElement('canvas');output.width=width;output.height=imageHeight+footerHeight;
  const context=output.getContext('2d');if(!context)throw new Error('The device could not stamp the image.');
  context.drawImage(imageCanvas,0,0,width,imageHeight);context.fillStyle='#102030';context.fillRect(0,imageHeight,width,footerHeight);
  context.fillStyle='#ffffff';context.textBaseline='top';
  for(let index=0;index<lines.length;index+=1){
    let size=fontSize;context.font=`${size}px sans-serif`;
    while(size>8 && context.measureText(lines[index]).width>width-padding*2){size-=1;context.font=`${size}px sans-serif`;}
    context.fillText(lines[index],padding,imageHeight+padding+index*lineHeight);
  }
  return output;
}
export function canvasJpeg(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare the stamped JPEG.')),'image/jpeg',0.9));}
