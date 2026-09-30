import type { ReactNode } from "react";

/** Line-art glyphs, one per cover type. Drawn on a 24-unit grid, stroked with currentColor. */
export const PATHS: Record<string, ReactNode> = {
  hospital: (<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></>),
  liability: (<><path d="M3 12a9 9 0 0118 0z" /><path d="M12 12v6a2 2 0 004 0" /></>),
  home: (<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>),
  car: (<><path d="M4 16v-4l2-5h12l2 5v4" /><path d="M3 16h18" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /></>),
  fraud: (<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  travel: (<path d="M21 4L3 11l7 2.5L12.5 21 21 4zM10 13.5L21 4" />),
  legal: (<><path d="M12 4v16M6 20h12M5 7h14" /><path d="M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z" /></>),
  contents: (<><rect x="4" y="5" width="16" height="11" rx="1" /><path d="M2 19h20" /></>),
  mortgage: (<><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 14h7M9 17h5" /></>),
  roadside: (<path d="M14.5 6.5a4 4 0 005 5L10 21a2 2 0 01-3-3l9.5-9.5a4 4 0 01-2-2z" />),
  care: (<path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z" />),
  income: (<><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5c-.4-1-1.3-1.5-2.5-1.5-1.4 0-2.5.7-2.5 1.7s1 1.4 2.5 1.8 2.5.8 2.5 1.8-1.1 1.7-2.5 1.7c-1.2 0-2.1-.5-2.5-1.5M12 6.5V8m0 8v1.5" /></>),
};

export function CoverIcon({ id, size = 44 }: { id: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[id] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
