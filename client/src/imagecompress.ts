/**
 * Photos are resized on the phone before they are sent, like Telegram: at most 2560 px on the long
 * side, re-encoded as JPEG. A 4 MB phone photo becomes about half a megabyte, so the server keeps
 * far less and the upload is quick on a slow link. Re-encoding also drops the EXIF block, which
 * carries the GPS position where the photo was taken.
 */
const MAX_SIDE = 2560;
const QUALITY = 0.82;

/** Formats we re-encode. GIFs stay as they are (they may be animated). */
const RECODE = /^image\/(jpeg|jpg|pjpeg|heic|heif|webp|avif|bmp)$/i;
/** PNGs are mostly screenshots: kept sharp unless they are big. */
const PNG_LIMIT = 1 << 20;

async function decode(
  file: Blob,
): Promise<{ img: CanvasImageSource; w: number; h: number; done(): void }> {
  if ("createImageBitmap" in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { img: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
    } catch {
      /* fall back to an <img>, e.g. formats only the image element understands */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const el = new Image();
    el.decoding = "async";
    el.src = url;
    await el.decode();
    return { img: el, w: el.naturalWidth, h: el.naturalHeight, done: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
}

/** Returns the photo ready to upload; falls back to the original on anything unexpected. */
export async function compressImage(file: File): Promise<File> {
  const type = file.type.toLowerCase();
  const png = type === "image/png";
  if (!RECODE.test(type) && !(png && file.size > PNG_LIMIT)) return file;
  let src: Awaited<ReturnType<typeof decode>>;
  try {
    src = await decode(file);
  } catch {
    return file;
  }
  try {
    if (!src.w || !src.h || src.w * src.h > 60_000_000) return file;
    const scale = Math.min(1, MAX_SIDE / Math.max(src.w, src.h));
    const w = Math.max(1, Math.round(src.w * scale));
    const h = Math.max(1, Math.round(src.h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no transparency (PNG, WebP): put the picture on white rather than black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src.img, 0, 0, w, h);
    const blob = await toJpeg(canvas);
    canvas.width = canvas.height = 0; // free the bitmap memory right away on iOS
    if (!blob) return file;
    // A small PNG that grew as JPEG is not worth it; JPEGs are always re-encoded for the EXIF.
    if (png && blob.size >= file.size) return file;
    const name = (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    src.done();
  }
}
