"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetState } from "@/lib/insurance/ego";
import { PixelGlyph } from "./pixel";
import type { Scene, SceneNode, SceneTerritory } from "./scenes";

// ============================================================================
// EgoMap: one thing in the middle, territories around it. The centre-and-territories
// composition of the Fynma gate, drawn in the poster style (pixel glyph, bold name,
// quiet caption). Pans by dragging, zooms with the wheel, fits on load, and eases
// the camera whenever the scene changes.
// ============================================================================

const W = 150;
const H = 112;
const CENTER_W = 170;
const CENTER_H = 150;
const PAD = 22;
const HEADER = 30;
const GAP = 64;

const STATE_COLOR: Record<AssetState, string> = {
  covered: "var(--ok)",
  shared: "var(--via)",
  gap: "var(--gap)",
  upcoming: "var(--soon)",
  na: "var(--muted)",
  neutral: "var(--ink)",
};

interface Placed extends SceneTerritory {
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  pad: number;
  header: number;
}
interface PlacedNode extends SceneNode {
  x: number;
  y: number;
  territory?: string;
}

function placeTerritory(t: SceneTerritory): Placed {
  const n = t.nodes.length;
  const cols = t.side === "e" || t.side === "w" ? (n > 9 ? 3 : n > 3 ? 2 : 1) : Math.min(n, n > 6 ? 4 : 3);
  const rows = Math.ceil(n / cols);
  const pad = t.bare ? 6 : PAD;
  const header = t.bare ? 22 : HEADER;
  return { ...t, cols, pad, header, x: 0, y: 0, w: cols * W + pad * 2, h: rows * H + pad * 2 + header };
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
type Laid = { territories: Placed[]; nodes: PlacedNode[]; center: PlacedNode; lines: Line[] };

const COLW = 200;
const ROWH = 190;

/** Generations as rows, oldest at the top: parents above, spouse beside, children below. */
function layoutTree(scene: Scene): Laid {
  const rows = scene.tree ?? [];
  const at = new Map<number, { id: string; cx: number }[]>();
  const spread = (level: number, ids: string[], start: number) => at.set(level, ids.map((id, i) => ({ id, cx: start + i * COLW })));
  for (const row of rows) {
    if (row.level === 0) continue;
    const ids = row.nodes.map((n) => n.id);
    spread(row.level, ids, (-(ids.length - 1) * COLW) / 2);
  }
  // The centre row: the person, their spouse next to them, siblings a little further along.
  const beside = rows.find((r) => r.level === 0)?.nodes ?? [];
  const spouse = beside.find((n) => n.caption === "spouse");
  const siblings = beside.filter((n) => n !== spouse);
  const row0: { id: string; cx: number }[] = [{ id: scene.center.id, cx: spouse ? -COLW / 2 : 0 }];
  if (spouse) row0.push({ id: spouse.id, cx: COLW / 2 });
  siblings.forEach((n, i) => row0.push({ id: n.id, cx: (spouse ? COLW / 2 : 0) + COLW * 1.3 + i * COLW }));
  at.set(0, row0);

  const nodeById = new Map([scene.center, ...rows.flatMap((r) => r.nodes)].map((n) => [n.id, n]));
  const placedNodes: PlacedNode[] = [];
  let center: PlacedNode = { ...scene.center, x: 0, y: 0 };
  for (const [level, list] of at)
    for (const { id, cx } of list) {
      const node = nodeById.get(id);
      if (!node) continue;
      const self = id === scene.center.id;
      const w = self ? CENTER_W : W;
      const h = self ? CENTER_H : H;
      const placed = { ...node, x: cx - w / 2, y: level * ROWH - h / 2 };
      if (self) center = placed;
      else placedNodes.push(placed);
    }

  const lines: Line[] = [];
  const levels = [...at.keys()].sort((a, b) => a - b);
  for (const level of levels) {
    const list = at.get(level) ?? [];
    // Couples (oldest generations and the centre row) are joined by a short line.
    const couple = level <= 0 ? list.slice(0, 2) : [];
    if (couple.length === 2 && (level < 0 || spouse)) lines.push({ x1: couple[0].cx + 40, y1: level * ROWH - 12, x2: couple[1].cx - 40, y2: level * ROWH - 12 });
    // The line down from a couple goes to their own children: not to a child's spouse (level 0), and
    // from the oldest row only to the first parent listed, whose own parents they are.
    const all = at.get(level + 1);
    const below = level + 1 === 0 ? all?.filter((b) => b.id !== spouse?.id) : level < -1 ? all?.slice(0, 1) : all;
    if (!below || below.length === 0) continue;
    const parents = level <= 0 ? list.slice(0, 2) : list;
    const mid = parents.reduce((sum, p) => sum + p.cx, 0) / parents.length;
    const y0 = level * ROWH + 62;
    const yBus = level * ROWH + ROWH / 2 + 4;
    const y1 = (level + 1) * ROWH - 62;
    const xs = below.map((b) => b.cx);
    lines.push({ x1: mid, y1: y0, x2: mid, y2: yBus });
    lines.push({ x1: Math.min(mid, ...xs), y1: yBus, x2: Math.max(mid, ...xs), y2: yBus });
    for (const b of below) lines.push({ x1: b.cx, y1: yBus, x2: b.cx, y2: y1 });
  }
  return { territories: [], nodes: placedNodes, center, lines };
}

function layout(scene: Scene): Laid {
  if (scene.tree) return layoutTree(scene);
  const placed = scene.territories.map(placeTerritory);
  const side = (s: string) => placed.find((p) => p.side === s);
  const n = side("n");
  const s = side("s");
  const s2 = side("s2");
  const e = side("e");
  const w = side("w");
  // North and south sit clear of the side territories, so nothing overlaps at the corners.
  const reach = Math.max(CENTER_H / 2, (w?.h ?? 0) / 2, (e?.h ?? 0) / 2) + GAP;
  if (n) {
    n.x = -n.w / 2;
    n.y = -reach - n.h;
  }
  // The bottom row: what they borrow and save, beside their family.
  const bottom = [s, s2].filter((x): x is Placed => Boolean(x));
  const rowW = bottom.reduce((sum, b) => sum + b.w, 0) + GAP * Math.max(0, bottom.length - 1);
  let cursor = -rowW / 2;
  for (const b of bottom) {
    b.x = cursor;
    b.y = reach;
    cursor += b.w + GAP;
  }
  const nw = side("nw");
  const ne = side("ne");
  const sw = side("sw");
  const se = side("se");
  if (w) {
    w.x = -(CENTER_W / 2 + GAP + w.w);
    w.y = -w.h / 2;
  }
  if (e) {
    e.x = CENTER_W / 2 + GAP;
    e.y = -e.h / 2;
  }
  // Satellites sit in the corners, in line with the territories beside them.
  const northY = n ? n.y : -reach - 150;
  const southY = s?.y ?? reach;
  const westX = (t: Placed) => (w ? w.x + (w.w - t.w) / 2 : -(CENTER_W / 2 + GAP + t.w));
  const eastX = (t: Placed) => (e ? e.x + (e.w - t.w) / 2 : CENTER_W / 2 + GAP);
  if (nw) [nw.x, nw.y] = [westX(nw), northY];
  if (ne) [ne.x, ne.y] = [eastX(ne), northY];
  if (sw) [sw.x, sw.y] = [westX(sw), southY];
  if (se) [se.x, se.y] = [eastX(se), southY];
  const nodes: PlacedNode[] = [];
  for (const t of placed)
    t.nodes.forEach((nd, i) => {
      const col = i % t.cols;
      const row = Math.floor(i / t.cols);
      // Centre a short last row.
      const inRow = Math.min(t.cols, t.nodes.length - row * t.cols);
      const offset = ((t.cols - inRow) * W) / 2;
      nodes.push({ ...nd, territory: t.id, x: t.x + t.pad + offset + col * W, y: t.y + t.header + t.pad + row * H });
    });
  return { territories: placed, nodes, center: { ...scene.center, x: -CENTER_W / 2, y: -CENTER_H / 2 }, lines: [] };
}

function rectPoint(r: { x: number; y: number; w: number; h: number }, tx: number, ty: number) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const s = Math.min(dx !== 0 ? r.w / 2 / Math.abs(dx) : Infinity, dy !== 0 ? r.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * s, y: cy + dy * s };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface EgoMapProps {
  scene: Scene;
  selectedId: string | null;
  /** Ids related to the selection that should be drawn connected to it. */
  relatedIds: string[];
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
}

export function EgoMap({ scene, selectedId, relatedIds, onSelect, onOpen }: EgoMapProps) {
  const { territories, nodes, center, lines } = useMemo(() => layout(scene), [scene]);
  const byId = useMemo(() => new Map([...nodes, center].map((n) => [n.id, n])), [nodes, center]);

  const bounds = useMemo(() => {
    let minX = center.x, minY = center.y, maxX = center.x + CENTER_W, maxY = center.y + CENTER_H;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + W);
      maxY = Math.max(maxY, n.y + H);
    }
    for (const t of territories) {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + t.w);
      maxY = Math.max(maxY, t.y + t.h);
    }
    return { minX, minY, maxX, maxY };
  }, [territories, nodes, center]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const surfaceRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const animRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  const stopAnim = () => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  };
  const animateTo = useCallback((to: { x: number; y: number; k: number }, ms = 480) => {
    stopAnim();
    const from = viewRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e });
      animRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    animRef.current = requestAnimationFrame(step);
  }, []);

  const fit = useCallback(
    (animate: boolean) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      const b = boundsRef.current;
      const cw = b.maxX - b.minX;
      const ch = b.maxY - b.minY;
      if (!rect || !rect.width || !rect.height) return;
      const pad = 36;
      const k = Math.max(0.2, Math.min((rect.width - pad * 2) / cw, (rect.height - pad * 2) / ch, 1.25));
      const to = { x: (rect.width - cw * k) / 2 - b.minX * k, y: (rect.height - ch * k) / 2 - b.minY * k, k };
      if (animate) animateTo(to);
      else {
        stopAnim();
        setView(to);
      }
    },
    [animateTo],
  );

  // A new scene is a new place: go there. The first fit is instant, later ones ease.
  const firstRef = useRef(true);
  useEffect(() => {
    movedRef.current = false;
    const id = requestAnimationFrame(() => {
      fit(!firstRef.current);
      firstRef.current = false;
    });
    return () => cancelAnimationFrame(id);
  }, [scene.key, fit]);

  // The canvas can be measured before it has a size, or resized later.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!movedRef.current) fit(false);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

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
        const k = Math.min(2.5, Math.max(0.25, v.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        return { x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k, k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest("[data-node]")) return;
    stopAnim();
    movedRef.current = true;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    setView((v) => ({ ...v, x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy }));
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved) onSelect(null);
  };

  const zoomBy = (f: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    movedRef.current = true;
    const v = viewRef.current;
    const k = Math.min(2.5, Math.max(0.25, v.k * f));
    const px = rect.width / 2;
    const py = rect.height / 2;
    animateTo({ x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k, k }, 220);
  };

  const related = new Set(relatedIds);
  const dimmed = (id: string) => selectedId !== null && id !== selectedId && !related.has(id) && id !== center.id;
  const selectedNode = selectedId ? byId.get(selectedId) : undefined;

  const renderNode = (n: PlacedNode, big = false) => {
    const size = big ? 72 : n.large ? 56 : 44;
    const w = big ? CENTER_W : W;
    const cx = w / 2;
    const top = big ? 14 : 8;
    const selected = n.id === selectedId;
    const faded = n.faded && !selected;
    const color = STATE_COLOR[n.state];
    const ring = n.state === "neutral" || n.info ? "var(--line)" : color;
    return (
      <g
        key={n.id}
        data-node
        role="button"
        tabIndex={0}
        aria-label={`${n.label}. ${n.caption}.${n.info ? "" : " Enter to select, double-click to open."}`}
        aria-pressed={selected}
        transform={`translate(${n.x} ${n.y})`}
        style={{ cursor: n.info ? "default" : "pointer", opacity: dimmed(n.id) ? 0.25 : faded ? 0.45 : 1 }}
        className="em-node"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(n.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!n.info) onOpen(n.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.metaKey || e.ctrlKey) {
              if (!n.info) onOpen(n.id);
            } else onSelect(n.id);
          }
        }}
      >
        <title>{`${n.label}: ${n.caption}`}</title>
        <rect width={w} height={big ? CENTER_H : H} rx={10} fill="var(--bg)" stroke={selected ? "var(--accent)" : "none"} strokeWidth={1.5} />
        <circle cx={cx} cy={top + size / 2 + 2} r={size / 2 + 8} fill={n.state === "covered" || n.state === "shared" ? "var(--surface)" : "none"} stroke={ring} strokeWidth={1.4} strokeDasharray={n.state === "gap" ? "3 3" : n.state === "upcoming" ? "0.5 4" : n.state === "neutral" ? "0" : undefined} strokeLinecap="round" opacity={n.state === "neutral" ? 0.6 : 1} />
        <PixelGlyph id={n.glyph} x={cx - size / 2} y={top + 2} size={size} ink={selected ? "var(--accent)" : n.state === "neutral" ? "var(--ink)" : color} accent={selected ? "var(--ink)" : "var(--accent)"} />
        <text x={cx} y={top + size + 30} textAnchor="middle" fill={selected ? "var(--accent)" : "var(--ink)"} fontSize={big ? 15 : 12.5} fontWeight={700}>{clip(n.label, big ? 22 : 20)}</text>
        <text x={cx} y={top + size + (big ? 47 : 44)} textAnchor="middle" fill={n.state === "gap" || n.state === "upcoming" ? color : "var(--muted)"} fontSize={big ? 11 : 9.5}>{clip(n.caption, big ? 30 : 27)}</text>
      </g>
    );
  };

  return (
    <div className="em">
      <svg ref={surfaceRef} className="em-surface" role="application" aria-label={`${scene.title}: map`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => (dragRef.current = null)}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {lines.map((l, i) => (
            <line key={`tree-${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--line)" strokeWidth={1.6} strokeLinecap="round" />
          ))}
          {territories.map((t) => {
            const cp = rectPoint({ x: -CENTER_W / 2, y: -CENTER_H / 2, w: CENTER_W, h: CENTER_H }, t.x + t.w / 2, t.y + t.h / 2);
            const tp = rectPoint(t, 0, 0);
            if (t.side === "s2") return null;
            const corner = t.side.length === 2;
            return <line key={`l-${t.id}`} x1={cp.x} y1={cp.y} x2={tp.x} y2={tp.y} stroke="var(--line)" strokeWidth={1.4} strokeDasharray={corner ? "3 7" : undefined} opacity={corner ? 0.7 : 1} />;
          })}
          {territories.map((t) => (
            <g key={t.id}>
              {t.bare ? (
                <text x={t.x + t.w / 2} y={t.y + 14} textAnchor="middle" fill="var(--muted)" fontSize={10.5} fontWeight={600} letterSpacing="0.1em" style={{ textTransform: "uppercase" }}>{t.label}</text>
              ) : (
                <>
                  <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={16} fill="var(--surface)" fillOpacity={0.45} stroke="var(--line)" />
                  <text x={t.x + 18} y={t.y + 21} fill="var(--muted)" fontSize={10.5} fontWeight={600} letterSpacing="0.1em" style={{ textTransform: "uppercase" }}>{t.label}</text>
                </>
              )}
            </g>
          ))}
          {selectedNode && selectedNode.id !== center.id
            ? relatedIds
                .filter((id) => byId.has(id))
                .map((id) => {
                  const a = selectedNode;
                  const b = byId.get(id) as PlacedNode;
                  const p1 = { x: a.x + W / 2, y: a.y + H / 2 - 6 };
                  const p2 = { x: b.x + (b.id === center.id ? CENTER_W : W) / 2, y: b.y + (b.id === center.id ? CENTER_H : H) / 2 - 6 };
                  const mx = (p1.x + p2.x) / 2;
                  return <path key={`r-${id}`} d={`M ${p1.x} ${p1.y} C ${mx} ${p1.y}, ${mx} ${p2.y}, ${p2.x} ${p2.y}`} fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeDasharray="5 4" strokeLinecap="round" />;
                })
            : null}
          {nodes.map((n) => renderNode(n))}
          {renderNode(center, true)}
        </g>
      </svg>
      <div className="em-zoom">
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => { movedRef.current = false; fit(true); }} aria-label="Fit to view">⤢</button>
      </div>
    </div>
  );
}
