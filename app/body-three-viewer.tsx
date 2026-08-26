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
  return {
    height: THREE.MathUtils.clamp(measurements.height / 170, 0.86, 1.14),
    chest: THREE.MathUtils.clamp(measurements.chest / 90, 0.82, 1.23),
    waist: THREE.MathUtils.clamp(measurements.waist / 74, 0.74, 1.2),
    hips: THREE.MathUtils.clamp(measurements.hips / 94, 0.82, 1.25),
    shoulder: THREE.MathUtils.clamp(measurements.shoulder / 42, 0.82, 1.22),
  };
}

function createParametricBody(measurements: BodyMeasurements) {
  const root = new THREE.Group();
  root.name = "muse-parametric-body";
  const factors = bodyFactors(measurements);
  const skin = material(skinColors[measurements.skinTone] ?? skinColors.自然暖调, { roughness: 0.8 });
  const hair = material(hairColors[measurements.hairColor] ?? hairColors.深棕, { roughness: 0.92 });

  addMesh(root, new THREE.SphereGeometry(0.36, 36, 24), skin, [0, 4.22, 0], [0.9, 1.08, 0.92]);
  addMesh(root, new THREE.CylinderGeometry(0.13, 0.16, 0.38, 24), skin, [0, 3.78, 0]);
  addMesh(root, new THREE.CylinderGeometry(0.47 * factors.chest, 0.37 * factors.waist, 1.28, 40, 5), skin, [0, 3.05, 0], [factors.shoulder, 1, 0.82]);
  addMesh(root, new THREE.SphereGeometry(0.48, 32, 20), skin, [0, 2.28, 0], [factors.hips, 0.78, 0.78]);

  const armGeometry = new THREE.CapsuleGeometry(0.125, 1.34, 8, 18);
  addMesh(root, armGeometry, skin, [-0.56 * factors.shoulder, 2.96, 0], [1, 1, 1], [0, 0, -0.08]);
  addMesh(root, armGeometry, skin, [0.56 * factors.shoulder, 2.96, 0], [1, 1, 1], [0, 0, 0.08]);

  const legGeometry = new THREE.CapsuleGeometry(0.19, 1.55, 10, 20);
  addMesh(root, legGeometry, skin, [-0.24 * factors.hips, 1.08, 0], [1, 1, 0.94]);
  addMesh(root, legGeometry, skin, [0.24 * factors.hips, 1.08, 0], [1, 1, 0.94]);
  addMesh(root, new THREE.BoxGeometry(0.42, 0.18, 0.72), skin, [-0.24 * factors.hips, 0.15, 0.13], [1, 1, 1]);
  addMesh(root, new THREE.BoxGeometry(0.42, 0.18, 0.72), skin, [0.24 * factors.hips, 0.15, 0.13], [1, 1, 1]);

  if (measurements.hairStyle !== "光头") {
    const length = measurements.hairStyle === "长发" ? 1.4 : measurements.hairStyle === "中长发" || measurements.hairStyle === "卷发" ? 0.88 : 0.46;
    addMesh(root, new THREE.SphereGeometry(0.4, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.68), hair, [0, 4.36 - length * 0.07, -0.02], [1, length, 1]);
  }

  root.scale.y = factors.height;
  return root;
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
    const fabric = material(garmentColor(top));
    addMesh(root, new THREE.CylinderGeometry(0.5 * factors.chest, 0.4 * factors.waist, 1.18, 40, 4, true), fabric, [0, 3.08, 0], [factors.shoulder, 1, 0.88]);
    addMesh(root, new THREE.CapsuleGeometry(0.17, 0.42, 6, 16), fabric, [-0.58 * factors.shoulder, 3.35, 0], [1, 1, 1], [0, 0, -0.2]);
    addMesh(root, new THREE.CapsuleGeometry(0.17, 0.42, 6, 16), fabric, [0.58 * factors.shoulder, 3.35, 0], [1, 1, 1], [0, 0, 0.2]);
  }

  if (bottom && !dress) {
    const fabric = material(garmentColor(bottom));
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
    const fabric = material(garmentColor(dress));
    addMesh(root, new THREE.CylinderGeometry(0.49 * factors.chest, 0.4 * factors.waist, 1.2, 40, 4, true), fabric, [0, 3.08, 0], [factors.shoulder, 1, 0.88]);
    addMesh(root, new THREE.CylinderGeometry(0.39 * factors.waist, 0.76 * factors.hips, 1.86, 48, 5, true), fabric, [0, 1.92, 0], [1, 1, 0.88]);
  }

  if (outer) {
    const fabric = material(garmentColor(outer), { roughness: 0.64, opacity: 0.94 });
    addMesh(root, new THREE.CylinderGeometry(0.58 * factors.chest, 0.54 * factors.hips, 1.92, 44, 5, true), fabric, [0, 2.82, 0], [factors.shoulder, 1, 0.94]);
    addMesh(root, new THREE.CapsuleGeometry(0.19, 1.22, 8, 18), fabric, [-0.62 * factors.shoulder, 2.98, 0], [1, 1, 1], [0, 0, -0.1]);
    addMesh(root, new THREE.CapsuleGeometry(0.19, 1.22, 8, 18), fabric, [0.62 * factors.shoulder, 2.98, 0], [1, 1, 1], [0, 0, 0.1]);
  }

  if (shoes) {
    const shoeMaterial = material(garmentColor(shoes), { roughness: 0.48 });
    addMesh(root, new THREE.BoxGeometry(0.48, 0.22, 0.82), shoeMaterial, [-0.24 * factors.hips, 0.14, 0.18]);
    addMesh(root, new THREE.BoxGeometry(0.48, 0.22, 0.82), shoeMaterial, [0.24 * factors.hips, 0.14, 0.18]);
  }

  if (accessory) {
    const accent = material(garmentColor(accessory), { roughness: 0.38, metalness: 0.24 });
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

  const statusLabel = status === "external-mesh" ? "EXTERNAL GLB MESH"
    : status === "loading-mesh" ? "LOADING 3D MESH"
      : status === "mesh-fallback" ? "WEBGL FALLBACK"
        : status === "unavailable" ? "WEBGL UNAVAILABLE"
          : "REAL-TIME WEBGL";

  return (
    <div className="body-three-viewer">
      <div ref={mountRef} className="body-three-canvas" role="img" aria-label="可拖动旋转和缩放的 3D 虚拟穿搭" />
      {status === "unavailable" && <div className="body-three-fallback"><strong>当前浏览器无法启动 3D</strong><span>仍可继续使用二维试穿。</span></div>}
      <span className="body-mode">{statusLabel}</span>
      <span className="body-confidence">人体置信度 {Math.round(model.profileConfidence * 100)}%</span>
      <span className="body-three-hint">拖动旋转 · 滚轮或双指缩放</span>
      <span className="sr-only">当前已应用：{garments.map((item) => item.name).join("、") || "尚未应用衣物"}</span>
    </div>
  );
}
