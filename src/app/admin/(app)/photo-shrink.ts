/**
 * A photo straight from a phone is several MB. The browser makes it a JPEG
 * that fits 800×1000 (about 100 KB) before it is sent, turned the right way
 * up. Throws when the file is not a picture the browser can read.
 *
 * For a barber's portrait (staff/[id]/forms.tsx) and a client's photo
 * (clients/[id]/tab-card.tsx). `ground` is what a see-through PNG gets
 * behind it instead of JPEG's default: the colour of the page it is shown on.
 *
 * `box` is another size to fit (the salon's gallery and logo, settings/).
 * With `alpha` a see-through picture stays see-through (a logo): WebP where
 * the browser can write it, else JPEG on `ground` after all, since a PNG
 * of a photo can be over the server's 600 KB.
 */
const MAX_BYTES = 600_000;

export async function shrinkPhoto(file: File, ground = "#000", box: { w: number; h: number; alpha?: boolean } = { w: 800, h: 1000 }): Promise<Blob> {
  const img = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, box.w / img.width, box.h / img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * k));
  canvas.height = Math.max(1, Math.round(img.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  const blob = (type: string, quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), type, quality));
  const draw = (fill: boolean) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (fill) {
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  try {
    if (box.alpha) {
      draw(false);
      // Safari writes no WebP and hands back a PNG instead: that is kept only while it is small
      const clear = await blob("image/webp", 0.9);
      if ((clear.type === "image/webp" || clear.type === "image/png") && clear.size <= MAX_BYTES) return clear;
    }
    draw(true);
    return await blob("image/jpeg", 0.86);
  } finally {
    img.close();
  }
}
