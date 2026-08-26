import type { PreviewImageModel } from "../../preview/preview-model";
import { PreviewImage } from "./PreviewImage";

export function PreviewGallery({ images, title }: { images: PreviewImageModel[]; title: string }) {
  if (!images.length) return null;
  return <section className="public-preview__section"><h2>{title}</h2><div className="public-preview__gallery">{images.map((image, index) => <PreviewImage image={image} key={`${index}-${image.alt}`} />)}</div></section>;
}
