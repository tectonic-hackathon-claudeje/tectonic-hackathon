"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Asset, AssetKind, EgoModel } from "@/lib/insurance/ego";
import type { InsuranceModel, Status } from "@/lib/insurance/model";
import { EgoMap } from "./EgoMap";
import { PixelIcon } from "./pixel";
import { PosterMap } from "./PosterMap";
import { assetScene, personScene } from "./scenes";

type Theme = "kbc" | "dark" | "plain";
type View = "person" | "family";
type Step = { asset: string };

const THEME_LABEL: Record<Theme, string> = { kbc: "KBC", dark: "Dark", plain: "Plain" };
const KIND_LABEL: Record<AssetKind, string> = {
  person: "Person",
  policy: "Insurance policy",
  account: "Account",
  card: "Card",
  loan: "Loan",
  goal: "Saving goal",
  gap: "Missing cover",
};
const STATE_LABEL: Record<Status, string> = { covered: "Covered", shared: "Covered via family", gap: "Gap", upcoming: "Needed soon", na: "Not relevant" };
const STATE_CLASS: Record<string, string> = { covered: "ok", shared: "via", gap: "gap", upcoming: "soon" };

export function InsuranceTree({ model, ego, initialTheme, initialPerson }: { model: InsuranceModel; ego: EgoModel; initialTheme: Theme; initialPerson: string }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [view, setView] = useState<View>("person");
  const [personId, setPersonId] = useState(initialPerson);
  const [trail, setTrail] = useState<Step[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<string[]>([]);

  // The theme belongs to the whole page, so it lives on <html>.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  const nodesById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model.nodes]);
  const person = model.people.find((p) => p.id === personId) ?? model.people[0];
  const here = trail[trail.length - 1];
  const scene = useMemo(() => (here ? assetScene(ego, here.asset, personId) : personScene(ego, personId)), [ego, here, personId]);
  const shown = (selectedId && ego.assets[selectedId]) || ego.assets[scene.center.id];

  const switchPerson = useCallback((id: string) => {
    setPersonId(id);
    setTrail([]);
    setSelectedId(null);
  }, []);
  const open = useCallback(
    (id: string) => {
      if (id.startsWith("person:")) return switchPerson(id.slice(7));
      setTrail((t) => (t[t.length - 1]?.asset === id ? t : [...t, { asset: id }]));
      setSelectedId(null);
    },
    [switchPerson],
  );
  const back = useCallback(() => {
    setTrail((t) => t.slice(0, -1));
    setSelectedId(null);
  }, []);
  const overview = useCallback(() => {
    setTrail([]);
    setSelectedId(null);
  }, []);
  const goTo = useCallback((depth: number) => {
    setTrail((t) => t.slice(0, depth));
    setSelectedId(null);
  }, []);

  useEffect(() => {
    if (view !== "person") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (e.key === "Escape" || (e.key === "ArrowUp" && (e.metaKey || e.ctrlKey) && !e.shiftKey)) {
        e.preventDefault();
        back();
      } else if (e.key === "ArrowUp" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        overview();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && shown && shown.id !== scene.center.id) {
        e.preventDefault();
        open(shown.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, back, overview, open, shown, scene.center.id]);

  const toggleProposal = (id: string) => setProposal((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const proposalNodes = proposal.map((id) => nodesById.get(id)).filter((n): n is NonNullable<typeof n> => Boolean(n));
  const monthly = proposalNodes.reduce((s, n) => s + n.product.monthly, 0);

  // What the panel says about the selection, for the person being looked at.
  const state = shown.kind === "policy" ? (shown.personState[personId] ?? shown.state) : shown.state;
  // A person is tied to everything they own, which is the map itself: the panel lists only their family and the accounts they manage.
  const connections = shown.related.filter((r) => ego.assets[r.id] && (shown.kind !== "person" || r.id.startsWith("person:") || /proxy|shared view/.test(r.relation)));
  const relatedIds = connections.map((r) => r.id);
  const canOpen = shown.id !== scene.center.id && shown.kind !== "person";
  const canSwitch = shown.kind === "person" && shown.id !== `person:${personId}`;
  const household = model.households.find((h) => h.memberIds.includes(personId));

  return (
    <div className="cw">
      <header className="cw-bar">
        <Link href="/" className="cw-mark" aria-label="Product explorer home">
          KBC<span> · Family cover</span>
        </Link>
        <span className="cw-sep" aria-hidden="true" />
        <details className="cw-menu">
          <summary>
            <PixelIcon id={ego.assets[`person:${person.id}`]?.glyph ?? "adult"} size={16} /> {person.name}
            <span aria-hidden="true"> ▾</span>
          </summary>
          <ul>
            {model.households.map((h) => (
              <li key={h.id} className="cw-menu-group">
                <span>{h.address.split(",")[1]?.trim().replace(/^\d+\s/, "")}</span>
                {h.memberIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-current={id === personId}
                    onClick={(e) => {
                      switchPerson(id);
                      e.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                  >
                    <PixelIcon id={ego.assets[`person:${id}`]?.glyph ?? "adult"} size={16} /> {model.people.find((p) => p.id === id)?.name}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </details>
        <span className="cw-sep" aria-hidden="true" />
        <div className="cw-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "person"} onClick={() => setView("person")}>Person</button>
          <button type="button" aria-pressed={view === "family"} onClick={() => setView("family")}>Family map</button>
        </div>
        <div className="cw-right">
          <div className="cw-seg" role="group" aria-label="Theme">
            {(["kbc", "dark", "plain"] as Theme[]).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{THEME_LABEL[t]}</button>
            ))}
          </div>
          <details className="cw-menu cw-proposal">
            <summary className="cw-cta">
              Proposal{proposalNodes.length > 0 ? ` · ${proposalNodes.length} · €${monthly}/mo` : ""}
            </summary>
            <div>
              {proposalNodes.length === 0 ? (
                <p>Open a missing cover and add the product that would close it.</p>
              ) : (
                <>
                  <ul>
                    {proposalNodes.map((n) => (
                      <li key={n.id}>
                        <span>{n.product.name}</span>
                        <button type="button" onClick={() => toggleProposal(n.id)} aria-label={`Remove ${n.product.name}`}>×</button>
                        <span>€{n.product.monthly}</span>
                      </li>
                    ))}
                  </ul>
                  <p><strong>From €{monthly} / month</strong> · indicative, mock prices</p>
                </>
              )}
            </div>
          </details>
        </div>
      </header>

      {view === "person" ? (
        <>
          <div className="cw-head">
            <div>
              <h1>{scene.title}</h1>
              <p>{scene.subtitle}{household ? ` · ${household.name}` : ""}</p>
            </div>
            <p className="cw-note">Mock data · not a KBC offer</p>
          </div>
          <div className="cw-trail">
            <button type="button" onClick={overview} disabled={trail.length === 0}>Overview <kbd>⇧⌘↑</kbd></button>
            <button type="button" onClick={back} disabled={trail.length === 0}>Back <kbd>Esc</kbd></button>
            <nav aria-label="Where you are">
              <button type="button" onClick={overview} aria-current={trail.length === 0 ? "page" : undefined} disabled={trail.length === 0}>{person.name}</button>
              {trail.map((s, i) => (
                <span key={`${s.asset}-${i}`}>
                  <span aria-hidden="true"> › </span>
                  <button type="button" onClick={() => goTo(i + 1)} aria-current={i === trail.length - 1 ? "page" : undefined} disabled={i === trail.length - 1}>{ego.assets[s.asset]?.label}</button>
                </span>
              ))}
            </nav>
            <span className="cw-where">{trail.length === 0 ? "At the overview" : `${trail.length} ${trail.length === 1 ? "step" : "steps"} in`}</span>
          </div>
          <div className="cw-body">
            <section className="cw-canvas" aria-label={scene.title}>
              <EgoMap scene={scene} selectedId={selectedId} relatedIds={relatedIds} onSelect={setSelectedId} onOpen={open} />
            </section>
            <Panel
              asset={shown}
              state={state}
              personName={person.name}
              connections={connections}
              ego={ego}
              onJump={(id) => setSelectedId(id)}
              canOpen={canOpen}
              canSwitch={canSwitch}
              onOpen={() => open(shown.id)}
              proposal={proposal}
              onToggleProposal={toggleProposal}
            />
          </div>
        </>
      ) : (
        <>
          <div className="cw-head">
            <div>
              <h1>The whole family</h1>
              <p>Every cover, who has it, and where the gaps are. Fold a territory by its tab.</p>
            </div>
            <p className="cw-note">Mock data · not a KBC offer</p>
          </div>
          <div className="cw-body cw-body-wide">
            <section className="cw-canvas" aria-label="Family cover map">
              <PosterMap model={model} scope="all" proposal={proposal} onToggleProposal={toggleProposal} focusRequest={null} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Panel({
  asset,
  state,
  personName,
  connections,
  ego,
  onJump,
  canOpen,
  canSwitch,
  onOpen,
  proposal,
  onToggleProposal,
}: {
  asset: Asset;
  state: Asset["state"];
  personName: string;
  connections: Asset["related"];
  ego: EgoModel;
  onJump: (id: string) => void;
  canOpen: boolean;
  canSwitch: boolean;
  onOpen: () => void;
  proposal: string[];
  onToggleProposal: (id: string) => void;
}) {
  const cls = STATE_CLASS[state] ?? "";
  return (
    <aside className="cw-panel" aria-label={`About ${asset.label}`}>
      <p className="cw-kind">
        <PixelIcon id={asset.glyph} size={18} /> {KIND_LABEL[asset.kind]}
      </p>
      <h2>{asset.label}</h2>
      {state !== "neutral" ? <p className={`cw-state cw-${cls}`}>{STATE_LABEL[state]} · for {personName}</p> : null}
      <p className="cw-detail">{asset.detail}</p>

      {canOpen ? (
        <button type="button" className="cw-open" onClick={onOpen}>Open this object <kbd>⌘↵</kbd></button>
      ) : null}
      {canSwitch ? (
        <button type="button" className="cw-open" onClick={onOpen}>Look at {asset.label}'s cover</button>
      ) : null}

      {asset.product ? (
        <div className="cw-offer">
          <p className="cw-kind">Would close this</p>
          <p className="cw-offer-name">{asset.product.name}</p>
          <p>{asset.product.pitch}</p>
          <p className="cw-muted">From €{asset.product.monthly} / month (mock price)</p>
          {asset.coverId ? (
            <button type="button" className="cw-add" aria-pressed={proposal.includes(asset.coverId)} onClick={() => onToggleProposal(asset.coverId as string)}>
              {proposal.includes(asset.coverId) ? "Remove from proposal" : "Add to proposal"}
            </button>
          ) : null}
        </div>
      ) : null}

      {connections.length > 0 ? (
        <section>
          <h3>{connections.length} {connections.length === 1 ? "connection" : "connections"} here</h3>
          <dl className="cw-rows">
            {connections.map((c) => (
              <div key={`${c.id}-${c.relation}`}>
                <dt>{c.relation}</dt>
                <dd>
                  <button type="button" onClick={() => onJump(c.id)}>{ego.assets[c.id].label}</button>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {asset.facts.length > 0 ? (
        <section>
          <h3>The details</h3>
          <dl className="cw-rows">
            {asset.facts.map((f) => (
              <div key={f.k}>
                <dt>{f.k}</dt>
                <dd>{f.v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section>
        <h3>Where it came from</h3>
        <p className="cw-muted">{asset.source}</p>
      </section>

      {asset.links.length > 0 ? (
        <section>
          <h3>Links</h3>
          <ul className="cw-links">
            {asset.links.map((l) => (
              <li key={l.href}>
                {l.external ? (
                  <a href={l.href} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>
                ) : (
                  <Link href={l.href}>{l.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3>Reading the map</h3>
        <ul className="cw-key">
          <li><span className="cw-ring cw-ring-solid" /> in place</li>
          <li><span className="cw-ring cw-ring-dash" /> missing</li>
          <li><span className="cw-ring cw-ring-dot" /> needed soon</li>
          <li><span className="cw-ring cw-ring-faint" /> someone else in the family</li>
        </ul>
        <p className="cw-muted">Click for detail. Double-click, or ⌘↵, to open an object. Esc steps back.</p>
      </section>
    </aside>
  );
}
