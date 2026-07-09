/**
 * The 3D stage: a Three.js scene with Desmos-style light theming (to match
 * the 2D graph), 3b1b-style fat colored arrows, and Desmos 3D navigation
 * (orbit around the origin, z-axis up, scroll to zoom).
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { apply3, col3, type Mat3, type Vec3 } from "../lib/matrix3";

export interface Vector3Drawable {
  kind: "vector";
  vec: Vec3;
  color: string;
  ride: boolean; // apply the warp (defined vectors) vs. fixed (computed results)
  label?: string;
}
export type Drawable3 = Vector3Drawable;

// Light Desmos-style stage (continuous with the 2D graph); the basis
// vectors keep the 3b1b palette: î green, ĵ red, k̂ blue.
const COLORS3 = {
  bg: 0xffffff,
  axis: 0x3c4350, // same as the 2D axes
  axisLabel: "#7a828f",
  lattice: 0xc6ccd5, // warped lattice lines — light grey for clarity
  iHat: 0x83c167,
  jHat: 0xfc6255,
  kHat: 0x58c4dd,
  cube: 0x78a05a, // same green as the 2D unit parallelogram
};

const AXIS_EXTENT = 5.5; // just past the ±4 lattice, Desmos-style

function toV(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

/** A fat arrow from the origin: cylinder shaft + cone tip, 3b1b-style. */
function makeArrow(vec: Vec3, color: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  const dir = toV(vec);
  const len = dir.length();
  if (len < 1e-9) return group;
  const headLen = Math.min(0.32, len * 0.4);
  const headR = headLen * 0.36;
  const shaftR = 0.028;
  const mat = new THREE.MeshBasicMaterial({ color });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftR, shaftR, len - headLen, 12),
    mat,
  );
  shaft.position.y = (len - headLen) / 2;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(headR, headLen, 16),
    mat,
  );
  head.position.y = len - headLen / 2;
  group.add(shaft, head);
  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize(),
  );
  return group;
}

/** A billboarded text label rendered onto a small canvas texture. */
function makeLabel(text: string, color: string, height = 0.34): THREE.Sprite {
  const pad = 10;
  const font = "600 64px ui-sans-serif, system-ui, sans-serif";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  canvas.height = 84;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false }),
  );
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  return sprite;
}

/**
 * A fat axis: cylinder shaft spanning -extent..extent with a cone arrowhead
 * on the positive end, Desmos 3D-style.
 */
function makeAxis(end: Vec3, color: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  const dir = toV(end);
  const len = dir.length();
  const headLen = 0.5;
  const headR = 0.15;
  const shaftR = 0.032;
  const mat = new THREE.MeshBasicMaterial({ color });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftR, shaftR, 2 * len - headLen, 12),
    mat,
  );
  shaft.position.y = -headLen / 2; // spans -len .. len - headLen
  const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 16), mat);
  head.position.y = len - headLen / 2;
  group.add(shaft, head);
  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize(),
  );
  return group;
}

/** Dispose everything under a group (geometries, materials, textures). */
function disposeDeep(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    } else if (obj instanceof THREE.Sprite) {
      obj.material.map?.dispose();
      obj.material.dispose();
    }
  });
}

interface Props {
  /** The matrix whose action is displayed (identity when nothing is active). */
  warp: Mat3;
  /** Draw basis vectors + the warped unit cube for the active matrix. */
  showActiveMatrix: boolean;
  drawables: Drawable3[];
}

export default function TransformCanvas3D({
  warp,
  showActiveMatrix,
  drawables,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const warpRef = useRef(warp);
  const drawablesRef = useRef(drawables);
  const activeRef = useRef(showActiveMatrix);
  const syncRef = useRef<() => void>(() => {});
  warpRef.current = warp;
  drawablesRef.current = drawables;
  activeRef.current = showActiveMatrix;

  useEffect(() => {
    const container = containerRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS3.bg);

    // z is up, like Desmos 3D (and 3b1b's 3D chapters).
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    camera.up.set(0, 0, 1);
    camera.position.set(3.2, -4.6, 2.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.4, 0.4, 0.5);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 1.5;
    controls.maxDistance = 60;
    controls.zoomSpeed = 1.4;

    // Static furniture: just the labeled x/y/z axes — the warped lattice
    // provides all the grid context once a matrix is active.
    const axisEnds: [Vec3, string][] = [
      [{ x: AXIS_EXTENT, y: 0, z: 0 }, "x"],
      [{ x: 0, y: AXIS_EXTENT, z: 0 }, "y"],
      [{ x: 0, y: 0, z: AXIS_EXTENT }, "z"],
    ];
    for (const [end, name] of axisEnds) {
      scene.add(makeAxis(end, COLORS3.axis));
      const lbl = makeLabel(name, COLORS3.axisLabel, 0.7);
      lbl.position.copy(toV(end)).multiplyScalar(1.09);
      scene.add(lbl);
    }

    // Everything matrix/vector-dependent lives in one group that `sync`
    // rebuilds whenever the props change. The scene is tiny, so a full
    // rebuild is simpler and plenty fast.
    const dynamic = new THREE.Group();
    scene.add(dynamic);

    // Viewport size in CSS pixels — LineMaterial needs it to size fat lines.
    const viewSize = new THREE.Vector2(1, 1);

    function sync() {
      disposeDeep(dynamic);
      dynamic.clear();
      const M = warpRef.current;

      if (activeRef.current) {
        // Warped lattice. A linear map keeps lines straight, so each lattice
        // line is just a segment between its two warped endpoints. Rendered
        // with LineSegments2 so the lines have a real pixel width.
        const L = 4;
        const latticePos: number[] = [];
        const seg = (a: Vec3, b: Vec3) => {
          const wa = apply3(M, a);
          const wb = apply3(M, b);
          latticePos.push(wa.x, wa.y, wa.z, wb.x, wb.y, wb.z);
        };
        for (let a = -L; a <= L; a++)
          for (let b = -L; b <= L; b++) {
            seg({ x: -L, y: a, z: b }, { x: L, y: a, z: b });
            seg({ x: a, y: -L, z: b }, { x: a, y: L, z: b });
            seg({ x: a, y: b, z: -L }, { x: a, y: b, z: L });
          }
        const latticeGeom = new LineSegmentsGeometry();
        latticeGeom.setPositions(latticePos);
        const latticeMat = new LineMaterial({
          color: COLORS3.lattice,
          transparent: true,
          opacity: 0.6,
          linewidth: 1.2, // px
        });
        latticeMat.resolution.copy(viewSize);
        dynamic.add(new LineSegments2(latticeGeom, latticeMat));

        // Warped unit cube (the parallelepiped whose volume is |det|).
        const corners: THREE.Vector3[] = [];
        for (let i = 0; i < 8; i++)
          corners.push(
            toV(apply3(M, { x: i & 1, y: (i >> 1) & 1, z: (i >> 2) & 1 })),
          );
        const faceIdx = [
          [0, 1, 3, 2], // z = 0
          [4, 6, 7, 5], // z = 1
          [0, 4, 5, 1], // y = 0
          [2, 3, 7, 6], // y = 1
          [0, 2, 6, 4], // x = 0
          [1, 5, 7, 3], // x = 1
        ];
        const positions: number[] = [];
        for (const [a, b, c, d] of faceIdx) {
          for (const i of [a, b, c, a, c, d]) {
            positions.push(corners[i].x, corners[i].y, corners[i].z);
          }
        }
        const cubeGeom = new THREE.BufferGeometry();
        cubeGeom.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        const cube = new THREE.Mesh(
          cubeGeom,
          new THREE.MeshBasicMaterial({
            color: COLORS3.cube,
            transparent: true,
            opacity: 0.16,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        dynamic.add(cube);

        const edgeIdx = [
          [0, 1], [2, 3], [4, 5], [6, 7], // along x
          [0, 2], [1, 3], [4, 6], [5, 7], // along y
          [0, 4], [1, 5], [2, 6], [3, 7], // along z
        ];
        const edgePts = edgeIdx.flatMap(([a, b]) => [corners[a], corners[b]]);
        const edges = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(edgePts),
          new THREE.LineBasicMaterial({
            color: COLORS3.cube,
            transparent: true,
            opacity: 0.55,
          }),
        );
        dynamic.add(edges);

        // Basis vectors land on the matrix columns.
        dynamic.add(makeArrow(col3(M, 0), COLORS3.iHat));
        dynamic.add(makeArrow(col3(M, 1), COLORS3.jHat));
        dynamic.add(makeArrow(col3(M, 2), COLORS3.kHat));
      }

      for (const d of drawablesRef.current) {
        const tip = d.ride ? apply3(M, d.vec) : d.vec;
        if (Math.hypot(tip.x, tip.y, tip.z) < 1e-9) continue;
        dynamic.add(makeArrow(tip, d.color));
        if (d.label) {
          const lbl = makeLabel(d.label, d.color);
          lbl.position.copy(toV(tip)).addScalar(0.001);
          lbl.center.set(-0.15, -0.2); // offset past the arrow tip
          dynamic.add(lbl);
        }
      }
    }
    syncRef.current = sync;
    sync();

    function resize() {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // hidden pane
      renderer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      viewSize.set(rect.width, rect.height);
      sync(); // rebuild so the lattice material picks up the new resolution
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposeDeep(scene);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    syncRef.current();
  }, [warp, drawables, showActiveMatrix]);

  return <div ref={containerRef} className="warp-canvas3d" />;
}
