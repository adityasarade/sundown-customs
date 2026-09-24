function load(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!url) return resolve(null);
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = url;
  });
}

/** Bay PD roadside billboard built from the real CCTV still and the livery the cameras saw. */
export async function wantedBillboard(shot: string, livery: string, alias: string) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const [cam, paint] = await Promise.all([load(shot), load(livery)]);
  ctx.fillStyle = "#101022";
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "#e3163b";
  ctx.fillRect(0, 0, 1024, 96);
  ctx.fillStyle = "#fff";
  ctx.font = 'italic 900 78px "Barlow Condensed", Impact, sans-serif';
  ctx.textBaseline = "middle";
  ctx.fillText("HAVE YOU SEEN THIS CAR?", 34, 50, 740);
  ctx.font = '800 26px "Barlow Condensed", Impact, sans-serif';
  ctx.textAlign = "right";
  ctx.fillText("BAY PD", 990, 50);
  ctx.textAlign = "left";
  if (cam) {
    ctx.filter = "grayscale(1) contrast(1.3)";
    const r = Math.max(470 / cam.width, 300 / cam.height);
    const sw = 470 / r,
      sh = 300 / r;
    ctx.drawImage(cam, (cam.width - sw) / 2, (cam.height - sh) / 2, sw, sh, 34, 120, 470, 300);
    ctx.filter = "none";
  }
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 6;
  ctx.strokeRect(34, 120, 470, 300);
  if (paint) ctx.drawImage(paint, 530, 120, 460, 230);
  ctx.strokeRect(530, 120, 460, 230);
  ctx.fillStyle = "#ffcf4a";
  ctx.font = '900 44px "Barlow Condensed", Impact, sans-serif';
  ctx.fillText("$5,000 REWARD", 530, 392);
  ctx.fillStyle = "#fff";
  ctx.font = '700 24px "DM Sans", sans-serif';
  ctx.fillText(`SUSPECT “${alias}” · LAST SEEN IN THIS PAINT`, 34, 470, 720);
  ctx.fillStyle = "#ffcf4a";
  ctx.textAlign = "right";
  ctx.fillText("TIP LINE 555-0199", 990, 470);
  return c.toDataURL("image/jpeg", 0.88);
}
