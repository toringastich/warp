/**
 * Drag handle between the expression list and the stage. It writes the shared
 * --sidebar-w CSS variable on the document root, so both the 2D and 3D panes
 * stay the same width, and remembers the choice in localStorage. Pointer
 * events cover mouse and touch alike.
 */

const MIN_W = 200;
const MAX_FRACTION = 0.85;
const LS_KEY = "warp:sidebar-w";

// Restore the last dragged width once, at module load.
try {
  const saved = localStorage.getItem(LS_KEY);
  if (saved && /^\d+(\.\d+)?px$/.test(saved))
    document.documentElement.style.setProperty("--sidebar-w", saved);
} catch {
  // storage unavailable
}

export default function SidebarResizer() {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    const move = (ev: PointerEvent) => {
      const w = Math.min(
        Math.max(ev.clientX, MIN_W),
        window.innerWidth * MAX_FRACTION,
      );
      document.documentElement.style.setProperty("--sidebar-w", `${w}px`);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.classList.remove("dragging");
      try {
        const w = document.documentElement.style.getPropertyValue("--sidebar-w");
        if (w) localStorage.setItem(LS_KEY, w);
      } catch {
        // storage unavailable
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <div
      className="sidebar-resizer"
      title="Drag to resize"
      onPointerDown={onPointerDown}
    />
  );
}
