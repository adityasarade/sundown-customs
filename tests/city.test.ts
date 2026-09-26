import assert from "node:assert/strict";
import test from "node:test";
import {
  AVENUES,
  BLOCK,
  EDGES,
  GARAGE_NODE,
  LANDMARKS,
  MAP,
  NODES,
  ROAD_HALF_WIDTH,
  START,
  STREETS,
  defaultMission,
  edgeKey,
  landmarks,
  mapToWorld,
  missionFromPath,
  nearestNode,
  node,
  onRoad,
  placeName,
  polylineLength,
  projectToRoad,
  segmentDistance,
  shortestPath,
  worldToMap,
} from "../src/city.ts";
import { nextTurn } from "../src/gps.ts";

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const pathLength = (path: string[]) =>
  path.reduce((sum, id, i) => (i ? sum + Math.hypot(node(id).x - node(path[i - 1]).x, node(id).z - node(path[i - 1]).z) : 0), 0);
const adjacent = (a: string, b: string) => EDGES.some((e) => edgeKey(e.a, e.b) === edgeKey(a, b));

/* ───────────────────────── Road graph ───────────────────────── */

test("the grid has a node at every avenue/street crossing and 24 road edges", () => {
  assert.equal(NODES.length, AVENUES.length * STREETS.length);
  assert.equal(new Set(NODES.map((n) => n.id)).size, NODES.length);
  for (const n of NODES) assert.equal(n.id, `${n.x}:${n.z}`);
  assert.equal(EDGES.length, 24);
  for (const e of EDGES) {
    const a = node(e.a),
      b = node(e.b);
    assert.ok(a && b, "edge endpoints exist");
    assert.ok(a.x === b.x || a.z === b.z, "edges are axis aligned");
    assert.equal(e.length, Math.hypot(a.x - b.x, a.z - b.z));
    assert.ok(e.length > 0);
  }
  assert.equal(edgeKey("a", "b"), edgeKey("b", "a"));
});

test("onRoad covers avenues, streets and crossings but not blocks, water or beyond the grid", () => {
  for (const n of NODES) assert.ok(onRoad(n.x, n.z));
  assert.ok(onRoad(0, -175), "avenue mid-block");
  assert.ok(onRoad(225, -250), "street mid-block");
  assert.ok(onRoad(ROAD_HALF_WIDTH, -175), "kerb edge is still road");
  assert.ok(!onRoad(ROAD_HALF_WIDTH + 0.01, -175), "just past the kerb");
  assert.ok(!onRoad(75, -25), "block centre");
  assert.ok(!onRoad(225, -175), "block centre");
  assert.ok(!onRoad(-40, -175), "marina water west of the grid");
  assert.ok(!onRoad(0, 50 + ROAD_HALF_WIDTH + 1), "south of the last street");
  assert.ok(!onRoad(450 + ROAD_HALF_WIDTH + 1, 50), "east of the last avenue");
  assert.ok(!onRoad(0, -400 - ROAD_HALF_WIDTH - 1), "north of the first street");
  assert.equal(AVENUES[1] - AVENUES[0], BLOCK);
  assert.equal(STREETS[1] - STREETS[0], BLOCK);
});

test("projectToRoad snaps to the nearest centre-line and respects travel direction", () => {
  // Avenue x = 150, point in the block to the east.
  let p = projectToRoad(160, -175, 0.2);
  assert.equal(p.x, 150);
  assert.equal(p.z, -175);
  assert.equal(p.distance, 10);
  assert.ok(close(p.heading, 0), "northbound stays northbound");
  p = projectToRoad(160, -175, Math.PI - 0.2);
  assert.ok(close(Math.abs(wrap(p.heading)), Math.PI), "southbound stays southbound");
  p = projectToRoad(160, -175, -2.9);
  assert.ok(close(Math.abs(wrap(p.heading)), Math.PI));
  // Street z = -100, point in the block to the south.
  p = projectToRoad(75, -90, Math.PI / 2 + 0.3);
  assert.equal(p.x, 75);
  assert.equal(p.z, -100);
  assert.ok(close(p.heading, Math.PI / 2), "eastbound stays eastbound");
  p = projectToRoad(75, -90, -Math.PI / 2 - 0.3);
  assert.ok(close(p.heading, -Math.PI / 2), "westbound stays westbound");
  // Defaults to heading 0 and clamps to the grid extents.
  p = projectToRoad(-40, 200);
  assert.equal(p.x, 0);
  assert.equal(p.z, 50);
  assert.ok(Number.isFinite(p.distance));
});

test("nearestNode picks the closest crossing", () => {
  assert.equal(nearestNode({ x: 3, z: 44 }).id, "0:50");
  assert.equal(nearestNode({ x: 430, z: -380 }).id, "450:-400");
  assert.equal(nearestNode({ x: 170, z: -240 }).id, "150:-250");
  assert.equal(nearestNode({ x: 999, z: 999 }).id, "450:50");
});

test("shortestPath finds a connected minimal route and honours custom weights", () => {
  const path = shortestPath(GARAGE_NODE, "450:-400");
  assert.equal(path[0], GARAGE_NODE);
  assert.equal(path[path.length - 1], "450:-400");
  for (let i = 1; i < path.length; i++) assert.ok(adjacent(path[i - 1], path[i]), `${path[i - 1]} -> ${path[i]}`);
  assert.equal(pathLength(path), 450 + 450);
  assert.deepEqual(shortestPath(GARAGE_NODE, GARAGE_NODE), [GARAGE_NODE]);
  // Make the west avenue expensive: the route to the marina detours via x = 150.
  const heavy = shortestPath(GARAGE_NODE, "0:-400", (e) => (node(e.a).x === 0 && node(e.b).x === 0 ? 1000 : e.length));
  assert.ok(heavy.includes("150:50") && heavy.includes("150:-400"));
  assert.ok(!heavy.slice(1, -1).some((id) => node(id).x === 0 && id !== "0:-400"));
  for (let i = 1; i < heavy.length; i++) assert.ok(adjacent(heavy[i - 1], heavy[i]));
});

test("segmentDistance and polylineLength", () => {
  assert.equal(segmentDistance({ x: 5, z: 3 }, { x: 0, z: 0 }, { x: 10, z: 0 }), 3);
  assert.equal(segmentDistance({ x: -4, z: 3 }, { x: 0, z: 0 }, { x: 10, z: 0 }), 5, "clamps to the endpoint");
  assert.equal(segmentDistance({ x: 3, z: 4 }, { x: 0, z: 0 }, { x: 0, z: 0 }), 5, "degenerate segment");
  assert.equal(polylineLength([]), 0);
  assert.equal(polylineLength([{ x: 0, z: 0 }, { x: 3, z: 4 }, { x: 3, z: 10 }]), 11);
});

/* ───────────────────────── Landmarks ───────────────────────── */

test("landmarks sit where the game expects them", () => {
  assert.equal(new Set(LANDMARKS.map((l) => l.id)).size, LANDMARKS.length, "unique ids");
  assert.ok(onRoad(START.x, START.z), "start pad is on the road");
  assert.equal(START.heading, 0);
  const garage = landmarks("garage");
  assert.equal(garage.length, 1);
  assert.equal(garage[0].node, GARAGE_NODE);
  const drops = landmarks("drop");
  assert.equal(drops.length, 3);
  for (const d of drops) {
    assert.ok(d.node && node(d.node), `${d.id} is on a node`);
    assert.equal(node(d.node!).x, d.x);
    assert.equal(node(d.node!).z, d.z);
  }
  for (const kind of ["camera", "respray", "stash"] as const) {
    assert.ok(landmarks(kind).length > 0);
    for (const l of landmarks(kind)) assert.ok(onRoad(l.x, l.z), `${l.id} is reachable by car`);
  }
  assert.equal(landmarks("respray").length, 2);
  // Every landmark reachable from the garage over the graph.
  for (const d of drops) assert.equal(shortestPath(GARAGE_NODE, d.node!).at(-1), d.node);
});

test("cameras only watch their own road (no false positives from parallel roads)", () => {
  for (const cam of landmarks("camera")) {
    const onAvenue = AVENUES.some((a) => a === cam.x);
    const onStreet = STREETS.some((s) => s === cam.z);
    assert.ok(onAvenue || onStreet, `${cam.id} sits on a centre-line`);
    // No other parallel road passes within 20 units.
    const nearestOther = onAvenue
      ? Math.min(...STREETS.map((s) => Math.abs(cam.z - s)))
      : Math.min(...AVENUES.map((a) => Math.abs(cam.x - a)));
    assert.ok(nearestOther > 20 + ROAD_HALF_WIDTH, `${cam.id} is mid-block`);
  }
});

test("placeName names every node", () => {
  for (const n of NODES) assert.notEqual(placeName(n.id), "SOLANA BAY");
  assert.equal(placeName("nowhere"), "SOLANA BAY");
  assert.equal(placeName(GARAGE_NODE), "SUNDOWN CUSTOMS");
});

/* ───────────────────────── Map projection ───────────────────────── */

test("worldToMap and mapToWorld are inverses and fit the map area", () => {
  for (const p of [{ x: 0, z: 0 }, { x: 450, z: -400 }, { x: -60, z: 90 }, { x: 123.4, z: -56.7 }]) {
    const { px, py } = worldToMap(p);
    const back = mapToWorld(px, py);
    assert.ok(close(back.x, p.x, 1e-9) && close(back.z, p.z, 1e-9));
  }
  const tl = worldToMap({ x: MAP.minX, z: MAP.minZ });
  const br = worldToMap({ x: MAP.maxX, z: MAP.maxZ });
  assert.deepEqual(tl, { px: MAP.left, py: MAP.top });
  assert.ok(close(br.px, MAP.left + MAP.size) && close(br.py, MAP.top + MAP.size));
  assert.equal(MAP.maxX - MAP.minX, MAP.maxZ - MAP.minZ, "square projection");
  assert.ok(MAP.left + MAP.size <= 940, "map stays left of the legend column");
  assert.ok(MAP.top + MAP.size <= MAP.height);
  // The whole grid (plus road width) fits with a margin on every side.
  const h = ROAD_HALF_WIDTH;
  assert.ok(MAP.minX < AVENUES[0] - h - 25, "room for the marina west of the grid");
  assert.ok(MAP.maxX > AVENUES[AVENUES.length - 1] + h + 25);
  assert.ok(MAP.minZ < STREETS[0] - h && MAP.maxZ > STREETS[STREETS.length - 1] + h);
  // Every landmark lands inside the map area.
  for (const l of LANDMARKS) {
    const { px, py } = worldToMap(l);
    assert.ok(px > MAP.left && px < MAP.left + MAP.size && py > MAP.top && py < MAP.top + MAP.size, l.id);
  }
});

/* ───────────────────────── Missions ───────────────────────── */

test("missionFromPath turns a node path into route, gates, cameras and a clock", () => {
  const causeway = LANDMARKS.find((l) => l.id === "causeway")!;
  const path = ["0:50", "0:-100", "150:-100", "150:-250", "300:-250", "300:-400", "450:-400"];
  const m = missionFromPath(path, causeway);
  assert.deepEqual(m.route[0], { x: START.x, z: START.z });
  assert.deepEqual(m.start, START, "north-first route starts on the pad facing north");
  assert.equal(m.route.length, path.length);
  assert.equal(m.checkpoints.length, path.length - 1);
  m.checkpoints.forEach((cp, i) => {
    assert.equal(cp.x, node(path[i + 1]).x);
    assert.equal(cp.z, node(path[i + 1]).z);
    assert.deepEqual({ x: m.route[i + 1].x, z: m.route[i + 1].z }, { x: cp.x, z: cp.z }, "checkpoint k is route[k + 1]");
  });
  assert.equal(m.checkpoints.at(-1)!.name, causeway.name);
  assert.equal(m.checkpoints[0].name, placeName("0:-100"));
  assert.equal(m.destination, causeway);
  assert.deepEqual(m.camerasOnRoute.map((c) => c.id).sort(), ["cam-market", "cam-mid", "cam-north"]);
  assert.ok(m.seconds >= 60);
  assert.equal(m.seconds, Math.round(Math.max(60, polylineLength(m.route) / 17 + 30)));
  assert.equal(polylineLength(m.route), 140 + 150 * 5);
  assert.equal(m.fromDrawing, false);
  assert.deepEqual(m.stashes, []);
  assert.equal(m.drawnShare, 0);
  const extra = missionFromPath(path, causeway, { fromDrawing: true, drawnShare: 0.5, notes: ["hi"], stashes: [landmarks("stash")[0]] });
  assert.equal(extra.fromDrawing, true);
  assert.equal(extra.drawnShare, 0.5);
  assert.deepEqual(extra.notes, ["hi"]);
  assert.equal(extra.stashes.length, 1);
});

test("a beach-road route to the motel is camera free", () => {
  const motel = LANDMARKS.find((l) => l.id === "motel")!;
  const m = missionFromPath(["0:50", "150:50", "300:50", "450:50"], motel);
  assert.deepEqual(m.camerasOnRoute, []);
});

test("mission.start faces the first leg of the route", () => {
  const motel = LANDMARKS.find((l) => l.id === "motel")!;
  const causeway = LANDMARKS.find((l) => l.id === "causeway")!;
  const east = missionFromPath(["0:50", "150:50", "300:50", "450:50"], motel);
  assert.deepEqual(east.start, { x: 10, z: 50, heading: Math.PI / 2 }, "east-first: just past the garage node, facing east");
  assert.deepEqual(east.route[0], { x: 10, z: 50 });
  assert.ok(onRoad(east.start.x, east.start.z));
  assert.equal(polylineLength(east.route), 440);
  const coast = missionFromPath(["0:50", "150:50", "300:50", "450:50", "450:-100", "450:-250", "450:-400"], causeway);
  assert.equal(coast.start.heading, Math.PI / 2);
  const north = missionFromPath(["0:50", "0:-100", "150:-100"], causeway);
  assert.deepEqual(north.start, { x: 0, z: 40, heading: 0 }, "north-first: the pad, facing north");
  assert.deepEqual(north.route[0], { x: 0, z: 40 });
  // In both cases the heading points straight at the first checkpoint.
  for (const m of [east, north]) {
    const cp = m.checkpoints[0];
    const want = Math.atan2(cp.x - m.start.x, -(cp.z - m.start.z));
    assert.ok(close(wrap(want - m.start.heading), 0), "heading 0 = -z, clockwise positive");
    assert.equal(nextTurn(m, 0, m.start.x, m.start.z, m.start.heading).dir === "uturn", false);
  }
  // A long drive gets a longer clock; a short one never drops under a minute.
  assert.equal(missionFromPath(["0:50", "150:50"], motel).seconds, 60);
  assert.ok(coast.seconds > 60);
});

test("defaultMission is Nico's west-side run to the Marina", () => {
  const m = defaultMission();
  assert.equal(m.destination.id, "marina");
  assert.deepEqual(m.checkpoints.map((c) => `${c.x}:${c.z}`), ["0:-100", "0:-250", "0:-400"]);
  assert.deepEqual(m.start, START);
  assert.deepEqual(m.camerasOnRoute.map((c) => c.id), ["cam-pier"]);
  assert.equal(m.fromDrawing, false);
  assert.ok(m.notes.length > 0);
  assert.deepEqual(defaultMission(), m, "pure: identical every call");
});

/* ───────────────────────── GPS: nextTurn ───────────────────────── */

const zigzag = () =>
  missionFromPath(
    ["0:50", "0:-100", "150:-100", "150:-250", "300:-250", "300:-400", "450:-400"],
    LANDMARKS.find((l) => l.id === "causeway")!,
  );

test("nextTurn: a straight run up the west avenue is one 'arrive' instruction", () => {
  const m = defaultMission();
  const t = nextTurn(m, 0, START.x, START.z, START.heading);
  assert.equal(t.dir, "arrive");
  assert.equal(t.distance, 140 + 150 + 150, "distance runs along the route to the drop");
  assert.equal(t.street, m.destination.name);
  // Without a heading there is no U-turn check at all.
  assert.equal(nextTurn(m, 0, START.x, START.z).dir, "arrive");
});

test("nextTurn: north then east is a right turn, east then north is a left", () => {
  const m = zigzag();
  let t = nextTurn(m, 0, 0, 40, 0);
  assert.equal(t.dir, "right");
  assert.equal(t.distance, 140);
  assert.equal(t.street, placeName("150:-100"));
  // Mid-leg the distance shrinks toward the turn.
  t = nextTurn(m, 0, 0, -50, 0);
  assert.equal(t.dir, "right");
  assert.equal(t.distance, 50);
  // Heading east along z = -100 toward (150, -100), then north: a left.
  t = nextTurn(m, 1, 20, -100, Math.PI / 2);
  assert.equal(t.dir, "left");
  assert.equal(t.distance, 130);
  assert.equal(t.street, placeName("150:-250"));
  // Heading north on x = 150, then east again: right.
  assert.equal(nextTurn(m, 2, 150, -120, 0).dir, "right");
});

test("nextTurn: the last leg says 'arrive' with the destination name", () => {
  const motel = LANDMARKS.find((l) => l.id === "motel")!;
  const m = missionFromPath(["0:50", "150:50", "300:50", "450:50"], motel);
  const t = nextTurn(m, 2, 330, 50, Math.PI / 2);
  assert.equal(t.dir, "arrive");
  assert.equal(t.distance, 120);
  assert.equal(t.street, "PALM MOTEL");
  // From the start, the whole street is straight: arrive in 440.
  const start = nextTurn(m, 0, m.start.x, m.start.z, m.start.heading);
  assert.equal(start.dir, "arrive");
  assert.equal(start.distance, 440);
  // A checkpoint index past the end still resolves to the destination.
  assert.equal(nextTurn(m, 99, 450, 50).dir, "arrive");
});

test("nextTurn: driving away from the next point asks for a U-turn", () => {
  const m = defaultMission();
  // Southbound on the west avenue while the next gate is north.
  let t = nextTurn(m, 0, 0, -50, Math.PI);
  assert.equal(t.dir, "uturn");
  assert.equal(t.distance, 50);
  assert.equal(t.street, "");
  // Wrapped headings behave the same (-π is also south).
  assert.equal(nextTurn(m, 0, 0, -50, -Math.PI).dir, "uturn");
  // Facing sideways (east) is not a U-turn: ~90° off is under the 2.2 rad limit.
  assert.notEqual(nextTurn(m, 0, 0, -50, Math.PI / 2).dir, "uturn");
  // Right on top of the gate (within 12) the check is skipped.
  t = nextTurn(m, 0, 0, -92, Math.PI);
  assert.notEqual(t.dir, "uturn");
  // An east-first route with the car facing west is turned around.
  const motel = LANDMARKS.find((l) => l.id === "motel")!;
  const east = missionFromPath(["0:50", "150:50", "300:50", "450:50"], motel);
  assert.equal(nextTurn(east, 0, 10, 50, -Math.PI / 2).dir, "uturn");
  assert.equal(nextTurn(east, 0, 10, 50, Math.PI / 2).dir, "arrive");
});
