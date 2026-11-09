// Uncompressed ZIP writer. JPEG is already compressed; no new dependency needed.
const encoder=new TextEncoder();
const CRC_TABLE=Array.from({length:256},(_,index)=> {
  let value=index;for(let bit=0;bit<8;bit+=1)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;
});
function crc32(bytes) {let value=0xffffffff;for(const byte of bytes)value=CRC_TABLE[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
function header(size) {const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};}
async function zipFiles(files) {
  const output=[];const directory=[];let offset=0;let directorySize=0;
  for(const file of files) {
    const name=encoder.encode(file.name);const data=new Uint8Array(await file.blob.arrayBuffer());const crc=crc32(data);
    const local=header(30);local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x800,true);local.view.setUint16(12,33,true);
    local.view.setUint32(14,crc,true);local.view.setUint32(18,data.length,true);local.view.setUint32(22,data.length,true);local.view.setUint16(26,name.length,true);
    output.push(local.bytes,name,data);
    const central=header(46);central.view.setUint32(0,0x02014b50,true);central.view.setUint16(4,20,true);central.view.setUint16(6,20,true);central.view.setUint16(8,0x800,true);central.view.setUint16(14,33,true);
    central.view.setUint32(16,crc,true);central.view.setUint32(20,data.length,true);central.view.setUint32(24,data.length,true);central.view.setUint16(28,name.length,true);central.view.setUint32(42,offset,true);
    directory.push(central.bytes,name);directorySize+=46+name.length;offset+=30+name.length+data.length;
  }
  const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,directorySize,true);end.view.setUint32(16,offset,true);
  return new Blob([...output,...directory,end.bytes],{type:'application/zip'});
}
export async function makePhotoBackup({details,items}) {
  if (!items.length) throw new Error('Add a photo before creating a backup.');
  const safeName=(value)=>String(value).replace(/[^a-z0-9_-]/gi,'_');
  const files=items.map((item)=>({name:`photos/${safeName(item.type)}-${safeName(item.id)}.jpg`,blob:item.blob}));
  const blob=await zipFiles(files);
  const office=/^CA\d{3}$/.test(details.office)?details.office:'office';
  return new File([blob],`vehicle-photos-${office}-${new Date().toISOString().replace(/[:.]/g,'-')}.zip`,{type:'application/zip'});
}
export function downloadPhotoBackup(file) {
  const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download=file.name;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
