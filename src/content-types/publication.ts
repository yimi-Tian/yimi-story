import type { ActivityData } from "./activity";
import type { ClassResultData } from "./class-result";
import type { PublicationMedia } from "./media";

export type ApprovedContentPublication = {
  schemaVersion: "1.0";
  contentType: "class_result" | "activity";
  status: "approved";
  data: ClassResultData | ActivityData;
  media: PublicationMedia[];
};
