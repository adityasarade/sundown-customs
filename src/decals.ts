/** Original, canvas-only sticker artwork for Solana Bay garage liveries. */
export type DecalCategory = "crew" | "number" | "sponsor" | "flair";
export type Decal = {
  id: string;
  name: string;
  category: DecalCategory;
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
};

export type Slot = "hood" | "doorFront" | "doorRear" | "roofline";

const INK = "#141323";
const PINK = "#ff4fb0";
const CYAN = "#52e8ff";
const ORANGE = "#ff8a5c";
const GOLD = "#ffcf4a";
const CREAM = "#f0ead9";
const FONT = '"Barlow Condensed", Impact, sans-serif';
const thumbnailCache = new Map<string, string>();

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, italic = false, max?: number): void {
  ctx.font = `${italic ? "italic " : ""}900 ${px}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, px * 0.13);
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y, max);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, max);
}

function sticker(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  draw();
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const d = i % 2 === 0 ? r : r * 0.43;
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.18;
  ctx.fill(); ctx.stroke();
}

function roundel(ctx: CanvasRenderingContext2D, size: number, number: string, color: string): void {
  const c = size / 2;
  ctx.beginPath(); ctx.arc(c, c, size * 0.43, 0, Math.PI * 2);
  ctx.fillStyle = CREAM; ctx.strokeStyle = INK; ctx.lineWidth = size * 0.07; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(c, c, size * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.lineWidth = size * 0.035; ctx.fill(); ctx.stroke();
  outlinedText(ctx, number, c, c + size * 0.01, size * 0.50, CREAM, true);
}

function banner(ctx: CanvasRenderingContext2D, size: number, top: string, bottom: string, color: string): void {
  const w = size * 0.94; const h = size * 0.43; const x = (size - w) / 2; const y = size * 0.29;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.18); ctx.lineTo(x + w * 0.12, y); ctx.lineTo(x + w, y + h * 0.14);
  ctx.lineTo(x + w * 0.88, y + h); ctx.lineTo(x, y + h * 0.84); ctx.closePath();
  ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = size * 0.055; ctx.fill(); ctx.stroke();
  outlinedText(ctx, top, size / 2, y + h * 0.36, size * 0.17, CREAM, true);
  if (bottom) outlinedText(ctx, bottom, size / 2, y + h * 0.67, size * 0.105, GOLD);
}

function palmSkull(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  ctx.strokeStyle = INK; ctx.lineWidth = size * 0.075; ctx.fillStyle = CREAM;
  ctx.beginPath(); ctx.arc(c, size * 0.54, size * 0.20, Math.PI * 0.08, Math.PI * 0.92); ctx.lineTo(c + size * .13, size * .79); ctx.lineTo(c - size * .13, size * .79); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK;
  for (const dx of [-.075, .075]) { ctx.beginPath(); ctx.arc(c + size * dx, size * .54, size * .045, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(c, size * .61); ctx.lineTo(c - size * .035, size * .68); ctx.lineTo(c + size * .035, size * .68); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(c, size * .37); ctx.quadraticCurveTo(c - size * .22, size * .10, c - size * .38, size * .19); ctx.moveTo(c, size * .37); ctx.quadraticCurveTo(c + size * .22, size * .10, c + size * .38, size * .19); ctx.strokeStyle = CYAN; ctx.lineWidth = size * .07; ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = size * .045; ctx.beginPath(); ctx.moveTo(c, size * .31); ctx.lineTo(c, size * .08); ctx.moveTo(c, size * .15); ctx.lineTo(c - size * .14, size * .06); ctx.moveTo(c, size * .15); ctx.lineTo(c + size * .14, size * .06); ctx.stroke();
  outlinedText(ctx, "BAY BONEZ", c, size * .91, size * .135, PINK, true);
}

function wingedSunset(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  ctx.beginPath(); ctx.arc(c, size * .48, size * .22, 0, Math.PI * 2); ctx.fillStyle = ORANGE; ctx.strokeStyle = INK; ctx.lineWidth = size * .055; ctx.fill(); ctx.stroke();
  ctx.strokeStyle = GOLD; ctx.lineWidth = size * .035;
  for (let y = .40; y < .61; y += .06) { ctx.beginPath(); ctx.moveTo(c - size*.19, size*y); ctx.lineTo(c + size*.19, size*y); ctx.stroke(); }
  ctx.fillStyle = CREAM; ctx.strokeStyle = INK; ctx.lineWidth = size*.05;
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(c + d*size*.16, size*.43); ctx.quadraticCurveTo(c + d*size*.40, size*.22, c + d*size*.43, size*.48); ctx.quadraticCurveTo(c + d*size*.31, size*.54, c + d*size*.17, size*.61); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  outlinedText(ctx, "SUNSET RUN", c, size * .84, size*.15, PINK, true);
}

function flamingo(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.strokeStyle = INK; ctx.lineWidth = size*.12; ctx.beginPath(); ctx.arc(size*.51, size*.43, size*.22, -.3, Math.PI*1.45); ctx.stroke();
  ctx.strokeStyle = PINK; ctx.lineWidth = size*.065; ctx.beginPath(); ctx.arc(size*.51, size*.43, size*.22, -.3, Math.PI*1.45); ctx.stroke();
  ctx.fillStyle = PINK; ctx.strokeStyle = INK; ctx.lineWidth=size*.045; ctx.beginPath(); ctx.arc(size*.55,size*.57,size*.19,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle=INK;ctx.lineWidth=size*.045;ctx.beginPath();ctx.moveTo(size*.48,size*.72);ctx.lineTo(size*.42,size*.88);ctx.moveTo(size*.60,size*.72);ctx.lineTo(size*.66,size*.88);ctx.stroke();
  ctx.fillStyle=INK;ctx.beginPath();ctx.moveTo(size*.44,size*.28);ctx.lineTo(size*.25,size*.30);ctx.lineTo(size*.42,size*.36);ctx.closePath();ctx.fill();
  outlinedText(ctx,"NEON BIRD",size*.5,size*.94,size*.12,CYAN,true);
}

function snakeDice(ctx: CanvasRenderingContext2D, size: number): void {
  for (const [x, y, a] of [[.32,.55,-.2],[.68,.55,.2]] as const) { ctx.save();ctx.translate(size*x,size*y);ctx.rotate(a);ctx.fillStyle=CREAM;ctx.strokeStyle=INK;ctx.lineWidth=size*.06;ctx.fillRect(-size*.14,-size*.14,size*.28,size*.28);ctx.strokeRect(-size*.14,-size*.14,size*.28,size*.28);ctx.fillStyle=PINK;for(const [dx,dy] of [[-.07,-.07],[.07,.07],[0,0]]){ctx.beginPath();ctx.arc(size*dx,size*dy,size*.025,0,Math.PI*2);ctx.fill();}ctx.restore(); }
  ctx.strokeStyle=INK;ctx.lineWidth=size*.115;ctx.beginPath();ctx.moveTo(size*.12,size*.23);ctx.bezierCurveTo(size*.72,size*.04,size*.12,size*.94,size*.86,size*.72);ctx.stroke();ctx.strokeStyle=CYAN;ctx.lineWidth=size*.06;ctx.stroke();
  outlinedText(ctx,"SNAKE EYES",size*.5,size*.12,size*.14,GOLD,true);
}

function crownKings(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.beginPath();ctx.moveTo(size*.25,size*.53);ctx.lineTo(size*.18,size*.23);ctx.lineTo(size*.38,size*.38);ctx.lineTo(size*.5,size*.14);ctx.lineTo(size*.62,size*.38);ctx.lineTo(size*.82,size*.23);ctx.lineTo(size*.75,size*.53);ctx.closePath();ctx.fillStyle=GOLD;ctx.strokeStyle=INK;ctx.lineWidth=size*.06;ctx.fill();ctx.stroke();
  banner(ctx,size,"KINGS","OF THE CAUSEWAY",PINK);
}

function sponsor(ctx: CanvasRenderingContext2D, size: number, main: string, sub: string, color: string, icon: "drop" | "palm" | "bolt" | "motel" | "speed"): void {
  ctx.fillStyle=INK;ctx.beginPath();ctx.roundRect(size*.05,size*.22,size*.90,size*.56,size*.08);ctx.fill();ctx.fillStyle=color;ctx.fillRect(size*.08,size*.26,size*.84,size*.48);
  if(icon==="bolt"){ctx.fillStyle=GOLD;ctx.beginPath();ctx.moveTo(size*.25,size*.29);ctx.lineTo(size*.12,size*.55);ctx.lineTo(size*.25,size*.55);ctx.lineTo(size*.17,size*.72);ctx.lineTo(size*.43,size*.45);ctx.lineTo(size*.29,size*.45);ctx.closePath();ctx.fill();}
  if(icon==="drop"){ctx.fillStyle=GOLD;ctx.beginPath();ctx.arc(size*.23,size*.52,size*.10,0,Math.PI*2);ctx.fill();ctx.fillStyle=INK;ctx.beginPath();ctx.moveTo(size*.23,size*.35);ctx.lineTo(size*.14,size*.55);ctx.lineTo(size*.32,size*.55);ctx.closePath();ctx.fill();}
  if(icon==="palm"){ctx.strokeStyle=GOLD;ctx.lineWidth=size*.035;ctx.beginPath();ctx.moveTo(size*.22,size*.68);ctx.lineTo(size*.22,size*.37);ctx.moveTo(size*.22,size*.42);ctx.lineTo(size*.11,size*.34);ctx.moveTo(size*.22,size*.42);ctx.lineTo(size*.34,size*.32);ctx.stroke();}
  if(icon==="motel"){outlinedText(ctx,"✦",size*.23,size*.51,size*.25,GOLD);}
  if(icon==="speed"){ctx.strokeStyle=GOLD;ctx.lineWidth=size*.04;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(size*.1,size*(.38+i*.11));ctx.lineTo(size*.33,size*(.32+i*.11));ctx.stroke();}}
  outlinedText(ctx,main,size*.61,size*.46,size*.17,CREAM,true,size*.54);ctx.font=`800 ${size*.09}px ${FONT}`;ctx.fillStyle=INK;ctx.textAlign="center";ctx.fillText(sub,size*.61,size*.65,size*.54);
}

function flames(ctx: CanvasRenderingContext2D, size: number): void { ctx.fillStyle=ORANGE;ctx.strokeStyle=INK;ctx.lineWidth=size*.055;ctx.beginPath();ctx.moveTo(size*.05,size*.72);ctx.bezierCurveTo(size*.22,size*.37,size*.22,size*.83,size*.35,size*.49);ctx.bezierCurveTo(size*.44,size*.17,size*.52,size*.70,size*.60,size*.39);ctx.bezierCurveTo(size*.75,size*.07,size*.79,size*.58,size*.95,size*.27);ctx.lineTo(size*.91,size*.76);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle=GOLD;ctx.lineWidth=size*.035;ctx.beginPath();ctx.moveTo(size*.18,size*.71);ctx.quadraticCurveTo(size*.31,size*.50,size*.34,size*.64);ctx.quadraticCurveTo(size*.48,size*.42,size*.55,size*.61);ctx.stroke(); }

function tiger(ctx: CanvasRenderingContext2D,size:number):void{ctx.fillStyle=ORANGE;ctx.strokeStyle=INK;ctx.lineWidth=size*.05;ctx.fillRect(size*.06,size*.18,size*.88,size*.64);ctx.strokeRect(size*.06,size*.18,size*.88,size*.64);ctx.fillStyle=INK;for(let i=0;i<6;i++){const x=size*(.16+i*.14);ctx.beginPath();ctx.moveTo(x,size*.2);ctx.lineTo(x+size*.09,size*.2);ctx.lineTo(x-size*.03,size*.8);ctx.closePath();ctx.fill();}}

function bolt(ctx:CanvasRenderingContext2D,size:number):void{ctx.beginPath();ctx.moveTo(size*.56,size*.06);ctx.lineTo(size*.15,size*.54);ctx.lineTo(size*.46,size*.54);ctx.lineTo(size*.35,size*.94);ctx.lineTo(size*.86,size*.37);ctx.lineTo(size*.58,size*.37);ctx.closePath();ctx.fillStyle=CYAN;ctx.strokeStyle=INK;ctx.lineWidth=size*.07;ctx.fill();ctx.stroke();}

function badge(ctx: CanvasRenderingContext2D, size: number, ring: string, fill: string): void {
  const c = size / 2;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(c, c, size * .47, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(c, c, size * .43, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(c, c, size * .36, 0, Math.PI * 2); ctx.fill();
}
function skullBadge(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2, u = size / 100;
  badge(ctx, size, PINK, "#1b1030");
  // palm fronds behind the skull
  ctx.strokeStyle = CYAN; ctx.lineWidth = 5 * u; ctx.lineCap = "round";
  for (const a of [-2.5, -2.0, -1.15, -0.65]) { ctx.beginPath(); ctx.moveTo(c, 36 * u); ctx.quadraticCurveTo(c + Math.cos(a) * 18 * u, 36 * u + Math.sin(a) * 22 * u, c + Math.cos(a) * 30 * u, 36 * u + Math.sin(a) * 10 * u); ctx.stroke(); }
  // skull
  ctx.fillStyle = CREAM; ctx.strokeStyle = INK; ctx.lineWidth = 3.5 * u;
  ctx.beginPath(); ctx.arc(c, 50 * u, 17 * u, Math.PI * .95, Math.PI * .05); ctx.lineTo(c + 13 * u, 62 * u); ctx.lineTo(c + 10 * u, 70 * u); ctx.lineTo(c - 10 * u, 70 * u); ctx.lineTo(c - 13 * u, 62 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK;
  for (const dx of [-7, 7]) { ctx.beginPath(); ctx.ellipse(c + dx * u, 52 * u, 5 * u, 6 * u, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(c, 58 * u); ctx.lineTo(c - 3 * u, 63 * u); ctx.lineTo(c + 3 * u, 63 * u); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 2 * u; for (const dx of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(c + dx * u, 66 * u); ctx.lineTo(c + dx * u, 70 * u); ctx.strokeStyle = INK; ctx.stroke(); }
  outlinedText(ctx, "BAY BONEZ", c, 83 * u, 13 * u, GOLD, true, 58 * u);
}
function sunBadge(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2, u = size / 100;
  badge(ctx, size, ORANGE, "#241040");
  ctx.save(); ctx.beginPath(); ctx.arc(c, c, 36 * u, 0, Math.PI * 2); ctx.clip();
  const g = ctx.createLinearGradient(0, 22 * u, 0, 60 * u); g.addColorStop(0, GOLD); g.addColorStop(1, PINK);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, 58 * u, 24 * u, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#241040"; for (let i = 0; i < 4; i++) ctx.fillRect(0, (44 + i * 4) * u, size, (1.2 + i * .5) * u);
  ctx.fillStyle = CYAN; ctx.fillRect(0, 58 * u, size, 3 * u);
  ctx.restore();
  // wings
  ctx.fillStyle = CREAM; ctx.strokeStyle = INK; ctx.lineWidth = 3 * u;
  for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(c + sgn * 20 * u, 56 * u); ctx.quadraticCurveTo(c + sgn * 44 * u, 44 * u, c + sgn * 49 * u, 34 * u); ctx.quadraticCurveTo(c + sgn * 40 * u, 52 * u, c + sgn * 44 * u, 50 * u); ctx.quadraticCurveTo(c + sgn * 34 * u, 60 * u, c + sgn * 20 * u, 62 * u); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  outlinedText(ctx, "SUNSET RUN", c, 76 * u, 12 * u, CREAM, true, 56 * u);
}
function palmBadge(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2, u = size / 100;
  badge(ctx, size, CYAN, PINK);
  ctx.save(); ctx.beginPath(); ctx.arc(c, c, 36 * u, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(c + 6 * u, 56 * u, 20 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1b1030"; ctx.fillRect(0, 66 * u, size, 40 * u);
  ctx.fillStyle = CYAN; for (let i = 0; i < 3; i++) ctx.fillRect(22 * u + i * 9 * u, (70 + i * 5) * u, (56 - i * 18) * u, 1.6 * u);
  // palm
  ctx.strokeStyle = "#1b1030"; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.moveTo(40 * u, 70 * u); ctx.quadraticCurveTo(38 * u, 48 * u, 46 * u, 30 * u); ctx.stroke();
  ctx.fillStyle = "#1b1030";
  for (const a of [-2.7, -2.2, -1.6, -0.9, -0.35]) { ctx.beginPath(); ctx.moveTo(46 * u, 30 * u); ctx.quadraticCurveTo(46 * u + Math.cos(a) * 12 * u, 30 * u + Math.sin(a) * 14 * u - 4 * u, 46 * u + Math.cos(a) * 22 * u, 30 * u + Math.sin(a) * 6 * u + 8 * u); ctx.quadraticCurveTo(46 * u + Math.cos(a) * 10 * u, 30 * u + Math.sin(a) * 4 * u, 46 * u, 30 * u); ctx.fill(); }
  ctx.restore();
  outlinedText(ctx, "NEON PALMS", c, 90 * u, 10 * u, GOLD, true, 50 * u);
}
function flameStrip(ctx: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  ctx.lineJoin = "round"; ctx.strokeStyle = INK;
  // Hot-rod licks: fat at the left, curling to sharp tips on the right.
  const licks = [
    { y: 34, len: 88, h: 13 }, { y: 50, len: 96, h: 15 }, { y: 66, len: 80, h: 13 },
  ];
  const layer = (col: string, k: number, w: number) => {
    ctx.fillStyle = col; ctx.lineWidth = w * u;
    for (const l of licks) {
      const y = l.y * u, h = l.h * k * u, x1 = 6 * u + (l.len * u) * (1 - k) * 0.15, tip = (6 + l.len * (0.55 + k * 0.45)) * u;
      ctx.beginPath(); ctx.moveTo(x1, y - h);
      ctx.bezierCurveTo(tip * 0.55, y - h * 1.6, tip * 0.85, y - h * 0.2, tip, y - h * 0.9);
      ctx.bezierCurveTo(tip * 0.82, y + h * 0.3, tip * 0.6, y + h * 1.1, x1, y + h);
      ctx.quadraticCurveTo(x1 - 6 * u, y, x1, y - h);
      ctx.fill(); if (w) ctx.stroke();
    }
  };
  layer(PINK, 1, 4); layer(ORANGE, 0.7, 0); layer(GOLD, 0.4, 0);
}
export const DECALS: Decal[] = [
  {id:"bay-bonez",name:"Bay Bonez",category:"crew",draw:(c,s)=>sticker(c,()=>skullBadge(c,s))},
  {id:"sunset-run",name:"Sunset Run",category:"crew",draw:(c,s)=>sticker(c,()=>sunBadge(c,s))},
  {id:"neon-bird",name:"Neon Palms",category:"crew",draw:(c,s)=>sticker(c,()=>palmBadge(c,s))},
  {id:"snake-eyes",name:"Snake Eyes",category:"crew",draw:(c,s)=>sticker(c,()=>snakeDice(c,s))},
  {id:"causeway-kings",name:"Kings of the Causeway",category:"crew",draw:(c,s)=>sticker(c,()=>crownKings(c,s))},
  {id:"number-07",name:"Race 07",category:"number",draw:(c,s)=>roundel(c,s,"07",PINK)},
  {id:"number-87",name:"Race 87",category:"number",draw:(c,s)=>roundel(c,s,"87",CYAN)},
  {id:"number-13",name:"Race 13",category:"number",draw:(c,s)=>roundel(c,s,"13",ORANGE)},
  {id:"number-88",name:"Race 88",category:"number",draw:(c,s)=>roundel(c,s,"88",GOLD)},
  {id:"sundown-oil",name:"Sundown Oil",category:"sponsor",draw:(c,s)=>sponsor(c,s,"SUNDOWN","OIL CO.",ORANGE,"drop")},
  {id:"palm-piston",name:"Palm & Piston",category:"sponsor",draw:(c,s)=>sponsor(c,s,"PALM","& PISTON",CYAN,"palm")},
  {id:"bay-energy",name:"Bay Energy",category:"sponsor",draw:(c,s)=>sponsor(c,s,"BAY","ENERGY",PINK,"bolt")},
  {id:"no-refunds",name:"No Refunds Motel",category:"sponsor",draw:(c,s)=>sponsor(c,s,"NO REFUNDS","MOTEL",GOLD,"motel")},
  {id:"solana-speed",name:"Solana Speed",category:"sponsor",draw:(c,s)=>sponsor(c,s,"SOLANA","SPEED",ORANGE,"speed")},
  {id:"fire-trail",name:"Fire Trail",category:"flair",draw:(c,s)=>sticker(c,()=>flameStrip(c,s))},
  {id:"wanted-five",name:"Five Wanted Stars",category:"flair",draw:(c,s)=>{for(let i=0;i<5;i++)star(c,s*(.14+i*.18),s*.5,s*.105,GOLD)}},
  {id:"bad-ideas",name:"Bad Ideas",category:"flair",draw:(c,s)=>banner(c,s,"BAD IDEAS","GOOD STORIES",PINK)},
  {id:"tiger-stripes",name:"Tiger Stripes",category:"flair",draw:(c,s)=>tiger(c,s)},
  {id:"electric-bolt",name:"Electric Bolt",category:"flair",draw:(c,s)=>bolt(c,s)},
  {id:"just-resprayed",name:"Just Resprayed",category:"flair",draw:(c,s)=>banner(c,s,"JUST","RESPRAYED",CYAN)},
];

export const SLOTS: { id: Slot; name: string; x: number; y: number; size: number; rotate: number }[] = [
  {id:"hood",name:"Hood Center",x:600,y:300,size:300,rotate:0},
  {id:"doorFront",name:"Front Door",x:300,y:330,size:220,rotate:-2},
  {id:"doorRear",name:"Rear Door",x:900,y:330,size:220,rotate:2},
  {id:"roofline",name:"Roofline Banner",x:600,y:90,size:260,rotate:0},
];

function canvas(width: number, height: number): HTMLCanvasElement { const result=document.createElement("canvas"); result.width=width; result.height=height; return result; }
function drawAt(ctx: CanvasRenderingContext2D, decal: Decal, x: number, y: number, size: number, rotate = 0, wide = false): void { ctx.save();ctx.translate(x,y);ctx.rotate(rotate*Math.PI/180);if(wide)ctx.scale(1.65,.72);ctx.translate(-size/2,-size/2);decal.draw(ctx,size);ctx.restore(); }
function loadImage(src: string): Promise<HTMLImageElement> { return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("Could not load livery image."));image.src=src;}); }

export function decalThumb(id: string, size = 160): string {
  const key=`${id}:${size}`; const cached=thumbnailCache.get(key); if(cached)return cached;
  const decal=DECALS.find((item)=>item.id===id); if(!decal)throw new Error(`Unknown decal: ${id}`);
  const c=canvas(size,size); const ctx=c.getContext("2d"); if(!ctx)throw new Error("Canvas 2D is unavailable."); decal.draw(ctx,size); const data=c.toDataURL("image/png");thumbnailCache.set(key,data);return data;
}

export async function composeLivery(baseDataUrl: string, placed: Partial<Record<Slot, string>>): Promise<string> {
  await document.fonts?.ready; const c=canvas(1200,600); const ctx=c.getContext("2d"); if(!ctx)throw new Error("Canvas 2D is unavailable."); const base=await loadImage(baseDataUrl);ctx.drawImage(base,0,0,1200,600);
  for(const slot of SLOTS){const id=placed[slot.id];const decal=id&&DECALS.find((item)=>item.id===id);if(decal)drawAt(ctx,decal,slot.x,slot.y,slot.size,slot.rotate,slot.id==="roofline");} return c.toDataURL("image/png");
}

export const KITS: { id: "taxi" | "icecream" | "undercover" | "tourist"; name: string; blurb: string }[] = [
  {id:"taxi",name:"Bay Cab",blurb:"Sun-yellow cab wash with checker duty stripe."},
  {id:"icecream",name:"Mr. Softserve",blurb:"Pastel swirl truck energy, with drips."},
  {id:"undercover",name:"Undercover",blurb:"Low-profile charcoal, pinstriped and inconspicuous."},
  {id:"tourist",name:"Rent-A-Ride",blurb:"Sky-blue holiday rental with hibiscus flair."},
];

function hibiscus(ctx:CanvasRenderingContext2D,x:number,y:number,r:number):void{ctx.fillStyle=PINK;ctx.strokeStyle=INK;ctx.lineWidth=r*.12;for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(x+Math.cos(i*1.256)*r*.45,y+Math.sin(i*1.256)*r*.45,r*.48,r*.27,i*1.256,0,Math.PI*2);ctx.fill();ctx.stroke();}ctx.beginPath();ctx.arc(x,y,r*.22,0,Math.PI*2);ctx.fillStyle=GOLD;ctx.fill();ctx.stroke();}

export async function disguise(baseDataUrl: string, kit: "taxi" | "icecream" | "undercover" | "tourist"): Promise<string> {
  await document.fonts?.ready;const c=canvas(1200,600);const ctx=c.getContext("2d");if(!ctx)throw new Error("Canvas 2D is unavailable.");ctx.drawImage(await loadImage(baseDataUrl),0,0,1200,600);
  if(kit==="taxi"){ctx.fillStyle="#f4c928";ctx.globalAlpha=.86;ctx.fillRect(0,0,1200,600);ctx.globalAlpha=1;for(let x=0;x<1200;x+=80){ctx.fillStyle=INK;ctx.fillRect(x,420,40,55);ctx.fillStyle=CREAM;ctx.fillRect(x+40,420,40,55);}outlinedText(ctx,"BAY CAB",600,100,92,CREAM,true);}
  if(kit==="icecream"){ctx.fillStyle="#ffb7cf";ctx.globalAlpha=.72;ctx.fillRect(0,0,1200,300);ctx.fillStyle="#a4f1d8";ctx.fillRect(0,300,1200,300);ctx.globalAlpha=1;ctx.fillStyle=CREAM;for(let x=0;x<1200;x+=95){ctx.beginPath();ctx.arc(x+45,305,48,0,Math.PI);ctx.fill();}outlinedText(ctx,"MR. SOFTSERVE",600,115,76,PINK,true);}
  if(kit==="undercover"){ctx.fillStyle="#30313b";ctx.globalAlpha=.88;ctx.fillRect(0,0,1200,600);ctx.globalAlpha=1;ctx.strokeStyle="#9aa1ad";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(0,155);ctx.lineTo(1200,155);ctx.moveTo(0,445);ctx.lineTo(1200,445);ctx.stroke();outlinedText(ctx,"NOTHING TO SEE",600,300,74,"#cbd0d6",true);}
  if(kit==="tourist"){ctx.fillStyle="#65ccec";ctx.globalAlpha=.80;ctx.fillRect(0,0,1200,600);ctx.globalAlpha=1;for(const [x,y] of [[130,130],[1060,130],[180,480],[1010,480]])hibiscus(ctx,x,y,55);outlinedText(ctx,"RENT-A-RIDE",600,105,78,CREAM,true);}
  return c.toDataURL("image/png");
}
