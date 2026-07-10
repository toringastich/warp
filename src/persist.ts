/**
 * Serializing the sandbox to a shareable URL hash and localStorage — no
 * backend. The whole app state (both documents + mode) round-trips through
 * a compact base64url-encoded JSON blob:
 *
 *   https://…/#s=<blob>
 *
 * The URL always mirrors the current state (via history.replaceState), so
 * copying the address bar is sharing; localStorage keeps the last state for
 * the next visit. Loading prefers the URL hash over localStorage.
 */
import { newId, type Mode, type Row, type RowId } from "./rows";

export interface Doc {
  rows: Row[];
  active: RowId | null;
}

export const LS_KEY = "warp:state";

// Compact wire format: one-letter kinds and keys keep URLs short.
type SavedRow =
  | { k: "m"; n: string; c: string[] }
  | { k: "v"; n: string; c: string[]; sh: boolean }
  | { k: "e"; s: string; sh: boolean; mn?: string; mx?: string };
interface SavedDoc {
  rows: SavedRow[];
  active: number | null; // index into rows
}
interface SavedState {
  v: 1;
  mode: Mode;
  d2: SavedDoc;
  d3: SavedDoc;
}

// --- base64url that survives unicode (·, ×, superscripts in sources) ------

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64decode(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// --- Doc <-> wire format ----------------------------------------------------

function docToSaved(doc: Doc): SavedDoc {
  const rows: SavedRow[] = doc.rows.map((r) => {
    if (r.kind === "matrix") return { k: "m", n: r.name, c: [...r.cells] };
    if (r.kind === "vector")
      return { k: "v", n: r.name, c: [...r.cells], sh: r.shown };
    return {
      k: "e",
      s: r.src,
      sh: r.shown,
      ...(r.sliderMin !== undefined ? { mn: r.sliderMin } : {}),
      ...(r.sliderMax !== undefined ? { mx: r.sliderMax } : {}),
    };
  });
  const active =
    doc.active === null
      ? null
      : doc.rows.findIndex((r) => r.id === doc.active);
  return { rows, active: active === -1 ? null : active };
}

function savedToDoc(saved: SavedDoc): Doc {
  const rows: Row[] = [];
  for (const r of saved.rows) {
    const id = newId();
    if (r.k === "m" && Array.isArray(r.c)) {
      rows.push({ id, kind: "matrix", name: String(r.n ?? "M"), cells: r.c.map(String) });
    } else if (r.k === "v" && Array.isArray(r.c)) {
      rows.push({
        id,
        kind: "vector",
        name: String(r.n ?? "v"),
        cells: r.c.map(String),
        shown: r.sh !== false,
      });
    } else if (r.k === "e") {
      rows.push({
        id,
        kind: "expr",
        src: String(r.s ?? ""),
        shown: r.sh !== false,
        ...(r.mn !== undefined ? { sliderMin: String(r.mn) } : {}),
        ...(r.mx !== undefined ? { sliderMax: String(r.mx) } : {}),
      });
    }
  }
  const active =
    saved.active !== null && saved.active >= 0 && saved.active < rows.length
      ? rows[saved.active].id
      : null;
  return { rows, active };
}

export function emptyDoc(): Doc {
  return {
    rows: [{ id: newId(), kind: "expr", src: "", shown: true }],
    active: null,
  };
}

// --- Public API -------------------------------------------------------------

export function encodeState(mode: Mode, d2: Doc, d3: Doc): string {
  const state: SavedState = {
    v: 1,
    mode,
    d2: docToSaved(d2),
    d3: docToSaved(d3),
  };
  return b64encode(JSON.stringify(state));
}

export function decodeState(
  enc: string,
): { mode: Mode; d2: Doc; d3: Doc } | null {
  try {
    const s = JSON.parse(b64decode(enc)) as SavedState;
    if (s.v !== 1 || !Array.isArray(s.d2?.rows) || !Array.isArray(s.d3?.rows))
      return null;
    return {
      mode: s.mode === "3d" ? "3d" : "2d",
      d2: savedToDoc(s.d2),
      d3: savedToDoc(s.d3),
    };
  } catch {
    return null;
  }
}

/** Initial app state: URL hash first, then localStorage, then blank docs. */
export function loadInitialState(): { mode: Mode; d2: Doc; d3: Doc } {
  if (window.location.hash.startsWith("#s=")) {
    const fromHash = decodeState(window.location.hash.slice(3));
    if (fromHash) return fromHash;
  }
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const fromStore = decodeState(stored);
      if (fromStore) return fromStore;
    }
  } catch {
    // storage unavailable (private mode etc.)
  }
  return { mode: "2d", d2: emptyDoc(), d3: emptyDoc() };
}
