import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { assertCanvasMemory, calculateCrop, clampCrop, createTransformationMetadata, JPEG_OUTPUT_QUALITY, normalizeRotation, orientedDimensions, preserveMetadata, readExifOrientation, renderEditorCanvas, resizeCrop, resolveOriginalMediaId, rotateDimensions, transformImage, validateCrop } from "./image-editing";
import type { DraftMediaAsset } from "../data/media-repository";

function exifJpeg(orientation:number){
  const payload=[...new TextEncoder().encode("Exif\0\0"),0x49,0x49,0x2a,0,8,0,0,0,1,0,0x12,0x01,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0];
  return new Uint8Array([0xff,0xd8,0xff,0xe1,0,(payload.length+2),...payload,0xff,0xd9]);
}
const asset=(value:Partial<DraftMediaAsset>={}):DraftMediaAsset=>({id:"original",referenceId:"original",contentId:"content",draftId:"draft",source:"cms_draft",role:"cover",legacyPath:null,bucket:"cms-drafts",objectPath:"owner/content/original/original.jpg",originalFilename:"phone.jpg",mimeType:"image/jpeg",byteSize:10,width:4,height:3,checksumSha256:"a".repeat(64),originalMediaId:null,transformation:null,altText:"人物合照",containsPortrait:"yes",rightsStatus:"authorized",previewUrl:"https://signed.test/image",...value});

describe("Stage 6.5 transformation contracts",()=>{
  test.each([1,3,6,8])("EXIF Orientation %s 可解析",(orientation)=>expect(readExifOrientation(exifJpeg(orientation))).toBe(orientation));
  test("手機直式照片 landscape pixels + Orientation 6 正規化為直式尺寸",()=>expect(orientedDimensions(4032,3024,6)).toEqual({width:3024,height:4032}));
  test("90／180／270 度尺寸規則",()=>{expect(rotateDimensions(640,480,90)).toEqual({width:480,height:640});expect(rotateDimensions(640,480,180)).toEqual({width:640,height:480});expect(rotateDimensions(640,480,270)).toEqual({width:480,height:640});expect(normalizeRotation(-90)).toBe(270);});
  test.each([["4:3",4/3],["3:4",3/4],["16:9",16/9],["1:1",1]])("%s crop維持比例",(aspect,ratio)=>{const crop=calculateCrop(1600,900,aspect as "4:3");expect((crop.width*1600)/(crop.height*900)).toBeCloseTo(ratio as number,5);});
  test("crop boundary拒絕negative、zero、NaN並可安全clamp",()=>{expect(()=>validateCrop({x:-.1,y:0,width:.5,height:.5,aspectRatio:"free"})).toThrow("INVALID_CROP");expect(()=>validateCrop({x:0,y:0,width:0,height:.5,aspectRatio:"free"})).toThrow("INVALID_CROP");expect(()=>validateCrop({x:Number.NaN,y:0,width:.5,height:.5,aspectRatio:"free"})).toThrow("INVALID_CROP");expect(clampCrop({x:.9,y:.9,width:.5,height:.5,aspectRatio:"free"})).toMatchObject({x:.5,y:.5,width:.5,height:.5});});
  test("Canvas memory估算超過128MiB即阻擋",()=>{expect(()=>assertCanvasMemory(12000,12000)).toThrow("IMAGE_EDITOR_TOO_LARGE");expect(()=>assertCanvasMemory(4000,3000)).not.toThrow();});
  test("固定比例resize不超出圖片",()=>{const crop=resizeCrop(calculateCrop(1200,900,"4:3"),1200,900,2,2);expect(crop.x+crop.width).toBeLessThanOrEqual(1);expect(crop.y+crop.height).toBeLessThanOrEqual(1);expect(crop.width/crop.height*1200/900).toBeCloseTo(4/3);});
  test("transformation不保存Canvas狀態且標記orientation normalized",()=>expect(createTransformationMetadata(90,calculateCrop(640,480,"1:1"),6)).toEqual(expect.objectContaining({rotation:90,normalizedOrientation:true,originalOrientation:6,crop:expect.objectContaining({aspectRatio:"1:1"})})));
  test("derived繼承alt、人物、權利且多次編輯仍解析root original",()=>{expect(preserveMetadata(asset())).toEqual({altText:"人物合照",containsPortrait:"yes",rightsStatus:"authorized"});expect(resolveOriginalMediaId(asset({id:"edited",originalMediaId:"original"}))).toBe("original");expect(()=>resolveOriginalMediaId(asset({source:"github_legacy"}))).toThrow("LEGACY_MEDIA_EDIT_FORBIDDEN");});
});

describe("Canvas輸出格式與尺寸",()=>{
  const realCreate=document.createElement.bind(document);let qualities:(number|undefined)[]=[];let alphaOptions:unknown[]=[];
  beforeEach(()=>{
    qualities=[];alphaOptions=[];
    vi.stubGlobal("createImageBitmap",vi.fn(async(blob:Blob)=>{const orientation=blob.type==="image/jpeg"?readExifOrientation(new Uint8Array(await blob.arrayBuffer())):1;return{...[5,6,7,8].includes(orientation)?{width:6,height:8}:{width:8,height:6},close:vi.fn()};}));
    vi.spyOn(document,"createElement").mockImplementation(((tag:string)=>{
      if(tag!=="canvas")return realCreate(tag);
      const value={width:0,height:0,getContext:(_kind:string,options:unknown)=>{alphaOptions.push(options);return{setTransform:vi.fn(),drawImage:vi.fn()};},toBlob:(callback:(blob:Blob)=>void,type:string,quality?:number)=>{qualities.push(quality);callback(new Blob([new Uint8Array([1,2,3])],{type}));}};
      return value as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
  });
  afterEach(()=>vi.restoreAllMocks());
  test.each([["image/jpeg","jpg",90,8,6],["image/png","png",180,8,6],["image/webp","webp",270,6,8]])("%s rotate與crop維持格式",async(type,extension,rotation,width,height)=>{const result=await transformImage(new Blob([exifJpeg(type==="image/jpeg"?6:1)],{type}),`photo.${extension}`,rotation as 90,calculateCrop(width as number,height as number,"1:1"));expect(result.file.type).toBe(type);expect(result.file.name).toMatch(new RegExp(`-edited\\.${extension}$`));expect(result.width).toBe(result.height);expect(result.metadata.normalizedOrientation).toBe(true);});
  test("手機直式JPEG輸出真正直式pixels且不再依賴EXIF",async()=>{const result=await transformImage(new Blob([exifJpeg(6)],{type:"image/jpeg"}),"phone.jpg",0,calculateCrop(6,8,"original"));expect(result.width).toBe(6);expect(result.height).toBe(8);expect(result.width).toBeLessThan(result.height);expect(result.metadata).toMatchObject({originalOrientation:6,normalizedOrientation:true});});
  test.each([[1,8,6],[3,8,6],[6,6,8],[8,6,8]])("Editor先套用Orientation %s",async(orientation,width,height)=>{const rendered=await renderEditorCanvas(new Blob([exifJpeg(orientation)],{type:"image/jpeg"}),0);expect(rendered.canvas.width).toBe(width);expect(rendered.canvas.height).toBe(height);});
  test("Chrome已套用EXIF後不會再次交換座標，180度加4:3可輸出",async()=>{const result=await transformImage(new Blob([exifJpeg(6)],{type:"image/jpeg"}),"phone.jpg",180,calculateCrop(6,8,"4:3"));expect(result).toMatchObject({width:6,height:5,metadata:{rotation:180,originalOrientation:6,crop:{aspectRatio:"4:3"}}});expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob));});
  test("90度加裁切可輸出有效整數尺寸",async()=>{const result=await transformImage(new Blob([exifJpeg(6)],{type:"image/jpeg"}),"phone.jpg",90,{x:.1,y:.2,width:.7,height:.6,aspectRatio:"free"});expect(result.width).toBe(6);expect(result.height).toBe(4);expect(result.width).toBeGreaterThan(0);expect(result.height).toBeGreaterThan(0);});
  test("JPEG固定quality 0.92，PNG不帶quality且Canvas保留alpha",async()=>{await transformImage(new Blob([exifJpeg(1)],{type:"image/jpeg"}),"a.jpg",0,calculateCrop(8,6,"original"));await transformImage(new Blob([new Uint8Array(24)],{type:"image/png"}),"a.png",0,calculateCrop(8,6,"original"));expect(qualities).toContain(JPEG_OUTPUT_QUALITY);expect(qualities).toContain(undefined);expect(alphaOptions).toContainEqual({alpha:true});});
  test("decode失敗不會產生輸出",async()=>{vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error("decode"));await expect(transformImage(new Blob([exifJpeg(1)],{type:"image/jpeg"}),"bad.jpg",0,calculateCrop(8,6,"original"))).rejects.toThrow("IMAGE_DECODE_FAILED");expect(qualities).toHaveLength(0);});
});
