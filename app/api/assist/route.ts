import { NextResponse } from "next/server";
import { forViewer } from "@/lib/insurance/access";
import { alertsFor } from "@/lib/insurance/alerts";
import { buildEgo } from "@/lib/insurance/ego";
import { buildModel } from "@/lib/insurance/model";
import { answer } from "@/app/insurance/assistant";

/**
 * Ask the assistant a question without the UI, for testing and as the seam for a real LLM later:
 *   /api/assist?q=is%20he%20safe%20from%20scams&person=P03&shown=gap:cybersecure:P03
 * It runs the same `answer()` the page uses, for the same viewer (P01, Koen).
 */
const VIEWER = "P01";

export function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const model = buildModel();
  const raw = buildEgo(model);
  const ego = forViewer(raw, VIEWER);
  const levelOf = (id: string) => raw.access[VIEWER]?.[id] ?? "none";
  const personId = model.people.some((p) => p.id === url.searchParams.get("person")) ? (url.searchParams.get("person") as string) : VIEWER;
  const shown = ego.assets[url.searchParams.get("shown") ?? ""] ?? ego.assets[`person:${personId}`];
  const { mine, others } = alertsFor(ego, personId, levelOf);
  const a = answer(q, { ego, model, viewer: VIEWER, personId, shown, mine, others });
  return NextResponse.json({
    you_asked: q,
    looking_at: model.people.find((p) => p.id === personId)?.name,
    reply: a.text,
    moves_the_map_to: a.navigate ? { person: a.navigate.person ?? personId, steps: a.navigate.steps.map((s) => ("id" in s ? s.id : "")) } : null,
    shows_an_offer_for: a.offerGapId ?? null,
    buttons: a.actions.map((x) => x.label),
  });
}
