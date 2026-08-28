import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PublicationPreparationPanel } from "./PublicationPreparationPanel";

const mocks=vi.hoisted(()=>({fetch:vi.fn(),request:vi.fn()}));
vi.mock("../../data/publication-repository",()=>({fetchPublicationSnapshots:mocks.fetch,requestPublicationPreparation:mocks.request}));
const client={} as never,base={client,contentId:"content-safe",draftId:"draft-safe",revision:4,draftStatus:"validated",blocked:false};
const preparation={valid:true,errors:[],warnings:[],validation:{revision:4,mediaCount:2,coverReady:true,exporterDeterministic:true},checksum:"a".repeat(64)};
afterEach(()=>cleanup());

test("先通過發布前檢查才可確認建立且明示不會公開",async()=>{mocks.fetch.mockResolvedValue([]);mocks.request.mockResolvedValue({preparation});const confirm=vi.spyOn(window,"confirm").mockReturnValue(true);render(<PublicationPreparationPanel {...base}/>);const create=await screen.findByRole("button",{name:"建立發布快照"});expect(create).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:"發布前檢查"}));await waitFor(()=>expect(create).toBeEnabled());fireEvent.click(create);await waitFor(()=>expect(confirm).toHaveBeenCalledWith("將以目前草稿版本 r4 建立不可變更的發布快照。\n此步驟不會立即更新公開網站。"));expect(screen.getByText(/不會更新公開網站/)).toBeInTheDocument();confirm.mockRestore();});
test("顯示目前與舊revision摘要，不顯示UUID或raw JSON",async()=>{mocks.fetch.mockResolvedValue([{revision:4,checksum:"a".repeat(64),status:"ready",createdAt:"2026-08-28T00:00:00Z"},{revision:3,checksum:"b".repeat(64),status:"ready",createdAt:"2026-08-27T00:00:00Z"}]);render(<PublicationPreparationPanel {...base}/>);expect(await screen.findByText("發布快照已建立")).toBeInTheDocument();expect(screen.getByText("目前草稿版本・尚未公開")).toBeInTheDocument();expect(screen.getByText("不是目前最新草稿版本")).toBeInTheDocument();expect(screen.queryByText("draft-safe")).not.toBeInTheDocument();expect(screen.queryByText(/publicData/)).not.toBeInTheDocument();});
test("dirty或未validated時不可建立snapshot",async()=>{mocks.fetch.mockResolvedValue([]);render(<PublicationPreparationPanel {...base} blocked draftStatus="draft"/>);expect(await screen.findByRole("button",{name:"發布前檢查"})).toBeDisabled();expect(screen.getByRole("button",{name:"建立發布快照"})).toBeDisabled();expect(screen.getByText(/請先完成並儲存/)).toBeInTheDocument();});
