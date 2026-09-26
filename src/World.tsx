import { useEffect, useRef } from "react";
import * as THREE from "three";
import { applyRespray, livePayout, copPose, createDriveState, runScore, starsFor, stepDrive, type DriveControls, type DriveEvent, } from "./driving";
import { makeCar, type CarModel } from "./car";
import { AVENUES, STREETS, BLOCK, ROAD_HALF_WIDTH, EDGES, NODES, START, node, landmarks, defaultMission, type Mission, type Point, type Landmark } from "./city";
import { nextTurn, type Turn } from "./gps";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
export type WorldMode = "garage" | "drive" | "photo";
export type Telemetry = {
    speed: number;
    remaining: number;
    checkpoint: number;
    totalCheckpoints: number;
    drift: number;
    boost: number;
    heat: number;
    stars: number;
    bust: number;
    cops: number;
    payout: number;
    respray: boolean;
    message: string;
    x?: number;
    z?: number;
    heading?: number;
    turn?: Turn;
    collected?: string[];
    stashes?: number;
    stashTotal?: number;
    limit?: number;
};
export type RunResult = {
    won: boolean;
    time: number;
    drift: number;
    collisions: number;
    score: number;
    snapshot: string;
    busted: boolean;
    stars: number;
    resprayed: boolean;
};
export type WorldApi = {
    respray: (changed: number) => {
        cleared: number;
        remaining: number;
    };
    teleport?: (x: number, z: number, heading: number) => void;
};
export type WorldProps = {
    mode: WorldMode;
    wrapUrl: string;
    paint: string;
    runId: number;
    paused: boolean;
    autoThrottle?: boolean;
    onTelemetry: (t: Telemetry) => void;
    onFinish: (r: RunResult) => void;
    onReady?: () => void;
    onError?: (message: string) => void;
    controls: React.MutableRefObject<DriveControls>;
    captureRef: React.MutableRefObject<(() => string) | null>;
    apiRef?: React.MutableRefObject<WorldApi | null>;
    onEvent?: (e: DriveEvent, shot?: string) => void;
    underglow?: string | null;
    emblemUrl?: string;
    billboardUrl?: string;
    mission?: Mission;
    tattooUrl?: string;
};
const PI = Math.PI;
const FALLBACK_MISSION = defaultMission();
type RenderDebugWindow = Window & {
    __sdRender?: () => THREE.WebGLInfo["render"];
};
function material(color: string | number, roughness = 0.8, metalness = 0.05) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function seeded(seed: number) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** Every bucket has exactly position, normal, uv (and optionally color). */
class Batch {
    private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    add(source: THREE.BufferGeometry, mat: THREE.Material, matrix = new THREE.Matrix4()) {
        const geo = source.index ? source.toNonIndexed() : source.clone();
        source.dispose();
        geo.clearGroups();
        for (const key of Object.keys(geo.attributes))
            if (!["position", "normal", "uv", "color"].includes(key))
                geo.deleteAttribute(key);
        if (!geo.getAttribute("normal"))
            geo.computeVertexNormals();
        const count = geo.getAttribute("position").count;
        if (!geo.getAttribute("uv"))
            geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
        if (mat.vertexColors) {
            if (!geo.getAttribute("color"))
                geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
        }
        else
            geo.deleteAttribute("color");
        geo.applyMatrix4(matrix);
        const bucket = this.buckets.get(mat) ?? [];
        bucket.push(geo);
        this.buckets.set(mat, bucket);
    }
    box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
        this.add(new THREE.BoxGeometry(w, h, d), mat, new THREE.Matrix4().makeTranslation(x, y, z));
    }
    flush(parent: THREE.Object3D) {
        for (const [mat, geometries] of this.buckets) {
            const merged = mergeGeometries(geometries, false);
            geometries.forEach((geo) => geo.dispose());
            if (!merged)
                throw new Error("Incompatible world geometry attributes");
            merged.computeBoundingSphere();
            const mesh = new THREE.Mesh(merged, mat);
            mesh.castShadow = !mat.transparent && !(mat instanceof THREE.MeshBasicMaterial);
            mesh.receiveShadow = true;
            parent.add(mesh);
        }
        this.buckets.clear();
    }
}
/** Dispose a whole ownership tree, including canvas maps and shader textures. */
function disposeTree(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Points))
            return;
        geometries.add(obj.geometry);
        for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
            mats.add(mat);
            Object.values(mat).forEach((v: unknown) => { if (v instanceof THREE.Texture)
                textures.add(v); });
            if (mat instanceof THREE.ShaderMaterial)
                Object.values(mat.uniforms).forEach((u) => { if (u.value instanceof THREE.Texture)
                    textures.add(u.value); });
        }
        if (obj instanceof THREE.InstancedMesh)
            obj.dispose();
    });
    textures.forEach((v) => v.dispose());
    geometries.forEach((v) => v.dispose());
    mats.forEach((v) => v.dispose());
}
/** Collapse a static subtree after all local transforms have been applied. */
function mergeStatic(root: THREE.Group) {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const batch = new Batch();
    root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && !Array.isArray(obj.material))
            batch.add(obj.geometry.clone(), obj.material, inverse.clone().multiply(obj.matrixWorld));
    });
    const old = new Set<THREE.BufferGeometry>();
    root.traverse((obj) => { if (obj instanceof THREE.Mesh)
        old.add(obj.geometry); });
    old.forEach((geo) => geo.dispose());
    root.clear();
    batch.flush(root);
}
function cube(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}
/**
 * World mounts at app start, usually before the display font has arrived, so
 * canvas-drawn signs would bake in the fallback face. Paint now, then repaint
 * once "Barlow Condensed" is ready.
 */
function paintWithDisplayFont(texture: THREE.Texture, paint: () => void) {
    paint();
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts)
        return;
    const faces = ['900 40px "Barlow Condensed"', '800 40px "Barlow Condensed"'];
    if (fonts.status !== "loading" && faces.every((f) => fonts.check(f)))
        return;
    fonts.ready
        .then(() => Promise.all(faces.map((f) => fonts.load(f))))
        .then(() => {
            paint();
            texture.needsUpdate = true;
        })
        .catch(() => { });
}
function textTexture(text: string, bg = "#183d38", fg = "#f0dfb5", width = 512, height = 128) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d")!;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    paintWithDisplayFont(t, () => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = fg;
        ctx.font = `italic 900 ${height * 0.43}px "Barlow Condensed", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, width / 2, height / 2, width * 0.9);
    });
    return t;
}
function sign(parent: THREE.Object3D, text: string, w: number, h: number, x: number, y: number, z: number, rotation = 0, bg = "#1b1030", fg = "#ff7ac8") {
    const mat = new THREE.MeshBasicMaterial({
        map: textTexture(text, bg, fg),
        side: THREE.DoubleSide,
    });
    mat.color.setScalar(1.9);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotation;
    parent.add(m);
    return m;
}
function buildTextures() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const random = seeded(8701);
    ctx.fillStyle = "#bcbcbc";
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++)
        for (let col = 0; col < 8; col++) {
            const x = col * 64, y = row * 64;
            ctx.fillStyle = "#555165";
            ctx.fillRect(x + 15, y + 10, 34, 46);
            ctx.fillStyle = random() < 0.64 ? "#172336" : ["#ffcc81", "#ff81bc", "#83e4ef"][Math.floor(random() * 3)];
            ctx.fillRect(x + 18, y + 13, 28, 38);
            ctx.fillStyle = "#655f72";
            ctx.fillRect(x + 31, y + 13, 2, 38);
            ctx.fillRect(x + 18, y + 32, 28, 2);
        }
    const facade = new THREE.CanvasTexture(canvas);
    facade.colorSpace = THREE.SRGBColorSpace;
    facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
    facade.anisotropy = 4;
    return { facade };
}
function palm(batch: Batch, x: number, z: number, size: number, angle: number, trunk: THREE.Material, frond: THREE.Material) {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)), new THREE.Vector3(size, size, size));
    const stem = new THREE.CylinderGeometry(0.14, 0.3, 7, 7);
    stem.rotateZ(0.09);
    stem.translate(-0.3, 3.5, 0);
    batch.add(stem, trunk, transform);
    for (let i = 0; i < 9; i++) {
        const a = i * PI * 2 / 9;
        const pts: number[] = [], uvs: number[] = [], indices: number[] = [];
        for (let j = 0; j <= 5; j++) {
            const t = j / 5, r = t * 3.6;
            const y = 7.15 + Math.sin(t * PI) * 0.85 - t * t * 0.8;
            const width = Math.sin(t * PI) * 0.6;
            pts.push(-0.6 + Math.cos(a) * r + Math.sin(a) * width, y, Math.sin(a) * r - Math.cos(a) * width, -0.6 + Math.cos(a) * r - Math.sin(a) * width, y, Math.sin(a) * r + Math.cos(a) * width);
            uvs.push(0, t, 1, t);
            if (j < 5) {
                const n = j * 2;
                indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        batch.add(geo, frond, transform);
    }
}
// All world extents and roadside furniture share the same grid-derived anchors.
const CITY = {
    west: AVENUES[0], east: AVENUES[AVENUES.length - 1],
    north: STREETS[0], south: STREETS[STREETS.length - 1],
};
const BOARD_IDS = ["cam-market", "cam-bridge", "cam-pier", "cam-north", "cam-mid"];
function roadside(l: Landmark, offset: number) {
    const avenue = AVENUES.some((x) => x === l.x);
    return { x: l.x + (avenue ? offset : 0), z: l.z - (avenue ? 0 : offset), avenue };
}
function boothPose(l: Landmark) {
    return roadside(l, ROAD_HALF_WIDTH + 7);
}
function boardPose(l: Landmark) {
    const p = roadside(l, ROAD_HALF_WIDTH + 12);
    return { ...p, rotation: p.avenue ? -PI / 3 : -PI / 7 };
}
type Footprint = Point & { w: number; d: number };
const reservedLots: Footprint[] = [
    ...landmarks("respray").map((l) => {
        const p = boothPose(l);
        return { ...p, w: p.avenue ? 15 : 24, d: p.avenue ? 24 : 15 };
    }),
    ...landmarks("camera").filter((l) => BOARD_IDS.includes(l.id)).map((l) => {
        const p = boardPose(l);
        return { ...p, w: Math.abs(Math.cos(p.rotation)) * 18.6 + 5,
            d: Math.abs(Math.sin(p.rotation)) * 18.6 + 5 };
    }),
];
function overlapsFurniture(x: number, z: number, w: number, d: number) {
    return reservedLots.some((p) => Math.abs(x - p.x) < (w + p.w) / 2 && Math.abs(z - p.z) < (d + p.d) / 2);
}
function clearGarageOrbit(x: number, z: number, w = 0, d = 0) {
    return Math.hypot(Math.max(0, Math.abs(x - START.x) - w / 2), Math.max(0, Math.abs(z - START.z) - d / 2)) >= 26;
}
function buildCity(scene: THREE.Scene) {
    const city = new THREE.Group();
    city.name = "Solana Bay / static material batches";
    scene.add(city);
    const batch = new Batch(), random = seeded(1987);
    const sand = material("#c79c86"), asphalt = material("#353544", 0.92);
    const curb = material("#d7c3ad"), concrete = material("#afa598"), grass = material("#718978");
    const yellow = material("#eacb83"), white = material("#f4dec2"), roof = material("#9a8b98");
    const metal = material("#465856"), wood = material("#998a70");
    const h = ROAD_HALF_WIDTH, sidewalk = 6;
    const width = CITY.east - CITY.west, depth = CITY.south - CITY.north;
    const cz = (CITY.north + CITY.south) / 2;
    const shore = CITY.west - h - 12, margin = BLOCK;
    const landEast = CITY.east + margin;
    batch.box(landEast - shore, 0.2, depth + margin * 2, (shore + landEast) / 2, -0.2, cz, sand);
    const water = material("#3d4f86", 0.15, 0.5);
    const seaWidth = width + margin * 4, seaDepth = depth + margin * 6;
    batch.box(seaWidth, 0.12, seaDepth, shore - seaWidth / 2, -0.28, cz, water);
    // Each node owns its intersection; edge slabs stop precisely at its edges.
    for (const n of NODES)
        batch.box(2 * h, 0.12, 2 * h, n.x, 0.02, n.z, asphalt);
    for (const edge of EDGES) {
        const a = node(edge.a), b = node(edge.b), alongX = a.z === b.z;
        const length = edge.length - 2 * h, x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
        batch.box(alongX ? length : 2 * h, 0.12, alongX ? 2 * h : length, x, 0.02, z, asphalt);
        for (const side of [-1, 1]) {
            const sx = x + (alongX ? 0 : side * (h + sidewalk / 2));
            const sz = z + (alongX ? side * (h + sidewalk / 2) : 0);
            batch.box(alongX ? length - 2 * sidewalk : sidewalk, 0.28, alongX ? sidewalk : length - 2 * sidewalk, sx, 0.04, sz, concrete);
            batch.box(alongX ? length : 0.4, 0.2, alongX ? 0.4 : length,
                x + (alongX ? 0 : side * (h + 0.2)), 0.2, z + (alongX ? side * (h + 0.2) : 0), curb);
        }
        for (let d = h + 5; d < edge.length - h - 2; d += 9)
            batch.box(alongX ? 4.4 : 0.16, 0.01, alongX ? 0.16 : 4.4,
                a.x + (b.x - a.x) * d / edge.length, 0.09, a.z + (b.z - a.z) * d / edge.length, yellow);
    }
    for (const n of NODES) {
        for (const sx of [-1, 1])
            for (const sz of [-1, 1])
                batch.box(sidewalk, 0.28, sidewalk, n.x + sx * (h + sidewalk / 2), 0.04, n.z + sz * (h + sidewalk / 2), concrete);
        for (const side of [-1, 1]) {
            for (let stripe = -h + 4; stripe <= h - 4; stripe += 3) {
                batch.box(1.6, 0.01, 3.1, n.x + stripe, 0.09, n.z + side * (h - 3), white);
                batch.box(3.1, 0.01, 1.6, n.x + side * (h - 3), 0.09, n.z + stripe, white);
            }
            if (n.z + side * h > CITY.north && n.z + side * h < CITY.south)
                batch.box(h - 3.5, 0.01, 0.4, n.x + side * h / 2, 0.09, n.z + side * h, white);
            if (n.x + side * h > CITY.west && n.x + side * h < CITY.east)
                batch.box(0.4, 0.01, h - 3.5, n.x + side * h, 0.09, n.z - side * h / 2, white);
        }
    }
    // The promenade and marina run the entire western edge, including the outer ring.
    const promenadeNorth = CITY.north - BLOCK / 2, promenadeSouth = CITY.south + BLOCK / 2;
    batch.box(8, 0.45, promenadeSouth - promenadeNorth, shore + 4, 0, cz, concrete);
    for (let z = promenadeNorth; z <= promenadeSouth; z += 8) {
        batch.box(0.16, 1.1, 0.16, shore + 0.5, 0.8, z, metal);
        const railLength = Math.min(8, promenadeSouth - z);
        if (railLength > 0)
            batch.box(0.1, 0.1, railLength, shore + 0.5, 1.25, z + railLength / 2, metal);
    }
    for (let z = promenadeNorth + 12, i = 0; z < promenadeSouth - 12; z += BLOCK / 5, i++) {
        batch.box(25, 0.3, 2.7, shore - 12.5, 0.02, z, wood);
        for (const offset of [2, 23])
            batch.box(0.35, 1.8, 0.35, shore - offset, 0.25, z, wood);
        const hull = new THREE.CapsuleGeometry(1.4, 5, 3, 6);
        hull.rotateX(PI / 2);
        hull.translate(shore - 16, -0.1, z - 5);
        batch.add(hull, i % 2 ? white : yellow);
        batch.box(1.8, 0.8, 2.9, shore - 16, 0.55, z - 5, white);
        batch.box(0.06, 7, 0.06, shore - 16, 3.8, z - 5, metal);
    }
    for (let i = 0; i < 96; i++)
        batch.box(12 + random() * 15, 0.01, 0.16, shore - 30 - random() * width, -0.208,
            promenadeNorth + random() * (promenadeSouth - promenadeNorth), metal);
    const { facade } = buildTextures();
    const walls = new THREE.MeshStandardMaterial({ map: facade, emissiveMap: facade, emissive: "#ffffff", emissiveIntensity: 1.65, vertexColors: true, roughness: 0.68, metalness: 0.12 });
    // Suppress neutral stucco in the shared emissive atlas; only colored windows glow.
    walls.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      vec3 windowTexel = texture2D(emissiveMap, vEmissiveMapUv).rgb;
      float chroma = max(max(windowTexel.r, windowTexel.g), windowTexel.b) - min(min(windowTexel.r, windowTexel.g), windowTexel.b);
      totalEmissiveRadiance *= smoothstep(0.13, 0.3, chroma);
    `);
    };
    const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff4fb0").multiplyScalar(2) });
    const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color("#52e8ff").multiplyScalar(2) });
    const neon = [pink, cyan];
    const palette = ["#eaa3b8", "#8fd3c2", "#f3b690", "#b7a1dc", "#f0dcb4", "#9fc4e8", "#e9b3d8"];
    const names = ["PALM MOTEL", "NO REFUNDS", "BAY RECORDS", "NICE TRY", "LATE CHECKOUT", "VICE & RICE", "CASH 4 GOLD-ISH", "SUNSET LIQUOR", "HOT WINGS HOT TAKES", "OCEAN VUE", "LUCKY 7 PAWN", "TAN LINES"];
    // All sixteen storefront signs share one atlas/material and one static draw.
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 512;
    signCanvas.height = names.length * 128;
    const signTexture = new THREE.CanvasTexture(signCanvas);
    signTexture.colorSpace = THREE.SRGBColorSpace;
    const signColors = ["#ff4fb0", "#52e8ff", "#ffcf4a"];
    paintWithDisplayFont(signTexture, () => {
        const ctx = signCanvas.getContext("2d")!;
        ctx.fillStyle = "#1b1030";
        ctx.fillRect(0, 0, signCanvas.width, signCanvas.height);
        ctx.font = 'italic 900 55px "Barlow Condensed", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        names.forEach((name, i) => {
            ctx.fillStyle = signColors[i % signColors.length];
            ctx.fillText(name, 256, i * 128 + 64, 460);
        });
    });
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide, color: new THREE.Color().setScalar(1.9) });
    let buildingId = 0, signId = 0;
    function building(x: number, z: number, w: number, d: number, height: number, color: string, facing?: number) {
        const geo = new THREE.BoxGeometry(w, height, d);
        const uv = geo.getAttribute("uv"), pos = geo.getAttribute("position"), norm = geo.getAttribute("normal");
        // Eight atlas cells per repeat: every window occupies 3.2 by 2.9 world meters.
        for (let i = 0; i < uv.count; i++) {
            const width = Math.abs(norm.getX(i)) > 0.5 ? d : w;
            uv.setXY(i, uv.getX(i) * width / (3.2 * 8), uv.getY(i) * height / (2.9 * 8));
        }
        const rgb = new THREE.Color(color), colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++)
            rgb.toArray(colors, i * 3);
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geo.translate(x, height / 2 + 0.2, z);
        batch.add(geo, walls);
        batch.box(w + 0.4, 0.35, d + 0.4, x, height + 0.25, z, roof);
        for (const side of [-1, 1]) {
            batch.box(w, 0.55, 0.22, x, height + 0.65, z + side * d / 2, roof);
            batch.box(0.22, 0.55, d, x + side * w / 2, height + 0.65, z, roof);
        }
        batch.box(2.3, 0.9, 1.5, x + 1, height + 0.9, z, metal);
        if (buildingId % 4 === 0) {
            const tank = new THREE.CylinderGeometry(1.2, 1.2, 2.1, 10);
            tank.translate(x - 2, height + 1.5, z - 2);
            batch.add(tank, wood);
        }
        if (buildingId % 3 === 0) {
            for (const side of [-1, 1])
                batch.box(w + 0.5, 0.1, 0.1, x, height + 0.45, z + side * (d / 2 + 0.22), neon[buildingId % 2]);
        }
        if (facing !== undefined && signId < 16) {
            const alongZ = Math.abs(Math.cos(facing)) > 0.5;
            const panel = new THREE.PlaneGeometry(Math.min(24, (alongZ ? w : d) * 0.95), 1.8);
            const uv = panel.getAttribute("uv"), row = signId % names.length;
            for (let i = 0; i < uv.count; i++)
                uv.setY(i, (names.length - row - 1 + uv.getY(i)) / names.length);
            panel.rotateY(facing);
            panel.translate(x + Math.sin(facing) * (w / 2 + 0.35), Math.min(height - 1.5, 8),
                z + Math.cos(facing) * (d / 2 + 0.35));
            batch.add(panel, signMat);
            signId++;
        }
        buildingId++;
    }
    const trunk = material("#907552");
    const frond = new THREE.MeshStandardMaterial({ color: "#447862", side: THREE.DoubleSide, roughness: 1 });
    function plant(x: number, z: number, size = 1) {
        if (clearGarageOrbit(x, z, 8, 8) && !overlapsFurniture(x, z, 8, 8))
            palm(batch, x, z, size, random() * PI * 2, trunk, frond);
    }
    const parkedPaint = material("#ffffff", 0.4, 0.25);
    parkedPaint.vertexColors = true;
    const parkedGlass = material("#273344", 0.2, 0.35), rubber = material("#20212a");
    for (let row = 0; row < STREETS.length - 1; row++) {
        for (let col = 0; col < AVENUES.length - 1; col++) {
            const left = AVENUES[col] + h + sidewalk, right = AVENUES[col + 1] - h - sidewalk;
            const top = STREETS[row] + h + sidewalk, bottom = STREETS[row + 1] - h - sidewalk;
            const x = (left + right) / 2, z = (top + bottom) / 2;
            const w = right - left, d = bottom - top;
            batch.box(w, 0.28, d, x, 0.04, z, concrete);
            if (row === 1 && col === 0) {
                // A full city block of lawns, paths, benches and a stepped fountain.
                for (const sx of [-1, 1])
                    for (const sz of [-1, 1])
                        batch.box(w / 2 - 9, 0.06, d / 2 - 9, x + sx * w / 4, 0.21, z + sz * d / 4, grass);
                for (const [radius, height, y, mat] of [[11, 0.6, 0.5, curb], [9.8, 0.12, 0.85, water], [3, 1.3, 1.1, curb], [2.7, 0.12, 1.8, water]] as const) {
                    const bowl = new THREE.CylinderGeometry(radius, radius, height, 32);
                    bowl.translate(x, y, z);
                    batch.add(bowl, mat);
                }
                batch.box(0.18, 3, 0.18, x, 3.2, z, cyan);
                for (const sx of [-1, 1])
                    for (const sz of [-1, 1]) {
                        plant(x + sx * w * 0.32, z + sz * d * 0.32, 1.3);
                        batch.box(5, 0.35, 1.4, x + sx * 18, 0.7, z + sz * 16, wood);
                        batch.box(5, 1, 0.18, x + sx * 18, 1.1, z + sz * 16 + sz * 0.6, wood);
                    }
                continue;
            }
            if (row === 0 && col === AVENUES.length - 2) {
                batch.box(w - 6, 0.04, d - 6, x, 0.2, z, asphalt);
                // Four rows, with driving aisles between them. Cars are simple merged boxes.
                for (let r = 0; r < 4; r++)
                    for (let c = 0; c < 12; c++) {
                        const px = left + 10 + c * (w - 20) / 12, pz = top + 14 + r * (d - 28) / 3;
                        if (overlapsFurniture(px, pz, 7, 12)) continue;
                        batch.box(0.12, 0.01, 8, px - 2.8, 0.23, pz, white);
                        if (random() < 0.32) continue;
                        const body = new THREE.BoxGeometry(2.8, 1, 5.6);
                        const colors = new Float32Array(body.getAttribute("position").count * 3);
                        const color = new THREE.Color(palette[(r + c) % 4]);
                        for (let v = 0; v < colors.length; v += 3) color.toArray(colors, v);
                        body.setAttribute("color", new THREE.BufferAttribute(colors, 3));
                        body.translate(px, 0.95, pz);
                        batch.add(body, parkedPaint);
                        batch.box(2.35, 0.85, 2.8, px, 1.85, pz, parkedGlass);
                        for (const side of [-1, 1])
                            for (const end of [-1, 1])
                                batch.box(0.3, 0.8, 1.1, px + side * 1.4, 0.65, pz + end * 1.7, rubber);
                    }
                for (const sx of [-1, 1]) plant(x + sx * (w / 2 - 3), z, 1.2);
                continue;
            }
            const divisions = (row + col) % 2 === 0 ? 3 : 2;
            const lotW = w / divisions, lotD = d / divisions;
            let blockSigns = 0;
            for (let r = 0; r < divisions; r++)
                for (let c = 0; c < divisions; c++) {
                    const bw = Math.min(45, lotW - 5) * (0.78 + random() * 0.22);
                    const bd = Math.min(45, lotD - 5) * (0.78 + random() * 0.22);
                    // Edge lots sit against the setback; remaining space becomes alleys.
                    const bx = c === 0 ? left + bw / 2 : c === divisions - 1 ? right - bw / 2 : x;
                    const bz = r === 0 ? top + bd / 2 : r === divisions - 1 ? bottom - bd / 2 : z;
                    if (overlapsFurniture(bx, bz, bw + 1, bd + 1) || !clearGarageOrbit(bx, bz, bw, bd)) continue;
                    const downtown = col === 1 && r === divisions - 1 && c === divisions - 1;
                    const height = downtown ? 48 + random() * 16 : 8 + random() * 37;
                    const facing = r === 0 ? PI : r === divisions - 1 ? 0 : c === 0 ? -PI / 2 : c === divisions - 1 ? PI / 2 : undefined;
                    building(bx, bz, bw, bd, height, downtown ? "#526880" : palette[Math.floor(random() * palette.length)],
                        facing !== undefined && blockSigns < 2 ? facing : undefined);
                    if (facing !== undefined) blockSigns++;
                }
        }
    }
    // Low-rise perimeter on the north, east and south; west remains open to the bay.
    const ringDepth = BLOCK * 0.4, ringOffset = h + sidewalk + ringDepth / 2;
    const outerLots: (Footprint & { facing: number })[] = [];
    for (let col = 0; col < AVENUES.length - 1; col++)
        for (let lot = 0; lot < 3; lot++) {
            const x = AVENUES[col] + (lot + 0.5) * (AVENUES[col + 1] - AVENUES[col]) / 3;
            for (const side of [-1, 1])
                outerLots.push({ x, z: (side < 0 ? CITY.north : CITY.south) + side * ringOffset, w: 30 + random() * 12, d: ringDepth * 0.65, facing: side < 0 ? 0 : PI });
        }
    for (let row = 0; row < STREETS.length - 1; row++)
        for (let lot = 0; lot < 3; lot++)
            outerLots.push({ x: CITY.east + ringOffset, z: STREETS[row] + (lot + 0.5) * (STREETS[row + 1] - STREETS[row]) / 3, w: ringDepth * 0.65, d: 30 + random() * 12, facing: -PI / 2 });
    const garage = landmarks("garage")[0];
    const shopX = garage.x + BLOCK / 5, shopZ = garage.z + h + 18;
    for (const lot of outerLots) {
        if (Math.abs(lot.x - shopX) < lot.w / 2 + 17 && Math.abs(lot.z - shopZ) < lot.d / 2 + 15) continue;
        if (overlapsFurniture(lot.x, lot.z, lot.w, lot.d) || !clearGarageOrbit(lot.x, lot.z, lot.w, lot.d)) continue;
        building(lot.x, lot.z, lot.w, lot.d, 8 + random() * 13, palette[Math.floor(random() * palette.length)], lot.facing);
        const px = lot.x + Math.sin(lot.facing) * (lot.w / 2 + 4);
        const pz = lot.z + Math.cos(lot.facing) * (lot.d / 2 + 4);
        plant(px, pz, 1.1);
    }
    building(shopX, shopZ, 24, 16, 5.5, "#7b9b8d");
    sign(city, "SUNDOWN CUSTOMS", 20, 1.7, shopX, 5.3, shopZ - 8.15, PI, "#143b34", "#f0d9a2");
    batch.box(25, 0.3, 7, shopX, 4.4, shopZ - 12, yellow);
    for (const side of [-1, 1])
        batch.box(0.18, 4.1, 0.18, shopX + side * 11, 2.1, shopZ - 14, curb);
    const lamp = new THREE.MeshStandardMaterial({ color: "#ffeab4", emissive: "#ffbe6b", emissiveIntensity: 2 });
    for (const edge of EDGES) {
        const a = node(edge.a), b = node(edge.b), alongX = a.z === b.z;
        const length = edge.length - 2 * (h + 7), count = Math.max(1, Math.round(length / 40));
        for (let i = 0; i <= count; i++) {
            const t = (h + 7 + i * length / count) / edge.length;
            const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
            const px = x + (alongX ? 0 : h + 2.5), pz = z - (alongX ? h + 2.5 : 0);
            if (!overlapsFurniture(px, pz, 4, 4) && clearGarageOrbit(px, pz)) {
                batch.box(0.14, 6, 0.14, px, 3, pz, metal);
                batch.box(alongX ? 0.14 : 2.4, 0.14, alongX ? 2.4 : 0.14, px - (alongX ? 0 : 1.2), 6, pz + (alongX ? 1.2 : 0), metal);
                batch.box(alongX ? 0.45 : 1, 0.08, alongX ? 1 : 0.45, px - (alongX ? 0 : 2.1), 5.9, pz + (alongX ? 2.1 : 0), lamp);
            }
        }
        for (let offset = h + 14; offset < edge.length - h - 8; offset += BLOCK / 5) {
            const t = offset / edge.length;
            for (const side of [-1, 1])
                plant(a.x + (b.x - a.x) * t + (alongX ? 0 : side * (h + 4)),
                    a.z + (b.z - a.z) * t + (alongX ? side * (h + 4) : 0), 0.85 + random() * 0.3);
        }
    }
    const cornerMat = new THREE.MeshBasicMaterial({ map: textTexture("› › ›", "#16443c", "#ffbf72"), side: THREE.DoubleSide });
    cornerMat.color.setScalar(1.9);
    for (const corner of [
        { x: CITY.west, z: CITY.north - h - 3, rotation: 0 },
        { x: CITY.east + h + 3, z: CITY.north, rotation: -PI / 2 },
        { x: CITY.east, z: CITY.south + h + 3, rotation: PI },
    ]) {
        const panelGroup = new THREE.Group();
        panelGroup.position.set(corner.x, 0, corner.z);
        panelGroup.rotation.y = corner.rotation;
        city.add(panelGroup);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 2), cornerMat);
        panel.position.y = 2.7;
        panelGroup.add(panel);
        for (const x of [-3, 3]) cube(panelGroup, 0.15, 2, 0.15, x, 1, 0, metal);
    }
    batch.flush(city);
    // Sign planes also join their own material buckets; no static geometry is left unbatched.
    mergeStatic(city);
    // Flat ground receives shadows but need not be redrawn as a shadow caster.
    const groundMaterials: THREE.Material[] = [sand, asphalt, concrete, grass, water];
    for (const obj of city.children)
        if (obj instanceof THREE.Mesh && !Array.isArray(obj.material) && groundMaterials.includes(obj.material))
            obj.castShadow = false;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.12, 64), material("#bdb199"));
    pad.position.set(START.x, 0.13, START.z);
    scene.add(pad);
    const line = new THREE.Mesh(new THREE.TorusGeometry(6.7, 0.035, 4, 80), material("#f7d5a0"));
    line.rotation.x = PI / 2;
    line.position.set(START.x, 0.205, START.z);
    scene.add(line);
    return { city, pad, line };
}
/** Default Bay PD public-safety ad shown until the cameras (or a hijack) give the boards something better. */
function bayPdPoster() {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext("2d")!;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    paintWithDisplayFont(t, () => {
        const bg = ctx.createLinearGradient(0, 0, 0, 512);
        bg.addColorStop(0, "#1b2350");
        bg.addColorStop(1, "#0d1024");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 1024, 512);
        ctx.fillStyle = "#ff3b4e";
        ctx.fillRect(0, 0, 1024, 18);
        ctx.fillStyle = "#52e8ff";
        ctx.fillRect(0, 494, 1024, 18);
        // Badge: a gold star inside a ring.
        ctx.save();
        ctx.translate(180, 250);
        ctx.fillStyle = "#141323";
        ctx.beginPath();
        ctx.arc(0, 0, 128, 0, PI * 2);
        ctx.fill();
        ctx.lineWidth = 12;
        ctx.strokeStyle = "#ffcf4a";
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const r = i % 2 ? 42 : 100, a = -PI / 2 + i * PI / 5;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = "#ffcf4a";
        ctx.fill();
        ctx.fillStyle = "#141323";
        ctx.font = `italic 900 34px "Barlow Condensed", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("BAY PD", 0, 6);
        ctx.restore();
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f0ead9";
        ctx.font = `italic 900 104px "Barlow Condensed", sans-serif`;
        ctx.fillText("SMILE.", 350, 190, 640);
        ctx.fillStyle = "#ff4fb0";
        ctx.fillText("WE SEE YOUR PAINT.", 350, 300, 640);
        ctx.fillStyle = "#52e8ff";
        ctx.font = `800 38px "Barlow Condensed", sans-serif`;
        ctx.fillText("SOLANA BAY PD · 214 CAMERAS · 0 DAYS OFF", 352, 372, 640);
        ctx.fillStyle = "#ffcf4a";
        ctx.font = `italic 800 30px "Barlow Condensed", sans-serif`;
        ctx.fillText("SEE A SUSPICIOUS RESPRAY? DIAL 9-1-BAY", 352, 430, 640);
    });
    return t;
}
/** Soft grayscale falloff used as an alphaMap so additive light pools have no hard rim. */
function falloffTexture(kind: "radial" | "beam") {
    const c = document.createElement("canvas");
    c.width = kind === "radial" ? 128 : 8;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = kind === "radial" ? ctx.createRadialGradient(64, 64, 0, 64, 64, 64) : ctx.createLinearGradient(0, 128, 0, 0);
    if (kind === "radial") {
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.45, "#b0b0b0");
        g.addColorStop(1, "#000000");
    }
    else {
        // v=0 is the ground end of the cone, v=1 the helicopter.
        g.addColorStop(0, "#303030");
        g.addColorStop(0.35, "#ffffff");
        g.addColorStop(0.85, "#9a9a9a");
        g.addColorStop(1, "#000000");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    return new THREE.CanvasTexture(c);
}
function additive(color: string, opacity: number) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
}
function groundRing(parent: THREE.Object3D, radius: number, mat: THREE.Material) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.22, radius, 48), mat);
    ring.rotation.x = -PI / 2;
    ring.position.y = 0.14;
    parent.add(ring);
    return ring;
}
const CONE_OPACITY = 0.06;
function cameraPole(l: Landmark) {
    const p = roadside(l, ROAD_HALF_WIDTH + 2.5);
    return new THREE.Vector3(p.x, 7, p.z);
}
function buildLandmarks(scene: THREE.Scene) {
    const staticGroup = new THREE.Group();
    scene.add(staticGroup);
    const batch = new Batch(), metal = material("#45414f"), dark = material("#1a1422");
    const blink = new THREE.MeshBasicMaterial({ color: "#ff3030" });
    // Each cone keeps its own material so it can fade out as the car drives into
    // it (from the chase camera a nearby cone would otherwise flood the road red).
    const cones: { mat: THREE.MeshBasicMaterial; x: number; z: number }[] = [];
    const zoneMat = additive("#ff3b4e", 0.45);
    for (const l of landmarks("camera")) {
        const pole = cameraPole(l), avenue = pole.x !== l.x;
        batch.box(0.22, 7, 0.22, pole.x, 3.5, pole.z, metal);
        const eye = pole.clone().add(new THREE.Vector3(avenue ? -5 : 0, 0, avenue ? 0 : 5));
        batch.box(avenue ? 5.2 : 0.2, 0.2, avenue ? 0.2 : 5.2, (eye.x + pole.x) / 2, 7, (eye.z + pole.z) / 2, metal);
        const cameraBox = new THREE.BoxGeometry(0.65, 0.45, 1.1);
        const pose = new THREE.Object3D();
        pose.position.copy(eye);
        pose.lookAt(l.x, 0, l.z);
        pose.updateMatrix();
        batch.add(cameraBox, dark, pose.matrix);
        const lamp = new THREE.SphereGeometry(0.12, 8, 6);
        lamp.translate(eye.x, 7.35, eye.z);
        batch.add(lamp, blink);
        // Oblique cone: the apex is the camera, and its circular footprint lies on the road.
        const cone = new THREE.ConeGeometry(18, 7, 32, 1, true), pos = cone.getAttribute("position");
        for (let i = 0; i < pos.count; i++) {
            const t = (pos.getY(i) + 3.5) / 7;
            pos.setXYZ(i, pos.getX(i) + l.x + (eye.x - l.x) * t, pos.getY(i) + 3.6, pos.getZ(i) + l.z + (eye.z - l.z) * t);
        }
        cone.computeVertexNormals();
        const coneMat = additive("#ff3b4e", CONE_OPACITY);
        coneMat.side = THREE.FrontSide;
        const coneMesh = new THREE.Mesh(cone, coneMat);
        coneMesh.renderOrder = 1;
        scene.add(coneMesh);
        cones.push({ mat: coneMat, x: l.x, z: l.z });
        const zone = new THREE.RingGeometry(17.4, 18, 64);
        zone.rotateX(-PI / 2);
        zone.translate(l.x, 0.12, l.z);
        batch.add(zone, zoneMat);
    }
    const markers: {
        group: THREE.Group;
        beam: THREE.Mesh;
    }[] = [];
    const boothMat = material("#2b2436"), opening = material("#0c0a12"), trim = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff4fb0").multiplyScalar(1.8) });
    for (const l of landmarks("respray")) {
        const { x, z, avenue } = boothPose(l);
        const booth = new THREE.Group();
        booth.position.set(x, 0, z);
        // Default facade is -x; rotating +90 degrees makes it face +z.
        booth.rotation.y = avenue ? 0 : PI / 2;
        staticGroup.add(booth);
        cube(booth, 10, 7, 18, 0, 3.5, 0, boothMat);
        cube(booth, 0.12, 5.2, 12, -5.08, 2.6, 0, opening);
        cube(booth, 11.5, 0.25, 19.5, 0, 7.1, 0, trim);
        sign(booth, "SPRAY & PRAY", 16, 2.6, -5.3, 9, 0, -PI / 2, "#1a0f24", "#ff5fb8");
        sign(booth, "NEW PAINT · NO QUESTIONS", 12, 1.2, -5.25, 6.1, 0, -PI / 2, "#1a0f24", "#6ff3ff");
        const group = new THREE.Group();
        group.position.set(l.x, 0, l.z);
        scene.add(group);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 5, 40, 1, true), additive("#ff4fb0", 0.25));
        beam.position.y = 2.5;
        group.add(beam);
        groundRing(group, 6.7, additive("#ff79c6", 0.9));
        const floor = sign(group, "RESPRAY", 9, 2.2, 0, 0.15, 0, 0, "#2a0f2a", "#ff9ad5");
        floor.rotation.set(-PI / 2, 0, PI);
        markers.push({ group, beam });
    }
    batch.flush(staticGroup);
    mergeStatic(staticGroup);
    const defaultBoard = bayPdPoster();
    const boardMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(1.25), map: defaultBoard });
    const boards = new THREE.Group();
    scene.add(boards);
    for (const id of BOARD_IDS) {
        const l = landmarks("camera").find((c) => c.id === id)!;
        const p = boardPose(l), group = new THREE.Group();
        group.position.set(p.x, 0, p.z);
        // Face the road, angled toward traffic arriving from the garage side (south / west).
        group.rotation.y = p.rotation;
        boards.add(group);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), boardMat);
        panel.position.y = 7.5;
        group.add(panel);
        cube(group, 18.6, 9.6, 0.4, 0, 7.5, -0.25, dark);
        for (const x of [-5, 5])
            cube(group, 0.4, 3.2, 0.4, x, 1.6, -0.3, metal);
    }
    mergeStatic(boards);
    boards.visible = false;
    return { markers, blink, boards, boardMat, defaultBoard, cones };
}
function buildMissionVisuals(mission: Mission) {
    const group = new THREE.Group();
    group.name = "Current mission";
    const chevrons = document.createElement("canvas");
    chevrons.width = 256;
    chevrons.height = 128;
    const ctx = chevrons.getContext("2d")!;
    function arrow(color: string, width: number) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = "miter";
        ctx.beginPath();
        ctx.moveTo(62, 8);
        ctx.lineTo(128, 64);
        ctx.lineTo(62, 120);
        ctx.stroke();
    }
    arrow("#ff4fb0", 36);
    arrow("#ff9ad5", 12);
    const texture = new THREE.CanvasTexture(chevrons);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    const ribbonGeo = new THREE.BufferGeometry();
    const capacity = Math.max(1, mission.route.length * 2 + 1) * 6;
    ribbonGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
    ribbonGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage));
    ribbonGeo.setDrawRange(0, 0);
    const ribbon = new THREE.Mesh(ribbonGeo, new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color().setScalar(1.6), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide, fog: false }));
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 2;
    group.add(ribbon);
    const gates = mission.checkpoints.slice(0, -1).map((cp, i) => {
        const gate = new THREE.Group();
        gate.position.set(cp.x, 0, cp.z);
        group.add(gate);
        const from = mission.route[i], to = mission.route[i + 1];
        if (from && to && Math.abs(to.x - from.x) > Math.abs(to.z - from.z))
            gate.rotation.y = PI / 2;
        const mat = additive("#ffcf4a", 0.85);
        mat.color.multiplyScalar(1.7);
        const batch = new Batch();
        batch.box(0.18, 6, 0.18, -10, 3, 0, mat);
        batch.box(0.18, 6, 0.18, 10, 3, 0, mat);
        batch.box(20, 0.18, 0.18, 0, 6, 0, mat);
        batch.flush(gate);
        sign(gate, String(i + 1).padStart(2, "0"), 2.2, 1.2, 0, 6.9, 0, 0, "#211c29", "#ffcf4a");
        const curtain = new THREE.Mesh(new THREE.PlaneGeometry(20, 6), additive("#ffcf4a", 0.1));
        curtain.position.y = 3;
        gate.add(curtain);
        return { group: gate, mat, curtain };
    });
    const currentRing = groundRing(group, 6.5, additive("#ffcf4a", 0.9));
    const dest = new THREE.Group();
    dest.position.set(mission.destination.x, 0, mission.destination.z);
    group.add(dest);
    const fade = document.createElement("canvas");
    fade.width = 8;
    fade.height = 256;
    const fadeCtx = fade.getContext("2d")!, gradient = fadeCtx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "#000000");
    gradient.addColorStop(0.55, "#777777");
    gradient.addColorStop(1, "#ffffff");
    fadeCtx.fillStyle = gradient;
    fadeCtx.fillRect(0, 0, 8, 256);
    const fadeTexture = new THREE.CanvasTexture(fade);
    const beamMat = additive("#ffcf4a", 0.28);
    beamMat.alphaMap = fadeTexture;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 70, 48, 1, true), beamMat);
    beam.position.y = 35;
    dest.add(beam);
    const coreMat = additive("#fff0b0", 0.4);
    coreMat.alphaMap = fadeTexture;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 70, 24, 1, true), coreMat);
    core.position.y = 35;
    dest.add(core);
    groundRing(dest, 7.4, additive("#ffcf4a", 0.9));
    const destinationSign = sign(dest, `DROP · ${mission.destination.name}`, 15, 2.5, 0, 14, 0, 0, "#141323", "#ffcf4a");
    const bagMat = new THREE.MeshStandardMaterial({ color: "#f2b730", emissive: "#ffb300", emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.35 });
    const dollarMat = new THREE.MeshBasicMaterial({ map: textTexture("$", "#dba132", "#412a16", 128, 128), side: THREE.DoubleSide });
    const stashes = mission.stashes.map((stash) => {
        const anchor = new THREE.Group();
        anchor.position.set(stash.x, 0, stash.z);
        group.add(anchor);
        const bag = new THREE.Group();
        anchor.add(bag);
        const batch = new Batch();
        const body = new THREE.SphereGeometry(0.7, 14, 10);
        body.scale(1, 1.15, 0.7);
        batch.add(body, bagMat);
        const neck = new THREE.CylinderGeometry(0.29, 0.12, 0.3, 12);
        neck.translate(0, 0.8, 0);
        batch.add(neck, bagMat);
        batch.flush(bag);
        for (const side of [-1, 1]) {
            const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.6), dollarMat);
            decal.position.set(0, 0, side * 0.49);
            decal.rotation.y = side === 1 ? 0 : PI;
            bag.add(decal);
        }
        mergeStatic(bag);
        bag.scale.setScalar(1.6);
        groundRing(anchor, 2.4, additive("#ffcf4a", 0.8));
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 20, 1, true), additive("#ffcf4a", 0.14));
        pillar.position.y = 1.5;
        anchor.add(pillar);
        return { id: stash.id, anchor, bag };
    });
    // Materials created for empty stash lists still have explicit ownership.
    if (!stashes.length) {
        bagMat.dispose();
        dollarMat.map?.dispose();
        dollarMat.dispose();
    }
    return { group, ribbon, texture, gates, currentRing, destinationSign, stashes, lastCheckpoint: -1, ribbonTime: -1 };
}
type MissionVisuals = ReturnType<typeof buildMissionVisuals>;
const missionKey = (m: Mission) =>
    `${m.destination.id}|${m.route.map((p) => `${p.x},${p.z}`).join(";")}|${m.checkpoints.map((c) => c.name).join(";")}|${m.stashes.map((s) => s.id).join(",")}`;
function updateRibbon(visuals: MissionVisuals, mission: Mission, checkpoint: number, x: number, z: number) {
    const geometry = visuals.ribbon.geometry, positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
    const route = mission.route;
    if (checkpoint >= route.length - 1) {
        geometry.setDrawRange(0, 0);
        return;
    }
    // Mission routes are node-to-node, but a leg can be diagonal (e.g. the pad at
    // START to the first corner). Expand those into road-following L-bends.
    const legs: Point[] = [route[checkpoint]];
    for (let i = checkpoint + 1; i < route.length; i++) {
        const a = legs[legs.length - 1], b = route[i];
        if (Math.abs(b.x - a.x) > 0.5 && Math.abs(b.z - a.z) > 0.5)
            legs.push(AVENUES.some((av) => Math.abs(av - a.x) < 0.5) ? { x: a.x, z: b.z } : { x: b.x, z: a.z });
        legs.push(b);
    }
    // The car is on the current leg: route[checkpoint] up to route[checkpoint + 1].
    const legEnd = legs.indexOf(route[checkpoint + 1]);
    let bestT = 0, bestSeg = 0, bestD = Infinity;
    for (let i = 0; i < legEnd; i++) {
        const a = legs[i], b = legs[i + 1], dx = b.x - a.x, dz = b.z - a.z;
        const tt = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        const d = Math.hypot(a.x + dx * tt - x, a.z + dz * tt - z);
        if (d < bestD) {
            bestD = d;
            bestT = tt;
            bestSeg = i;
        }
    }
    const a0 = legs[bestSeg], b0 = legs[bestSeg + 1];
    let from: Point = { x: a0.x + (b0.x - a0.x) * bestT, z: a0.z + (b0.z - a0.z) * bestT }, distance = 0, vertex = 0;
    for (let i = bestSeg + 1; i < legs.length; i++) {
        const to = legs[i], length = Math.hypot(to.x - from.x, to.z - from.z);
        if (length < 0.001) {
            from = to;
            continue;
        }
        const fx = (to.x - from.x) / length, fz = (to.z - from.z) / length, rx = -fz * 1.6, rz = fx * 1.6;
        const sx = from.x - fx * 1.6, sz = from.z - fz * 1.6, ex = to.x + fx * 1.6, ez = to.z + fz * 1.6;
        const corners = [[sx + rx, sz + rz], [sx - rx, sz - rz], [ex - rx, ez - rz], [ex + rx, ez + rz]];
        for (const index of [0, 1, 2, 0, 2, 3]) {
            positions.setXYZ(vertex, corners[index][0], 0.13, corners[index][1]);
            uv.setXY(vertex, (distance + (index < 2 ? -1.6 : length + 1.6)) / 4, index === 0 || index === 3 ? 0 : 1);
            vertex++;
        }
        distance += length;
        from = to;
    }
    positions.needsUpdate = uv.needsUpdate = true;
    geometry.setDrawRange(0, vertex);
}
function buildArm(car: CarModel) {
    const group = new THREE.Group();
    group.name = "Driver / Ink & Iron";
    car.group.add(group);
    const skin = material("#c98d6a", 0.7), forearmMat = material("#c98d6a", 0.62);
    // Elbow hangs out past the door line; the hand reaches back in toward the
    // wheel through the open window. The forearm's top face (where the ink sits)
    // is what the chase camera sees.
    const elbow = new THREE.Vector3(-1.66, 1.23, 0.5), wrist = new THREE.Vector3(-1.2, 1.25, -0.36);
    const length = elbow.distanceTo(wrist);
    const direction = wrist.clone().sub(elbow).normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    // u follows elbow→wrist; v wraps the circumference with the image centre on
    // the up/outward face. The seam starts opposite that face, and v runs against
    // theta so the ink is not mirrored.
    const outward = new THREE.Vector3(-0.35, 1, 0.1).normalize().applyQuaternion(rotation.clone().invert());
    const outwardAngle = Math.atan2(outward.x, outward.z);
    const geo = new THREE.CylinderGeometry(0.115, 0.145, length, 20, 1, true, outwardAngle - PI, PI * 2), pos = geo.getAttribute("position"), uv = geo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++)
        uv.setXY(i, pos.getY(i) / length + 0.5, 0.5 - (uv.getX(i) * 2 - 1) / 1.6);
    const forearm = new THREE.Mesh(geo, forearmMat);
    forearm.quaternion.copy(rotation);
    forearm.position.copy(elbow).add(wrist).multiplyScalar(0.5);
    forearm.castShadow = true;
    group.add(forearm);
    const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 10), skin);
    elbowCap.position.copy(elbow);
    group.add(elbowCap);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), skin);
    hand.scale.set(0.8, 0.62, 1.45);
    hand.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction));
    hand.position.copy(wrist).addScaledVector(direction, 0.12);
    group.add(hand);
    // Short T-shirt sleeve: from just behind the elbow back to the shoulder.
    // Kept low and inboard so it doesn't hide the inked forearm from the chase cam.
    const shoulder = new THREE.Vector3(-0.9, 1.32, 0.82);
    const sleeveStart = elbow.clone().lerp(shoulder, 0.4);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, sleeveStart.distanceTo(shoulder), 14), material("#1b1f2a"));
    sleeve.position.copy(sleeveStart).add(shoulder).multiplyScalar(0.5);
    sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shoulder.clone().sub(sleeveStart).normalize());
    group.add(sleeve);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, elbow.distanceTo(sleeveStart) + 0.05, 12), skin);
    upper.position.copy(elbow).add(sleeveStart).multiplyScalar(0.5);
    upper.quaternion.copy(sleeve.quaternion);
    group.add(upper);
    return { group, material: forearmMat };
}
/** Merge each rigid car part; wheels retain their own local rotation. */
function compactCar(car: CarModel) {
    const rigid = new THREE.Group();
    for (const child of [...car.group.children])
        if (child instanceof THREE.Mesh && child.visible && !child.material.transparent)
            rigid.add(child);
    // Transparent glass/wrap must preserve their sorting and polygon-offset materials.
    for (const child of [...car.group.children])
        if (child instanceof THREE.Mesh && child.visible && child.position.y > 0.1)
            rigid.add(child);
    car.group.add(rigid);
    mergeStatic(rigid);
    for (const wheel of car.wheels)
        mergeStatic(wheel);
}
/** Instance matching rigid parts across the fleet, including rotating wheels.
 * Logical makeCar groups remain off-scene so their original control API still works.
 */
function createFleet(scene: THREE.Scene, models: CarModel[]) {
    type Entry = {
        mesh: THREE.Mesh;
        owner: CarModel;
        index: number;
    };
    const buckets = new Map<string, {
        geometry: THREE.BufferGeometry;
        material: THREE.Material;
        entries: Entry[];
        tinted: boolean;
    }>();
    // Match local geometry, not traversal order: all identical tires/rims can
    // share an instance batch even when they belong to different wheel groups.
    const geometryIds = new Map<string, number>();
    const geometryId = (geo: THREE.BufferGeometry) => {
        const signature = Object.keys(geo.attributes).sort().map((name) => {
            const attr = geo.getAttribute(name);
            return `${name}:${attr.itemSize}:${Array.from(attr.array, (v) => Math.round(v * 1e6)).join(",")}`;
        }).join("|") + `/${geo.index ? Array.from(geo.index.array).join(",") : ""}`;
        let id = geometryIds.get(signature);
        if (id === undefined) {
            id = geometryIds.size;
            geometryIds.set(signature, id);
        }
        return id;
    };
    for (const model of models) {
        compactCar(model);
        model.group.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh) || Array.isArray(obj.material) || !obj.visible)
                return;
            const mat = obj.material;
            const standard = mat instanceof THREE.MeshStandardMaterial ? mat : null;
            const tinted = mat === model.body;
            const key = `${geometryId(obj.geometry)}/${mat.type}/${tinted ? "paint" : standard?.color.getHex()}/${standard?.emissive.getHex()}/${standard?.roughness}/${standard?.metalness}/${mat.transparent}/${mat.side}`;
            let bucket = buckets.get(key);
            if (!bucket) {
                const instanceMaterial = tinted ? model.body.clone() : mat;
                if (instanceMaterial instanceof THREE.MeshStandardMaterial && tinted)
                    instanceMaterial.color.set("#ffffff");
                bucket = { geometry: obj.geometry, material: instanceMaterial, entries: [], tinted };
            }
            bucket.entries.push({ mesh: obj, owner: model, index: bucket.entries.length });
            buckets.set(key, bucket);
        });
    }
    const batches = [...buckets.values()].map((bucket) => {
        const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.entries.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (bucket.tinted)
            for (const entry of bucket.entries) mesh.setColorAt(entry.index, entry.owner.body.color);
        mesh.castShadow = !bucket.material.transparent;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
        return { ...bucket, instance: mesh };
    });
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    return {
        sync() {
            models.forEach((m) => m.group.updateMatrixWorld(true));
            for (const batch of batches) {
                batch.instance.visible = batch.entries.some((e) => e.owner.group.visible);
                for (const entry of batch.entries)
                    batch.instance.setMatrixAt(entry.index, entry.owner.group.visible ? entry.mesh.matrixWorld : hidden);
                batch.instance.instanceMatrix.needsUpdate = true;
            }
        },
        dispose() { models.forEach((model) => { disposeTree(model.group); model.wrap.dispose(); }); },
    };
}
function createTraffic() {
    const random = seeded(7031), adjacency = new Map(NODES.map((n) => [n.id, [] as string[]]));
    for (const edge of EDGES) {
        adjacency.get(edge.a)!.push(edge.b);
        adjacency.get(edge.b)!.push(edge.a);
    }
    const colors = ["#f1ca8c", "#6faca6", "#a16e71", "#d9cbb4", "#6d8795", "#be946b", "#bd8cad", "#82c6b4"];
    const traffic = colors.map((color) => {
        let edge = EDGES[0], t = 0;
        for (let tries = 0; tries < 100; tries++) {
            edge = EDGES[Math.floor(random() * EDGES.length)];
            t = random() * edge.length;
            const a = node(edge.a), b = node(edge.b), ratio = t / edge.length;
            if (Math.hypot(a.x + (b.x - a.x) * ratio - START.x, a.z + (b.z - a.z) * ratio - START.z) >= 50)
                break;
        }
        return { car: makeCar(color, "civilian"), from: edge.a, to: edge.b, t, speed: 8 + random() * 4 };
    });
    return { traffic, advance(dt: number) {
            for (const vehicle of traffic) {
                vehicle.t += vehicle.speed * dt;
                let a = node(vehicle.from), b = node(vehicle.to), length = Math.hypot(b.x - a.x, b.z - a.z);
                while (vehicle.t >= length) {
                    vehicle.t -= length;
                    const previous = vehicle.from;
                    vehicle.from = vehicle.to;
                    const neighbours = adjacency.get(vehicle.from)!;
                    const forward = neighbours.filter((id) => id !== previous);
                    const choices = forward.length ? forward : neighbours;
                    vehicle.to = choices[Math.floor(random() * choices.length)];
                    a = node(vehicle.from);
                    b = node(vehicle.to);
                    length = Math.hypot(b.x - a.x, b.z - a.z);
                }
                const h = Math.atan2(b.x - a.x, -(b.z - a.z)), t = vehicle.t / length;
                vehicle.car.group.position.set(a.x + (b.x - a.x) * t + Math.cos(h) * ROAD_HALF_WIDTH * 0.4, 0.025, a.z + (b.z - a.z) * t + Math.sin(h) * ROAD_HALF_WIDTH * 0.4);
                vehicle.car.group.rotation.y = -h;
                for (const wheel of vehicle.car.wheels)
                    wheel.rotation.x -= vehicle.speed * dt / 0.6;
            }
        } };
}
export function World(all: WorldProps) {
    const host = useRef<HTMLDivElement>(null), props = useRef(all);
    props.current = all;
    useEffect(() => {
        const el = host.current;
        if (!el)
            return;
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({
                antialias: true,
                preserveDrawingBuffer: true,
                powerPreference: "high-performance",
            });
        }
        catch {
            props.current.onError?.("Enable hardware acceleration or try another browser to drive the 3D coast.");
            return;
        }
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        renderer.setClearColor("#d9798a");
        if (import.meta.env.DEV)
            (window as RenderDebugWindow).__sdRender = () => ({ ...renderer.info.render });
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog("#d9798a", BLOCK * 0.8, BLOCK * 3.2);
        const camera = new THREE.PerspectiveCamera(47, 1, 0.1, BLOCK * 6);
        camera.position.set(START.x + 11, 6, START.z + 11);
        scene.add(new THREE.HemisphereLight("#ffc9a8", "#4b3f78", 2.2));
        const sun = new THREE.DirectionalLight("#ffb482", 3.0);
        sun.position.set(-45, 75, -20);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -70;
        sun.shadow.camera.right = 70;
        sun.shadow.camera.top = 70;
        sun.shadow.camera.bottom = -70;
        sun.shadow.normalBias = 0.035;
        sun.shadow.bias = -0.0001;
        scene.add(sun);
        scene.add(sun.target);
        const sky = new THREE.Mesh(new THREE.SphereGeometry(BLOCK * 5, 32, 16), new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                top: { value: new THREE.Color("#2a1b5e") },
                mid: { value: new THREE.Color("#c2457f") },
                bottom: { value: new THREE.Color("#ff8a5c") },
            },
            vertexShader: "varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
            fragmentShader: "varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; void main(){float t=clamp(normalize(vP).y,0.,1.); vec3 color=mix(bottom,mid,smoothstep(0.,.13,t)); color=mix(color,top,smoothstep(.08,.55,t)); gl_FragColor=vec4(color,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
        }));
        scene.add(sky);
        const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 24), new THREE.MeshBasicMaterial({ color: "#ffd08a", fog: false }));
        sunDisc.position.set(START.x - BLOCK * 2.1, 22, START.z + BLOCK * 0.4);
        scene.add(sunDisc);
        const starRandom = seeded(450);
        const starPositions: number[] = [];
        for (let i = 0; i < 120; i++) {
            const az = starRandom() * PI * 2, elevation = 0.3 + starRandom() * 1.15;
            starPositions.push(Math.cos(az) * Math.cos(elevation) * BLOCK * 4.3, Math.sin(elevation) * BLOCK * 4.3, Math.sin(az) * Math.cos(elevation) * BLOCK * 4.3);
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
        const starsSky = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#e6c7ff", size: 1.1, transparent: true, opacity: 0.45, depthWrite: false, fog: false }));
        scene.add(starsSky);
        const { pad, line } = buildCity(scene);
        const { markers, blink, boards, boardMat, defaultBoard, cones } = buildLandmarks(scene);
        let lastMission = props.current.mission ?? FALLBACK_MISSION;
        let lastMissionKey = missionKey(lastMission);
        let missionVisuals = buildMissionVisuals(lastMission);
        scene.add(missionVisuals.group);
        const car = makeCar(props.current.paint, "hero");
        compactCar(car);
        const arm = buildArm(car);
        // Crew emblem on the roof: visible from the chase camera the whole run.
        const emblemMat = new THREE.MeshStandardMaterial({
            color: "#ffffff",
            transparent: true,
            roughness: 0.4,
            metalness: 0.1,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3,
        });
        const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), emblemMat);
        emblem.rotation.x = -Math.PI / 2 + 0.03;
        emblem.position.set(0, 1.835, 0.37);
        emblem.visible = false;
        car.group.add(emblem);
        let lastBoard = "", boardTex: THREE.Texture | null = null;
        let lastEmblem = "", emblemTex: THREE.Texture | null = null;
        let lastTattoo = "", tattooTex: THREE.Texture | null = null;
        let boardVersion = 0, emblemVersion = 0, tattooVersion = 0;
        scene.add(car.group);
        car.group.position.set(START.x, 0, START.z);
        const trafficSystem = createTraffic();
        const traffic = trafficSystem.traffic;
        trafficSystem.advance(0);
        const cops = Array.from({ length: 3 }, () => {
            const c = makeCar("#10161c", "police");
            c.group.visible = false;
            return c;
        });
        const civilianFleet = createFleet(scene, traffic.map((v) => v.car));
        const policeFleet = createFleet(scene, cops);
        // Police helicopter: a searchlight that follows the car at three stars.
        const heli = new THREE.Group();
        const heliBody = material("#141a22", 0.5, 0.3);
        const heliRigid = new THREE.Group();
        heli.add(heliRigid);
        const cabin = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.4, 4, 10), heliBody);
        cabin.rotation.x = PI / 2;
        heliRigid.add(cabin);
        cube(heliRigid, 0.35, 0.35, 4.6, 0, 0.2, 3.4, heliBody);
        cube(heliRigid, 0.1, 1.2, 0.8, 0, 0.7, 5.6, heliBody);
        mergeStatic(heliRigid);
        const rotor = cube(heli, 9, 0.06, 0.32, 0, 1.35, 0, material("#0a0d12", 0.6));
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: "#ff3030" }));
        beacon.position.set(0, -0.9, -0.6);
        heli.add(beacon);
        heli.visible = false;
        scene.add(heli);
        const searchlight = new THREE.Mesh(new THREE.ConeGeometry(3.4, 24, 28, 1, true), new THREE.MeshBasicMaterial({
            color: "#fff4d0",
            alphaMap: falloffTexture("beam"),
            transparent: true,
            opacity: 0.07,
            fog: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        }));
        searchlight.visible = false;
        scene.add(searchlight);
        const spot = new THREE.Mesh(new THREE.CircleGeometry(4.8, 40), new THREE.MeshBasicMaterial({
            color: "#fff1c2",
            alphaMap: falloffTexture("radial"),
            transparent: true,
            opacity: 0.42,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        }));
        spot.rotation.x = -PI / 2;
        spot.visible = false;
        scene.add(spot);
        const dustGeo = new THREE.BufferGeometry();
        const dustPos = new Float32Array(80 * 3);
        const dustLife = new Float32Array(80);
        const dustRandom = seeded(970);
        for (let i = 0; i < 80; i++)
            dustPos[i * 3 + 1] = -100;
        dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
        const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
            size: 0.35,
            color: "#d9d0b0",
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
        }));
        dust.frustumCulled = false;
        scene.add(dust);
        let dustCursor = 0;
        let state = createDriveState(lastMission), lastRun = props.current.runId, lastMode = props.current.mode, lastTime = performance.now(), raf = 0, dead = false, finishedReported = false, lastUi = 0, textureVersion = 0, lastWrap = "", lastPaint = "", lastGlow: string | null | undefined = undefined, currentTexture: THREE.Texture | null = null, orbit = 0, dragAngle = 0, dragX: number | null = null;
        const target = new THREE.Vector3(), look = new THREE.Vector3();
        const resetChaseCamera = () => {
            const start = state.mission.start;
            camera.position.set(start.x - Math.sin(start.heading) * 9.5, 6.6, start.z + Math.cos(start.heading) * 9.5);
            camera.lookAt(start.x + Math.sin(start.heading) * 8, 1, start.z - Math.cos(start.heading) * 8);
        };
        if (props.current.mode === "drive") resetChaseCamera();
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dragStart = (e: PointerEvent) => {
            if (props.current.mode === "drive")
                return;
            dragX = e.clientX;
            el.setPointerCapture(e.pointerId);
        };
        const dragMove = (e: PointerEvent) => {
            if (dragX === null)
                return;
            dragAngle -= (e.clientX - dragX) * 0.008;
            dragX = e.clientX;
        };
        const dragEnd = () => {
            dragX = null;
        };
        el.addEventListener("pointerdown", dragStart);
        el.addEventListener("pointermove", dragMove);
        el.addEventListener("pointerup", dragEnd);
        el.addEventListener("pointercancel", dragEnd);
        let bloomOn = el.clientWidth >= 700 && !reduced;
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.48, 0.45, 1.05);
        composer.addPass(bloom);
        composer.addPass(new OutputPass());
        // Report a complete frame, including shadow and bloom passes.
        renderer.info.autoReset = false;
        const draw = () => {
            renderer.info.reset();
            if (bloomOn) composer.render();
            else renderer.render(scene, camera);
        };
        const resize = () => {
            const w = el.clientWidth, h = el.clientHeight;
            if (!w || !h)
                return;
            bloomOn = w >= 700 && !reduced;
            renderer.setSize(w, h, false);
            composer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(el);
        resize();
        const keys = (down: boolean) => (e: KeyboardEvent) => {
            if (down && (props.current.mode !== "drive" || props.current.paused))
                return;
            const key = e.key.toLowerCase(), c = props.current.controls.current;
            const map: Record<string, keyof DriveControls> = {
                w: "gas",
                arrowup: "gas",
                s: "brake",
                arrowdown: "brake",
                a: "left",
                arrowleft: "left",
                d: "right",
                arrowright: "right",
                shift: "boost",
                " ": "drift",
            };
            if (map[key]) {
                e.preventDefault();
                c[map[key]] = down;
            }
        };
        const keyDown = keys(true), keyUp = keys(false);
        const blur = () => Object.keys(props.current.controls.current).forEach((k) => (props.current.controls.current[k as keyof DriveControls] = false));
        window.addEventListener("keydown", keyDown);
        window.addEventListener("keyup", keyUp);
        window.addEventListener("blur", blur);
        const capture = () => {
            draw();
            return renderer.domElement.toDataURL("image/png");
        };
        // A fixed "security camera" frame of the car, rendered and presented in the
        // same task so the player never sees the cut.
        const cctv = () => {
            const pos = camera.position.clone(), quat = camera.quaternion.clone(), fov = camera.fov;
            const view = camera.view ? { ...camera.view } : null;
            camera.clearViewOffset();
            const nearest = landmarks("camera").reduce((best, l) => Math.hypot(l.x - state.x, l.z - state.z) < Math.hypot(best.x - state.x, best.z - state.z) ? l : best);
            if (state.wantedReason === "camera")
                camera.position.copy(cameraPole(nearest));
            else
                camera.position.set(state.x + 7.5, 5.6, state.z - 8.5);
            camera.lookAt(state.x, 0.9, state.z);
            camera.fov = 40;
            camera.updateProjectionMatrix();
            draw();
            const url = renderer.domElement.toDataURL("image/jpeg", 0.86);
            camera.position.copy(pos);
            camera.quaternion.copy(quat);
            camera.fov = fov;
            if (view?.enabled)
                camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
            camera.updateProjectionMatrix();
            draw();
            return url;
        };
        const captureRef = props.current.captureRef, apiRef = props.current.apiRef;
        captureRef.current = capture;
        if (apiRef)
            apiRef.current = {
                respray: (changed) => {
                    const r = applyRespray(state, changed);
                    state = r.state;
                    return { cleared: r.cleared, remaining: r.remaining };
                },
                teleport: import.meta.env.DEV
                    ? (x, z, heading) => {
                        const trail = Array.from({ length: 80 }, (_, i) => {
                            const back = (79 - i) * 1.6;
                            return {
                                x: x - Math.sin(heading) * back,
                                z: z + Math.cos(heading) * back,
                                d: i * 1.6,
                            };
                        });
                        state = { ...state, x, z, heading, trail, odo: trail[trail.length - 1].d };
                        missionVisuals.ribbonTime = -1;
                    }
                    : undefined,
            };
        const tick = (now: number) => {
            if (dead)
                return;
            const dt = Math.min((now - lastTime) / 1000, 0.05);
            lastTime = now;
            const p = props.current;
            if (p.runId !== lastRun) {
                state = createDriveState(p.mission ?? FALLBACK_MISSION);
                lastRun = p.runId;
                finishedReported = false;
                dustLife.fill(0);
                missionVisuals.ribbonTime = -1;
                missionVisuals.lastCheckpoint = -1;
                resetChaseCamera();
            }
            // The mission prop is only read when a run (re)starts; everything the
            // player sees and the HUD reads follows the mission the run is actually
            // using, so a mid-run prop change can never desync gates and checkpoints.
            const mission = state.mission;
            // Rebuild only when the mission's content changes, so a parent that
            // recreates an equal Mission object each render doesn't thrash the GPU.
            if (mission !== lastMission) {
                const key = missionKey(mission);
                if (key !== lastMissionKey) {
                    scene.remove(missionVisuals.group);
                    disposeTree(missionVisuals.group);
                    missionVisuals.group.clear();
                    missionVisuals = buildMissionVisuals(mission);
                    scene.add(missionVisuals.group);
                    lastMissionKey = key;
                }
                lastMission = mission;
            }
            if (p.paused && p.mode !== "drive") {
                raf = requestAnimationFrame(tick);
                return;
            }
            if ((p.billboardUrl ?? "") !== lastBoard) {
                lastBoard = p.billboardUrl ?? "";
                const version = ++boardVersion;
                boardTex?.dispose();
                boardTex = null;
                boardMat.map = defaultBoard;
                boardMat.needsUpdate = true;
                if (lastBoard)
                    new THREE.TextureLoader().load(lastBoard, (tex) => {
                        if (dead || version !== boardVersion)
                            return tex.dispose();
                        tex.colorSpace = THREE.SRGBColorSpace;
                        boardTex = tex;
                        boardMat.map = tex;
                        boardMat.needsUpdate = true;
                    });
            }
            boards.visible = p.mode === "drive";
            if ((p.emblemUrl ?? "") !== lastEmblem) {
                lastEmblem = p.emblemUrl ?? "";
                const version = ++emblemVersion;
                emblem.visible = false;
                emblemTex?.dispose();
                emblemTex = null;
                emblemMat.map = null;
                emblemMat.needsUpdate = true;
                if (lastEmblem)
                    new THREE.TextureLoader().load(lastEmblem, (tex) => {
                        if (dead || version !== emblemVersion)
                            return tex.dispose();
                        tex.colorSpace = THREE.SRGBColorSpace;
                        emblemTex = tex;
                        emblemMat.map = tex;
                        emblemMat.needsUpdate = true;
                        emblem.visible = true;
                    });
            }
            if ((p.tattooUrl ?? "") !== lastTattoo) {
                lastTattoo = p.tattooUrl ?? "";
                const version = ++tattooVersion;
                tattooTex?.dispose();
                tattooTex = null;
                arm.material.map = null;
                arm.material.color.set("#c98d6a");
                arm.material.needsUpdate = true;
                if (lastTattoo)
                    new THREE.TextureLoader().load(lastTattoo, (tex) => {
                        if (dead || version !== tattooVersion)
                            return tex.dispose();
                        tex.colorSpace = THREE.SRGBColorSpace;
                        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
                        tattooTex = tex;
                        arm.material.map = tex;
                        arm.material.color.set("#ffffff");
                        arm.material.needsUpdate = true;
                    });
            }
            arm.group.visible = p.mode === "drive" || p.mode === "photo" || !!p.tattooUrl;
            if (p.underglow !== lastGlow) {
                lastGlow = p.underglow;
                car.setUnderglow(p.underglow ?? null);
            }
            if (p.paint !== lastPaint) {
                lastPaint = p.paint;
                car.body.color.set(p.paint);
            }
            if (p.wrapUrl !== lastWrap) {
                lastWrap = p.wrapUrl;
                const ver = ++textureVersion;
                if (!p.wrapUrl) {
                    currentTexture?.dispose();
                    currentTexture = null;
                    car.wrap.map = null;
                    car.wrap.needsUpdate = true;
                }
                else
                    new THREE.TextureLoader().load(p.wrapUrl, (tex) => {
                        if (dead || ver !== textureVersion) {
                            tex.dispose();
                            return;
                        }
                        tex.colorSpace = THREE.SRGBColorSpace;
                        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
                        currentTexture?.dispose();
                        currentTexture = tex;
                        car.wrap.map = tex;
                        car.wrap.needsUpdate = true;
                    }, undefined, () => {
                        if (!dead && ver === textureVersion)
                            props.current.onError?.("The livery texture could not load. Reopen the garage and try again.");
                    });
            }
            if (p.mode !== lastMode) {
                lastMode = p.mode;
                blur();
                if (p.mode !== "drive") {
                    car.group.position.set(START.x, 0, START.z);
                    car.group.rotation.set(0, 0, 0);
                    orbit = 0;
                }
            }
            const advancing = p.mode === "drive" && !p.paused && !state.finished;
            if (advancing) {
                state = stepDrive(state, {
                    ...p.controls.current,
                    gas: p.controls.current.gas ||
                        Boolean(p.autoThrottle && !p.controls.current.brake),
                }, dt);
                car.setBrake(Boolean(p.controls.current.brake));
                car.group.position.set(state.x, 0.025, state.z);
                car.group.rotation.y = -state.heading;
                car.group.rotation.z = THREE.MathUtils.lerp(car.group.rotation.z, (p.controls.current.left ? 1 : p.controls.current.right ? -1 : 0) *
                    Math.min(0.06, state.speed * 0.003), 0.12);
                for (const w of car.wheels)
                    w.rotation.x -= (state.speed * dt) / 0.6;
                for (const e of state.events)
                    p.onEvent?.(e, e === "wanted" ? cctv() : undefined);
                if ((p.controls.current.drift || p.controls.current.brake) &&
                    (p.controls.current.left || p.controls.current.right) &&
                    state.speed > 9) {
                    for (let i = 0; i < 2; i++) {
                        const particle = dustCursor++ % 80, n = particle * 3;
                        dustLife[particle] = 0.8;
                        dustPos[n] = state.x + (dustRandom() - 0.5) * 3;
                        dustPos[n + 1] = 0.3 + dustRandom();
                        dustPos[n + 2] = state.z + Math.cos(state.heading) * 2;
                    }
                    dustGeo.attributes.position.needsUpdate = true;
                }
            }
            const inDrive = p.mode === "drive";
            pad.visible = !inDrive;
            line.visible = !inDrive;
            for (let i = 0; i < dustLife.length; i++) {
                if (advancing)
                    dustLife[i] = Math.max(0, dustLife[i] - dt);
                if (dustLife[i] === 0)
                    dustPos[i * 3 + 1] = -100;
                else if (advancing)
                    dustPos[i * 3 + 1] += dt * 0.7;
            }
            dustGeo.attributes.position.needsUpdate = true;
            dust.visible = inDrive && dustLife.some((life) => life > 0);
            const t = now / 1000;
            const stars = starsFor(state.heat);
            missionVisuals.group.visible = inDrive;
            missionVisuals.ribbon.visible = inDrive && !state.finished;
            if (state.checkpoint !== missionVisuals.lastCheckpoint || t - missionVisuals.ribbonTime >= 0.1 || missionVisuals.ribbonTime < 0) {
                updateRibbon(missionVisuals, mission, state.checkpoint, state.x, state.z);
                missionVisuals.lastCheckpoint = state.checkpoint;
                missionVisuals.ribbonTime = t;
            }
            if (advancing)
                missionVisuals.texture.offset.x -= dt * 1.6;
            for (let i = 0; i < missionVisuals.gates.length; i++) {
                const gate = missionVisuals.gates[i], current = i === state.checkpoint;
                gate.group.visible = !state.finished && i >= state.checkpoint && i <= state.checkpoint + 2;
                gate.group.scale.setScalar(current ? 1 : 0.6);
                gate.mat.opacity = current ? 0.9 : 0.25;
                gate.curtain.visible = current;
            }
            const checkpoint = mission.checkpoints[state.checkpoint];
            missionVisuals.currentRing.visible = !!checkpoint && !state.finished;
            if (checkpoint) {
                missionVisuals.currentRing.position.set(checkpoint.x, 0.145, checkpoint.z);
                missionVisuals.currentRing.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
            }
            for (const stash of missionVisuals.stashes) {
                stash.anchor.visible = !state.collected.includes(stash.id);
                stash.bag.position.y = 1.9 + Math.sin(t * 2.5) * 0.25;
                stash.bag.rotation.y = t * 1.4;
            }
            for (const cone of cones) {
                const d = inDrive ? Math.hypot(state.x - cone.x, state.z - cone.z) : Infinity;
                cone.mat.opacity = CONE_OPACITY * THREE.MathUtils.smoothstep(d, 18, 40);
            }
            blink.color.set("#ff3030").multiplyScalar(Math.sin(t * 5) > 0 ? 4 : 0.25);
            for (const marker of markers) {
                marker.group.visible = inDrive && !state.resprayUsed && state.heat > 0;
                if (marker.group.visible) {
                    marker.beam.scale.y = 1 + Math.sin(t * 3) * 0.12;
                    marker.group.rotation.y = t * 0.4;
                }
            }
            for (let i = 0; i < cops.length; i++) {
                const cop = state.cops[i];
                const c = cops[i];
                c.group.visible = inDrive && Boolean(cop);
                if (!cop || !inDrive)
                    continue;
                const pose = copPose(state, cop);
                const side = i === 0 ? 0 : i === 1 ? 3.6 : -3.6;
                c.group.position.set(pose.x + Math.cos(pose.heading) * side, 0.02, pose.z + Math.sin(pose.heading) * side);
                c.group.rotation.y = -pose.heading;
                c.setSiren(t + i * 0.37);
                if (advancing)
                    for (const w of c.wheels)
                        w.rotation.x -= (30 * dt) / 0.6;
            }
            const heliOn = inDrive && stars >= 3 && !state.finished;
            heli.visible = searchlight.visible = spot.visible = heliOn;
            if (heliOn) {
                const hx = state.x + Math.sin(t * 0.5) * 9, hz = state.z + Math.cos(t * 0.5) * 9;
                heli.position.set(hx, 24, hz);
                heli.rotation.y = -t * 0.5 + PI / 2;
                rotor.rotation.y = t * 38;
                beacon.visible = Math.sin(t * 9) > 0;
                const sx = state.x + Math.sin(state.heading) * 2, sz = state.z - Math.cos(state.heading) * 2;
                spot.position.set(sx, 0.16, sz);
                searchlight.position.set((hx + sx) / 2, 12, (hz + sz) / 2);
                searchlight.lookAt(sx, 0, sz);
                searchlight.rotateX(-PI / 2);
            }
            trafficSystem.advance(advancing ? dt : 0);
            for (const vehicle of traffic) {
                vehicle.car.group.visible = inDrive;
                const position = vehicle.car.group.position;
                if (advancing && !state.finished && state.collisionCooldown <= 0 && Math.hypot(state.x - position.x, state.z - position.z) < 3.5) {
                    state.speed *= 0.55;
                    state.collisions++;
                    state.collisionCooldown = 1;
                    if (state.wantedTriggered && state.heat > 0)
                        state.heat = Math.min(100, state.heat + 5);
                }
            }
            civilianFleet.sync();
            policeFleet.sync();
            if (inDrive) {
                target.set(state.x - Math.sin(state.heading) * 9.5, 6.6, state.z + Math.cos(state.heading) * 9.5);
                look.set(state.x + Math.sin(state.heading) * 8, 1, state.z - Math.cos(state.heading) * 8);
                camera.fov = THREE.MathUtils.lerp(camera.fov, p.controls.current.boost && state.speed > 25 ? 60 : 53, 0.04);
                camera.clearViewOffset();
                sun.position.set(state.x - 45, 75, state.z - 20);
                sun.target.position.set(state.x, 0, state.z);
            }
            else {
                if (!p.paused && !reduced)
                    orbit += dt * 0.065;
                const a = 2.06 + Math.sin(orbit) * 0.15 + dragAngle;
                const distance = el.clientWidth < 700 ? 22 : 12.7;
                target.set(START.x + Math.sin(a) * distance, el.clientWidth < 700 ? 7.5 : 5.2, START.z + Math.cos(a) * distance);
                look.set(START.x, 1.0, START.z);
                camera.fov = 47;
                sun.position.set(START.x - 45, 75, START.z - 20);
                sun.target.position.set(START.x, 0, START.z);
                if (el.clientWidth < 700)
                    camera.setViewOffset(el.clientWidth, el.clientHeight, 0, el.clientHeight * 0.13, el.clientWidth, el.clientHeight);
                else {
                    camera.clearViewOffset();
                    if (p.mode === "photo")
                        look.x = -1.5;
                }
            }
            camera.position.lerp(target, 1 - Math.exp(-dt * (inDrive ? 5 : 2)));
            camera.lookAt(look);
            camera.updateProjectionMatrix();
            // Keep the sky beyond the fog horizon wherever the mission takes us.
            sky.position.copy(camera.position);
            starsSky.position.copy(camera.position);
            sunDisc.position.set(camera.position.x - BLOCK * 2.1, 22, camera.position.z + BLOCK * 0.4);
            missionVisuals.destinationSign.quaternion.copy(camera.quaternion);
            draw();
            if (inDrive && now - lastUi > 95) {
                lastUi = now;
                const cp = mission.checkpoints[state.checkpoint];
                const dist = cp
                    ? Math.round(Math.hypot(state.x - cp.x, state.z - cp.z))
                    : 0;
                p.onTelemetry({
                    speed: state.speed * 3.6,
                    remaining: Math.max(0, state.limit - state.elapsed),
                    checkpoint: state.checkpoint,
                    totalCheckpoints: mission.checkpoints.length,
                    drift: state.drift,
                    boost: state.boost,
                    heat: state.heat,
                    stars,
                    bust: state.bust,
                    cops: state.cops.length,
                    payout: livePayout(state),
                    respray: state.resprayUsed,
                    message: cp ? `${cp.name.toUpperCase()} · ${dist} M` : "BACK WHERE YOU BELONG",
                    x: state.x,
                    z: state.z,
                    heading: state.heading,
                    turn: nextTurn(mission, state.checkpoint, state.x, state.z, state.heading),
                    collected: [...state.collected],
                    stashes: state.collected.length,
                    stashTotal: mission.stashes.length,
                    limit: state.limit,
                });
            }
            if (inDrive && state.finished && !finishedReported) {
                finishedReported = true;
                p.onFinish({
                    won: state.won,
                    time: state.elapsed,
                    drift: state.drift,
                    collisions: state.collisions,
                    score: runScore(state),
                    snapshot: capture(),
                    busted: state.busted,
                    stars: starsFor(state.heat),
                    resprayed: state.resprayUsed,
                });
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        props.current.onReady?.();
        return () => {
            dead = true;
            cancelAnimationFrame(raf);
            observer.disconnect();
            el.removeEventListener("pointerdown", dragStart);
            el.removeEventListener("pointermove", dragMove);
            el.removeEventListener("pointerup", dragEnd);
            el.removeEventListener("pointercancel", dragEnd);
            window.removeEventListener("keydown", keyDown);
            window.removeEventListener("keyup", keyUp);
            window.removeEventListener("blur", blur);
            captureRef.current = null;
            if (apiRef)
                apiRef.current = null;
            if (import.meta.env.DEV)
                delete (window as RenderDebugWindow).__sdRender;
            disposeTree(scene);
            civilianFleet.dispose();
            policeFleet.dispose();
            car.wrap.dispose();
            currentTexture?.dispose();
            emblemTex?.dispose();
            boardTex?.dispose();
            defaultBoard.dispose();
            tattooTex?.dispose();
            for (const pass of composer.passes)
                pass.dispose();
            composer.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, []);
    return (<div ref={host} style={{
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "hidden",
            touchAction: "pan-y",
        }} aria-label="Interactive 3D coastal car scene"/>);
}
