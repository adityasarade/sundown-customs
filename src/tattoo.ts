/** Ink & Iron: original procedural American-traditional tattoo flash, plus arm compositing for Unlayer. */
export type Flash = { id: string; name: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void };

const INK = "#141323"; const RED = "#d42a2a"; const TEAL = "#1f9e8f";
const GOLD = "#f2b632"; const GREEN = "#3f8f3a"; const CREAM = "#f4ead2";

// All artwork lives in a transparent 100-unit square. Separate silhouettes,
// clipped solid shadows, and deterministic dots keep the small prints legible.
function shape(c: CanvasRenderingContext2D, d: string, fill: string, w = 3.2, stroke = INK) {
  const p = new Path2D(d);
  c.fillStyle = fill; c.fill(p);
  if (w > 0) { c.lineWidth = w; c.strokeStyle = stroke; c.stroke(p); }
}
function line(c: CanvasRenderingContext2D, d: string, color = INK, w = 1.6) {
  c.strokeStyle = color; c.lineWidth = w; c.stroke(new Path2D(d));
}
function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill = INK) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
}
function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, w = 0, angle = 0) {
  c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  c.fillStyle = fill; c.fill();
  if (w) { c.lineWidth = w; c.strokeStyle = INK; c.stroke(); }
}
function shade(c: CanvasRenderingContext2D, boundary: string, crescent: string, x: number, y: number, dx: number, dy: number, rows = 3) {
  c.save(); c.clip(new Path2D(boundary));
  shape(c, crescent, INK, 0);
  for (let row = 0; row < rows; row++) for (let i = 0; i < 7; i++) {
    const t = i / 6;
    dot(c, x + dx * t + row * 1.7, y + dy * t - row * 2.1, .85 - .65 * t);
  }
  c.restore();
}
function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, maxWidth: number, italic = false) {
  c.save(); c.translate(x, y);
  c.font = italic ? `italic bold ${size}px Georgia, serif` : `900 ${size}px "Arial Narrow", Impact, sans-serif`;
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = INK;
  c.fillText(s, 0, 0, maxWidth); c.restore();
}
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.save(); c.translate(x, y);
  shape(c, `M0 ${-r} L${r*.27} ${-r*.27} L${r} 0 L${r*.27} ${r*.27} L0 ${r} L${-r*.27} ${r*.27} L${-r} 0 L${-r*.27} ${-r*.27} Z`, GOLD, 2);
  c.restore();
}
function leaf(c: CanvasRenderingContext2D, x: number, y: number, angle: number, scale = 1) {
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(scale, scale);
  const d = 'M0 0 Q7 -10 13 -10 L13 -13 L19 -11 L20 -14 L25 -10 L31 -8 L29 -2 L25 -1 L25 3 L20 3 L18 7 L13 6 Q5 7 0 0Z';
  shape(c, d, GREEN);
  shade(c, d, 'M0 0 Q15 5 31 -8 Q23 6 13 6Z', 6, -1, 17, -5, 2);
  line(c, 'M2 0 L27 -7 M10 -2 L11 -7 M16 -4 L18 -9', INK, 1.3);
  c.restore();
}
function heart(c: CanvasRenderingContext2D, d: string) { shape(c, d, RED); }

function drawPalmSkull(c: CanvasRenderingContext2D) {
  oval(c, 50, 36, 24, 24, GOLD, 3.2);
  line(c, 'M34 24 Q44 15 56 18', CREAM, 2);
  // Two bowed, crossing trunks, with visible growth rings.
  for (const mirror of [false, true]) {
    c.save(); if (mirror) { c.translate(100, 0); c.scale(-1, 1); }
    shape(c, 'M23 25 L29 24 Q34 55 72 82 L66 87 Q30 63 23 25Z', GOLD);
    line(c, 'M25 33 L31 31 M27 41 L34 38 M31 49 L38 45 M36 57 L43 52 M43 65 L49 59 M52 73 L57 67 M62 81 L66 76', INK, 1.5);
    // Broad, drooping fronds, not a radial crown. Each silhouette has cut leaflets.
    shape(c, 'M26 24 Q11 12 7 36 L12 31 L12 35 L17 27 L17 31 L21 25 L22 28Z', GREEN, 2.6);
    shape(c, 'M26 24 Q10 3 8 18 L14 16 L13 20 L19 19 L19 23Z', GREEN, 2.6);
    shape(c, 'M26 24 Q29 7 43 12 L38 15 L41 17 L34 18 L36 21 L30 22Z', GREEN, 2.6);
    shape(c, 'M26 24 Q43 17 46 37 L41 32 L40 35 L36 28 L34 31 L31 26Z', GREEN, 2.6);
    line(c, 'M26 23 Q17 18 11 29 M27 23 Q37 22 42 31', INK, 1.2);
    c.restore();
  }
  const skull = 'M30 57 Q26 39 40 36 Q50 32 61 36 Q75 40 71 57 L75 65 L65 71 L63 82 Q50 92 37 82 L35 71 L25 65Z';
  shape(c, skull, CREAM);
  shade(c, skull, 'M35 38 Q27 55 34 62 L31 65 L41 70 L41 83 L36 85 L31 70 L24 64 L27 44Z', 34, 56, 10, -13, 3);
  shape(c, 'M35 54 Q37 48 44 52 Q47 54 44 61 Q39 65 34 61Z', INK, 1.5);
  shape(c, 'M56 52 Q64 48 66 55 L66 61 Q60 65 56 60Z', INK, 1.5);
  dot(c, 39, 54, 1.25, CREAM); dot(c, 61, 54, 1.25, CREAM);
  shape(c, 'M50 61 C48 64 44 66 46 69 Q48 71 50 68 Q52 71 54 69 C56 66 52 64 50 61Z', INK, 0);
  line(c, 'M29 64 L37 66 M71 64 L63 66 M39 72 Q50 76 61 72 L60 81 Q50 85 40 81Z', INK, 1.8);
  for (const x of [44, 48, 52, 56]) line(c, `M${x} 74 L${x} 82`, INK, 1.3);
  line(c, 'M44 40 Q51 38 58 41', GOLD, 1.2);
}

function drawRose(c: CanvasRenderingContext2D) {
  line(c, 'M51 60 Q46 77 51 91', INK, 5.5);
  line(c, 'M51 60 Q46 77 51 91', GREEN, 2.4);
  shape(c, 'M49 78 L42 71 L48 73 M49 86 L57 80 L50 82', GREEN, 1.8);
  leaf(c, 44, 76, -2.65, 1.05); leaf(c, 53, 82, -.55, 1.08);
  shape(c, 'M49 88 L43 82 L49 84Z', GREEN, 1.7);
  const petals: [string, string, number, number, number, number][] = [
    ['M29 32 Q23 16 39 16 Q48 5 60 15 Q78 13 77 32 L60 48Z', 'M24 26 Q46 32 78 23 L76 41 L37 43Z', 37, 25, 16, -8],
    ['M34 29 Q20 24 15 38 Q12 51 30 58 L48 45Z', 'M15 42 Q21 53 37 47 L33 59 L19 54Z', 21, 45, 9, -11],
    ['M63 28 Q79 22 85 38 Q89 51 72 60 L54 46Z', 'M80 35 Q84 50 66 51 L68 62 L86 54Z', 77, 43, -6, -10],
    ['M30 45 Q34 30 48 32 Q48 47 58 51 Q44 65 30 62 Q19 58 20 49Z', 'M20 50 Q29 61 46 52 Q37 66 27 62Z', 29, 56, 9, -7],
    ['M69 43 Q68 31 57 29 Q49 38 49 47 Q57 59 72 61 Q83 56 80 47Z', 'M79 48 Q68 57 54 48 Q62 62 74 61Z', 73, 54, -9, -7],
  ];
  for (const [d, shadow, x, y, dx, dy] of petals) { shape(c, d, RED); shade(c, d, shadow, x, y, dx, dy, 2); }
  // Open spiral bud: a dark centre enclosed by two readable curled lips.
  shape(c, 'M34 36 Q29 23 43 21 Q61 17 69 32 Q63 43 51 46 Q40 43 34 36Z', RED);
  shape(c, 'M40 29 Q49 22 60 29 Q66 35 56 39 Q43 41 40 29Z', INK, 0);
  shape(c, 'M40 29 Q51 27 56 32 Q58 35 51 36 Q43 35 39 40 L34 36 Q31 31 35 26Z', RED, 2.4);
  line(c, 'M45 25 Q55 22 62 29 M36 32 Q39 36 45 35', CREAM, 1.7);
  const cup = 'M25 53 Q36 49 50 58 Q63 47 77 53 Q73 71 51 71 Q30 70 25 53Z';
  shape(c, cup, RED);
  shade(c, cup, 'M25 54 Q36 70 53 67 Q69 65 77 53 Q73 73 49 73 Q28 70 25 54Z', 32, 61, 27, 0, 2);
  line(c, 'M34 55 Q41 55 46 59 M57 58 Q65 53 70 55 M20 38 Q22 33 27 32 M73 29 Q79 32 80 38', CREAM, 1.9);
}

function drawDaggerHeart(c: CanvasRenderingContext2D) {
  // The uninterrupted blade is drawn first, so the heart occludes its middle.
  const blade = 'M28 28 L34 23 L78 70 L85 85 L70 77 L24 33Z';
  shape(c, blade, CREAM);
  shape(c, 'M31 28 L85 85 L70 77 L26 33Z', INK, 0);
  line(c, 'M33 31 L80 79', CREAM, 1.1);
  const d = 'M50 76 C39 66 21 52 25 39 C29 23 46 28 51 39 C59 23 78 28 80 42 C82 56 61 70 50 76Z';
  heart(c, d);
  shade(c, d, 'M25 35 Q22 54 50 68 Q65 64 78 51 Q69 69 50 78 Q26 60 23 46Z', 31, 48, 20, 18, 3);
  line(c, 'M33 36 Q39 31 44 37', CREAM, 2.8); dot(c, 31, 41, 1.2, CREAM);
  line(c, 'M28 35 L37 37', INK, 2.5);
  shape(c, 'M13 15 L18 10 L32 24 L26 30Z', RED);
  line(c, 'M17 16 L22 15 M20 20 L26 18 M23 24 L29 22', INK, 1.7);
  oval(c, 14, 12, 5, 4, GOLD, 2.8, -.75);
  shape(c, 'M18 33 L34 17 Q38 15 40 19 L40 23 L24 39 L20 39Z', GOLD);
  line(c, 'M24 32 L34 22', CREAM, 1.5);
  for (const [x, y, r] of [[83, 91, 2.4], [73, 86, 2.1], [65, 90, 1.6]]) {
    shape(c, `M${x} ${y-r*2} Q${x+r*2} ${y+r*1.5} ${x} ${y+r*1.5} Q${x-r*2} ${y+r*1.5} ${x} ${y-r*2}Z`, RED, 1.8);
  }
}

function drawSwallow(c: CanvasRenderingContext2D) {
  // Long flight feathers share a clear leading edge and taper to real points.
  shape(c, 'M40 48 Q39 25 61 9 Q58 26 69 39 L59 34 L62 43 L53 39 L55 48 L47 43 L49 53Z', TEAL);
  shape(c, 'M40 48 Q38 27 61 9 Q48 27 46 45Z', INK, 0);
  line(c, 'M48 36 L56 23 M51 40 L58 31 M52 45 L58 39', INK, 1.6);
  shape(c, 'M56 49 Q72 46 88 35 L78 54 L93 61 Q76 65 61 58Z', TEAL);
  shape(c, 'M63 52 L86 39 L74 53 L89 60 L63 56Z', INK, 0);
  const body = 'M18 48 Q16 38 25 36 Q35 34 41 43 Q54 44 68 51 Q61 67 42 64 Q28 63 23 53 L15 52Z';
  shape(c, body, TEAL);
  shape(c, 'M21 44 Q24 50 35 49 Q44 55 63 55 Q57 66 42 64 Q27 62 23 53 L18 51Z', CREAM, 2.4);
  shape(c, 'M23 49 Q31 45 39 50 L36 58 Q26 56 23 49Z', RED, 2);
  shape(c, 'M18 44 L8 48 L20 50Z', GOLD, 2.3);
  oval(c, 25, 42, 2.5, 2.8, INK); dot(c, 24.5, 41.2, .7, CREAM);
  // Near wing sweeps down; its separated tips read against the belly.
  shape(c, 'M46 51 Q54 55 61 65 Q67 78 72 88 Q53 81 44 67 Q39 57 46 51Z', TEAL);
  shape(c, 'M46 51 Q40 62 54 77 Q61 84 72 88 Q53 82 44 69 Q36 57 46 51Z', INK, 0);
  line(c, 'M49 63 L63 80 M53 62 L67 81 M57 64 L68 76', INK, 1.6);
  line(c, 'M48 57 L55 65', CREAM, 1.8);
  line(c, 'M31 39 L35 41 M30 59 Q35 62 40 62', CREAM, 1.6);
  line(c, 'M49 29 L53 24', CREAM, 1.4);
}

function drawPanther(c: CanvasRenderingContext2D) {
  // Distinct paws beneath a broad feline mask.
  for (const flip of [false, true]) {
    c.save(); if (flip) { c.translate(100, 0); c.scale(-1, 1); }
    shape(c, 'M27 67 Q17 71 17 83 Q16 89 23 90 L38 90 Q45 86 41 76 L38 69Z', INK);
    line(c, 'M23 76 Q20 80 22 83 M30 77 L29 84 M36 79 L36 84', CREAM, 1.3);
    for (const x of [23, 30, 37]) shape(c, `M${x-2} 85 Q${x-3} 90 ${x+1} 93 L${x+2} 85Z`, CREAM, 1.4);
    c.restore();
  }
  shape(c, 'M24 34 L21 12 Q31 11 39 22 Q50 17 61 22 Q70 11 79 12 L76 34 Q84 40 81 50 L85 57 L78 56 L80 65 L74 63 Q70 78 59 82 L41 82 Q29 78 26 63 L20 65 L22 56 L15 57 L19 50 Q16 40 24 34Z', INK);
  shape(c, 'M26 18 L29 32 L36 26Z', RED, 1.6); shape(c, 'M74 18 L71 32 L64 26Z', RED, 1.6);
  line(c, 'M27 37 Q31 29 39 29 M61 29 Q69 29 73 37 M22 47 L24 55 M78 47 L76 55 M44 26 Q50 23 56 26', CREAM, 1.7);
  shape(c, 'M28 38 L44 44 Q33 48 28 38Z', GOLD, 1.4);
  shape(c, 'M72 38 L56 44 Q67 48 72 38Z', GOLD, 1.4);
  line(c, 'M37 41 L37 45 M63 41 L63 45', INK, 2);
  line(c, 'M27 34 Q37 35 45 41 M73 34 Q63 35 55 41', INK, 4);
  // Wide red mouth and four separated ivory canines.
  shape(c, 'M30 56 Q50 49 70 56 L67 69 Q61 83 50 83 Q39 83 33 69Z', RED, 2.6);
  shape(c, 'M39 62 Q50 56 61 62 L58 72 Q50 66 42 73Z', INK, 0);
  shape(c, 'M32 56 L41 58 L39 72 Q33 67 32 56Z', CREAM, 1.7);
  shape(c, 'M68 56 L59 58 L61 72 Q67 67 68 56Z', CREAM, 1.7);
  shape(c, 'M39 77 L43 68 L47 79Z', CREAM, 1.4); shape(c, 'M61 77 L57 68 L53 79Z', CREAM, 1.4);
  shape(c, 'M26 51 Q33 47 44 51 L50 57 Q39 62 28 57Z', CREAM, 2);
  shape(c, 'M74 51 Q67 47 56 51 L50 57 Q61 62 72 57Z', CREAM, 2);
  shape(c, 'M42 48 Q50 45 58 48 L55 54 L50 57 L45 54Z', INK, 1.6);
  line(c, 'M46 49 L53 49', CREAM, 1.3);
  for (const [x,y] of [[32,52],[38,53],[33,55],[68,52],[62,53],[67,55]]) dot(c,x,y,.9);
  line(c, 'M25 60 L29 64 M75 60 L71 64 M47 78 Q50 76 53 78', CREAM, 1.4);
  line(c, 'M43 33 L46 36 M57 33 L54 36 M47 44 L46 47 M53 44 L54 47', CREAM, 1.2);
}

function drawBanner(c: CanvasRenderingContext2D) {
  c.save(); c.translate(0, 8);
  leaf(c, 45, 33, -2.65, .78); leaf(c, 56, 34, -.4, .78);
  star(c, 50, 23, 13);
  shape(c, 'M8 40 L28 43 L28 70 L8 68 L14 55Z', RED);
  shape(c, 'M72 38 L92 33 L86 49 L92 60 L72 66Z', RED);
  shape(c, 'M18 61 L28 70 L31 55Z M72 38 L82 41 L72 52Z', INK, 2);
  const d = 'M18 35 Q37 42 51 39 Q67 36 82 40 L82 68 Q66 63 51 68 Q35 72 18 63Z';
  shape(c, d, CREAM);
  shade(c, d, 'M18 59 Q34 69 51 65 Q68 60 82 64 L82 69 Q65 63 51 68 Q33 73 18 63Z', 23, 60, 17, 4, 2);
  line(c, 'M23 41 Q34 45 43 44 M60 42 Q69 41 77 43', GOLD, 1.3);
  text(c, 'Solana', 50, 53, 21, 55, true);
  c.restore();
}

function drawSnake(c: CanvasRenderingContext2D) {
  const spine = 'M80 82 C57 94 20 84 19 67 C18 51 40 47 58 56 C78 65 80 78 62 80 C43 82 35 66 49 50 C60 39 65 34 60 23';
  line(c, spine, INK, 16);
  line(c, spine, GREEN, 9.6);
  line(c, 'M78 85 C52 94 24 80 23 68 C22 58 39 52 54 60 C71 68 73 76 61 76 C48 76 42 68 52 53 Q70 36 63 24', CREAM, 2.8);
  const front = 'M62 80 C43 82 35 66 49 50 C60 39 65 34 60 23';
  // Only repaint the crossing: clipping avoids an artificial cap where the
  // foreground section rejoins the continuous coil below it.
  c.save(); c.beginPath(); c.rect(10, 10, 80, 54); c.clip();
  line(c, front, INK, 16); line(c, front, GREEN, 9.6); c.restore();
  line(c, 'M62 76 C48 76 42 68 52 53 Q70 36 63 24', CREAM, 2.8);
  // Scale dashes follow the back of each bend, leaving the belly stripe clear.
  line(c, 'M27 78 L30 75 M35 83 L37 80 M44 86 L45 83 M54 88 L54 85 M65 88 L64 85 M24 60 L28 62 M34 54 L35 57 M44 54 L44 57 M54 57 L53 60 M62 62 L60 65 M66 69 L63 70 M45 66 L48 66 M47 58 L50 59 M54 48 L57 50 M61 40 L64 42 M64 31 L67 31', INK, 1.35);
  // Upper jaw and hinged lower jaw create an open triangular mouth.
  shape(c, 'M57 31 Q50 27 51 19 Q53 10 64 11 Q77 10 83 19 L79 23 L65 23 L71 32 L81 28 L81 34 Q65 43 57 31Z', GREEN);
  shape(c, 'M63 23 L79 23 L69 26 L77 31 L81 28 L79 34 L70 35Z', INK, 0);
  shape(c, 'M69 23 L75 23 L72 30Z', CREAM, 1.1);
  shape(c, 'M75 33 L78 28 L80 32Z', CREAM, 1.1);
  line(c, 'M76 27 Q85 26 89 23 L93 24 M89 23 L91 19', RED, 2);
  oval(c, 63, 18, 4, 3.4, GOLD, 1.6); line(c, 'M64 16 L63 20', INK, 1.6);
  dot(c, 78, 18, 1); line(c, 'M54 18 Q53 23 57 26 M58 13 L63 13', CREAM, 1.6);
}

function drawWaves(c: CanvasRenderingContext2D) {
  oval(c, 50, 50, 41, 41, GOLD, 3.2);
  c.save(); c.beginPath(); c.arc(50, 50, 39.5, 0, Math.PI * 2); c.clip();
  for (const [y,h] of [[31,2],[38,3],[46,4],[55,5]]) { c.fillStyle = RED; c.fillRect(8,y,84,h); }
  shape(c, 'M7 67 Q17 54 30 61 Q36 44 48 47 Q60 49 55 58 Q50 61 47 57 Q49 55 51 55 Q47 51 43 57 Q43 65 53 66 Q67 45 79 50 Q91 54 82 64 Q76 66 74 61 Q80 62 80 57 Q74 53 70 63 L82 69 L95 63 L94 95 L7 95Z', TEAL);
  shape(c, 'M28 64 Q36 44 48 47 Q59 48 56 56 Q53 62 47 57 Q51 58 52 54 Q45 49 40 61 L37 68Z', CREAM, 2);
  shape(c, 'M58 70 Q67 48 79 50 Q89 52 85 60 Q81 67 74 61 Q81 63 81 57 Q73 51 67 65 L64 73Z', CREAM, 2);
  shape(c, 'M8 79 Q20 65 33 73 Q45 79 55 70 Q62 64 69 69 Q76 76 94 69 L94 96 L7 95Z', TEAL, 2.6);
  line(c, 'M15 80 Q25 72 35 78 M43 83 Q51 80 56 75 Q62 71 67 75 M62 88 Q74 77 83 79', CREAM, 2.3);
  line(c, 'M19 86 Q29 80 38 85 M74 71 Q79 75 86 72', INK, 1.6);
  for (const [x,y] of [[32,51],[36,46],[66,49],[70,45]]) dot(c,x,y,1.1,CREAM);
  c.restore();
  c.beginPath(); c.arc(50,50,41,0,Math.PI*2); c.strokeStyle=INK; c.lineWidth=3.2; c.stroke();
}

function drawEightBall(c: CanvasRenderingContext2D) {
  shape(c, 'M23 73 Q10 57 18 38 Q19 48 27 47 Q34 36 27 23 Q39 27 40 39 Q50 26 47 8 Q64 19 61 34 Q68 31 70 18 Q86 36 78 47 Q86 44 87 35 Q99 60 77 79Z', RED);
  shape(c, 'M25 68 Q18 55 23 44 Q24 53 33 47 Q41 40 34 32 Q47 38 45 46 Q56 31 52 18 Q64 30 57 44 Q71 42 71 28 Q81 43 70 54 Q82 54 86 45 Q91 62 73 73Z', GOLD, 0);
  oval(c, 50, 63, 29, 29, INK, 3.2);
  oval(c, 54, 61, 13, 13, CREAM, 2.5);
  text(c, '8', 54, 62, 23, 19);
  line(c, 'M29 58 Q31 45 42 42', CREAM, 3.2); dot(c, 28, 64, 1.4, CREAM);
  line(c, 'M63 85 Q69 82 73 75', TEAL, 1.7);
}

function drawNoRegrets(c: CanvasRenderingContext2D) {
  // A flat sheet winds around two vertical rollers, whose oval spiral ends
  // make the rolled paper construction visible even at thumbnail size.
  shape(c, 'M9 37 Q10 27 20 30 L25 68 Q24 78 15 77 Q8 76 9 68Z', GOLD);
  shape(c, 'M77 28 Q90 25 91 35 L91 66 Q90 76 78 72Z', GOLD);
  const d = 'M17 32 Q32 29 49 36 Q65 42 84 33 L84 69 Q65 78 48 70 Q32 63 17 69Z';
  shape(c, d, CREAM);
  shade(c, d, 'M17 64 Q32 60 49 68 Q65 75 84 66 L84 69 Q65 78 48 70 Q31 63 17 69Z', 24, 60, 20, 4, 2);
  shape(c, 'M9 36 Q11 43 21 40 L21 70 Q16 76 9 69Z', CREAM, 2.5);
  shape(c, 'M80 32 Q83 38 91 34 L91 66 Q88 74 80 69Z', CREAM, 2.5);
  oval(c,15,34,6,4.8,CREAM,2.2); line(c,'M12 34 Q15 31 18 34 Q19 37 15 37',INK,1.3);
  oval(c,85.5,30,5.5,4.8,CREAM,2.2); line(c,'M83 30 Q86 27 88 30 Q89 33 85 33',INK,1.3);
  line(c, 'M13 44 L13 65 M87 40 L87 62', GOLD, 2);
  text(c, 'NO REGRETS', 50.5, 53.5, 11.5, 54);
  const h = 'M74 82 C65 76 61 70 65 66 Q70 61 75 68 Q80 62 84 66 C91 73 78 81 74 82Z';
  heart(c,h); line(c,'M67 68 Q69 65 71 68',CREAM,1.7);
}

function drawAnchor(c: CanvasRenderingContext2D) {
  // Back rope segments are laid down before the shank.
  line(c, 'M51 26 C73 32 66 44 50 48 C30 55 31 62 49 67 Q67 71 60 83', INK, 6.7);
  line(c, 'M51 26 C73 32 66 44 50 48 C30 55 31 62 49 67 Q67 71 60 83', RED, 3.7);
  const d = 'M45 26 L55 26 L55 73 Q70 68 74 57 L66 58 L77 44 L89 60 L81 60 Q79 81 50 91 Q21 81 19 60 L11 60 L23 44 L34 58 L26 57 Q30 68 45 73Z';
  shape(c,d,CREAM);
  shade(c,d,'M11 60 L22 60 Q27 79 50 85 Q75 75 81 60 L89 60 L82 79 L51 95 L23 83Z',30,73,17,10,3);
  line(c,'M50 32 L50 71',GOLD,1.8);
  oval(c,50,18,10,10,GOLD,3.2);
  // The ring's hole is truly transparent.
  c.save(); c.globalCompositeOperation='destination-out'; dot(c,50,18,4.3); c.restore();
  c.beginPath(); c.arc(50,18,4.3,0,Math.PI*2); c.strokeStyle=INK; c.lineWidth=2; c.stroke();
  shape(c,'M27 34 L73 34 L73 43 L27 43Z',TEAL);
  shape(c,'M24 32 L30 32 L30 45 L24 45Z M70 32 L76 32 L76 45 L70 45Z',GOLD,2.5);
  line(c,'M34 37 L43 37',CREAM,1.6);
  // Front crossings complete the S, with black edges separating rope and metal.
  for(const segment of ['M58 29 Q62 32 59 35','M61 44 Q56 48 45 50','M38 59 Q41 64 55 68','M60 78 Q59 86 67 87']) {
    line(c,segment,INK,6.3); line(c,segment,RED,3.3);
  }
  line(c,'M43 48 L47 47 M44 63 L49 65',CREAM,1);
}

function die(c: CanvasRenderingContext2D, x: number, y: number, scale: number, rotation: number, values: [number, number, number]) {
  c.save(); c.translate(x,y); c.rotate(rotation); c.scale(scale,scale);
  const top='M0 -22 L21 -11 L0 1 L-21 -11Z';
  const left='M-21 -11 L0 1 L0 26 L-21 14Z';
  const right='M0 1 L21 -11 L21 14 L0 26Z';
  shape(c,top,CREAM); shape(c,left,CREAM); shape(c,right,CREAM);
  shade(c,right,'M17 -9 L22 -12 L22 15 L0 28 L0 22 L17 12Z',15,10,-11,7,3);
  shade(c,left,'M-22 11 L0 22 L0 27 L-22 15Z',-17,10,12,7,2);
  // Each pip is a circle projected through the same affine face basis.
  const patterns: Record<number, [number,number][]> = {
    1:[[.5,.5]], 2:[[.27,.27],[.73,.73]],
    3:[[.25,.25],[.5,.5],[.75,.75]],
    4:[[.27,.27],[.73,.27],[.27,.73],[.73,.73]],
    5:[[.27,.27],[.73,.27],[.5,.5],[.27,.73],[.73,.73]],
    6:[[.27,.25],[.73,.25],[.27,.5],[.73,.5],[.27,.75],[.73,.75]],
  };
  const faces: [number,number,number,number,number,number][] = [
    [21,11,-21,11,0,-22], [21,12,0,25,-21,-11], [21,-12,0,25,0,1],
  ];
  faces.forEach((matrix,index)=>{
    c.save(); c.transform(...matrix);
    for(const [u,v] of patterns[values[index]]) dot(c,u,v,.095,RED);
    c.restore();
  });
  c.restore();
}
function drawDice(c: CanvasRenderingContext2D) {
  die(c,34,35,.99,-.17,[3,5,2]);
  die(c,66,63,1.03,.14,[2,3,6]);
  star(c,72,17,6); star(c,15,70,6); star(c,34,85,4.8); star(c,88,37,4);
  dot(c,82,24,1.3); dot(c,21,82,1.2); dot(c,80,87,1.2);
}

function make(id: string, name: string, art: (c: CanvasRenderingContext2D) => void): Flash {
  return { id, name, draw(ctx, size) { ctx.save(); ctx.scale(size / 100, size / 100); ctx.lineJoin = "round"; ctx.lineCap = "round"; art(ctx); ctx.restore(); } };
}
export const FLASH: Flash[] = [
  make("palm-skull", "Palm Skull", drawPalmSkull), make("rose", "Solana Rose", drawRose),
  make("dagger-heart", "Dagger Heart", drawDaggerHeart), make("swallow", "Swallow", drawSwallow),
  make("panther", "Crawling Panther", drawPanther), make("solana-banner", "SOLANA Banner", drawBanner),
  make("snake", "Bay Snake", drawSnake), make("sunset-waves", "Sundown Waves", drawWaves),
  make("eight-ball", "Eight Ball", drawEightBall), make("no-regrets", "No Regrets", drawNoRegrets),
  make("anchor", "Anchor", drawAnchor), make("lucky-dice", "Lucky Dice", drawDice)
];

// ─── compose / crop ───

/**
 * Clean forearm skin rectangle in /art/arm.webp pixels (1200×800), 2:1 like the crop.
 * Measured per column on the real art (skin top–bottom: x=364 → 247–500, x=532 → 272–504, x=700 → 299–480),
 * so every corner sits on skin: the 3D arm texture never picks up the leather bench.
 */
export const TATTOO_AREA = { x: 364, y: 306, w: 336, h: 168 } as const;
export const ARM_SIZE = { w: 1200, h: 800 } as const;
export const CROP_SIZE = { w: 512, h: 256 } as const;

const thumbCache = new Map<string, string>();

export function flashById(id: string): Flash | undefined {
  return FLASH.find((f) => f.id === id);
}

/** Transparent PNG data URL of a flash design (cached). Empty string for unknown ids. */
export function flashThumb(id: string, size = 128): string {
  const key = `${id}@${size}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const f = flashById(id);
  if (!f || typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  f.draw(ctx, size);
  const url = c.toDataURL("image/png");
  thumbCache.set(key, url);
  return url;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return [c, ctx];
}

/** Deterministic PRNG so the healed-ink speckle is identical on every render. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Renders the flash as healed ink: softened edges, slightly muted colour, and pore-sized gaps in the pigment. */
function inkLayer(f: Flash, size: number): HTMLCanvasElement {
  const [art, actx] = canvas(size, size);
  f.draw(actx, size);
  const [ink, ictx] = canvas(size, size);
  ictx.filter = `blur(${Math.max(0.5, size / 520).toFixed(2)}px) saturate(0.82) contrast(1.04)`;
  ictx.drawImage(art, 0, 0);
  ictx.filter = "none";
  ictx.globalCompositeOperation = "destination-out";
  const rnd = mulberry(size * 131 + f.id.length * 7919);
  const pores = Math.round((size * size) / 90);
  for (let i = 0; i < pores; i += 1) {
    ictx.globalAlpha = 0.12 + rnd() * 0.3;
    ictx.beginPath();
    ictx.arc(rnd() * size, rnd() * size, (0.35 + rnd() * 0.9) * (size / 400), 0, Math.PI * 2);
    ictx.fill();
  }
  return ink;
}

/**
 * Stencils a flash design into TATTOO_AREA of the arm photo so it reads as ink in skin:
 * a faint warm fresh-ink halo, a multiply pass (skin tone and pores show through the pigment) and
 * a thin normal pass so the colour keeps its punch.
 * Returns a 1200×800 PNG data URL; with `flashId === null` it just returns the bare arm.
 */
export async function composeTattoo(armUrl: string, flashId: string | null): Promise<string> {
  const arm = await loadImage(armUrl);
  const [c, ctx] = canvas(ARM_SIZE.w, ARM_SIZE.h);
  ctx.drawImage(arm, 0, 0, ARM_SIZE.w, ARM_SIZE.h);
  const f = flashId ? flashById(flashId) : undefined;
  if (!f) return c.toDataURL("image/png");

  const { x, y, w, h } = TATTOO_AREA;
  // The design square fits the clean-skin area height so cropTattoo never clips its outer linework.
  const size = h; // art stays inside ~7–93% of its square, so this never touches the crop edge
  const ink = inkLayer(f, size * 2);
  const dx = x + (w - size) / 2;
  const dy = y + (h - size) / 2;

  // Fresh-ink irritation: a faint warm halo hugging the linework.
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.22;
  ctx.shadowColor = "rgba(190, 40, 40, 0.9)";
  ctx.shadowBlur = size * 0.06;
  ctx.shadowOffsetX = ARM_SIZE.w * 4;
  ctx.drawImage(ink, dx - ARM_SIZE.w * 4, dy, size, size);
  ctx.restore();

  // Pigment: multiply keeps the skin tone and pores showing through; a thin normal pass keeps the colour punchy.
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.95;
  ctx.drawImage(ink, dx, dy, size, size);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.13;
  ctx.drawImage(ink, dx, dy, size, size);
  ctx.restore();

  return c.toDataURL("image/png");
}

/** 512×256 crop of TATTOO_AREA from a (possibly Unlayer-edited) inked arm image: 3D arm texture, mugshot, news. */
export async function cropTattoo(inkedArmUrl: string): Promise<string> {
  const img = await loadImage(inkedArmUrl);
  const sx = img.naturalWidth / ARM_SIZE.w;
  const sy = img.naturalHeight / ARM_SIZE.h;
  const [c, ctx] = canvas(CROP_SIZE.w, CROP_SIZE.h);
  ctx.imageSmoothingQuality = "high";
  const { x, y, w, h } = TATTOO_AREA;
  ctx.drawImage(img, x * sx, y * sy, w * sx, h * sy, 0, 0, CROP_SIZE.w, CROP_SIZE.h);
  return c.toDataURL("image/png");
}
