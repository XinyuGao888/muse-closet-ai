"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { BodyMeasurements, BodyModel } from "@/lib/phase-two-three";
import { categoryColors, type Garment } from "@/lib/wardrobe";

type ViewerStatus = "webgl" | "loading-mesh" | "external-mesh" | "mesh-fallback" | "unavailable";

const skinColors: Record<string, string> = {
  自然暖调: "#d8b9a3",
  自然冷调: "#d4b4aa",
  白皙: "#ead1c2",
  小麦: "#b98968",
  深色: "#77513f",
};

const hairColors: Record<string, string> = {
  黑色: "#211e1c",
  深棕: "#3d302a",
  浅棕: "#765744",
  灰色: "#73706c",
  彩色: "#5b465c",
};

const namedColors: Array<[string, string]> = [
  ["黑", "#242624"], ["白", "#f2f0e9"], ["米", "#d8cfbd"], ["灰", "#8b908c"],
  ["藏青", "#23364c"], ["深蓝", "#304c66"], ["蓝", "#527999"], ["牛仔", "#456987"],
  ["绿", "#557466"], ["卡其", "#a68d68"], ["棕", "#795b45"], ["咖", "#60493b"],
  ["红", "#8e3c4c"], ["粉", "#d89aa8"], ["紫", "#765d86"], ["黄", "#c5a04a"],
];

function garmentColor(garment: Garment) {
  return namedColors.find(([name]) => garment.color.includes(name))?.[1]
    ?? categoryColors[garment.category]
    ?? "#789087";
}

function material(color: string, options: { roughness?: number; metalness?: number; opacity?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.02,
    transparent: (options.opacity ?? 1) < 1,
    opacity: options.opacity ?? 1,
    side: THREE.DoubleSide,
  });
}

function garmentMaterial(
  garment: Garment,
  options: { roughness?: number; metalness?: number; opacity?: number } = {},
) {
  const fabric = material(garmentColor(garment), options);
  if (!garment.imageUrl) return fabric;
  const texture = new THREE.TextureLoader().load(garment.imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  fabric.map = texture;
  fabric.color.set("#ffffff");
  fabric.transparent = true;
  fabric.alphaTest = 0.04;
  fabric.needsUpdate = true;
  return fabric;
}

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  meshMaterial: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function bodyFactors(measurements: BodyMeasurements) {
  const heightM = Math.max(1.35, measurements.height / 100);
  const bmi = measurements.weight / (heightM * heightM);
  const chest = THREE.MathUtils.clamp(measurements.chest / 90, 0.84, 1.2);
  const waist = THREE.MathUtils.clamp(measurements.waist / 74, 0.78, 1.18);
  const hips = THREE.MathUtils.clamp(measurements.hips / 94, 0.84, 1.2);
  const mass = THREE.MathUtils.clamp(bmi / 22, 0.86, 1.16);
  return {
    height: THREE.MathUtils.clamp(measurements.height / 170, 0.88, 1.12),
    chest,
    waist,
    hips,
    shoulder: THREE.MathUtils.clamp(0.96 + (chest - 1) * 0.48 + (mass - 1) * 0.18, 0.88, 1.14),
    mass,
  };
}

type AnatomicalSection = {
  x: number;
  y: number;
  z: number;
  radiusX: number;
  radiusZ: number;
};

function createSectionGeometry(sections: AnatomicalSection[], radialSegments = 36) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const section of sections) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * Math.PI * 2;
      positions.push(
        section.x + Math.cos(angle) * section.radiusX,
        section.y,
        section.z + Math.sin(angle) * section.radiusZ,
      );
    }
  }
  for (let ring = 0; ring < sections.length - 1; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const currentRing = ring * radialSegments;
      const nextRing = (ring + 1) * radialSegments;
      indices.push(currentRing + segment, nextRing + segment, currentRing + next);
      indices.push(currentRing + next, nextRing + segment, nextRing + next);
    }
  }
  const firstCenter = positions.length / 3;
  positions.push(sections[0].x, sections[0].y, sections[0].z);
  const lastCenter = positions.length / 3;
  const last = sections.length - 1;
  positions.push(sections[last].x, sections[last].y, sections[last].z);
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(firstCenter, next, segment);
    indices.push(lastCenter, last * radialSegments + segment, last * radialSegments + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createParametricBody(measurements: BodyMeasurements) {
  const root = new THREE.Group();
  root.name = "muse-proportional-body";
  const factors = bodyFactors(measurements);
  const skin = new THREE.MeshPhysicalMaterial({
    color: skinColors[measurements.skinTone] ?? skinColors.自然暖调,
    roughness: 0.58,
    metalness: 0,
    sheen: 0.18,
    sheenRoughness: 0.72,
    clearcoat: 0.08,
    clearcoatRoughness: 0.78,
  });
  const hair = material(hairColors[measurements.hairColor] ?? hairColors.深棕, { roughness: 0.92 });

  // Stable anatomical profiles avoid the swollen, irregular silhouette produced by
  // metaballs. Weight and the three circumferences influence widths conservatively.
  const bulk = THREE.MathUtils.lerp(1, factors.mass, 0.55);
  const shoulderWidth = 0.54 * factors.shoulder * bulk;
  const chestWidth = 0.47 * factors.chest * bulk;
  const waistWidth = 0.37 * factors.waist * bulk;
  const hipWidth = 0.47 * factors.hips * bulk;
  addMesh(root, createSectionGeometry([
    { x: 0, y: 3.67, z: 0, radiusX: 0.17, radiusZ: 0.14 },
    { x: 0, y: 3.57, z: 0, radiusX: 0.3, radiusZ: 0.2 },
    { x: 0, y: 3.45, z: 0, radiusX: shoulderWidth, radiusZ: 0.25 * bulk },
    { x: 0, y: 3.27, z: 0.01, radiusX: chestWidth, radiusZ: 0.29 * factors.chest * bulk },
    { x: 0, y: 2.94, z: 0.015, radiusX: chestWidth * 0.94, radiusZ: 0.28 * bulk },
    { x: 0, y: 2.62, z: 0.005, radiusX: waistWidth * 1.04, radiusZ: 0.23 * factors.waist * bulk },
    { x: 0, y: 2.39, z: 0, radiusX: waistWidth, radiusZ: 0.23 * factors.waist * bulk },
    { x: 0, y: 2.2, z: -0.005, radiusX: hipWidth * 0.94, radiusZ: 0.29 * factors.hips * bulk },
    { x: 0, y: 2.03, z: -0.01, radiusX: hipWidth, radiusZ: 0.31 * factors.hips * bulk },
    { x: 0, y: 1.91, z: 0, radiusX: hipWidth * 0.72, radiusZ: 0.26 * factors.hips * bulk },
  ], 48), skin, [0, 0, 0]);

  const legX = 0.21 * factors.hips * bulk;
  for (const side of [-1, 1]) {
    const armX = side * shoulderWidth;
    addMesh(root, createSectionGeometry([
      { x: armX * 0.93, y: 3.44, z: 0, radiusX: 0.18 * bulk, radiusZ: 0.17 * bulk },
      { x: armX * 1.08, y: 3.16, z: 0, radiusX: 0.145 * bulk, radiusZ: 0.135 * bulk },
      { x: armX * 1.12, y: 2.67, z: 0.005, radiusX: 0.118 * bulk, radiusZ: 0.11 * bulk },
      { x: armX * 1.13, y: 2.35, z: 0.015, radiusX: 0.108 * bulk, radiusZ: 0.1 * bulk },
      { x: armX * 1.13, y: 1.98, z: 0.025, radiusX: 0.078 * bulk, radiusZ: 0.073 * bulk },
      { x: armX * 1.13, y: 1.78, z: 0.055, radiusX: 0.095 * bulk, radiusZ: 0.065 * bulk },
    ], 28), skin, [0, 0, 0]);

    addMesh(root, createSectionGeometry([
      { x: side * legX, y: 2.08, z: 0, radiusX: 0.205 * bulk, radiusZ: 0.195 * bulk },
      { x: side * legX, y: 1.67, z: 0, radiusX: 0.18 * bulk, radiusZ: 0.17 * bulk },
      { x: side * legX, y: 1.17, z: 0.005, radiusX: 0.135 * bulk, radiusZ: 0.13 * bulk },
      { x: side * legX, y: 0.89, z: -0.005, radiusX: 0.15 * bulk, radiusZ: 0.145 * bulk },
      { x: side * legX, y: 0.35, z: 0.01, radiusX: 0.095 * bulk, radiusZ: 0.09 * bulk },
      { x: side * legX, y: 0.18, z: 0.06, radiusX: 0.09 * bulk, radiusZ: 0.08 * bulk },
    ], 32), skin, [0, 0, 0]);
    addMesh(root, new THREE.CapsuleGeometry(0.13 * bulk, 0.3, 8, 22), skin, [side * legX, 0.13, 0.22], [1.08, 1, 1.42], [Math.PI / 2, 0, 0]);
  }

  // Keep the existing restrained head treatment; the complaint is addressed in the
  // body proportions rather than by inventing a new facial identity.
  addMesh(root, new THREE.CapsuleGeometry(0.14, 0.25, 8, 22), skin, [0, 3.72, 0], [1, 1, 0.9]);
  addMesh(root, new THREE.SphereGeometry(0.36, 44, 32), skin, [0, 4.2, 0], [0.9, 1.07, 0.9]);
  addMesh(root, new THREE.SphereGeometry(0.3, 40, 28), skin, [0, 4.02, 0.025], [0.9, 0.8, 0.88]);

  // Restrained facial landmarks keep the identity-neutral avatar human without
  // attempting to invent a user's face.
  const face = material("#4a3732", { roughness: 0.78 });
  addMesh(root, new THREE.SphereGeometry(0.025, 16, 10), face, [-0.115, 4.27, 0.304], [1, 0.6, 0.45]);
  addMesh(root, new THREE.SphereGeometry(0.025, 16, 10), face, [0.115, 4.27, 0.304], [1, 0.6, 0.45]);
  addMesh(root, new THREE.ConeGeometry(0.045, 0.12, 18), skin, [0, 4.16, 0.35], [0.72, 1, 0.72], [Math.PI / 2, 0, 0]);
  addMesh(root, new THREE.CapsuleGeometry(0.012, 0.095, 4, 12), material("#965f61", { roughness: 0.68 }), [0, 4.04, 0.31], [1, 1, 0.5], [0, 0, Math.PI / 2]);

  if (measurements.hairStyle !== "光头") {
    const length = measurements.hairStyle === "长发" ? 1.38 : measurements.hairStyle === "中长发" || measurements.hairStyle === "卷发" ? 0.92 : 0.5;
    addMesh(root, new THREE.SphereGeometry(0.39, 40, 28, 0, Math.PI * 2, 0, Math.PI * 0.7), hair, [0, 4.39 - length * 0.06, -0.015], [0.96, length, 0.9]);
  }

  root.scale.y = factors.height;
  return root;
}

function latheLayer(points: Array<[number, number]>, segments = 56) {
  return new THREE.LatheGeometry(points.map(([radius, y]) => new THREE.Vector2(radius, y)), segments);
}

function createGarmentLayers(garments: Garment[], measurements: BodyMeasurements) {
  const root = new THREE.Group();
  root.name = "muse-garment-layers";
  const factors = bodyFactors(measurements);
  const top = garments.find((item) => item.category === "上装");
  const outer = garments.find((item) => item.category === "外套");
  const bottom = garments.find((item) => item.category === "下装");
  const dress = garments.find((item) => item.category === "连衣裙");
  const shoes = garments.find((item) => item.category === "鞋履");
  const accessory = garments.find((item) => item.category === "配饰");

  if (top && !dress) {
    const fabric = garmentMaterial(top);
    addMesh(root, latheLayer([[0.39 * factors.waist, 2.46], [0.43 * factors.waist, 2.72], [0.5 * factors.chest, 3.2], [0.48 * factors.shoulder, 3.57], [0.27, 3.66]]), fabric, [0, 0, 0], [1, 1, 0.86]);
    addMesh(root, new THREE.CapsuleGeometry(0.17, 0.42, 6, 16), fabric, [-0.58 * factors.shoulder, 3.35, 0], [1, 1, 1], [0, 0, -0.2]);
    addMesh(root, new THREE.CapsuleGeometry(0.17, 0.42, 6, 16), fabric, [0.58 * factors.shoulder, 3.35, 0], [1, 1, 1], [0, 0, 0.2]);
  }

  if (bottom && !dress) {
    const fabric = garmentMaterial(bottom);
    const isSkirt = /裙/.test(bottom.name);
    if (isSkirt) {
      addMesh(root, new THREE.CylinderGeometry(0.43 * factors.waist, 0.62 * factors.hips, 1.48, 40, 4, true), fabric, [0, 1.92, 0], [1, 1, 0.84]);
    } else {
      const trouser = new THREE.CylinderGeometry(0.23 * factors.hips, 0.18 * factors.hips, 1.75, 28, 3, true);
      addMesh(root, trouser, fabric, [-0.235 * factors.hips, 1.28, 0], [1, 1, 0.92]);
      addMesh(root, trouser.clone(), fabric, [0.235 * factors.hips, 1.28, 0], [1, 1, 0.92]);
      addMesh(root, new THREE.CylinderGeometry(0.49 * factors.waist, 0.5 * factors.hips, 0.52, 36, 2, true), fabric, [0, 2.2, 0], [1, 1, 0.86]);
    }
  }

  if (dress) {
    const fabric = garmentMaterial(dress);
    addMesh(root, latheLayer([[0.7 * factors.hips, 0.95], [0.62 * factors.hips, 1.65], [0.43 * factors.waist, 2.42], [0.4 * factors.waist, 2.72], [0.49 * factors.chest, 3.22], [0.46 * factors.shoulder, 3.56], [0.27, 3.66]], 64), fabric, [0, 0, 0], [1, 1, 0.88]);
  }

  if (outer) {
    const fabric = garmentMaterial(outer, { roughness: 0.64, opacity: 0.96 });
    addMesh(root, latheLayer([[0.55 * factors.hips, 1.86], [0.54 * factors.waist, 2.42], [0.57 * factors.chest, 3.18], [0.55 * factors.shoulder, 3.62], [0.3, 3.73]], 64), fabric, [0, 0, 0], [1, 1, 0.92]);
    addMesh(root, new THREE.CapsuleGeometry(0.19, 1.22, 8, 18), fabric, [-0.62 * factors.shoulder, 2.98, 0], [1, 1, 1], [0, 0, -0.1]);
    addMesh(root, new THREE.CapsuleGeometry(0.19, 1.22, 8, 18), fabric, [0.62 * factors.shoulder, 2.98, 0], [1, 1, 1], [0, 0, 0.1]);
  }

  if (shoes) {
    const shoeMaterial = garmentMaterial(shoes, { roughness: 0.48 });
    addMesh(root, new THREE.CapsuleGeometry(0.16, 0.34, 8, 20), shoeMaterial, [-0.24 * factors.hips, 0.15, 0.18], [1.2, 1, 1.34], [Math.PI / 2, 0, 0]);
    addMesh(root, new THREE.CapsuleGeometry(0.16, 0.34, 8, 20), shoeMaterial, [0.24 * factors.hips, 0.15, 0.18], [1.2, 1, 1.34], [Math.PI / 2, 0, 0]);
  }

  if (accessory) {
    const accent = garmentMaterial(accessory, { roughness: 0.38, metalness: 0.24 });
    addMesh(root, new THREE.TorusGeometry(0.28, 0.035, 12, 36), accent, [0, 3.67, 0.34], [1, 1, 1], [Math.PI / 2, 0, 0]);
  }

  root.scale.y = factors.height;
  return root;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const meshMaterial of materials) {
      if (meshMaterial instanceof THREE.MeshStandardMaterial && meshMaterial.map) meshMaterial.map.dispose();
      meshMaterial.dispose();
    }
  });
}

function normalizeExternalModel(object: THREE.Object3D) {
  const initial = new THREE.Box3().setFromObject(object);
  const size = initial.getSize(new THREE.Vector3());
  const scale = size.y > 0 ? 4.75 / size.y : 1;
  object.scale.setScalar(scale);
  const fitted = new THREE.Box3().setFromObject(object);
  const center = fitted.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= fitted.min.y;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

export function BodyThreeViewer({
  model,
  rotation,
  garments,
  externalResult,
}: {
  model: BodyModel;
  rotation: number;
  garments: Garment[];
  externalResult: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const [status, setStatus] = useState<ViewerStatus>(model.meshUrl ? "loading-mesh" : "webgl");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let frame = 0;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      queueMicrotask(() => setStatus("unavailable"));
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.domElement.setAttribute("aria-label", `可旋转的 3D 人体，当前穿着 ${garments.map((item) => item.name).join("、") || "基础人体"}`);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 2.75, 8.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2.35, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 5.6;
    controls.maxDistance = 11;
    controls.maxPolarAngle = Math.PI * 0.58;
    controls.minPolarAngle = Math.PI * 0.32;

    scene.add(new THREE.HemisphereLight(0xf8f4e8, 0x43564d, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
    keyLight.position.set(4, 7, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xb7d7c8, 1.9);
    rimLight.position.set(-4, 4, -4);
    scene.add(rimLight);

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xd7ded8, roughness: 0.92, transparent: true, opacity: 0.72 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.15, 64), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    floor.receiveShadow = true;
    scene.add(floor);

    const modelRoot = new THREE.Group();
    modelRoot.rotation.y = 0;
    modelRootRef.current = modelRoot;
    scene.add(modelRoot);

    const bodyRoot = createParametricBody(model.measurements);
    modelRoot.add(bodyRoot);
    if (!externalResult || !model.meshUrl) modelRoot.add(createGarmentLayers(garments, model.measurements));

    if (model.meshUrl) {
      queueMicrotask(() => { if (!disposed) setStatus("loading-mesh"); });
      const loader = new GLTFLoader();
      loader.load(model.meshUrl, (gltf) => {
        if (disposed) return;
        modelRoot.remove(bodyRoot);
        disposeObject(bodyRoot);
        normalizeExternalModel(gltf.scene);
        modelRoot.add(gltf.scene);
        setStatus("external-mesh");
      }, undefined, () => {
        if (!disposed) setStatus("mesh-fallback");
      });
    } else {
      queueMicrotask(() => { if (!disposed) setStatus("webgl"); });
    }

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      disposeObject(scene);
      floorMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      modelRootRef.current = null;
    };
  }, [externalResult, garments, model.measurements, model.meshUrl]);

  useEffect(() => {
    if (modelRootRef.current) modelRootRef.current.rotation.y = THREE.MathUtils.degToRad(rotation);
  }, [rotation]);

  const statusLabel = status === "external-mesh" ? (externalResult ? "CHATGARMENT 3D RESULT" : "PHOTO BODY MESH")
    : status === "loading-mesh" ? "LOADING 3D MESH"
      : status === "mesh-fallback" ? "WEBGL FALLBACK"
        : status === "unavailable" ? "WEBGL UNAVAILABLE"
          : "HUMAN PROPORTION MESH";

  return (
    <div className="body-three-viewer">
      <div ref={mountRef} className="body-three-canvas" role="img" aria-label="可拖动旋转和缩放的 3D 虚拟穿搭" />
      {status === "unavailable" && <div className="body-three-fallback"><strong>当前浏览器无法启动 3D</strong><span>请开启硬件加速或更换支持 WebGL 的浏览器。</span></div>}
      <span className="body-mode">{statusLabel}</span>
      <span className="body-confidence">人体置信度 {Math.round(model.profileConfidence * 100)}%</span>
      <span className="body-three-hint">拖动旋转 · 滚轮或双指缩放</span>
      <span className="sr-only">当前已应用：{garments.map((item) => item.name).join("、") || "尚未应用衣物"}</span>
    </div>
  );
}
