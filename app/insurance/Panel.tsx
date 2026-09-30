"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AccessLevel, Asset } from "@/lib/insurance/ego";
import { KBC } from "@/lib/insurance/kbc";
import type { Status } from "@/lib/insurance/model";
import { priceLine, type Reply } from "./assistant";
import { PixelIcon } from "./pixel";

const STATE_WORD: Record<Status, string> = { covered: "Covered", shared: "Covered via family", gap: "Not covered", upcoming: "Needed soon", na: "" };

/**
 * A missing cover as an offer you can turn down: what we noticed, then equal choices. The product and
 * its price are one tap away, never the headline.
 */
export function OfferCard({
  gap,
  age,
  name,
  canAct,
  proposal,
  response,
  onAdd,
  onRespond,
  onUndo,
  onInsure,
  proxy,
}: {
  gap: Asset;
  age: number;
  name: string;
  canAct: boolean;
  proposal: string[];
  response?: Reply;
  onAdd: (cover: string) => void;
  onRespond: (gapId: string, reply: Reply) => void;
  onUndo: (gapId: string) => void;
  onInsure?: (gapId: string) => void;
  proxy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const covers = KBC.products.find((p) => p.id === gap.kbcId)?.covers;
  if (response)
    return (
      <div className="cw-offer2 cw-offer2-done">
        <p>{response === "not-needed" ? "Left as not needed." : "Noted: covered elsewhere."} <button type="button" onClick={() => onUndo(gap.id)}>Undo</button></p>
      </div>
    );
  const added = gap.coverId ? proposal.includes(gap.coverId) : false;
  return (
    <div className="cw-offer2">
      <p className="cw-offer-line">{gap.story?.line}</p>
      {confirm && gap.product ? (
        <div className="cw-confirm" role="group" aria-label="Confirm">
          <p><strong>{gap.product.name}</strong></p>
          <p>{priceLine(gap, age)}</p>
          <p className="cw-muted">{proxy ? `${name} still has to confirm this themselves.` : "Nothing is really bought: this is a demo."}</p>
          <div className="cw-offer-actions">
            <button type="button" className="cw-primary" onClick={() => onInsure?.(gap.id)}>Confirm</button>
            <button type="button" onClick={() => setConfirm(false)}>Not now</button>
          </div>
        </div>
      ) : null}
      <div className="cw-offer-actions">
        {canAct && onInsure && gap.product && !confirm ? <button type="button" className="cw-primary" onClick={() => setConfirm(true)}>Get covered</button> : null}
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Hide the cover" : "See the cover"}</button>
        {canAct && gap.coverId ? (
          <button type="button" aria-pressed={added} onClick={() => onAdd(gap.coverId as string)}>{added ? "✓ Added" : "Add to proposal"}</button>
        ) : null}
        <button type="button" onClick={() => onRespond(gap.id, "not-needed")}>Not needed</button>
        <button type="button" onClick={() => onRespond(gap.id, "covered-elsewhere")}>Covered elsewhere</button>
      </div>
      {!canAct ? <p className="cw-muted">Only {name} can decide this.</p> : null}
      {open && gap.product ? (
        <div className="cw-offer-detail">
          <strong>{gap.product.name}</strong>
          {covers ? <p>Covers {covers.charAt(0).toLowerCase()}{covers.slice(1)}.</p> : null}
          <p>{priceLine(gap, age)}</p>
        </div>
      ) : null}
    </div>
  );
}

type Line = { text: string; links?: { id: string; label: string }[] };

/** What a person would want to know, as sentences, leaving out what the page already says or they already know. */
function goodToKnow(asset: Asset, lookup: (id: string) => Asset | undefined): Line[] {
  const fact = (k: string) => asset.facts.find((f) => f.k === k)?.v;
  const rel = (...names: string[]) => asset.related.filter((r) => names.includes(r.relation) && lookup(r.id)).map((r) => ({ id: r.id, label: lookup(r.id)?.label ?? "" }));
  const lines: Line[] = [];
  const add = (text: string, links?: { id: string; label: string }[]) => {
    if (links && links.length === 0) return;
    lines.push({ text, links });
  };
  switch (asset.kind) {
    case "policy":
      add("Paid from", rel("paid from"));
      add("Sits on the", rel("home loan"));
      add("Protects the", rel("protects"));
      if (fact("Note")) add(`Tip: ${fact("Note")}.`);
      break;
    case "gap": {
      const covers = KBC.products.find((p) => p.id === asset.kbcId)?.covers;
      if (covers) add(`Covers ${covers.charAt(0).toLowerCase()}${covers.slice(1)}.`);
      add("Goes with", rel("builds on"));
      for (const f of asset.facts.filter((x) => x.k === "Worth a look")) add(`${f.v}.`);
      break;
    }
    case "account":
      add(`Balance ${fact("Balance")}.`);
      add("Pays for", [...rel("pays premium"), ...rel("pays")]);
      add("Has the card", rel("card"));
      add("Saving for", rel("saving for"));
      break;
    case "card":
      add(`${fact("Status")}, expires ${fact("Expires")}.`);
      add("Linked to", rel("draws on"));
      break;
    case "loan":
      add(`${fact("Still owed")} still owed, until ${fact("Ends")}.`);
      add("Paid from", rel("paid from"));
      add("Protected by", rel("protected by"));
      add("The house", rel("insures the house"));
      break;
    case "goal":
      add(asset.detail);
      add("Kept in", rel("kept in"));
      break;
    case "product":
      add(`Covers ${(fact("Covers") ?? "").toLowerCase()}.`);
      break;
    case "property":
      add(`Owned by ${fact("Owned by")}.`);
      add("Insured by", rel("insured by"));
      add("The mortgage is", rel("mortgage"));
      break;
    default:
      break;
  }
  return lines;
}

const BANNER: Record<AccessLevel, (n: string) => string | null> = {
  self: () => null,
  joint: () => null,
  proxy: (n) => `You’re looking at ${n}’s cover as their proxy. A purchase needs ${n}’s own OK.`,
  view: (n) => `View only: you can look at ${n}’s cover, not change it.`,
  none: (n) => `You don’t have access to ${n}’s accounts. You only see the cover you share.`,
};

export function Panel({
  asset,
  state,
  title,
  isMe,
  personName,
  level,
  age,
  stories,
  inPlace,
  gap,
  viaPolicy,
  personId,
  lookup,
  onJump,
  canOpen,
  canSwitch,
  onOpen,
  onOpenStory,
  proposal,
  onToggleProposal,
  responses,
  onRespond,
  onUndoRespond,
  requested,
  onRequestAccess,
  onInsure,
  onAsk,
  celebrate,
  onUndoCelebrate,
  dangers,
}: {
  asset: Asset;
  state: Asset["state"];
  title: string;
  isMe: boolean;
  personName: string;
  level: AccessLevel;
  age: number;
  stories: Asset[];
  inPlace: string[];
  gap?: Asset;
  viaPolicy?: Asset;
  personId: string;
  lookup: (id: string) => Asset | undefined;
  onJump: (id: string) => void;
  canOpen: boolean;
  canSwitch: boolean;
  onOpen: () => void;
  onOpenStory: (a: Asset) => void;
  proposal: string[];
  onToggleProposal: (id: string) => void;
  responses: Record<string, Reply>;
  onRespond: (gapId: string, reply: Reply) => void;
  onUndoRespond: (gapId: string) => void;
  requested: boolean;
  onRequestAccess: () => void;
  onInsure: (gapId: string) => void;
  onAsk: (a: Asset) => void;
  celebrate: { text: string } | null;
  onUndoCelebrate: () => void;
  dangers: { scenario: string; outcome: string }[];
}) {
  const isPerson = asset.kind === "person";
  // When a danger has just been avoided, show the news at the top.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (celebrate) top.current?.scrollTo({ top: 0 });
  }, [celebrate]);
  const tagline = gap ? gap.story?.headline : asset.kind === "policy" || asset.kind === "product" || asset.kind === "property" ? (state === "neutral" ? "Not needed right now" : STATE_WORD[state as Status]) : asset.kind === "category" || asset.kind === "group" ? asset.caption : undefined;
  const renews = asset.facts.find((f) => f.k === "Renews")?.v;
  const good = goodToKnow(asset, lookup);
  const policy = asset.kind === "policy" ? asset : viaPolicy?.kind === "policy" ? viaPolicy : undefined;
  const scenarios = policy?.scenarios;
  // One line that is about this person's own policy, from what is on file.
  const note = policy?.facts.find((f) => f.k === "Note")?.v;
  const personal = note ? (/value declining/i.test(note) ? "Your car is getting older: the omnium pays up to its current value, which falls each year." : /employer/i.test(note) ? "Worth knowing: an employer may offer hospital cover too, so you might be paying twice." : `${note}.`) : undefined;
  const docs = asset.links.filter((l) => l.pdf);
  const links = asset.links.filter((l) => !l.pdf && !/\(mock\)/.test(l.label));
  const insurerLink = policy ? links.find((l) => l.external) : undefined;
  const canAct = level === "self" || level === "joint" || level === "proxy";
  const banner = BANNER[level](personName);
  const first = stories.slice(0, 3);
  const rest = stories.slice(3);
  const row = (a: Asset) => (
    <li key={a.id} className="cw-look-row">
      <button type="button" className="cw-look" onClick={() => onOpenStory(a)}>
        <PixelIcon id={a.glyph} size={22} />
        <span>{a.story?.headline}</span>
      </button>
      <button type="button" className="cw-ask" onClick={() => onAsk(a)} aria-label={`Ask about: ${a.story?.headline}`}>Ask</button>
    </li>
  );

  return (
    <div className="cw-info" ref={top}>
      {celebrate ? (
        <p className="cw-avoided" role="status">
          <span aria-hidden="true">✓</span> {celebrate.text} <button type="button" onClick={onUndoCelebrate}>Undo</button>
        </p>
      ) : null}
      {banner && isPerson ? (
        <p className={`cw-banner cw-banner-${level}`}>
          {banner}
          {level === "none" ? (
            requested ? <em> Request sent (mock).</em> : <button type="button" onClick={onRequestAccess}>Ask {personName} to share</button>
          ) : null}
        </p>
      ) : null}

      <header className="cw-ph">
        <PixelIcon id={asset.glyph} size={40} />
        <div>
          <h2>{title}</h2>
          {tagline ? <p className={`cw-tagline cw-tagline-${state}`}>{tagline}</p> : null}
        </div>
        {canOpen ? <button type="button" className="cw-open" onClick={onOpen}>Open</button> : null}
        {canSwitch ? <button type="button" className="cw-open" onClick={onOpen}>Switch</button> : null}
      </header>

      {stories.length > 0 ? (
        <>
          <p className="cw-label">Dangers to look at</p>
          <ul className="cw-looks" aria-label={`Things to look at for ${personName}`}>
            {first.map(row)}
            {rest.length > 0 ? (
              <li>
                <details className="cw-rest">
                  <summary>{rest.length} more</summary>
                  <ul className="cw-looks">{rest.map(row)}</ul>
                </details>
              </li>
            ) : null}
          </ul>
        </>
      ) : isPerson && asset.id === `person:${personId}` && level !== "none" ? (
        <p className="cw-quiet">{isMe ? "All good: nothing to look at." : `Nothing to look at for ${personName}.`}</p>
      ) : null}

      {inPlace.length > 0 ? <p className="cw-inplace"><span>In place</span> {inPlace.join(" · ")}</p> : null}

      {asset.kind === "employer" ? (
        <div className="cw-offer2">
          <p className="cw-offer-line">{asset.story?.line}</p>
          <p className="cw-muted">Worth asking: hospital cover, income if you cannot work, and a pension or life plan. Your employer\u2019s benefits overview will say.</p>
          {responses[asset.id] ? (
            <p className="cw-muted">Noted. <button type="button" onClick={() => onUndoRespond(asset.id)}>Undo</button></p>
          ) : (
            <div className="cw-offer-actions">
              <button type="button" onClick={() => onRespond(asset.id, "covered-elsewhere")}>I\u2019ve looked into it</button>
            </div>
          )}
        </div>
      ) : null}

      {gap && gap.story && dangers.length > 0 ? (
        <>
          <p className="cw-label">What could happen</p>
          <ul className="cw-cov cw-cov-no">
            {dangers.slice(0, 4).map((d) => (
              <li key={d.scenario}><span aria-hidden="true">!</span><div><strong>{d.scenario}</strong><small>Nothing pays for this today.</small></div></li>
            ))}
          </ul>
        </>
      ) : null}

      {gap && gap.story ? (
        <OfferCard gap={gap} age={age} name={personName} canAct={canAct} proposal={proposal} response={responses[gap.id]} onAdd={onToggleProposal} onRespond={onRespond} onUndo={onUndoRespond} onInsure={onInsure} proxy={level === "proxy"} />
      ) : null}

      {(asset.kind === "policy" || viaPolicy?.kind === "policy") && (state === "covered" || state === "shared") ? (
        <p className="cw-line">
          {(viaPolicy ?? asset).caption}
          {renews ? ` · renews ${renews}` : ""}
        </p>
      ) : null}
      {asset.kind === "product" && !gap && state === "neutral" ? <p className="cw-line">{asset.facts.find((f) => f.k === "Covers")?.v}</p> : null}
      {["account", "card", "loan", "goal", "property"].includes(asset.kind) ? <p className="cw-line">{asset.caption}</p> : null}

      {scenarios && (scenarios.pays.length > 0 || scenarios.not.length > 0) ? (
        <div className="cw-coverage">
          {scenarios.pays.length > 0 ? (
            <>
              <p className="cw-label">When it pays</p>
              <ul className="cw-cov cw-cov-yes">
                {scenarios.pays.map((c) => (
                  <li key={c.scenario}><span aria-hidden="true">✓</span><div><strong>{c.scenario}</strong><small>{c.outcome}</small></div></li>
                ))}
              </ul>
            </>
          ) : null}
          {scenarios.not.length > 0 ? (
            <>
              <p className="cw-label">When it does not</p>
              <ul className="cw-cov cw-cov-no">
                {scenarios.not.map((c) => (
                  <li key={c.scenario}><span aria-hidden="true">✕</span><div><strong>{c.scenario}</strong><small>{c.outcome}</small></div></li>
                ))}
              </ul>
            </>
          ) : null}
          {personal ? <p className="cw-personal">{personal}</p> : null}
          <p className="cw-muted cw-cov-note">Typical situations for this kind of policy. Your own conditions decide.</p>
        </div>
      ) : null}

      {docs.length > 0 || insurerLink ? (
        <>
          <p className="cw-label">Documents</p>
          <ul className="cw-docs">
            {insurerLink ? (
              <li>
                <a href={insurerLink.href} target="_blank" rel="noopener noreferrer"><PixelIcon id="building" size={20} /> <span>{insurerLink.label}</span> <small>website ↗</small></a>
              </li>
            ) : null}
            {docs.map((d) => (
              <li key={d.href}>
                <a href={d.href} target="_blank" rel="noopener noreferrer">
                  <PixelIcon id="pdf" size={20} /> <span>{d.label}</span> <small>PDF ↗</small>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!policy && (good.length > 0 || links.length > 0) ? (
        <details className="cw-more">
          <summary>Details</summary>
          <ul className="cw-good">
            {good.map((l, i) => (
              <li key={i}>
                {l.text}
                {l.links?.map((k, j) => (
                  <span key={k.id}>
                    {j > 0 ? " and " : " "}
                    <button type="button" onClick={() => onJump(k.id)}>{k.label}</button>
                  </span>
                ))}
                {l.links ? "." : ""}
              </li>
            ))}
            {links.map((l) => (
              <li key={l.href}>{l.external ? <a href={l.href} target="_blank" rel="noopener noreferrer">{l.label} ↗</a> : <Link href={l.href}>{l.label}</Link>}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
