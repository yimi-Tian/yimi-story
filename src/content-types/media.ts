export type PublicationMedia = {
  id: string;
  role: "cover" | "gallery";
  sortOrder: number;
  url: string;
  altText: string;
  source: "github_legacy" | "supabase_upload";
};
