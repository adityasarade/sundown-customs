import { placeName, type Mission, type Point, NODES } from "./city";

export type TurnDir = "left" | "right" | "straight" | "arrive";
export type Turn = { dir: TurnDir; distance: number; street: string };

const nodeAt = (p: Point) => NODES.find((n) => n.x === p.x && n.z === p.z);

/**
 * GTA-style next instruction along the planned route. `checkpoint` is the
 * index of the next checkpoint (checkpoint k sits at route[k + 1]).
 */
export function nextTurn(mission: Mission, checkpoint: number, x: number, z: number): Turn {
  const r = mission.route;
  const target = Math.min(checkpoint + 1, r.length - 1);
  let distance = Math.hypot(r[target].x - x, r[target].z - z);
  for (let j = target; j < r.length; j++) {
    if (j > target) distance += Math.hypot(r[j].x - r[j - 1].x, r[j].z - r[j - 1].z);
    if (j === r.length - 1)
      return { dir: "arrive", distance: Math.round(distance), street: mission.destination.name };
    const prev = j === target ? { x, z } : r[j - 1];
    const d1 = { x: Math.sign(r[j].x - prev.x), z: Math.sign(r[j].z - prev.z) };
    const d2 = { x: Math.sign(r[j + 1].x - r[j].x), z: Math.sign(r[j + 1].z - r[j].z) };
    const cross = d1.x * d2.z - d1.z * d2.x;
    if (cross !== 0) {
      const next = nodeAt(r[j + 1]);
      return {
        dir: cross > 0 ? "right" : "left",
        distance: Math.round(distance),
        street: next ? placeName(next.id) : "",
      };
    }
  }
  return { dir: "straight", distance: Math.round(distance), street: "" };
}
