export const MAX_BASE = 2000; // working size while cropping
export const MAX_OUT = 1568;  // size of the cropped photo that is kept and sent for recognition
export interface Rect { x: number; y: number; w: number; h: number } // fractions of the photo, 0 to 1
export const defaultRect: Rect = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
export const MIN_CROP = 0.08;

/** Opens a photo and returns it at working size with the camera's rotation already applied. */
export async function loadBase(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, MAX_BASE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } catch {
    throw new Error('This photo could not be opened.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function rotateQuarter(src: HTMLCanvasElement, quarter: number): HTMLCanvasElement {
  const q = ((quarter % 4) + 4) % 4;
  if (q === 0) return src;
  const c = document.createElement('canvas');
  const odd = q % 2 === 1;
  c.width = odd ? src.height : src.width;
  c.height = odd ? src.width : src.height;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((q * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export async function cropToBlob(src: HTMLCanvasElement, r: Rect): Promise<{ blob: Blob; width: number; height: number }> {
  const sx = Math.round(r.x * src.width), sy = Math.round(r.y * src.height);
  const sw = Math.max(1, Math.round(r.w * src.width)), sh = Math.max(1, Math.round(r.h * src.height));
  const k = Math.min(1, MAX_OUT / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  c.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not prepare the photo.'))), 'image/jpeg', 0.85));
  return { blob, width: c.width, height: c.height };
}
