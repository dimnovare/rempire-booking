/**
 * A photo straight from a phone is several MB. The browser makes it a JPEG
 * that fits 800×1000 (about 100 KB) before it is sent, turned the right way
 * up. Throws when the file is not a picture the browser can read.
 *
 * For a barber's portrait (staff/[id]/forms.tsx) and a client's photo
 * (clients/[id]/tab-card.tsx). `ground` is what a see-through PNG gets
 * behind it instead of JPEG's default: the colour of the page it is shown on.
 */
export async function shrinkPhoto(file: File, ground = "#000"): Promise<Blob> {
  const img = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, 800 / img.width, 1000 / img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * k));
  canvas.height = Math.max(1, Math.round(img.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/jpeg", 0.86));
}
