import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { DraftMediaAsset } from "../../data/media-repository";

const editing=vi.hoisted(()=>({renderEditorCanvas:vi.fn(),transformRenderedCanvas:vi.fn()}));
vi.mock("../../media/image-editing",async(importOriginal)=>({...await importOriginal<typeof import("../../media/image-editing")>(),...editing}));
import { ImageEditorModal } from "./ImageEditorModal";

const asset:DraftMediaAsset={id:"media",referenceId:"media",contentId:"content",draftId:"draft",source:"cms_draft",role:"cover",legacyPath:null,bucket:"cms-drafts",objectPath:"owner/content/media/media.jpg",originalFilename:"phone.jpg",mimeType:"image/jpeg",byteSize:20,width:8,height:6,checksumSha256:"a".repeat(64),originalMediaId:null,transformation:null,altText:"手機照片",containsPortrait:"yes",rightsStatus:"authorized",previewUrl:"https://signed.test/media"};

beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(new Blob([new Uint8Array([1])],{type:"image/jpeg"}),{status:200})));
  vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);
  editing.renderEditorCanvas.mockImplementation(async()=>{const canvas=document.createElement("canvas");canvas.width=8;canvas.height=6;return{canvas,orientation:1};});
  editing.transformRenderedCanvas.mockResolvedValue({file:new File(["edited"],"phone-edited.jpg",{type:"image/jpeg"}),metadata:{rotation:90,crop:{x:0,y:0,width:1,height:1,aspectRatio:"original"},normalizedOrientation:true,originalOrientation:1},width:6,height:8});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

test("取消未儲存旋轉會提醒且不upload、不改revision",async()=>{const onCancel=vi.fn(),onSave=vi.fn(),onDirtyState=vi.fn();const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);render(<ImageEditorModal asset={asset} onCancel={onCancel} onSave={onSave} onDirtyState={onDirtyState}/>);await screen.findByRole("button",{name:"向左旋轉"});await userEvent.click(screen.getByRole("button",{name:"向左旋轉"}));await waitFor(()=>expect(onDirtyState).toHaveBeenCalledWith(true));await userEvent.click(screen.getByRole("button",{name:"取消"}));expect(confirm).toHaveBeenCalled();expect(onCancel).not.toHaveBeenCalled();expect(onSave).not.toHaveBeenCalled();expect(editing.transformRenderedCanvas).not.toHaveBeenCalled();});

test("儲存期間重用預覽Canvas且只提交一次新版本",async()=>{const onSave=vi.fn(async()=>undefined);render(<ImageEditorModal asset={asset} onCancel={vi.fn()} onSave={onSave} onDirtyState={vi.fn()}/>);await screen.findByRole("button",{name:"向右旋轉"});await userEvent.click(screen.getByRole("button",{name:"向右旋轉"}));await userEvent.click(screen.getByRole("button",{name:"儲存新版本"}));await waitFor(()=>expect(onSave).toHaveBeenCalledTimes(1));expect(editing.transformRenderedCanvas).toHaveBeenCalledTimes(1);expect(editing.renderEditorCanvas).toHaveBeenCalledTimes(2);});

test("儲存失敗顯示安全步驟與錯誤碼",async()=>{editing.transformRenderedCanvas.mockRejectedValueOnce(new Error("IMAGE_ENCODE_FAILED"));render(<ImageEditorModal asset={asset} onCancel={vi.fn()} onSave={vi.fn()} onDirtyState={vi.fn()}/>);await screen.findByRole("button",{name:"儲存新版本"});await userEvent.click(screen.getByRole("button",{name:"儲存新版本"}));expect(await screen.findByRole("alert")).toHaveTextContent("IMAGE_ENCODE_FAILED");expect(screen.getByRole("alert")).toHaveTextContent("canvas.toBlob");});
