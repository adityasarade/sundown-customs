import { DECALS } from "./decals";

/** Default GTA Online-style crew emblem: a 512 × 512 badge the visitor then edits in Unlayer. */
export function createEmblem(crew: string, decalId = "bay-bonez"): string {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const decal = DECALS.find((d) => d.id === decalId) ?? DECALS[0];
  decal.draw(ctx, 512);
  ctx.save();
  ctx.translate(256, 420);
  ctx.rotate(-0.05);
  ctx.fillStyle = "#141323";
  ctx.fillRect(-190, -40, 380, 80);
  ctx.fillStyle = "#ffcf4a";
  ctx.fillRect(-180, -31, 360, 62);
  ctx.fillStyle = "#141323";
  ctx.font = 'italic 900 56px "Barlow Condensed", Impact, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((crew || "GHOST").toUpperCase(), 0, 3, 330);
  ctx.restore();
  return c.toDataURL("image/png");
}
