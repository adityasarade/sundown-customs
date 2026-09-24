import * as THREE from "three";

export type CarVariant = "hero" | "civilian" | "police";
export type CarModel = {
  group: THREE.Group;
  body: THREE.MeshStandardMaterial;
  wrap: THREE.MeshStandardMaterial;
  wheels: THREE.Group[];
  setUnderglow: (hex: string | null) => void;
  setSiren: (t: number) => void;
  setBrake: (on: boolean) => void;
};

type Point3 = readonly [number, number, number];

function finishMesh<T extends THREE.BufferGeometry>(
  geometry: T,
  material: THREE.Material | THREE.Material[],
): THREE.Mesh<T> {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(
  parent: THREE.Object3D,
  size: Point3,
  position: Point3,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = finishMesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function quad(
  points: readonly [Point3, Point3, Point3, Point3],
  material: THREE.Material,
  uvs: readonly [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ],
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flat(), 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs.flat(), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return finishMesh(geometry, material);
}

function profileGeometry(width: number): THREE.ExtrudeGeometry {
  // Shape X is -world Z; extrusion Z becomes world X after rotation.
  const shape = new THREE.Shape();
  shape.moveTo(2.82, 0.43);
  shape.lineTo(2.77, 0.82);
  shape.lineTo(2.6, 0.97);
  shape.lineTo(1.55, 1.08);
  shape.lineTo(0.62, 1.16);
  shape.lineTo(-0.4, 1.14);
  shape.lineTo(-1.48, 1.03);
  shape.lineTo(-2.58, 0.91);
  shape.lineTo(-2.82, 0.7);
  shape.lineTo(-2.8, 0.4);
  shape.lineTo(-2.46, 0.28);
  shape.lineTo(2.43, 0.28);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.07,
    bevelThickness: 0.07,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function policeDoorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f2f1e9";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#17232c";
    ctx.fillRect(0, 0, canvas.width, 55);
    ctx.fillRect(0, 545, canvas.width, 55);
    ctx.strokeStyle = "#bda765";
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(215, 300, 116, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#17232c";
    ctx.font = "900 250px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BAY PD", 735, 304);
    ctx.font = "700 64px sans-serif";
    ctx.fillText("87", 215, 303);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function makeCar(
  color: string,
  variant: CarVariant = "hero",
): CarModel {
  const group = new THREE.Group();
  group.name = `Solstice '87 (${variant})`;

  const body = new THREE.MeshStandardMaterial({
    color: variant === "police" ? "#10161c" : color,
    roughness: 0.27,
    metalness: 0.52,
  });
  const wrap = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    side: THREE.DoubleSide,
    roughness: 0.35,
    metalness: 0.15,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#11171b",
    roughness: 0.62,
    metalness: 0.25,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: "#090b0c",
    roughness: 0.94,
    metalness: 0.04,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: "#dce3e2",
    roughness: 0.16,
    metalness: 0.92,
  });
  const rim = new THREE.MeshStandardMaterial({
    color: "#9da6a7",
    roughness: 0.25,
    metalness: 0.86,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: "#18343d",
    roughness: 0.18,
    metalness: 0.05,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
  });

  const shell = finishMesh(profileGeometry(2.72), body);
  shell.name = "beveled wedge body";
  group.add(shell);

  // Low undertray, crisp rocker panels, and a chin spoiler keep the silhouette lean.
  box(group, [2.82, 0.13, 4.88], [0, 0.32, 0.04], dark);
  box(group, [3.02, 0.12, 3.03], [0, 0.38, 0.02], body);
  box(group, [2.9, 0.11, 0.28], [0, 0.43, -2.78], dark);
  box(group, [2.98, 0.08, 0.18], [0, 0.36, -2.88], chrome);
  for (const side of [-1, 1]) {
    const skirt = box(
      group,
      [0.13, 0.2, 3.42],
      [side * 1.44, 0.43, 0.03],
      body,
    );
    skirt.rotation.z = side * 0.035;
  }

  // The greenhouse tapers toward the roof in both plan and elevation.
  const leftSide: [Point3, Point3, Point3, Point3] = [
    [-1.255, 1.11, 1.39],
    [-1.255, 1.14, -0.73],
    [-0.88, 1.82, -0.08],
    [-0.88, 1.79, 0.82],
  ];
  const rightSide: [Point3, Point3, Point3, Point3] = [
    [1.255, 1.14, -0.73],
    [1.255, 1.11, 1.39],
    [0.88, 1.79, 0.82],
    [0.88, 1.82, -0.08],
  ];
  group.add(quad(leftSide, glass), quad(rightSide, glass));
  group.add(
    quad(
      [
        [-1.255, 1.14, -0.73],
        [1.255, 1.14, -0.73],
        [0.88, 1.82, -0.08],
        [-0.88, 1.82, -0.08],
      ],
      glass,
    ),
    quad(
      [
        [1.255, 1.11, 1.39],
        [-1.255, 1.11, 1.39],
        [-0.88, 1.79, 0.82],
        [0.88, 1.79, 0.82],
      ],
      glass,
    ),
    quad(
      [
        [-0.88, 1.82, -0.08],
        [0.88, 1.82, -0.08],
        [0.88, 1.79, 0.82],
        [-0.88, 1.79, 0.82],
      ],
      body,
    ),
  );

  // Window frames, B-pillars, mirrors, and period-correct chrome belt trim.
  for (const side of [-1, 1]) {
    box(group, [0.055, 0.73, 0.075], [side * 1.08, 1.47, 0.69], dark).rotation.z =
      side * 0.27;
    box(group, [0.055, 0.055, 2.02], [side * 1.27, 1.11, 0.32], chrome);
    const mirror = box(
      group,
      [0.29, 0.15, 0.38],
      [side * 1.48, 1.19, -0.48],
      body,
    );
    mirror.rotation.z = side * 0.08;
  }

  // Raised fender brows add width without turning the body into a rectangular slab.
  const browGeometry = new THREE.TorusGeometry(0.68, 0.075, 5, 16, Math.PI);
  browGeometry.rotateY(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (const z of [-1.77, 1.77]) {
      const brow = finishMesh(browGeometry, body);
      brow.position.set(side * 1.405, 0.56, z);
      group.add(brow);
    }
  }

  // Pop-up headlight pods and warm inset lamps.
  const headlight = new THREE.MeshStandardMaterial({
    color: "#fff1c7",
    emissive: "#ffd89a",
    emissiveIntensity: 2.2,
    roughness: 0.22,
    metalness: 0.08,
  });
  for (const x of [-0.86, 0.86]) {
    const pod = box(group, [0.69, 0.2, 0.49], [x, 1.02, -1.91], body);
    pod.rotation.x = -0.06;
    const lamp = box(group, [0.52, 0.13, 0.055], [x, 1.03, -2.17], headlight);
    lamp.rotation.x = -0.06;
  }
  box(group, [1.28, 0.1, 0.055], [0, 0.74, -2.786], dark);

  if (variant === "hero") {
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: "#ffe4a8",
      transparent: true,
      opacity: 0.075,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beamGeometry = new THREE.ConeGeometry(0.72, 3.5, 12, 1, true);
    beamGeometry.rotateX(Math.PI / 2);
    for (const x of [-0.86, 0.86]) {
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.position.set(x, 0.91, -3.91);
      beam.renderOrder = 1;
      group.add(beam);
    }
  }

  const tailMaterial = new THREE.MeshStandardMaterial({
    color: "#8e1216",
    emissive: "#ff1d24",
    emissiveIntensity: 0.85,
    roughness: 0.3,
  });
  for (const x of [-0.91, 0.91]) {
    box(group, [0.82, 0.22, 0.065], [x, 0.82, 2.72], tailMaterial);
  }
  box(group, [0.7, 0.07, 0.04], [0, 0.67, 2.77], chrome);

  // Rear deck louvers leave the sloping rear glass visible between their blades.
  for (let i = 0; i < 6; i += 1) {
    const louver = box(
      group,
      [2.16 - i * 0.06, 0.045, 0.13],
      [0, 1.72 - i * 0.105, 0.94 + i * 0.12],
      dark,
    );
    louver.rotation.x = -0.22;
  }

  if (variant !== "civilian") {
    for (const x of [-1.08, 1.08]) {
      const upright = box(group, [0.12, 0.43, 0.18], [x, 1.21, 2.17], dark);
      upright.rotation.x = -0.12;
    }
    const wing = box(group, [3.08, 0.12, 0.48], [0, 1.46, 2.24], body);
    wing.rotation.x = -0.055;
    box(group, [3.22, 0.055, 0.12], [0, 1.51, 2.42], dark);
  }

  // Full-image UV panels. Each side has outward winding and independent UV order,
  // so text is readable rather than mirrored from either side of the car.
  const panelMaterial =
    variant === "police"
      ? new THREE.MeshStandardMaterial({
          map: policeDoorTexture(),
          color: "#ffffff",
          side: THREE.DoubleSide,
          roughness: 0.4,
          metalness: 0.1,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
      : wrap;
  if (variant !== "civilian") {
    const rightDoor = quad(
      [
        [1.447, 0.46, 1.14],
        [1.447, 0.46, -1.15],
        [1.447, 1.02, -1.15],
        [1.447, 1.1, 1.14],
      ],
      panelMaterial,
    );
    const leftDoor = quad(
      [
        [-1.447, 0.46, -1.15],
        [-1.447, 0.46, 1.14],
        [-1.447, 1.1, 1.14],
        [-1.447, 1.02, -1.15],
      ],
      panelMaterial,
    );
    rightDoor.renderOrder = 2;
    leftDoor.renderOrder = 2;
    group.add(rightDoor, leftDoor);

    if (variant === "hero") {
      const hood = quad(
        [
          [-1.2, 1.238, -0.73],
          [-1.2, 1.127, -1.93],
          [1.2, 1.127, -1.93],
          [1.2, 1.238, -0.73],
        ],
        wrap,
        [
          [1, 1],
          [1, 0],
          [0, 0],
          [0, 1],
        ],
      );
      hood.renderOrder = 2;
      group.add(hood);
    }
  }

  const wheels: THREE.Group[] = [];
  const tireGeometry = new THREE.CylinderGeometry(0.59, 0.59, 0.36, 20, 1);
  tireGeometry.rotateZ(Math.PI / 2);
  const rimGeometry = new THREE.CylinderGeometry(0.39, 0.39, 0.375, 20, 1);
  rimGeometry.rotateZ(Math.PI / 2);
  const hubGeometry = new THREE.CylinderGeometry(0.105, 0.105, 0.405, 12, 1);
  hubGeometry.rotateZ(Math.PI / 2);
  const spokeGeometry = new THREE.BoxGeometry(0.4, 0.07, 0.06);
  for (const x of [-1.48, 1.48]) {
    for (const z of [-1.77, 1.77]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, 0.56, z);
      const tire = finishMesh(tireGeometry, rubber);
      const wheelRim = finishMesh(rimGeometry, rim);
      const hub = finishMesh(hubGeometry, chrome);
      wheel.add(tire, wheelRim, hub);
      for (let i = 0; i < 5; i += 1) {
        const spoke = finishMesh(spokeGeometry, chrome);
        spoke.rotation.x = (i / 5) * Math.PI * 2;
        spoke.position.x = x > 0 ? 0.205 : -0.205;
        wheel.add(spoke);
      }
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  // A single additive plane provides cheap neon without adding dynamic lights.
  const underglowMaterial = new THREE.MeshBasicMaterial({
    color: "#39e6ff",
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const underglow = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 4.35), underglowMaterial);
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.y = 0.075;
  underglow.visible = false;
  underglow.renderOrder = 1;
  group.add(underglow);

  let sirenRed: THREE.MeshStandardMaterial | null = null;
  let sirenBlue: THREE.MeshStandardMaterial | null = null;
  if (variant === "police") {
    box(group, [1.15, 0.055, 0.24], [0, 1.9, 0.36], dark);
    sirenRed = new THREE.MeshStandardMaterial({
      color: "#d91d2b",
      emissive: "#ff1025",
      emissiveIntensity: 0.2,
      roughness: 0.24,
    });
    sirenBlue = new THREE.MeshStandardMaterial({
      color: "#155bd8",
      emissive: "#1677ff",
      emissiveIntensity: 0.2,
      roughness: 0.24,
    });
    box(group, [0.52, 0.18, 0.26], [-0.29, 1.99, 0.36], sirenRed);
    box(group, [0.52, 0.18, 0.26], [0.29, 1.99, 0.36], sirenBlue);
  }

  return {
    group,
    body,
    wrap,
    wheels,
    setUnderglow: (hex: string | null) => {
      underglow.visible = hex !== null;
      if (hex !== null) underglowMaterial.color.set(hex);
    },
    setSiren: (t: number) => {
      if (!sirenRed || !sirenBlue) return;
      const redOn = Math.floor(t * 8) % 2 === 0;
      sirenRed.emissiveIntensity = redOn ? 5 : 0.18;
      sirenBlue.emissiveIntensity = redOn ? 0.18 : 5;
    },
    setBrake: (on: boolean) => {
      tailMaterial.emissiveIntensity = on ? 3.8 : 0.85;
    },
  };
}
