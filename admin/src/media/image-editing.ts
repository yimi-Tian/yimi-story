import type { DraftMediaAsset } from "../data/media-repository";

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ImageRotation = 0 | 90 | 180 | 270;
export type CropAspect = "original" | "free" | "4:3" | "3:4" | "16:9" | "1:1";
export interface NormalizedCrop { x:number;y:number;width:number;height:number;aspectRatio:CropAspect }
export interface TransformationMetadata { rotation:ImageRotation;crop:NormalizedCrop;normalizedOrientation:true;originalOrientation:ExifOrientation }
export interface EditableMetadata { altText:string;containsPortrait:DraftMediaAsset["containsPortrait"];rightsStatus:DraftMediaAsset["rightsStatus"] }

export const JPEG_OUTPUT_QUALITY = 0.92;
export const WEBP_OUTPUT_QUALITY = 0.92;
export const MAX_CANVAS_MEMORY_BYTES = 128 * 1024 * 1024;

const ratios:Record<Exclude<CropAspect,"original"|"free">,number>={"4:3":4/3,"3:4":3/4,"16:9":16/9,"1:1":1};
const finite=(value:number)=>Number.isFinite(value);
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

export function readExifOrientation(bytes:Uint8Array):ExifOrientation {
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return 1;
  let offset=2;
  while(offset+4<=bytes.length){
    if(bytes[offset]!==0xff){offset++;continue;}
    const marker=bytes[offset+1];
    if(marker===0xda||marker===0xd9)break;
    const length=(bytes[offset+2]<<8)|bytes[offset+3];
    if(length<2||offset+2+length>bytes.length)break;
    if(marker===0xe1&&length>=10){
      const start=offset+4;
      if(String.fromCharCode(...bytes.slice(start,start+4))==="Exif"){
        const tiff=start+6;
        if(tiff+8>bytes.length)return 1;
        const little=bytes[tiff]===0x49&&bytes[tiff+1]===0x49;
        const big=bytes[tiff]===0x4d&&bytes[tiff+1]===0x4d;
        if(!little&&!big)return 1;
        const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        const u16=(at:number)=>view.getUint16(at,little);
        const u32=(at:number)=>view.getUint32(at,little);
        const ifd=tiff+u32(tiff+4);
        if(ifd+2>bytes.length)return 1;
        const count=u16(ifd);
        for(let index=0;index<count;index++){
          const entry=ifd+2+index*12;
          if(entry+12>bytes.length)break;
          if(u16(entry)===0x0112){
            const orientation=u16(entry+8);
            return orientation>=1&&orientation<=8?orientation as ExifOrientation:1;
          }
        }
      }
    }
    offset+=length+2;
  }
  return 1;
}

export function orientedDimensions(width:number,height:number,orientation:ExifOrientation){
  return [5,6,7,8].includes(orientation)?{width:height,height:width}:{width,height};
}

export function rotateDimensions(width:number,height:number,rotation:ImageRotation){
  return rotation===90||rotation===270?{width:height,height:width}:{width,height};
}

export function normalizeRotation(rotation:number):ImageRotation {
  const value=((rotation%360)+360)%360;
  if(![0,90,180,270].includes(value))throw new Error("INVALID_ROTATION");
  return value as ImageRotation;
}

export function validateCrop(crop:NormalizedCrop):NormalizedCrop {
  if(![crop.x,crop.y,crop.width,crop.height].every(finite)||crop.x<0||crop.y<0||crop.width<=0||crop.height<=0||crop.x+crop.width>1.000001||crop.y+crop.height>1.000001)throw new Error("INVALID_CROP");
  if(!["original","free","4:3","3:4","16:9","1:1"].includes(crop.aspectRatio))throw new Error("INVALID_CROP");
  return crop;
}

export function clampCrop(crop:NormalizedCrop):NormalizedCrop {
  const width=clamp(finite(crop.width)?crop.width:0,0.000001,1);
  const height=clamp(finite(crop.height)?crop.height:0,0.000001,1);
  return {...crop,width,height,x:clamp(finite(crop.x)?crop.x:0,0,1-width),y:clamp(finite(crop.y)?crop.y:0,0,1-height)};
}

export function calculateCrop(width:number,height:number,aspectRatio:CropAspect):NormalizedCrop {
  if(!finite(width)||!finite(height)||width<=0||height<=0)throw new Error("INVALID_IMAGE_DIMENSIONS");
  if(aspectRatio==="original"||aspectRatio==="free")return{x:0,y:0,width:1,height:1,aspectRatio};
  const target=ratios[aspectRatio],source=width/height;
  if(source>target){const cropWidth=target/source;return{x:(1-cropWidth)/2,y:0,width:cropWidth,height:1,aspectRatio};}
  const cropHeight=source/target;return{x:0,y:(1-cropHeight)/2,width:1,height:cropHeight,aspectRatio};
}

export function resizeCrop(crop:NormalizedCrop,width:number,height:number,nextWidth:number,nextHeight:number):NormalizedCrop {
  let w=clamp(nextWidth,0.02,1),h=clamp(nextHeight,0.02,1);
  if(crop.aspectRatio!=="free"&&crop.aspectRatio!=="original"){
    const target=ratios[crop.aspectRatio];h=w*width/(target*height);
    if(h>1){h=1;w=target*height/width;}
  }
  return clampCrop({...crop,width:w,height:h});
}

export function createTransformationMetadata(rotation:ImageRotation,crop:NormalizedCrop,originalOrientation:ExifOrientation):TransformationMetadata {
  return{rotation:normalizeRotation(rotation),crop:validateCrop(clampCrop(crop)),normalizedOrientation:true,originalOrientation};
}

export function preserveMetadata(asset:DraftMediaAsset):EditableMetadata {
  return{altText:asset.altText,containsPortrait:asset.containsPortrait,rightsStatus:asset.rightsStatus};
}

export function resolveOriginalMediaId(asset:Pick<DraftMediaAsset,"id"|"source"|"originalMediaId">):string {
  if(asset.source!=="cms_draft")throw new Error("LEGACY_MEDIA_EDIT_FORBIDDEN");
  return asset.originalMediaId??asset.id;
}

export function estimateCanvasBytes(width:number,height:number){return width*height*4;}
export function assertCanvasMemory(width:number,height:number){if(estimateCanvasBytes(width,height)>MAX_CANVAS_MEMORY_BYTES)throw new Error("IMAGE_EDITOR_TOO_LARGE");}

function canvas(width:number,height:number){const result=document.createElement("canvas");result.width=width;result.height=height;return result;}
function context(target:HTMLCanvasElement){const value=target.getContext("2d",{alpha:true});if(!value)throw new Error("CANVAS_CONTEXT_UNAVAILABLE");return value;}

function drawRotated(source:CanvasImageSource,width:number,height:number,rotation:ImageRotation):HTMLCanvasElement {
  const size=rotateDimensions(width,height,rotation);assertCanvasMemory(size.width,size.height);
  const target=canvas(size.width,size.height),ctx=context(target),w=width,h=height;
  if(rotation===90)ctx.setTransform(0,1,-1,0,h,0);
  else if(rotation===180)ctx.setTransform(-1,0,0,-1,w,h);
  else if(rotation===270)ctx.setTransform(0,-1,1,0,0,w);
  ctx.drawImage(source,0,0);return target;
}

async function decoded(blob:Blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const orientation=blob.type==="image/jpeg"?readExifOrientation(bytes):1;
  let bitmap:ImageBitmap;
  // createImageBitmap's default `from-image` behavior applies EXIF orientation.
  // `none` is not a valid ImageBitmapOptions value and was ignored by Chrome,
  // which caused the already-oriented pixels to be normalized a second time.
  try{bitmap=await createImageBitmap(blob);}catch{throw new Error("IMAGE_DECODE_FAILED");}
  return{bitmap,orientation};
}

export async function renderEditorCanvas(blob:Blob,rotation:ImageRotation){
  const {bitmap,orientation}=await decoded(blob);
  try{return{canvas:drawRotated(bitmap,bitmap.width,bitmap.height,rotation),orientation};}finally{bitmap.close();}
}

function outputOptions(mimeType:string){
  if(mimeType==="image/jpeg")return{mimeType,quality:JPEG_OUTPUT_QUALITY,extension:"jpg"};
  if(mimeType==="image/png")return{mimeType,quality:undefined,extension:"png"};
  if(mimeType==="image/webp")return{mimeType,quality:WEBP_OUTPUT_QUALITY,extension:"webp"};
  throw new Error("MEDIA_TYPE_UNSUPPORTED");
}

function editedFilename(filename:string,extension:string){const base=filename.replace(/\.[^.]+$/,"").replace(/[^\p{L}\p{N}._-]+/gu,"-").slice(0,180)||"image";return`${base}-edited.${extension}`;}

export async function transformRenderedCanvas(source:HTMLCanvasElement,filename:string,mimeType:string,rotation:ImageRotation,crop:NormalizedCrop,originalOrientation:ExifOrientation):Promise<{file:File;metadata:TransformationMetadata;width:number;height:number}> {
  const valid=validateCrop(crop);
  const sx=Math.round(valid.x*source.width),sy=Math.round(valid.y*source.height);
  const sw=Math.max(1,Math.round(valid.width*source.width)),sh=Math.max(1,Math.round(valid.height*source.height));
  const width=Math.min(sw,source.width-sx),height=Math.min(sh,source.height-sy);
  if(width<=0||height<=0)throw new Error("INVALID_CROP_DIMENSIONS");
  const target=canvas(width,height);assertCanvasMemory(width,height);
  try{
    context(target).drawImage(source,sx,sy,width,height,0,0,width,height);
    const options=outputOptions(mimeType);
    const output=await new Promise<Blob>((resolve,reject)=>target.toBlob((value)=>value?resolve(value):reject(new Error("IMAGE_ENCODE_FAILED")),options.mimeType,options.quality));
    if(output.type!==options.mimeType)throw new Error("IMAGE_FORMAT_UNSUPPORTED");
    return{file:new File([output],editedFilename(filename,options.extension),{type:options.mimeType,lastModified:Date.now()}),metadata:createTransformationMetadata(rotation,valid,originalOrientation),width,height};
  }finally{target.width=0;target.height=0;}
}

export async function transformImage(blob:Blob,filename:string,rotation:ImageRotation,crop:NormalizedCrop):Promise<{file:File;metadata:TransformationMetadata;width:number;height:number}> {
  const rendered=await renderEditorCanvas(blob,rotation);
  try{return await transformRenderedCanvas(rendered.canvas,filename,blob.type,rotation,crop,rendered.orientation);}
  finally{rendered.canvas.width=0;rendered.canvas.height=0;}
}
