"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import sections from "@/data/insurance-sections.json";
import type { Cell, InsuranceModel, Status, TreeNode } from "@/lib/insurance/model";
import { PATHS } from "./icons";

// ============================================================================
// PosterMap: the Fynma EvolutionMap, re-used for family cover.
//
// Each cover is a line-art glyph with a bold name and a quiet caption. Depth runs
// left to right ("builds on"), and covers are grouped into horizontal territories.
// A territory folds to a single cluster node by its header tab. The canvas pans by
// dragging, zooms with the wheel, nodes can be dragged, and a click traces a node's
// neighbourhood. Double-click zooms the camera in on a cover.
// ============================================================================

const NODE_W = 150;
const GLYPH_H = 52;
const NODE_H = 104;
const ANCHOR_Y = GLYPH_H / 2;
const COL_GAP = 84;
const ROW_GAP = 30;
const BAND_GAP = 72;
const FRAME_PAD = 18;
const TAB_H = 22;
const PAD = 64;

const GROUP_PREFIX = "group:";
const isGroupId = (id: string) => id.startsWith(GROUP_PREFIX);

const STATUS_LABEL: Record<Status, string> = {
  covered: "Covered",
  shared: "Covered via family",
  gap: "Gap",
  upcoming: "Needed soon",
  na: "Not relevant",
};
const STATUS_COLOR: Record<Status, string> = {
  covered: "var(--ok)",
  shared: "var(--via)",
  gap: "var(--gap)",
  upcoming: "var(--soon)",
  na: "var(--muted)",
};
const isSolid = (s: Status) => s === "covered" || s === "shared";

function nodeState(cells: Cell[]): Status {
  const live = cells.filter((c) => c.status !== "na");
  if (live.length === 0) return "na";
  if (live.some((c) => c.status === "gap")) return "gap";
  if (live.some((c) => c.status === "upcoming")) return "upcoming";
  return live.every((c) => c.status === "shared") ? "shared" : "covered";
}

interface DisplayNode {
  id: string;
  section: string;
  order: number;
  cover?: TreeNode;
  group?: { title: string; count: number; gaps: number };
}
interface DisplayEdge {
  id: string;
  ds: string;
  dt: string;
}
interface PositionedNode extends DisplayNode {
  x: number;
  y: number;
}

const sectionOfCover = new Map<string, string>();
for (const s of sections) for (const c of s.covers) sectionOfCover.set(c, s.id);
const sectionTitle = (id: string) => sections.find((s) => s.id === id)?.title ?? id;

function borderPoint(n: { x: number; y: number }, tx: number, ty: number) {
  const cx = n.x + NODE_W / 2;
  const cy = n.y + NODE_H / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? NODE_W / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? NODE_H / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/** Collapsed territories become one cluster node; edges inside them drop, edges across them reroute. */
function buildDisplay(covers: TreeNode[], cellsOf: (n: TreeNode) => Cell[], collapsed: Set<string>) {
  const nodes: DisplayNode[] = [];
  const order = new Map(covers.map((c, i) => [c.id, i]));
  for (const s of sections) {
    const members = covers.filter((c) => sectionOfCover.get(c.id) === s.id);
    if (members.length === 0) continue;
    if (collapsed.has(s.id)) {
      const gaps = members.reduce((n, m) => n + cellsOf(m).filter((c) => c.status === "gap" || c.status === "upcoming").length, 0);
      nodes.push({ id: `${GROUP_PREFIX}${s.id}`, section: s.id, order: order.get(members[0].id) ?? 0, group: { title: s.title, count: members.length, gaps } });
    } else {
      for (const m of members) nodes.push({ id: m.id, section: s.id, order: order.get(m.id) ?? 0, cover: m });
    }
  }
  const mapId = (id: string) => {
    const s = sectionOfCover.get(id);
    return s && collapsed.has(s) ? `${GROUP_PREFIX}${s}` : id;
  };
  const seen = new Set<string>();
  const edges: DisplayEdge[] = [];
  for (const c of covers)
    for (const p of c.parents) {
      const ds = mapId(p);
      const dt = mapId(c.id);
      const key = `${ds}>${dt}`;
      if (ds === dt || seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: key, ds, dt });
    }
  return { nodes, edges };
}

/** Section-banded layout: x is depth (what builds on what), y stacks territories into bands. */
function layout(items: DisplayNode[], edges: DisplayEdge[]): PositionedNode[] {
  if (items.length === 0) return [];
  const ids = items.map((c) => c.id);
  const idSet = new Set(ids);
  const valid = edges.filter((e) => idSet.has(e.ds) && idSet.has(e.dt));
  const adj = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const e of valid) {
    adj.get(e.ds)?.add(e.dt);
    adj.get(e.dt)?.add(e.ds);
  }
  // Depth: a cover sits one column right of what it builds on (edges run parent → child, so ds = parent).
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  for (let it = 0; it < ids.length * 2; it++) {
    let changed = false;
    for (const e of valid) {
      const cand = (layer.get(e.ds) ?? 0) + 1;
      if (cand > (layer.get(e.dt) ?? 0)) {
        layer.set(e.dt, cand);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const secOrder = sections.map((s) => s.id).filter((id) => items.some((i) => i.section === id));
  const LX = NODE_W + COL_GAP;
  const LY = NODE_H + ROW_GAP;
  const rank = new Map<string, number>();
  [...items].sort((a, b) => a.order - b.order).forEach((c, i) => rank.set(c.id, i));
  const bary = (id: string) => {
    const ns = [...(adj.get(id) ?? [])].filter((n) => rank.has(n));
    if (!ns.length) return rank.get(id) ?? 0;
    return ns.reduce((s, n) => s + (rank.get(n) ?? 0), 0) / ns.length;
  };

  const nodes: PositionedNode[] = [];
  // Territories are arranged in poster columns; each column stacks its territories as bands.
  const columns = [...new Set(sections.map((x) => x.column))].sort((a, b) => a - b);
  let columnLeft = PAD;
  for (const column of columns) {
    let bandTop = PAD;
    let widest = 0;
    for (const sec of secOrder.filter((id) => sections.find((x) => x.id === id)?.column === column)) {
      const cols = new Map<number, DisplayNode[]>();
      for (const it of items.filter((i) => i.section === sec)) {
        const L = layer.get(it.id) ?? 0;
        cols.set(L, [...(cols.get(L) ?? []), it]);
      }
      let colMax = 1;
      for (const col of cols.values()) {
        col.sort((a, b) => bary(a.id) - bary(b.id) || a.order - b.order);
        colMax = Math.max(colMax, col.length);
      }
      const bandH = colMax * LY - ROW_GAP;
      for (const [L, col] of cols) {
        const topOffset = ((colMax - col.length) / 2) * LY;
        col.forEach((it, i) => nodes.push({ ...it, x: columnLeft + L * LX, y: bandTop + topOffset + i * LY }));
        widest = Math.max(widest, (L + 1) * LX - COL_GAP);
      }
      bandTop += bandH + BAND_GAP;
    }
    columnLeft += widest + BAND_GAP + FRAME_PAD;
  }
  const minY = Math.min(...nodes.map((n) => n.y));
  for (const n of nodes) n.y += PAD - minY;
  return nodes;
}

interface SectionFrame {
  section: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
type NodeVisual = "idle" | "selected" | "neighbor" | "dimmed";

export interface PosterMapProps {
  model: InsuranceModel;
  scope: string;
  proposal: string[];
  onToggleProposal: (id: string) => void;
  /** Ask the map to select and zoom to a cover (n changes so the same id can be asked twice). */
  focusRequest: { id: string; n: number } | null;
}

export function PosterMap({ model, scope, proposal, onToggleProposal, focusRequest }: PosterMapProps) {
  const covers = model.nodes;
  const nameOf = useMemo(() => new Map(model.people.map((p) => [p.id, p.name])), [model.people]);
  const inScope = useCallback((cells: Cell[]) => (scope === "all" ? cells : cells.filter((c) => c.personId === scope)), [scope]);
  const cellsOf = useCallback((n: TreeNode) => inScope(n.cells), [inScope]);

  const [cardMode, setCardMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sectionList = useMemo(() => sections.map((s) => s.id), []);
  const toggleSection = useCallback((s: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const { nodes: displayNodes, edges: displayEdges } = useMemo(() => buildDisplay(covers, cellsOf, collapsed), [covers, cellsOf, collapsed]);
  const baseNodes = useMemo(() => layout(displayNodes, displayEdges), [displayNodes, displayEdges]);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const nodes = useMemo(
    () =>
      baseNodes.map((n) => {
        const o = positions.get(n.id);
        return o ? { ...n, x: o.x, y: o.y } : n;
      }),
    [baseNodes, positions],
  );

  const frames = useMemo<SectionFrame[]>(() => {
    const out: SectionFrame[] = [];
    for (const sec of sectionList) {
      if (collapsed.has(sec)) continue;
      const members = nodes.filter((n) => n.section === sec && n.cover);
      if (members.length === 0) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const m of members) {
        minX = Math.min(minX, m.x);
        minY = Math.min(minY, m.y);
        maxX = Math.max(maxX, m.x + NODE_W);
        maxY = Math.max(maxY, m.y + NODE_H);
      }
      out.push({ section: sec, title: sectionTitle(sec), x: minX - FRAME_PAD, y: minY - FRAME_PAD, w: maxX - minX + FRAME_PAD * 2, h: maxY - minY + FRAME_PAD * 2 });
    }
    return out;
  }, [nodes, sectionList, collapsed]);

  const bounds = useMemo(() => {
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + NODE_H);
    }
    return { minX: minX - FRAME_PAD, minY: minY - FRAME_PAD - TAB_H, maxX: maxX + FRAME_PAD, maxY: maxY + FRAME_PAD };
  }, [nodes]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const posById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const posRef = useRef(posById);
  posRef.current = posById;

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of displayEdges) {
      if (!m.has(e.ds)) m.set(e.ds, new Set());
      if (!m.has(e.dt)) m.set(e.dt, new Set());
      m.get(e.ds)?.add(e.dt);
      m.get(e.dt)?.add(e.ds);
    }
    return m;
  }, [displayEdges]);

  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const surfaceRef = useRef<SVGSVGElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const nodeDragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const animRef = useRef<number | null>(null);
  // Once someone has panned or zoomed, a resize must not yank the camera back.
  const movedRef = useRef(false);

  const stopAnim = () => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  };
  const animateTo = useCallback((to: { x: number; y: number; k: number }) => {
    stopAnim();
    const from = viewRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 420);
      const e = 1 - Math.pow(1 - t, 3);
      setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e });
      animRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    animRef.current = requestAnimationFrame(step);
  }, []);

  const fit = useCallback(
    (animate = false) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      const b = boundsRef.current;
      const cw = b.maxX - b.minX;
      const ch = b.maxY - b.minY;
      if (!rect || !rect.width || cw <= 0 || ch <= 0) {
        setView({ x: 0, y: 0, k: 1 });
        return;
      }
      const pad = 36;
      const k = Math.max(0.2, Math.min((rect.width - pad * 2) / cw, (rect.height - pad * 2) / ch, 1.4));
      const to = { x: (rect.width - cw * k) / 2 - b.minX * k, y: (rect.height - ch * k) / 2 - b.minY * k, k };
      if (animate) animateTo(to);
      else {
        stopAnim();
        setView(to);
      }
    },
    [animateTo],
  );

  const zoomTo = useCallback(
    (id: string) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      const n = posRef.current.get(id);
      if (!rect || !n) return;
      const k = 1.35;
      // Leave room on the right for the detail panel.
      const cx = Math.max(rect.width * 0.36, rect.width / 2 - 160);
      animateTo({ x: cx - (n.x + NODE_W / 2) * k, y: rect.height / 2 - (n.y + NODE_H / 2) * k, k });
    },
    [animateTo],
  );

  const [isFull, setIsFull] = useState(false);
  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  }, []);
  useEffect(() => {
    const onFs = () => {
      setIsFull(!!document.fullscreenElement);
      requestAnimationFrame(() => fit());
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [fit]);

  // Refit when the set of nodes changes (folding). Scope changes keep the camera where it is.
  useEffect(() => {
    movedRef.current = false;
    const id = requestAnimationFrame(() => fit(true));
    return () => cancelAnimationFrame(id);
  }, [fit, collapsed]);

  // The canvas can be measured before it has a size (or resized later): refit until the reader takes over.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!movedRef.current) fit(false);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  // Wheel needs a non-passive listener to stop the page scrolling under it.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      movedRef.current = true;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const k = Math.min(2.5, Math.max(0.25, v.k * factor));
        return { x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k, k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Stories (and anything else outside) can ask for a cover to be selected and zoomed to.
  useEffect(() => {
    if (!focusRequest) return;
    const id = focusRequest.id;
    const sec = sectionOfCover.get(id);
    if (sec && collapsed.has(sec)) toggleSection(sec);
    setSelected(id);
    const t = setTimeout(() => zoomTo(id), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if (target.closest("[data-map-node]") || target.closest("[data-map-tab]")) return;
    stopAnim();
    movedRef.current = true;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.origX + e.clientX - d.startX, y: d.origY + e.clientY - d.startY }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onNodeDown = (e: React.PointerEvent<SVGGElement>, id: string, x: number, y: number) => {
    e.stopPropagation();
    stopAnim();
    nodeDragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: x, origY: y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onNodeMove = (e: React.PointerEvent<SVGGElement>) => {
    const d = nodeDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    const k = viewRef.current.k || 1;
    setPositions((prev) => new Map(prev).set(d.id, { x: d.origX + dx / k, y: d.origY + dy / k }));
  };
  const onNodeUp = (e: React.PointerEvent<SVGGElement>) => {
    const d = nodeDragRef.current;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (d && !d.moved) {
      if (isGroupId(d.id)) toggleSection(d.id.slice(GROUP_PREFIX.length));
      else setSelected((cur) => (cur === d.id ? null : d.id));
    }
    nodeDragRef.current = null;
  };

  const visualOf = (id: string): NodeVisual => {
    if (!selected) return "idle";
    if (id === selected) return "selected";
    if (neighbors.get(selected)?.has(id)) return "neighbor";
    return "dimmed";
  };

  const selectedCover = selected && !isGroupId(selected) ? covers.find((c) => c.id === selected) : undefined;
  const allFolded = collapsed.size === sectionList.length;

  return (
    <div ref={rootRef} className="pm" data-testid="poster-map">
      <div className="pm-strip">
      <ul className="pm-legend" aria-label="Legend">
        <li><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--ok)" strokeWidth="1.75" /></svg> builds on cover you have</li>
        <li><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--muted)" strokeWidth="1.25" strokeDasharray="4 4" /></svg> builds on a gap</li>
        <li><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--gap)" strokeWidth="1.4" strokeDasharray="3 3" /></svg> gap</li>
        <li><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--soon)" strokeWidth="1.6" strokeDasharray="0.5 3.5" strokeLinecap="round" /></svg> needed soon</li>
      </ul>
        <div className="pm-controls">
        <button type="button" onClick={() => setCardMode((c) => !c)} title={cardMode ? "Switch to poster (line-art) style" : "Switch to cards style"}>
          {cardMode ? "Poster" : "Cards"}
        </button>
        <button type="button" onClick={() => setCollapsed(allFolded ? new Set() : new Set(sectionList))}>
          {allFolded ? "Expand all" : "Fold all"}
        </button>
        <button
          type="button"
          onClick={() => {
            movedRef.current = false;
            setSelected(null);
            setPositions(new Map());
            requestAnimationFrame(() => fit(true));
          }}
          title="Put everything back in its place"
        >
          Arrange
        </button>
        <button type="button" onClick={() => { movedRef.current = false; fit(true); }} title="Zoom to fit everything">
          Fit
        </button>
        <button type="button" onClick={toggleFullscreen} aria-label={isFull ? "Exit full screen" : "Full screen"}>
          {isFull ? "Exit full screen" : "Full screen"}
        </button>
        </div>
      </div>

      <svg
        ref={surfaceRef}
        className="pm-surface"
        role="application"
        aria-label="Family cover map"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <marker id="pm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--muted)" />
          </marker>
          <marker id="pm-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--ok)" />
          </marker>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {frames.map((f) => (
            <rect key={`frame-${f.section}`} x={f.x} y={f.y} width={f.w} height={f.h} rx={16} fill="var(--surface)" fillOpacity={cardMode ? 0.4 : 0} stroke="var(--line)" strokeWidth={1} strokeOpacity={cardMode ? 0.7 : 0.6} pointerEvents="none" />
          ))}

          {displayEdges.map((edge) => {
            const from = posById.get(edge.ds);
            const to = posById.get(edge.dt);
            if (!from || !to) return null;
            const fromCover = from.cover;
            const on = fromCover ? isSolid(nodeState(cellsOf(fromCover))) : false;
            const cs = { x: from.x + NODE_W / 2, y: from.y + NODE_H / 2 };
            const ct = { x: to.x + NODE_W / 2, y: to.y + NODE_H / 2 };
            const a = borderPoint(from, ct.x, ct.y);
            const b = borderPoint(to, cs.x, cs.y);
            const horiz = Math.abs(ct.x - cs.x) >= Math.abs(ct.y - cs.y);
            const span = horiz ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
            const off = Math.max(28, span * 0.4);
            const sgnX = Math.sign(ct.x - cs.x) || 1;
            const sgnY = Math.sign(ct.y - cs.y) || 1;
            const c1 = horiz ? `${a.x + sgnX * off} ${a.y}` : `${a.x} ${a.y + sgnY * off}`;
            const c2 = horiz ? `${b.x - sgnX * off} ${b.y}` : `${b.x} ${b.y - sgnY * off}`;
            const active = !selected || edge.ds === selected || edge.dt === selected;
            return (
              <g key={edge.id} style={{ opacity: active ? 1 : 0.1 }} className="pm-fade">
                <path
                  d={`M ${a.x} ${a.y} C ${c1}, ${c2}, ${b.x} ${b.y}`}
                  fill="none"
                  stroke={on ? "var(--ok)" : "var(--muted)"}
                  strokeWidth={on ? 1.75 : 1.25}
                  strokeLinecap="round"
                  strokeDasharray={on ? undefined : "4 4"}
                  markerEnd={on ? "url(#pm-arrow-on)" : "url(#pm-arrow)"}
                />
              </g>
            );
          })}

          {nodes.map((n) => {
            const visual = visualOf(n.id);
            const opacity = visual === "dimmed" ? 0.22 : 1;
            const nameColor = visual === "selected" ? "var(--accent)" : "var(--ink)";

            if (n.group) {
              return (
                <g
                  key={n.id}
                  data-map-node
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.group.title}, ${n.group.count} covers, ${n.group.gaps} open. Click to expand.`}
                  style={{ opacity, cursor: "pointer", touchAction: "none" }}
                  className="pm-fade pm-node"
                  transform={`translate(${n.x} ${n.y})`}
                  onPointerDown={(e) => onNodeDown(e, n.id, n.x, n.y)}
                  onPointerMove={onNodeMove}
                  onPointerUp={onNodeUp}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSection(n.id.slice(GROUP_PREFIX.length));
                    }
                  }}
                >
                  <rect x={8} y={10} width={NODE_W - 16} height={NODE_H - 22} rx={9} fill="var(--surface)" stroke="var(--line)" opacity={0.5} />
                  <rect x={4} y={5} width={NODE_W - 8} height={NODE_H - 16} rx={10} fill="var(--surface)" stroke="var(--line)" opacity={0.75} />
                  <rect x={0} y={0} width={NODE_W} height={NODE_H - 12} rx={10} fill="var(--surface)" stroke={visual === "selected" ? "var(--accent)" : "var(--line)"} strokeWidth={1.4} />
                  <text x={NODE_W / 2} y={32} textAnchor="middle" fill={nameColor} fontSize={13} fontWeight={600}>{n.group.title}</text>
                  <text x={NODE_W / 2} y={50} textAnchor="middle" fill="var(--muted)" fontSize={10}>
                    {n.group.count} covers{n.group.gaps > 0 ? ` · ${n.group.gaps} open` : ""}
                  </text>
                  <text x={NODE_W / 2} y={70} textAnchor="middle" fill="var(--accent)" fontSize={9.5}>▸ expand</text>
                </g>
              );
            }

            const cover = n.cover as TreeNode;
            const cells = cellsOf(cover);
            const live = cells.filter((c) => c.status !== "na");
            const state = nodeState(cells);
            const mine = scope === "all" ? null : cells.find((c) => c.personId === scope);
            const solid = live.filter((c) => isSolid(c.status)).length;
            const gaps = live.filter((c) => c.status === "gap").length;
            const soon = live.filter((c) => c.status === "upcoming").length;
            const ink = visual === "selected" ? "var(--accent)" : STATUS_COLOR[state];
            const caption = mine
              ? STATUS_LABEL[mine.status]
              : live.length === 0
                ? "Not relevant here"
                : `${solid} of ${live.length} covered${gaps ? ` · ${gaps} ${gaps === 1 ? "gap" : "gaps"}` : ""}${soon ? ` · ${soon} soon` : ""}`;
            // Everyone at a glance; with one person checked, the rest step back to lighter shades.
            const dots = model.people
              .map((p) => ({ p, c: cover.cells.find((c) => c.personId === p.id) }))
              .filter((x): x is { p: (typeof model.people)[number]; c: Cell } => x.c !== undefined && x.c.status !== "na");
            const dotGap = 11;
            return (
              <g
                key={cover.id}
                data-map-node
                data-testid={`map-node-${cover.id}`}
                role="button"
                tabIndex={0}
                aria-label={`${cover.label}. ${caption}. Press Enter for detail.`}
                style={{ opacity: state === "na" && visual === "idle" ? 0.45 : opacity, cursor: "grab", touchAction: "none" }}
                className="pm-fade pm-node"
                transform={`translate(${n.x} ${n.y})`}
                onPointerDown={(e) => onNodeDown(e, cover.id, n.x, n.y)}
                onPointerMove={onNodeMove}
                onPointerUp={onNodeUp}
                onDoubleClick={() => {
                  setSelected(cover.id);
                  zoomTo(cover.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(cover.id);
                    zoomTo(cover.id);
                  }
                }}
              >
                {/* Backing plate: hides any edge behind the node. Invisible in poster mode, a card in cards mode. */}
                <rect x={0} y={0} width={NODE_W} height={NODE_H} rx={10} fill={cardMode ? "var(--surface)" : "var(--bg)"} stroke={visual === "selected" ? "var(--accent)" : cardMode ? "var(--line)" : "none"} strokeWidth={visual === "selected" ? 1.5 : 1} />
                <circle cx={NODE_W / 2} cy={ANCHOR_Y + 2} r={28} fill={isSolid(state) ? "var(--surface)" : "none"} stroke={state === "na" ? "var(--line)" : STATUS_COLOR[state]} strokeWidth={1.4} strokeDasharray={state === "gap" ? "3 3" : state === "upcoming" ? "0.5 4" : undefined} strokeLinecap="round" />
                <svg x={NODE_W / 2 - 18} y={ANCHOR_Y + 2 - 18} width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" style={{ color: ink }}>
                  {PATHS[cover.id]}
                </svg>
                <text x={NODE_W / 2} y={GLYPH_H + 24} textAnchor="middle" fill={nameColor} fontSize={12.5} fontWeight={600}>{cover.label}</text>
                <text x={NODE_W / 2} y={GLYPH_H + 38} textAnchor="middle" fill={mine ? STATUS_COLOR[mine.status] : "var(--muted)"} fontSize={9.5}>{caption}</text>
                {dots.map(({ p, c }, i) => {
                  const x = NODE_W / 2 - ((dots.length - 1) * dotGap) / 2 + i * dotGap;
                  const isMine = scope !== "all" && p.id === scope;
                  return (
                    <g key={p.id} opacity={scope === "all" || isMine ? 1 : 0.3}>
                      <title>{`${p.name}: ${STATUS_LABEL[c.status]}`}</title>
                      <circle cx={x} cy={GLYPH_H + 50} r={isMine ? 4.2 : 3} fill={STATUS_COLOR[c.status]} />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {frames.map((f) => {
            const tabW = Math.max(72, f.title.length * 7.2 + 30);
            return (
              <g
                key={`tab-${f.section}`}
                data-map-tab
                role="button"
                tabIndex={0}
                aria-label={`Fold the ${f.title} section`}
                style={{ cursor: "pointer" }}
                transform={`translate(${f.x} ${f.y - TAB_H})`}
                onClick={() => toggleSection(f.section)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSection(f.section);
                  }
                }}
              >
                <rect x={0} y={0} width={tabW} height={TAB_H} rx={7} fill="var(--surface)" stroke="var(--line)" />
                <text x={12} y={TAB_H / 2 + 3.5} fill="var(--muted)" fontSize={10}>▾</text>
                <text x={26} y={TAB_H / 2 + 3.5} fill="var(--ink)" fontSize={11} fontWeight={600}>{f.title}</text>
              </g>
            );
          })}
        </g>
      </svg>

      {selectedCover ? (
        <aside className="pm-panel" aria-label={`Details for ${selectedCover.label}`}>
          <button type="button" className="pm-close" onClick={() => setSelected(null)} aria-label="Close details">×</button>
          <p className="ins-eyebrow">{sectionTitle(sectionOfCover.get(selectedCover.id) ?? "")}</p>
          <h2>{selectedCover.label}</h2>
          <p className="ins-muted">{selectedCover.summary}</p>
          <ul className="pm-people">
            {selectedCover.cells
              .filter((c) => scope !== "all" || c.status !== "na")
              .filter((c) => scope === "all" || c.status !== "na" || c.personId === scope)
              .map((c) => (
                <li key={c.personId} className={`pm-row pm-${c.status}${scope !== "all" && c.personId !== scope ? " pm-faded" : ""}`}>
                  <p className="pm-row-head">
                    <strong>{nameOf.get(c.personId)}</strong>
                    <span style={{ color: STATUS_COLOR[c.status] }}>
                      {STATUS_LABEL[c.status]}
                      {c.priority && (c.status === "gap" || c.status === "upcoming") ? ` · ${c.priority}` : ""}
                    </span>
                  </p>
                  <p>{c.detail}</p>
                  {c.policy ? (
                    <p className="ins-muted">{c.policy.insurer} · {c.policy.premium}{c.policy.renewal ? ` · renews ${c.policy.renewal}` : ""}</p>
                  ) : null}
                  {c.flags.map((f) => (
                    <p key={f} className="pm-flag">Worth a look: {f}</p>
                  ))}
                </li>
              ))}
          </ul>
          {selectedCover.cells.some((c) => (scope === "all" || c.personId === scope) && (c.status === "gap" || c.status === "upcoming")) ? (
            <div className="pm-offer">
              <p className="ins-eyebrow">
                Would close this for{" "}
                {selectedCover.cells
                  .filter((c) => (scope === "all" || c.personId === scope) && (c.status === "gap" || c.status === "upcoming"))
                  .map((c) => nameOf.get(c.personId))
                  .join(", ")}
              </p>
              <p className="pm-offer-title">{selectedCover.product.name}</p>
              <p>{selectedCover.product.pitch}</p>
              <p className="ins-muted">From €{selectedCover.product.monthly} / month (mock price)</p>
              <button type="button" className="ins-add" aria-pressed={proposal.includes(selectedCover.id)} onClick={() => onToggleProposal(selectedCover.id)}>
                {proposal.includes(selectedCover.id) ? "Remove from proposal" : "Add to proposal"}
              </button>
            </div>
          ) : null}
        </aside>
      ) : null}

      <p className="pm-hint">Drag to pan · scroll to zoom · click to trace · double-click to zoom in · drag a cover to move it</p>
    </div>
  );
}
