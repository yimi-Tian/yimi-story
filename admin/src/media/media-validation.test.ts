import { describe, expect, test } from "vitest";
import { detectImageType, findOrphanDraftMedia, hasDuplicateChecksum, readImageDimensions, reorderAssetIds, safeStoragePath, validateMediaFile } from "./media-validation";

const png=(w=640,h=480)=>{const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10],0);b.set([73,72,68,82],12);new DataView(b.buffer).setUint32(16,w);new DataView(b.buffer).setUint32(20,h);return b;};
const jpeg=(w=640,h=480)=>new Uint8Array([255,216,255,192,0,11,8,h>>8,h&255,w>>8,w&255,3,0,0,0,255,217]);
const webp=(w=640,h=480)=>{const b=new Uint8Array(30);b.set(new TextEncoder().encode("RIFF"),0);b.set(new TextEncoder().encode("WEBPVP8X"),8);const ww=w-1,hh=h-1;b.set([ww&255,ww>>8&255,ww>>16&255,hh&255,hh>>8&255,hh>>16&255],24);return b;};
const file=(bytes:Uint8Array,name:string,type:string)=>new File([bytes as BlobPart],name,{type});

describe("Stage 5B-2 media validation",()=>{
  test.each([
    ["JPEG",jpeg(),"photo.jpeg","image/jpeg",640,480],
    ["PNG",png(),"photo.png","image/png",640,480],
    ["WebP",webp(),"photo.webp","image/webp",640,480],
  ])("%s magic bytes、尺寸與 SHA-256",async(_,bytes,name,type,width,height)=>{
    const result=await validateMediaFile(file(bytes as Uint8Array,name as string,type as string));
    expect(result).toMatchObject({mimeType:type,width,height});expect(result.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });
  test("SVG、fake JPG、corrupt image 與超過 10MB 均拒絕",async()=>{
    await expect(validateMediaFile(file(new TextEncoder().encode("<svg></svg>"),"x.svg","image/svg+xml"))).rejects.toThrow("MEDIA_TYPE_UNSUPPORTED");
    await expect(validateMediaFile(file(new TextEncoder().encode("not jpeg"),"x.jpg","image/jpeg"))).rejects.toThrow("MEDIA_HEADER_MISMATCH");
    await expect(validateMediaFile(file(new Uint8Array([255,216,255]),"x.jpg","image/jpeg"))).rejects.toThrow("MEDIA_CORRUPT");
    await expect(validateMediaFile(file(new Uint8Array(10*1024*1024+1),"x.png","image/png"))).rejects.toThrow("MEDIA_TOO_LARGE");
  });
  test("低於300px只產生warning，超過12000px拒絕",async()=>{
    expect((await validateMediaFile(file(png(299,300),"x.png","image/png"))).warnings).toHaveLength(1);
    await expect(validateMediaFile(file(png(12001,300),"x.png","image/png"))).rejects.toThrow("MEDIA_DIMENSIONS_TOO_LARGE");
  });
  test("Storage path只接受UUID segment與安全副檔名",()=>{
    const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"];
    expect(safeStoragePath(ids[0],ids[1],ids[2],"jpg")).toBe(`${ids[0]}/${ids[1]}/${ids[2]}/${ids[2]}.jpg`);
    expect(()=>safeStoragePath("../admin",ids[1],ids[2],"jpg")).toThrow("INVALID_STORAGE_SEGMENT");
  });
  test("排序保留asset IDs且邊界安全",()=>{expect(reorderAssetIds(["a","b","c"],1,-1)).toEqual(["b","a","c"]);expect(reorderAssetIds(["a"],0,-1)).toEqual(["a"]);});
  test("同content checksum重複可被阻擋",()=>expect(hasDuplicateChecksum([{checksumSha256:"abc"}],"abc")).toBe(true));
  test("orphan cleanup只挑未被canonical refs引用的cms_draft",()=>{const assets=[{source:"cms_draft",referenceId:"keep"},{source:"cms_draft",referenceId:"orphan"},{source:"github_legacy",referenceId:"legacy"}];expect(findOrphanDraftMedia(assets,"keep",[])).toEqual([assets[1]]);});
  test("header helpers拒絕未知格式",()=>{expect(detectImageType(new Uint8Array([1,2,3]))).toBeNull();expect(readImageDimensions(new Uint8Array([255,216,255]),"image/jpeg")).toBeNull();});
});
