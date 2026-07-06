import { useEffect, useRef } from "react";
import {
  apply,
  det,
  iHat,
  inverse,
  jHat,
  type Mat2,
  type Vec2,
} from "../lib/matrix";

interface View {
  cx: number; // world coordinate at canvas center
  cy: number;
  scale: number; // pixels per world unit
}

export interface VectorDrawable {
  kind: "vector";
  vec: Vec2;
  color: string;
  ride: boolean; // apply the warp (defined vectors) vs. fixed (computed results)
  label?: string;
}
export interface SumDrawable {
  kind: "sum";
  parts: Vec2[]; // head-to-tail components (already signed)
  result: Vec2;
  color: string;
  ride: boolean;
  label?: string;
}
export type Drawable = VectorDrawable | SumDrawable;

const COLORS = {
  bg: "#ffffff",
  grid: "#d3d8e0",
  axis: "#3c4350",
  label: "#7a828f",
  square: "rgba(120, 160, 90, 0.16)",
  iHat: "#2d70b3", // blue  — first column
  jHat: "#388c46", // green — second column
};

function niceStep(scale: number, targetPx = 84): number {
  const target = targetPx / scale;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const f = target / pow;
  const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nice * pow;
}

function formatTick(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
}

interface Props {
  /** The ambient warp applied to the grid and ride-along vectors. */
  warp: Mat2;
  /** Draw the basis vectors + unit parallelogram for the active matrix. */
  showActiveMatrix: boolean;
  drawables: Drawable[];
}

export default function TransformCanvas({
  warp,
  showActiveMatrix,
  drawables,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ cx: 0, cy: 0, scale: 80 });
  const warpRef = useRef<Mat2>(warp);
  const drawablesRef = useRef<Drawable[]>(drawables);
  const activeRef = useRef<boolean>(showActiveMatrix);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  warpRef.current = warp;
  drawablesRef.current = drawables;
  activeRef.current = showActiveMatrix;

  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    function toScreen(world: Vec2): Vec2 {
      const { cx, cy, scale } = viewRef.current;
      const { w, h } = sizeRef.current;
      return {
        x: w / 2 + (world.x - cx) * scale,
        y: h / 2 - (world.y - cy) * scale,
      };
    }

    function toWorld(sx: number, sy: number): Vec2 {
      const { cx, cy, scale } = viewRef.current;
      const { w, h } = sizeRef.current;
      return {
        x: cx + (sx - w / 2) / scale,
        y: cy - (sy - h / 2) / scale,
      };
    }

    function arrow(
      from: Vec2,
      to: Vec2,
      color: string,
      opts: { width?: number; dash?: boolean; alpha?: number } = {},
    ) {
      const a = toScreen(from);
      const b = toScreen(to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      ctx.save();
      ctx.globalAlpha = opts.alpha ?? 1;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = opts.width ?? 3;
      ctx.lineCap = "round";
      ctx.setLineDash(opts.dash ? [5, 5] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (len >= 1) {
        const ux = dx / len;
        const uy = dy / len;
        const head = Math.min(14, len * 0.5);
        const wing = head * 0.55;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - ux * head - uy * wing, b.y - uy * head + ux * wing);
        ctx.lineTo(b.x - ux * head + uy * wing, b.y - uy * head - ux * wing);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    function label(at: Vec2, text: string, color: string) {
      const s = toScreen(at);
      ctx.save();
      ctx.fillStyle = color;
      ctx.font =
        "600 13px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(text, s.x + 6, s.y - 6);
      ctx.restore();
    }

    function draw() {
      const { w, h } = sizeRef.current;
      const M = warpRef.current;
      const view = viewRef.current;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, w, h);

      const step = niceStep(view.scale);

      const tl = toWorld(0, 0);
      const br = toWorld(w, h);
      const visMinX = Math.min(tl.x, br.x);
      const visMaxX = Math.max(tl.x, br.x);
      const visMinY = Math.min(tl.y, br.y);
      const visMaxY = Math.max(tl.y, br.y);

      // Grid-line range (bounded; see fade note below for near-singular case).
      const MAX_SPAN = 400;
      const inv = inverse(M);
      let kxMin = -MAX_SPAN;
      let kxMax = MAX_SPAN;
      let kyMin = -MAX_SPAN;
      let kyMax = MAX_SPAN;
      if (inv) {
        const corners = [
          apply(inv, { x: visMinX, y: visMinY }),
          apply(inv, { x: visMaxX, y: visMinY }),
          apply(inv, { x: visMinX, y: visMaxY }),
          apply(inv, { x: visMaxX, y: visMaxY }),
        ];
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        const rx0 = Math.floor(Math.min(...xs) / step) - 1;
        const rx1 = Math.ceil(Math.max(...xs) / step) + 1;
        const ry0 = Math.floor(Math.min(...ys) / step) - 1;
        const ry1 = Math.ceil(Math.max(...ys) / step) + 1;
        const sane =
          [rx0, rx1, ry0, ry1].every(Number.isFinite) &&
          rx1 - rx0 <= 2 * MAX_SPAN &&
          ry1 - ry0 <= 2 * MAX_SPAN;
        if (sane) {
          kxMin = rx0;
          kxMax = rx1;
          kyMin = ry0;
          kyMax = ry1;
        }
      }

      // Fade each grid-line family out as its lines crowd together (|det| -> 0),
      // so the collapse stays clean with no smear or frame-time spike.
      const detAbs = Math.abs(det(M));
      const lenI = Math.hypot(M[0], M[2]);
      const lenJ = Math.hypot(M[1], M[3]);
      const spacingV = lenJ > 1e-9 ? (detAbs / lenJ) * step * view.scale : 0;
      const spacingH = lenI > 1e-9 ? (detAbs / lenI) * step * view.scale : 0;
      const FADE_LO = 5;
      const FADE_HI = 18;
      const fade = (s: number) =>
        Math.max(0, Math.min(1, (s - FADE_LO) / (FADE_HI - FADE_LO)));
      const alphaV = fade(spacingV);
      const alphaH = fade(spacingH);

      ctx.lineWidth = 1;
      ctx.strokeStyle = COLORS.grid;
      if (alphaV > 0.003) {
        ctx.globalAlpha = alphaV;
        for (let k = kxMin; k <= kxMax; k++) {
          const x = k * step;
          const s1 = toScreen(apply(M, { x, y: kyMin * step }));
          const s2 = toScreen(apply(M, { x, y: kyMax * step }));
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
        }
      }
      if (alphaH > 0.003) {
        ctx.globalAlpha = alphaH;
        for (let k = kyMin; k <= kyMax; k++) {
          const y = k * step;
          const s1 = toScreen(apply(M, { x: kxMin * step, y }));
          const s2 = toScreen(apply(M, { x: kxMax * step, y }));
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Unit square -> parallelogram for the active matrix.
      if (activeRef.current) {
        const o = toScreen(apply(M, { x: 0, y: 0 }));
        const pi = toScreen(apply(M, { x: 1, y: 0 }));
        const pij = toScreen(apply(M, { x: 1, y: 1 }));
        const pj = toScreen(apply(M, { x: 0, y: 1 }));
        ctx.fillStyle = COLORS.square;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(pi.x, pi.y);
        ctx.lineTo(pij.x, pij.y);
        ctx.lineTo(pj.x, pj.y);
        ctx.closePath();
        ctx.fill();
      }

      // Fixed reference axes + labels.
      const origin = toScreen({ x: 0, y: 0 });
      ctx.strokeStyle = COLORS.axis;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(w, origin.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(origin.x, 0);
      ctx.lineTo(origin.x, h);
      ctx.stroke();

      ctx.fillStyle = COLORS.label;
      ctx.font =
        "12px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
      const labelClampY = Math.min(Math.max(origin.y, 14), h - 6);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let x = Math.ceil(visMinX / step) * step; x <= visMaxX; x += step) {
        if (Math.abs(x) < step / 2) continue;
        const s = toScreen({ x, y: 0 });
        ctx.fillText(formatTick(x), s.x, labelClampY + 5);
      }
      const labelClampX = Math.min(Math.max(origin.x, 10), w - 10);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let y = Math.ceil(visMinY / step) * step; y <= visMaxY; y += step) {
        if (Math.abs(y) < step / 2) continue;
        const s = toScreen({ x: 0, y });
        ctx.fillText(formatTick(y), labelClampX - 8, s.y);
      }

      // Basis vectors for the active matrix.
      if (activeRef.current) {
        const zero = { x: 0, y: 0 };
        arrow(zero, jHat(M), COLORS.jHat);
        arrow(zero, iHat(M), COLORS.iHat);
      }

      // User drawables.
      const xf = (v: Vec2, ride: boolean) => (ride ? apply(M, v) : v);
      const zero = { x: 0, y: 0 };
      for (const d of drawablesRef.current) {
        if (d.kind === "vector") {
          if (d.vec.x === 0 && d.vec.y === 0) continue;
          const tip = xf(d.vec, d.ride);
          arrow(zero, tip, d.color, { width: 3 });
          if (d.label) label(tip, d.label, d.color);
        } else {
          // head-to-tail components, then the resultant
          let cursor: Vec2 = { x: 0, y: 0 };
          for (const part of d.parts) {
            const start = xf(cursor, d.ride);
            cursor = { x: cursor.x + part.x, y: cursor.y + part.y };
            const end = xf(cursor, d.ride);
            arrow(start, end, d.color, { width: 2, alpha: 0.45, dash: true });
          }
          const tip = xf(d.result, d.ride);
          arrow(zero, tip, d.color, { width: 3 });
          if (d.label) label(tip, d.label, d.color);
        }
      }
    }

    drawRef.current = draw;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    function onPointerDown(e: PointerEvent) {
      dragRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    }
    function onPointerMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const { scale } = viewRef.current;
      viewRef.current.cx -= (e.clientX - d.x) / scale;
      viewRef.current.cy += (e.clientY - d.y) / scale;
      dragRef.current = { x: e.clientX, y: e.clientY };
      draw();
    }
    function onPointerUp(e: PointerEvent) {
      dragRef.current = null;
      canvas.releasePointerCapture(e.pointerId);
      canvas.style.cursor = "grab";
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const before = toWorld(sx, sy);
      const factor = Math.exp(-e.deltaY * 0.0015);
      viewRef.current.scale = Math.min(
        4000,
        Math.max(8, viewRef.current.scale * factor),
      );
      const after = toWorld(sx, sy);
      viewRef.current.cx += before.x - after.x;
      viewRef.current.cy += before.y - after.y;
      draw();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.style.cursor = "grab";

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    drawRef.current();
  }, [warp, drawables, showActiveMatrix]);

  return <canvas ref={canvasRef} className="warp-canvas" />;
}
