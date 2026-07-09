import { useEffect, useMemo, useState } from "react";

type HeicImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  type?: string;
  name?: string;
};

function isHeicSource(src: string, type?: string, name?: string) {
  const mime = (type || "").toLowerCase();
  const label = `${src} ${name || ""}`.toLowerCase().split("?")[0];
  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    label.endsWith(".heic") ||
    label.endsWith(".heif")
  );
}

export function HeicImage({ src, type, name, alt, ...props }: HeicImageProps) {
  const shouldConvert = useMemo(() => isHeicSource(src, type, name), [src, type, name]);
  const [convertedSrc, setConvertedSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!shouldConvert || !src) {
      setConvertedSrc("");
      setFailed(false);
      return;
    }

    let disposed = false;
    let objectUrl = "";
    setConvertedSrc("");
    setFailed(false);

    async function convertForPreview() {
      try {
        const [response, module] = await Promise.all([fetch(src), import("heic2any")]);
        const sourceBlob = await response.blob();
        const converted = await module.default({
          blob: sourceBlob,
          toType: "image/jpeg",
          quality: 0.9,
        });
        const previewBlob = Array.isArray(converted) ? converted[0] : converted;
        objectUrl = URL.createObjectURL(previewBlob);
        if (!disposed) setConvertedSrc(objectUrl);
      } catch {
        if (!disposed) setFailed(true);
      }
    }

    convertForPreview();

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [shouldConvert, src]);

  if (shouldConvert && failed) {
    return <span className="heic-preview-fallback">HEIC</span>;
  }

  return <img src={shouldConvert ? convertedSrc : src} alt={alt} {...props} />;
}
