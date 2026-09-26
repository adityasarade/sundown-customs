/**
 * Solana Bay road network, landmarks, map projection and mission shape.
 * Pure data + geometry (no DOM, no three.js) so driving, planning, World and
 * Minimap all agree on one city — and so it is unit-testable in Node.
 */

export type Point = { x: number; z: number };
export const ROAD_HALF_WIDTH = 13;

/** Grid avenues (x) and streets (z). Every crossing is a node. */
export const BLOCK = 150;
export const AVENUES = [0, 150, 300, 450] as const;
export const STREETS = [-400, -250, -100, 50] as const;

export type Node = Point & { id: string };
export type Edge = { a: string; b: string; length: number };

export const NODES: Node[] = STREETS.flatMap((z) =>
  AVENUES.map((x) => ({ id: `${x}:${z}`, x, z })),
);
const nodeById = new Map(NODES.map((n) => [n.id, n]));
export const node = (id: string) => nodeById.get(id)!;

export const EDGES: Edge[] = [];
for (const z of STREETS)
  for (let i = 0; i < AVENUES.length - 1; i++)
    EDGES.push({ a: `${AVENUES[i]}:${z}`, b: `${AVENUES[i + 1]}:${z}`, length: AVENUES[i + 1] - AVENUES[i] });
for (const x of AVENUES)
  for (let i = 0; i < STREETS.length - 1; i++)
    EDGES.push({ a: `${x}:${STREETS[i]}`, b: `${x}:${STREETS[i + 1]}`, length: STREETS[i + 1] - STREETS[i] });

export const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export type LandmarkKind = "garage" | "drop" | "camera" | "respray" | "stash";
export type Landmark = Point & { id: string; kind: LandmarkKind; name: string; node?: string };

/** The car starts on the west avenue just north of the garage, facing north. */
export const START = { x: 0, z: 40, heading: 0 };
export const GARAGE_NODE = "0:50";

export const LANDMARKS: Landmark[] = [
  { id: "garage", kind: "garage", name: "SUNDOWN CUSTOMS", x: 0, z: 50, node: "0:50" },
  { id: "marina", kind: "drop", name: "MARINA MEET", x: 0, z: -400, node: "0:-400" },
  { id: "causeway", kind: "drop", name: "CAUSEWAY LOT", x: 450, z: -400, node: "450:-400" },
  { id: "motel", kind: "drop", name: "PALM MOTEL", x: 450, z: 50, node: "450:50" },
  { id: "cam-pier", kind: "camera", name: "PIER CAM", x: 0, z: -175 },
  { id: "cam-market", kind: "camera", name: "MARKET CAM", x: 225, z: -250 },
  { id: "cam-bridge", kind: "camera", name: "BRIDGE CAM", x: 300, z: -25 },
  { id: "cam-north", kind: "camera", name: "HARBOR CAM", x: 375, z: -400 },
  { id: "cam-mid", kind: "camera", name: "PLAZA CAM", x: 150, z: -175 },
  { id: "spray-east", kind: "respray", name: "SPRAY & PRAY", x: 300, z: -175 },
  { id: "spray-west", kind: "respray", name: "SPRAY & PRAY 2", x: 75, z: -250 },
  { id: "stash-1", kind: "stash", name: "CRATE", x: 75, z: -100 },
  { id: "stash-2", kind: "stash", name: "CRATE", x: 150, z: -325 },
  { id: "stash-3", kind: "stash", name: "CRATE", x: 375, z: 50 },
  { id: "stash-4", kind: "stash", name: "CRATE", x: 450, z: -175 },
  { id: "stash-5", kind: "stash", name: "CRATE", x: 225, z: -400 },
  { id: "stash-6", kind: "stash", name: "CRATE", x: 300, z: -325 },
];
export const landmarks = (kind: LandmarkKind) => LANDMARKS.filter((l) => l.kind === kind);

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** True when (x, z) lies on any road surface. */
export function onRoad(x: number, z: number) {
  const h = ROAD_HALF_WIDTH;
  const minX = AVENUES[0] - h,
    maxX = AVENUES[AVENUES.length - 1] + h,
    minZ = STREETS[0] - h,
    maxZ = STREETS[STREETS.length - 1] + h;
  if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
  return AVENUES.some((a) => Math.abs(x - a) <= h) || STREETS.some((s) => Math.abs(z - s) <= h);
}

export type RoadProjection = Point & { heading: number; distance: number };

/**
 * Nearest point on the road centre-lines. The returned heading is the lane
 * direction closest to `heading`, so a car driving either way is respected.
 */
export function projectToRoad(x: number, z: number, heading = 0): RoadProjection {
  let best: RoadProjection = { x: 0, z: 0, heading: 0, distance: Infinity };
  const minX = AVENUES[0],
    maxX = AVENUES[AVENUES.length - 1],
    minZ = STREETS[0],
    maxZ = STREETS[STREETS.length - 1];
  for (const a of AVENUES) {
    const pz = clamp(z, minZ, maxZ);
    const d = Math.hypot(x - a, z - pz);
    if (d < best.distance) best = { x: a, z: pz, heading: 0, distance: d };
  }
  for (const s of STREETS) {
    const px = clamp(x, minX, maxX);
    const d = Math.hypot(x - px, z - s);
    if (d < best.distance) best = { x: px, z: s, heading: Math.PI / 2, distance: d };
  }
  // Choose the lane direction (h or h + PI) nearest the car's heading.
  const wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
  const alt = wrap(best.heading + Math.PI);
  if (Math.abs(wrap(heading - alt)) < Math.abs(wrap(heading - best.heading))) best.heading = alt;
  return best;
}

export function nearestNode(p: Point) {
  let best = NODES[0],
    d = Infinity;
  for (const n of NODES) {
    const dd = Math.hypot(n.x - p.x, n.z - p.z);
    if (dd < d) {
      d = dd;
      best = n;
    }
  }
  return best;
}

/** Dijkstra over the grid. `weight(edge)` defaults to its length. */
export function shortestPath(
  from: string,
  to: string,
  weight: (e: Edge) => number = (e) => e.length,
): string[] {
  const dist = new Map<string, number>(NODES.map((n) => [n.id, Infinity]));
  const prev = new Map<string, string>();
  const open = new Set(NODES.map((n) => n.id));
  dist.set(from, 0);
  while (open.size) {
    let u = "",
      best = Infinity;
    for (const id of open) {
      const d = dist.get(id)!;
      if (d < best) {
        best = d;
        u = id;
      }
    }
    if (!u || u === to) break;
    open.delete(u);
    for (const e of EDGES) {
      const v = e.a === u ? e.b : e.b === u ? e.a : "";
      if (!v || !open.has(v)) continue;
      const alt = best + weight(e);
      if (alt < dist.get(v)!) {
        dist.set(v, alt);
        prev.set(v, u);
      }
    }
  }
  const path = [to];
  while (path[0] !== from) {
    const p = prev.get(path[0]);
    if (!p) return [from];
    path.unshift(p);
  }
  return path;
}

/** Distance from p to the segment a–b. */
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

export const polylineLength = (pts: Point[]) =>
  pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);

/* ───────────────────────── Map projection ───────────────────────── */

/** The planning map image: a square world view plus a legend column. */
export const MAP = {
  width: 1200,
  height: 960,
  left: 40,
  top: 40,
  size: 880,
  minX: -70,
  maxX: 520,
  minZ: -470,
  maxZ: 120,
} as const;
const SPAN = MAP.maxX - MAP.minX; // square: maxZ - minZ is the same span

export const worldToMap = (p: Point) => ({
  px: MAP.left + ((p.x - MAP.minX) / SPAN) * MAP.size,
  py: MAP.top + ((p.z - MAP.minZ) / SPAN) * MAP.size,
});
export const mapToWorld = (px: number, py: number): Point => ({
  x: MAP.minX + ((px - MAP.left) / MAP.size) * SPAN,
  z: MAP.minZ + ((py - MAP.top) / MAP.size) * SPAN,
});

/* ───────────────────────── Missions ───────────────────────── */

export type Checkpoint = Point & { name: string };
export type Mission = {
  /** Where and which way the car starts: facing the first leg of the route. */
  start: { x: number; z: number; heading: number };
  /** Road polyline from the start to the destination, node to node. */
  route: Point[];
  /** Turn points along the route (excluding the start) ending at the destination. */
  checkpoints: Checkpoint[];
  destination: Landmark;
  /** Marked stash crates that spawn as pickups. */
  stashes: Landmark[];
  /** Share of the route the player actually drew on the map (0–1). */
  drawnShare: number;
  /** Cameras the route passes (heat risk). */
  camerasOnRoute: Landmark[];
  /** Planning notes from Nico shown on the Plan Locked screen. */
  notes: string[];
  /** Seconds on the clock for this route. */
  seconds: number;
  /** True when the route came from the player's own map drawing. */
  fromDrawing: boolean;
};

const CHECKPOINT_NAMES: Record<string, string> = {
  "0:-175": "MARINA", "70:-175": "HARBOR ROW", "140:-175": "NORTH PIERS", "210:-175": "CAUSEWAY",
  "0:-100": "OLD TOWN", "70:-100": "MARKET ST", "140:-100": "EAST MARKET", "210:-100": "RAIL YARD",
  "0:-25": "PIER ROAD", "70:-25": "PLAZA", "140:-25": "PALM AVE", "210:-25": "SUNSET BLVD",
  "0:50": "SUNDOWN CUSTOMS", "70:50": "BEACH ROAD", "140:50": "PALM HOTEL", "210:50": "PALM MOTEL",
};
export const placeName = (id: string) => CHECKPOINT_NAMES[id] ?? "SOLANA BAY";

/** Builds a mission from a node path (starting at the garage node). */
export function missionFromPath(
  path: string[],
  destination: Landmark,
  extra: Partial<Pick<Mission, "stashes" | "drawnShare" | "notes" | "fromDrawing">> = {},
): Mission {
  const pts = path.map(node);
  // Face the first leg: north up the west avenue from the pad, or east along
  // the garage street from just past the intersection.
  const first = pts[1] ?? pts[0];
  const east = first.x > pts[0].x;
  const start = east
    ? { x: pts[0].x + 10, z: pts[0].z, heading: Math.PI / 2 }
    : { x: START.x, z: START.z, heading: 0 };
  const route: Point[] = [{ x: start.x, z: start.z }, ...pts.slice(1).map((p) => ({ x: p.x, z: p.z }))];
  // Every node on the way is a gate; the last one is the destination.
  const checkpoints: Checkpoint[] = pts.slice(1).map((p, i, all) => ({
    x: p.x,
    z: p.z,
    name: i === all.length - 1 ? destination.name : placeName(path[i + 1]),
  }));
  const cams = landmarks("camera").filter((c) =>
    route.some((p, i) => i > 0 && segmentDistance(c, route[i - 1], p) < 16),
  );
  const length = polylineLength(route);
  return {
    start,
    route,
    checkpoints,
    destination,
    stashes: extra.stashes ?? [],
    drawnShare: extra.drawnShare ?? 0,
    camerasOnRoute: cams,
    notes: extra.notes ?? [],
    seconds: Math.round(Math.max(60, length / 17 + 30)),
    fromDrawing: extra.fromDrawing ?? false,
  };
}

/** Nico's fallback: garage → Marina Meet by the shortest road. */
export function defaultMission(): Mission {
  const dest = LANDMARKS.find((l) => l.id === "marina")!;
  return missionFromPath(shortestPath(GARAGE_NODE, dest.node!), dest, {
    notes: ["No plan? Fine. Take my route to the Marina. Straight up the west side."],
  });
}
