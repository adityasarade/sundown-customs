const W = 160,
  H = 80;

function load(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load."));
    img.src = url;
  });
}

async function pixels(url: string) {
  const img = await load(url);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.drawImage(img, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}

/**
 * Share of the livery that visibly changed between two saved bitmaps.
 * A straight per-pixel colour comparison on a 160 × 80 sample — no recognition.
 */
export async function paintChange(before: string, after: string) {
  try {
    const [a, b] = await Promise.all([pixels(before), pixels(after)]);
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d =
        Math.abs(a[i] - b[i]) +
        Math.abs(a[i + 1] - b[i + 1]) +
        Math.abs(a[i + 2] - b[i + 2]);
      if (d > 54) changed++;
    }
    return changed / (W * H);
  } catch {
    return 0.1;
  }
}
