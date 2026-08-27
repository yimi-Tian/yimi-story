import { useState } from "react";
import type { PreviewImageModel } from "../../preview/preview-model";

export function PreviewImage({ image, className = "" }: { image: PreviewImageModel; className?: string }) {
  const [url, setUrl] = useState(image.url);
  const [usedFallback, setUsedFallback] = useState(false);
  if (!url) return <div className={`preview-image-fallback ${className}`} role="img" aria-label={image.alt}>圖片暫時無法預覽</div>;
  return <img className={className} src={url} alt={image.alt} onError={() => {
    if (!usedFallback && image.fallbackUrl && image.fallbackUrl !== url) { setUsedFallback(true); setUrl(image.fallbackUrl); }
    else setUrl(null);
  }} />;
}
