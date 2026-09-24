import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  CHECKPOINTS,
  RESPRAY,
  RUN_SECONDS,
  applyRespray,
  livePayout,
  copPose,
  createDriveState,
  runScore,
  starsFor,
  stepDrive,
  type DriveControls,
  type DriveEvent,
} from "./driving";
import { makeCar } from "./car";
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
  respray: (changed: number) => { cleared: number; remaining: number };
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
};
const PI = Math.PI;
const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string | number, roughness = 0.8, metalness = 0.05) {
  const key = `${color}/${roughness}/${metalness}`;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness, metalness }),
    );
  return materials.get(key)!;
}
function cube(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function quad(parent: THREE.Object3D, pts: number[], mat: THREE.Material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function textTexture(
  text: string,
  bg = "#183d38",
  fg = "#f0dfb5",
  width = 512,
  height = 128,
) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fg;
  ctx.font = `800 ${height * 0.43}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2, width * 0.9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function sign(
  parent: THREE.Object3D,
  text: string,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  rotation = 0,
  bg = "#1b1030",
  fg = "#ff7ac8",
) {
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
function palm(parent: THREE.Object3D, x: number, z: number, size = 1) {
  const g = new THREE.Group();
  parent.add(g);
  g.position.set(x, 0, z);
  g.scale.setScalar(size);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.3, 7, 7),
    material("#907552"),
  );
  trunk.position.y = 3.5;
  trunk.rotation.z = 0.09;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 9; i++) {
    const a = (i * PI * 2) / 9;
    const pts = [];
    const segments = 5;
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      const r = t * 3.6;
      const y = 7.15 + Math.sin(t * PI) * 0.85 - t * t * 0.8;
      const width = Math.sin(t * PI) * 0.6;
      pts.push(
        Math.cos(a) * r + Math.sin(a) * width,
        y,
        Math.sin(a) * r - Math.cos(a) * width,
        Math.cos(a) * r - Math.sin(a) * width,
        y,
        Math.sin(a) * r + Math.cos(a) * width,
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const indices = [];
    for (let j = 0; j < segments; j++) {
      const n = j * 2;
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const leaf = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: i % 2 ? "#39725c" : "#53816b",
        side: THREE.DoubleSide,
        roughness: 1,
      }),
    );
    leaf.castShadow = true;
    g.add(leaf);
  }
}
const windowMats: THREE.MeshStandardMaterial[] = [];
function windowMat(n: number) {
  if (!windowMats.length)
    ["#ffcf85", "#2d2f4f", "#ff8fc8", "#2d2f4f", "#8ff0ff"].forEach((c, i) =>
      windowMats.push(
        new THREE.MeshStandardMaterial({
          color: i % 2 ? c : "#3a3350",
          emissive: i % 2 ? "#000000" : c,
          emissiveIntensity: i % 2 ? 0 : 1.35,
          roughness: 0.25,
          metalness: 0.3,
        }),
      ),
    );
  return windowMats[Math.abs(Math.round(n)) % 5];
}
function building(
  parent: THREE.Object3D,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  color: string,
  name?: string,
) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  const wall = material(color),
    trim = material("#e0c7a0");
  cube(g, w, h, d, 0, h / 2, 0, wall);
  cube(g, w + 0.45, 0.35, d + 0.45, 0, h, 0, trim);
  cube(g, w + 0.5, 0.15, d + 0.5, 0, 1.2, 0, trim);
  cube(g, w * 0.8, 0.55, d * 0.8, 0, h + 0.4, 0, material("#b7a887"));
  for (let floor = 0; floor < Math.min(5, Math.floor((h - 1) / 2.7)); floor++) {
    const y = 2.6 + floor * 2.6;
    for (let i = 0; i < Math.floor(w / 3); i++) {
      const xx = -w / 2 + 1.8 + i * 3;
      cube(
        g,
        1.15,
        1.38,
        0.08,
        xx,
        y,
        d / 2 + 0.045,
        windowMat(x * 7 + z * 3 + floor * 5 + i * 11),
      );
      cube(g, 1.27, 0.08, 0.2, xx, y - 0.7, d / 2 + 0.06, trim);
    }
    for (let i = 0; i < Math.floor(d / 3); i++) {
      const zz = -d / 2 + 1.8 + i * 3;
      cube(
        g,
        0.08,
        1.38,
        1.15,
        -w / 2 - 0.045,
        y,
        zz,
        windowMat(x * 3 + z + floor * 7 + i * 5),
      );
      cube(g, 0.22, 0.08, 1.3, -w / 2 - 0.06, y - 0.7, zz, trim);
    }
  }
  if (name) {
    sign(g, name, w * 0.88, 1.1, 0, 3.2, d / 2 + 0.12);
    cube(g, w + 0.1, 0.16, 2.2, 0, 2.25, d / 2 + 0.7, material("#e68c6d"));
    for (let i = 0; i < 6; i++)
      cube(
        g,
        (w + 0.1) / 12,
        0.18,
        2.2,
        -w / 2 + ((i * 2 + 0.5) * w) / 12,
        2.28,
        d / 2 + 0.7,
        trim,
      );
  }
}
function buildCity(scene: THREE.Scene) {
  const city = new THREE.Group();
  scene.add(city);
  const sand = material("#c79c86");
  cube(city, 700, 0.2, 700, 70, -0.37, -30, sand);
  const asphalt = material("#353544", 0.92);
  const curb = material("#cebea0");
  const concrete = material("#afa58c");
  for (const x of [0, 140]) {
    cube(city, 32, 0.2, 182, x, -0.08, -25, concrete);
    cube(city, 26, 0.12, 176, x, 0.02, -25, asphalt);
    for (const edge of [-13.3, 13.3])
      cube(city, 0.55, 0.19, 177, x + edge, 0.13, -25, curb);
    for (let z = -90; z < 45; z += 9)
      cube(city, 0.14, 0.012, 4.4, x, 0.09, z, material("#eacb83"));
  }
  for (const z of [-100, 50]) {
    cube(city, 166, 0.2, 32, 70, -0.08, z, concrete);
    cube(city, 166, 0.12, 26, 70, 0.025, z, asphalt);
    for (const edge of [-13.3, 13.3])
      cube(city, 167, 0.19, 0.55, 70, 0.13, z + edge, curb);
    for (let x = 15; x < 137; x += 9)
      cube(city, 4.4, 0.012, 0.14, x, 0.1, z, material("#eacb83"));
  }
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 700, 1, 1),
    new THREE.MeshStandardMaterial({
      color: "#4e6f9a",
      roughness: 0.18,
      metalness: 0.45,
    }),
  );
  water.rotation.x = -PI / 2;
  water.position.set(-295, -0.24, -50);
  city.add(water);
  for (let i = 0; i < 38; i++)
    cube(
      city,
      12 + (i % 5) * 4,
      0.01,
      0.2,
      -48 - ((i * 37) % 195),
      -0.22,
      -210 + i * 13,
      material("#93b4a5", 0.4),
    );
  // Marina promenade, mooring posts, tiny boats and a distant coastal skyline.
  cube(city, 7, 0.45, 230, -20, 0.05, -20, material("#b9a88b"));
  for (let i = 0; i < 28; i++) {
    cube(city, 0.12, 1, 0.12, -23, 0.8, 92 - i * 8, material("#465856"));
    if (i < 27)
      cube(city, 0.09, 0.1, 8, -23, 1.12, 88 - i * 8, material("#465856"));
  }
  for (let i = 0; i < 6; i++) {
    cube(city, 22, 0.24, 2.7, -36, 0.06, 20 - i * 24, material("#998a70"));
    const boat = new THREE.Mesh(
      new THREE.CapsuleGeometry(1.4, 5, 3, 6),
      material(i % 2 ? "#e5d5af" : "#e68a69"),
    );
    boat.rotation.x = PI / 2;
    boat.position.set(-39, -0.1, 15 - i * 24);
    city.add(boat);
    cube(city, 1.8, 0.8, 2.9, -39, 0.55, 15 - i * 24, material("#f6e5c2"));
    cube(city, 0.06, 7, 0.06, -39, 3.8, 15 - i * 24, material("#c4c5af"));
  }
  const palette = ["#eaa3b8", "#8fd3c2", "#f3b690", "#b7a1dc", "#f0dcb4"];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const x = 31 + col * 26,
        z = -71 + row * 38;
      building(
        city,
        x,
        z,
        15 + (col % 2) * 3,
        20,
        6 + ((row * 7 + col * 3) % 4) * 3.1,
        palette[(row + col) % 5],
        row === 2
          ? ["PALM MOTEL", "NO REFUNDS", "BAY RECORDS", "NICE TRY"][col]
          : undefined,
      );
    }
  for (let i = 0; i < 8; i++)
    building(
      city,
      175 + (i % 2) * 21,
      -90 + i * 22,
      13,
      14,
      8 + (i % 3) * 8,
      palette[i % 5],
      i === 5 ? "LATE CHECKOUT" : undefined,
    );
  for (let i = 0; i < 8; i++)
    building(
      city,
      22 + i * 23,
      -135,
      14,
      12,
      12 + ((i * 3) % 21),
      palette[(i + 1) % 5],
    );
  for (let i = 0; i < 10; i++) {
    palm(city, -17, 50 - i * 17, 1 + (i % 3) * 0.15);
    palm(city, 157, 48 - i * 17, 0.9 + (i % 2) * 0.2);
  }
  for (let i = 0; i < 8; i++) {
    palm(city, 17 + i * 17, -117, 1.1);
    palm(city, 20 + i * 17, 68, 1.2);
  }
  // The shop: a sun-worn service bay, canopy and custom circular display pad.
  building(city, 30, 81, 24, 16, 5.5, "#7b9b8d");
  sign(
    city,
    "SUNDOWN CUSTOMS",
    20,
    1.7,
    30,
    5.3,
    72.85,
    PI,
    "#143b34",
    "#f0d9a2",
  );
  cube(city, 25, 0.3, 7, 30, 4.4, 69, material("#e8b574"));
  for (const x of [19, 41])
    cube(city, 0.18, 4.1, 0.18, x, 2.1, 67, material("#d0b799"));
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 0.12, 64),
    material("#bdb199"),
  );
  pad.position.set(0, 0.13, 40);
  city.add(pad);
  const line = new THREE.Mesh(
    new THREE.TorusGeometry(6.7, 0.035, 4, 80),
    material("#f7d5a0"),
  );
  line.rotation.x = PI / 2;
  line.position.set(0, 0.205, 40);
  city.add(line);
  for (let i = 0; i < 12; i++) {
    const x = i % 2 === 0 ? -15.3 : 155.3,
      z = 40 - Math.floor(i / 2) * 27;
    cube(city, 0.13, 6, 0.13, x, 3, z, material("#3f5650"));
    const arm = cube(
      city,
      2.5,
      0.13,
      0.13,
      x + (i % 2 === 0 ? 1 : -1),
      6,
      z,
      material("#3f5650"),
    );
    void arm;
    cube(
      city,
      1,
      0.08,
      0.45,
      x + (i % 2 === 0 ? 2 : -2),
      5.9,
      z,
      new THREE.MeshStandardMaterial({
        color: "#ffeab4",
        emissive: "#ffbe6b",
        emissiveIntensity: 0.7,
      }),
    );
  }
  // Branded trackside panels and road chevrons make the corners readable at speed.
  const corners = [
    { x: 0, z: -98, a: 0 },
    { x: 138, z: -100, a: -PI / 2 },
    { x: 140, z: 48, a: PI },
    { x: 2, z: 50, a: PI / 2 },
  ];
  for (const c of corners) {
    const p = new THREE.Group();
    p.position.set(c.x, 0, c.z);
    p.rotation.y = c.a;
    city.add(p);
    sign(p, "› › ›", 9, 2, 0, 2.7, -12, 0, "#16443c", "#ffbf72");
    cube(p, 0.15, 2, 0.15, -3, 1, -12, material("#5e6554"));
    cube(p, 0.15, 2, 0.15, 3, 1, -12, material("#5e6554"));
  }
  // Spray & Pray: the roadside respray booth that shakes off the heat.
  const booth = new THREE.Group();
  booth.position.set(RESPRAY.x + 24, 0, RESPRAY.z);
  city.add(booth);
  const boothWall = material("#2b2436", 0.9);
  cube(booth, 10, 7, 18, 0, 3.5, 0, boothWall);
  cube(booth, 0.3, 5.2, 12, -5.1, 2.6, 0, material("#0c0a12", 1));
  cube(booth, 11.5, 0.5, 19.5, 0, 7.2, 0, material("#ff3d9a", 0.4));
  const neon = sign(booth, "SPRAY & PRAY", 16, 2.6, -5.3, 9.6, 0, -PI / 2, "#1a0f24", "#ff5fb8");
  void neon;
  sign(booth, "NEW PAINT · NO QUESTIONS", 12, 1.2, -5.25, 6.1, 0, -PI / 2, "#1a0f24", "#6ff3ff");
  const markerMat = new THREE.MeshBasicMaterial({
    color: "#ff4fb0",
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const marker = new THREE.Group();
  marker.position.set(RESPRAY.x, 0, RESPRAY.z);
  city.add(marker);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(RESPRAY.radius * 0.72, RESPRAY.radius * 0.72, 5, 40, 1, true),
    markerMat,
  );
  beam.position.y = 2.5;
  marker.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(RESPRAY.radius * 0.62, RESPRAY.radius * 0.74, 48),
    new THREE.MeshBasicMaterial({ color: "#ff79c6", transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -PI / 2;
  ring.position.y = 0.12;
  marker.add(ring);
  const floorSign = sign(marker, "RESPRAY", 9, 2.2, 0, 0.14, 0, 0, "#2a0f2a", "#ff9ad5");
  floorSign.rotation.set(-PI / 2, 0, PI);
  return { city, water, pad, line, marker, beam };
}
export function World(all: WorldProps) {
  const host = useRef<HTMLDivElement>(null),
    props = useRef(all);
  props.current = all;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
    } catch {
      props.current.onError?.(
        "Enable hardware acceleration or try another browser to drive the 3D coast.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setClearColor("#f59a7a");
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#e59486", 90, 330);
    const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 1000);
    camera.position.set(11, 6, 51);
    scene.add(new THREE.HemisphereLight("#ffc9a8", "#4b3f78", 2.2));
    const sun = new THREE.DirectionalLight("#ffb482", 3.0);
    sun.position.set(-45, 75, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -65;
    sun.shadow.camera.right = 65;
    sun.shadow.camera.top = 65;
    sun.shadow.camera.bottom = -65;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0001;
    scene.add(sun);
    scene.add(sun.target);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(700, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color("#3d2c6b") },
          bottom: { value: new THREE.Color("#ff9a6e") },
        },
        vertexShader:
          "varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){float t=clamp(normalize(vP).y*1.5,0.,1.);gl_FragColor=vec4(mix(bottom,top,pow(t,.6)),1.);}",
      }),
    );
    scene.add(sky);
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(23, 32, 24),
      new THREE.MeshBasicMaterial({ color: "#ffd08a", fog: false }),
    );
    sunDisc.position.set(-290, 48, -240);
    scene.add(sunDisc);
    const { city, pad, line, marker, beam } = buildCity(scene);
    void city;
    const car = makeCar(props.current.paint, "hero");
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
    let lastEmblem = "",
      emblemTex: THREE.Texture | null = null;
    scene.add(car.group);
    car.group.position.set(0, 0, 40);
    const gates = CHECKPOINTS.map((cp, i) => {
      const g = new THREE.Group();
      g.position.set(cp.x, 0, cp.z);
      if (i % 2) g.rotation.y = PI / 2;
      scene.add(g);
      const m = new THREE.MeshBasicMaterial({
        color: "#ffd476",
        transparent: true,
        opacity: 0.8,
      });
      cube(g, 0.18, 6, 0.18, -10, 3, 0, m);
      cube(g, 0.18, 6, 0.18, 10, 3, 0, m);
      cube(g, 20, 0.18, 0.18, 0, 6, 0, m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.05, 5, 40), m);
      ring.position.set(0, 3.1, 0);
      g.add(ring);
      sign(
        g,
        String(i + 1).padStart(2, "0"),
        2.2,
        1.2,
        0,
        3.1,
        0.1,
        0,
        "#23544a",
        "#ffdb8a",
      );
      return g;
    });
    // Moving civilian cars on the far lane create a living coastal circuit.
    const traffic = Array.from({ length: 6 }, (_, i) => {
      const c = makeCar(
        ["#f1ca8c", "#6faca6", "#a16e71", "#d9cbb4", "#6d8795", "#be946b"][i],
        "civilian",
      );
      scene.add(c.group);
      return c;
    });
    const cops = Array.from({ length: 3 }, () => {
      const c = makeCar("#10161c", "police");
      c.group.visible = false;
      scene.add(c.group);
      return c;
    });
    // Police helicopter: a searchlight that follows the car at three stars.
    const heli = new THREE.Group();
    const heliBody = material("#141a22", 0.5, 0.3);
    const cabin = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.4, 4, 10), heliBody);
    cabin.rotation.x = PI / 2;
    heli.add(cabin);
    cube(heli, 0.35, 0.35, 4.6, 0, 0.2, 3.4, heliBody);
    cube(heli, 0.1, 1.2, 0.8, 0, 0.7, 5.6, heliBody);
    const rotor = cube(heli, 9, 0.06, 0.32, 0, 1.35, 0, material("#0a0d12", 0.6));
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color: "#ff3030" }),
    );
    beacon.position.set(0, -0.9, -0.6);
    heli.add(beacon);
    heli.visible = false;
    scene.add(heli);
    const searchlight = new THREE.Mesh(
      new THREE.ConeGeometry(4.2, 24, 28, 1, true),
      new THREE.MeshBasicMaterial({
        color: "#fff4d0",
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    searchlight.visible = false;
    scene.add(searchlight);
    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(4.3, 32),
      new THREE.MeshBasicMaterial({
        color: "#fff1c2",
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    spot.rotation.x = -PI / 2;
    spot.visible = false;
    scene.add(spot);
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(80 * 3);
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        size: 0.35,
        color: "#d9d0b0",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    scene.add(dust);
    let dustCursor = 0;
    let state = createDriveState(),
      lastRun = props.current.runId,
      lastMode = props.current.mode,
      lastTime = performance.now(),
      raf = 0,
      dead = false,
      finishedReported = false,
      lastUi = 0,
      textureVersion = 0,
      lastWrap = "",
      lastPaint = "",
      lastGlow: string | null | undefined = undefined,
      currentTexture: THREE.Texture | null = null,
      orbit = 0,
      dragAngle = 0,
      dragX: number | null = null;
    const target = new THREE.Vector3(),
      look = new THREE.Vector3();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dragStart = (e: PointerEvent) => {
      if (props.current.mode === "drive") return;
      dragX = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const dragMove = (e: PointerEvent) => {
      if (dragX === null) return;
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
    const bloomOn = el.clientWidth >= 700 && !reduced;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.96);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const draw = () =>
      bloomOn ? composer.render() : renderer.render(scene, camera);
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const keys = (down: boolean) => (e: KeyboardEvent) => {
      if (props.current.mode !== "drive" || props.current.paused) return;
      const key = e.key.toLowerCase(),
        c = props.current.controls.current;
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
    const keyDown = keys(true),
      keyUp = keys(false);
    const blur = () =>
      Object.keys(props.current.controls.current).forEach(
        (k) =>
          (props.current.controls.current[k as keyof DriveControls] = false),
      );
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
      const pos = camera.position.clone(),
        quat = camera.quaternion.clone(),
        fov = camera.fov;
      camera.clearViewOffset();
      camera.position.set(state.x + 7.5, 5.6, state.z - 8.5);
      camera.lookAt(state.x, 0.9, state.z);
      camera.fov = 40;
      camera.updateProjectionMatrix();
      draw();
      const url = renderer.domElement.toDataURL("image/jpeg", 0.86);
      camera.position.copy(pos);
      camera.quaternion.copy(quat);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      draw();
      return url;
    };
    props.current.captureRef.current = capture;
    if (props.current.apiRef)
      props.current.apiRef.current = {
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
              state = { ...state, x, z, heading, trail };
            }
          : undefined,
      };
    const tick = (now: number) => {
      if (dead) return;
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const p = props.current;
      if (p.paused && p.mode !== "drive") {
        raf = requestAnimationFrame(tick);
        return;
      }
      if ((p.emblemUrl ?? "") !== lastEmblem) {
        lastEmblem = p.emblemUrl ?? "";
        if (!lastEmblem) emblem.visible = false;
        else
          new THREE.TextureLoader().load(lastEmblem, (tex) => {
            if (dead) return tex.dispose();
            tex.colorSpace = THREE.SRGBColorSpace;
            emblemTex?.dispose();
            emblemTex = tex;
            emblemMat.map = tex;
            emblemMat.needsUpdate = true;
            emblem.visible = true;
          });
      }
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
        new THREE.TextureLoader().load(
          p.wrapUrl,
          (tex) => {
            if (dead || ver !== textureVersion) {
              tex.dispose();
              return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = Math.min(
              8,
              renderer.capabilities.getMaxAnisotropy(),
            );
            currentTexture?.dispose();
            currentTexture = tex;
            car.wrap.map = tex;
            car.wrap.needsUpdate = true;
          },
          undefined,
          () =>
            p.onError?.(
              "The livery texture could not load. Reopen the garage and try again.",
            ),
        );
      }
      if (p.runId !== lastRun) {
        state = createDriveState();
        lastRun = p.runId;
        finishedReported = false;
        camera.position.set(0, 6, 52);
      }
      if (p.mode !== lastMode) {
        lastMode = p.mode;
        blur();
        if (p.mode !== "drive") {
          car.group.position.set(0, 0, 40);
          car.group.rotation.set(0, 0, 0);
          orbit = 0;
        }
      }
      if (p.mode === "drive" && !p.paused && !state.finished) {
        state = stepDrive(
          state,
          {
            ...p.controls.current,
            gas:
              p.controls.current.gas ||
              Boolean(p.autoThrottle && !p.controls.current.brake),
          },
          dt,
        );
        car.setBrake(Boolean(p.controls.current.brake));
        car.group.position.set(state.x, 0.025, state.z);
        car.group.rotation.y = -state.heading;
        car.group.rotation.z = THREE.MathUtils.lerp(
          car.group.rotation.z,
          (p.controls.current.left ? 1 : p.controls.current.right ? -1 : 0) *
            Math.min(0.06, state.speed * 0.003),
          0.12,
        );
        for (const w of car.wheels) w.rotation.x -= (state.speed * dt) / 0.6;
        for (const e of state.events)
          p.onEvent?.(e, e === "wanted" ? cctv() : undefined);
        if (
          (p.controls.current.drift || p.controls.current.brake) &&
          (p.controls.current.left || p.controls.current.right) &&
          state.speed > 9
        ) {
          for (let i = 0; i < 2; i++) {
            const n = (dustCursor++ % 80) * 3;
            dustPos[n] = state.x + (Math.random() - 0.5) * 3;
            dustPos[n + 1] = 0.3 + Math.random();
            dustPos[n + 2] = state.z + Math.cos(state.heading) * 2;
          }
          dustGeo.attributes.position.needsUpdate = true;
        }
      }
      const inDrive = p.mode === "drive";
      pad.visible = !inDrive;
      line.visible = !inDrive;
      dust.visible = inDrive;
      for (let i = 0; i < gates.length; i++) {
        gates[i].visible = inDrive && i >= state.checkpoint;
        gates[i].scale.setScalar(i === state.checkpoint ? 1 : 0.6);
      }
      const t = now / 1000;
      const stars = starsFor(state.heat);
      marker.visible = inDrive && !state.resprayUsed && state.heat > 0;
      if (marker.visible) {
        beam.scale.y = 1 + Math.sin(t * 3) * 0.12;
        marker.rotation.y = t * 0.4;
      }
      for (let i = 0; i < cops.length; i++) {
        const cop = state.cops[i];
        const c = cops[i];
        c.group.visible = inDrive && Boolean(cop);
        if (!cop || !inDrive) continue;
        const pose = copPose(state, cop);
        const side = i === 0 ? 0 : i === 1 ? 3.6 : -3.6;
        c.group.position.set(
          pose.x + Math.cos(pose.heading) * side,
          0.02,
          pose.z + Math.sin(pose.heading) * side,
        );
        c.group.rotation.y = -pose.heading;
        c.setSiren(t + i * 0.37);
        for (const w of c.wheels) w.rotation.x -= (30 * dt) / 0.6;
      }
      const heliOn = inDrive && stars >= 3 && !state.finished;
      heli.visible = searchlight.visible = spot.visible = heliOn;
      if (heliOn) {
        const hx = state.x + Math.sin(t * 0.5) * 9,
          hz = state.z + Math.cos(t * 0.5) * 9;
        heli.position.set(hx, 24, hz);
        heli.rotation.y = -t * 0.5 + PI / 2;
        rotor.rotation.y = t * 38;
        beacon.visible = Math.sin(t * 9) > 0;
        const sx = state.x + Math.sin(state.heading) * 2,
          sz = state.z - Math.cos(state.heading) * 2;
        spot.position.set(sx, 0.16, sz);
        searchlight.position.set((hx + sx) / 2, 12, (hz + sz) / 2);
        searchlight.lookAt(sx, 0, sz);
        searchlight.rotateX(-PI / 2);
      }
      for (let i = 0; i < traffic.length; i++) {
        let d = (state.elapsed * 4 + i * 97) % 580;
        let x, z, h;
        if (d < 150) {
          x = -5;
          z = 50 - d;
          h = 0;
        } else if (d < 290) {
          x = d - 150;
          z = -105;
          h = PI / 2;
        } else if (d < 440) {
          x = 145;
          z = -100 + d - 290;
          h = PI;
        } else {
          x = 140 - (d - 440);
          z = 55;
          h = -PI / 2;
        }
        traffic[i].group.position.set(x, 0, z);
        traffic[i].group.rotation.y = -h;
        traffic[i].group.visible = inDrive;
        if (
          inDrive &&
          !p.paused &&
          !state.finished &&
          state.collisionCooldown <= 0 &&
          Math.hypot(state.x - x, state.z - z) < 3.5
        ) {
          state.speed *= 0.55;
          state.collisions++;
          state.collisionCooldown = 1;
          if (state.wantedTriggered && state.heat > 0)
            state.heat = Math.min(100, state.heat + 5);
        }
      }
      if (inDrive) {
        target.set(
          state.x - Math.sin(state.heading) * 9.5,
          6.6,
          state.z + Math.cos(state.heading) * 9.5,
        );
        look.set(
          state.x + Math.sin(state.heading) * 8,
          1,
          state.z - Math.cos(state.heading) * 8,
        );
        camera.fov = THREE.MathUtils.lerp(
          camera.fov,
          p.controls.current.boost && state.speed > 25 ? 60 : 53,
          0.04,
        );
        camera.clearViewOffset();
        sun.position.set(state.x - 45, 75, state.z - 20);
        sun.target.position.set(state.x, 0, state.z);
      } else {
        if (!p.paused && !reduced) orbit += dt * 0.065;
        const a = 2.06 + Math.sin(orbit) * 0.15 + dragAngle;
        const distance = el.clientWidth < 700 ? 22 : 12.7;
        target.set(
          Math.sin(a) * distance,
          el.clientWidth < 700 ? 7.5 : 5.2,
          40 + Math.cos(a) * distance,
        );
        look.set(0, 1.0, 40);
        camera.fov = 47;
        sun.position.set(-45, 75, 20);
        sun.target.position.set(0, 0, 40);
        if (el.clientWidth < 700)
          camera.setViewOffset(
            el.clientWidth,
            el.clientHeight,
            0,
            el.clientHeight * 0.13,
            el.clientWidth,
            el.clientHeight,
          );
        else {
          camera.clearViewOffset();
          if (p.mode === "photo") look.x = -1.5;
        }
      }
      camera.position.lerp(target, 1 - Math.exp(-dt * (inDrive ? 5 : 2)));
      camera.lookAt(look);
      camera.updateProjectionMatrix();
      draw();
      if (inDrive && now - lastUi > 95) {
        lastUi = now;
        const cp = CHECKPOINTS[state.checkpoint];
        const dist = cp
          ? Math.round(Math.hypot(state.x - cp.x, state.z - cp.z))
          : 0;
        p.onTelemetry({
          speed: state.speed * 3.6,
          remaining: Math.max(0, RUN_SECONDS - state.elapsed),
          checkpoint: state.checkpoint,
          totalCheckpoints: 4,
          drift: state.drift,
          boost: state.boost,
          heat: state.heat,
          stars,
          bust: state.bust,
          cops: state.cops.length,
          payout: livePayout(state),
          respray: state.resprayUsed,
          message: cp ? `${cp.name} · ${dist} M` : "BACK WHERE YOU BELONG",
          x: state.x,
          z: state.z,
          heading: state.heading,
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
      props.current.captureRef.current = null;
      const geometries = new Set<THREE.BufferGeometry>(),
        mats = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) geometries.add(m.geometry);
        if (m.material)
          (Array.isArray(m.material) ? m.material : [m.material]).forEach(
            (mat) => {
              mats.add(mat);
              Object.values(mat).forEach((v) => {
                if (v instanceof THREE.Texture) textures.add(v);
              });
            },
          );
      });
      textures.forEach((t) => t.dispose());
      geometries.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      materials.clear();
      windowMats.length = 0;
      currentTexture?.dispose();
      emblemTex?.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      ref={host}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        touchAction: "pan-y",
      }}
      aria-label="Interactive 3D coastal car scene"
    />
  );
}
