import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * A "ghost" onboarding tour: dims the app, spotlights one piece of UI per
 * step, and explains it in a small card. Steps target elements by selector;
 * a step whose target isn't in the visible pane is skipped, so the same tour
 * works whether or not the demo scene is present.
 */
interface TourStep {
  /** CSS selector for the element to spotlight; omitted = centered card. */
  target?: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to Warp",
    body:
      "Warp shows what a matrix does to space. Type a matrix and the whole " +
      "plane transforms — the way 3Blue1Brown draws it, but live. Here's a " +
      "60-second tour of the essentials.",
  },
  {
    target: '[data-tour-kind="matrix"]',
    title: "A matrix warps space",
    body:
      "Edit any entry of this 2×2 matrix and the grid re-warps instantly. " +
      "The blue and green arrows are the basis vectors î and ĵ — they " +
      "always land on the matrix's columns.",
  },
  {
    target: '[data-tour="anim"]',
    title: "Animate it",
    body:
      "Play sweeps from the untouched grid to the warped one (or scrub the " +
      "slider). The shaded unit square becomes a parallelogram whose area " +
      "is |det| — this shear keeps the area at exactly 1.",
  },
  {
    target: '[data-tour="toggle"]',
    title: "Show and hide",
    body:
      "Each dot toggles its object on the graph, Desmos-style. Matrices " +
      "share one warp slot — turning one on turns the others off.",
  },
  {
    target: '[data-tour-kind="expr"]',
    title: "Compute anything",
    body:
      "Expression rows speak linear algebra: M·v, det(M), eigen(M), " +
      "inv(M), proj(v, w)… Results update live, and naming one — " +
      "u = M·v — lets every other row use it. The ⚙ menu inserts any " +
      "function.",
  },
  {
    target: '[data-tour="add"]',
    title: "Build your scene",
    body:
      "Add matrices, vectors, expressions, and sliders here. A slider like " +
      "a = 1.5 animates everything that uses it as you drag.",
  },
  {
    target: '[data-tour="mode"]',
    title: "Go 3D",
    body:
      "The same sandbox, one dimension up: 3×3 matrices warp the unit cube " +
      "into the parallelepiped whose volume is |det|. Drag to orbit, " +
      "scroll to zoom.",
  },
  {
    target: '[data-tour="share"]',
    title: "Share and undo",
    body:
      "Your whole scene lives in the URL — this button copies a link that " +
      "recreates it exactly, and ⌘Z undoes any step. Rerun this tour with " +
      "the Tutorial button (top right of the graph); Feedback, right above " +
      "it, comes straight to us. Warp away!",
  },
];

const PAD = 6; // spotlight breathing room around the target
const CARD_W = 300;

/** Both mode panes stay mounted, so pick the match that's actually shown. */
function findVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export default function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dir = useRef(1); // which way to skip past a missing target

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const go = (d: number) => {
    dir.current = d;
    const next = i + d;
    if (next >= STEPS.length) onClose();
    else if (next >= 0) setI(next);
  };

  // Measure the target; skip steps whose target isn't on screen.
  useEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    const el = findVisible(step.target);
    if (!el) {
      const next = i + dir.current;
      if (next < 0 || next >= STEPS.length) onClose();
      else setI(next);
      return;
    }
    el.scrollIntoView({ block: "nearest" });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const spot: CSSProperties = rect
    ? {
        left: rect.left - PAD,
        top: rect.top - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : { left: "50%", top: "50%", width: 0, height: 0 };

  const card: CSSProperties = (() => {
    if (!rect)
      return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right + PAD + 14;
    if (left + CARD_W > vw - 8) left = Math.max(8, rect.left - PAD - 14 - CARD_W);
    const top = Math.min(Math.max(8, rect.top - PAD), vh - 230);
    return { left, top };
  })();

  return (
    <div className="tour">
      <div className="tour-blocker" />
      <div className="tour-spotlight" style={spot} />
      <div className="tour-card" style={card}>
        <button className="tour-close" title="Skip the tour" onClick={onClose}>
          ×
        </button>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-nav">
          <span className="tour-count">
            {i + 1} / {STEPS.length}
          </span>
          {i > 0 && (
            <button className="tour-btn ghost" onClick={() => go(-1)}>
              Back
            </button>
          )}
          <button className="tour-btn primary" onClick={() => go(1)}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
