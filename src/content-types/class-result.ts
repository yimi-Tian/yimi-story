export type ClassResultData = {
  id: string;
  year: number;
  title: string;
  className: string;
  instructor: string;
  description: string;
  districts: string[];
  venue: string;
  tags: string[];
  sdgs: string[];
  displayOrder: number;
  internalNotes: string | null;
  publicNotes: string | null;
  coverAssetId: string | null;
  galleryAssetIds: string[];
};

export type PublishedClassResult = {
  id: string;
  year: number;
  title: string;
  className: string;
  instructor: string;
  description: string;
  districts: string[];
  venue: string;
  photoFolder: string;
  coverImage: string;
  coverImageAlt: string;
  images: string[];
  imageAlts: string[];
  publicationStatus: "approved";
  tags: string[];
  sdgs: string[];
  displayOrder: number;
  publicNotes: string | null;
};
