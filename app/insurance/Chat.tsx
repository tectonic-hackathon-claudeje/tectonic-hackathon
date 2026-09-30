"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Action } from "./assistant";
import type { Msg } from "./chatTypes";
import { PixelIcon } from "./pixel";

export type Pick = { id: string; label: string; glyph: string; inPlace: boolean };

/**
 * A chat with one insurance at a time. Each insurance has its own conversation, in its own KBC-branded
 * frame, and is only spoken to when you inspect it. With nothing inspected there is no shared helper:
 * you pick which insurance to talk to. Nothing speaks until you do.
 */
export function ChatPanel({
  speaker,
  picks,
  onPick,
  msgs,
  chips,
  opener,
  onSend,
  onAction,
  onUndo,
  renderOffer,
}: {
  speaker: { kind: "policy" | "cover" | "group"; label: string; sub?: string; glyph: string };
  picks: Pick[];
  onPick: (id: string) => void;
  msgs: Msg[];
  chips: string[];
  opener: string;
  onSend: (text: string) => void;
  onAction: (a: Action) => void;
  onUndo: (id: string) => void;
  renderOffer: (gapId: string) => ReactNode;
}) {
  const [q, setQ] = useState("");
  const list = useRef<HTMLDivElement>(null);
  // Scroll the conversation itself, never the page.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  // Nothing inspected: choose who to talk to.
  if (speaker.kind === "group")
    return (
      <section className="cw-chat cw-chat-pick" aria-label="Talk to an insurance">
        <header className="cw-chat-head">
          <span className="cw-sam"><PixelIcon id="fraud" size={18} ink="#ffffff" accent="#ffffff" /></span>
          <strong>Talk to an insurance</strong>
          <button type="button" className="cw-person" onClick={() => onAction({ kind: "call", label: "Talk to a person" })}>Talk to a person</button>
        </header>
        <p className="cw-opener">{opener}</p>
        <div className="cw-picks">
          {picks.map((p) => (
            <button key={p.id} type="button" className={p.inPlace ? "cw-pick cw-pick-on" : "cw-pick"} onClick={() => onPick(p.id)}>
              <span><PixelIcon id={p.glyph} size={22} ink={p.inPlace ? "#ffffff" : "currentColor"} accent={p.inPlace ? "#ffffff" : "currentColor"} /></span>
              {p.label}
            </button>
          ))}
        </div>
      </section>
    );

  const started = msgs.length > 0;
  return (
    <section className={`cw-chat${started ? " cw-chat-open" : ""}`} aria-label={`Chat with ${speaker.label}`}>
      <header className="cw-chat-head">
        <span className="cw-sam"><PixelIcon id={speaker.glyph} size={18} ink="#ffffff" accent="#ffffff" /></span>
        <span className="cw-who">
          <strong>{speaker.label}</strong>
          {speaker.sub ? <small>{speaker.sub}</small> : null}
        </span>
        <small className="cw-ai" title="This voice is made up by the app to help you. It is not a statement from the insurer.">AI voice</small>
        <button type="button" className="cw-person" onClick={() => onAction({ kind: "call", label: "Talk to a person" })}>Talk to a person</button>
      </header>

      {started ? (
        <div ref={list} className="cw-msgs" role="log" aria-live="polite" aria-relevant="additions">
          {msgs.map((m) =>
            m.role === "system" ? (
              <p key={m.id} className="cw-sys">
                {m.text}{" "}
                {m.nav ? m.nav.undone ? <em>undone</em> : <button type="button" onClick={() => onUndo(m.id)}>Undo</button> : null}
              </p>
            ) : (
              <div key={m.id} className={`cw-msg cw-msg-${m.role}`}>
                <p>{m.text}</p>
                {m.offerGapId ? renderOffer(m.offerGapId) : null}
                {m.actions && m.actions.length > 0 ? (
                  <div className="cw-actions">
                    {m.actions.map((a) =>
                      a.kind === "link" ? (
                        <a key={a.label} href={a.href} target="_blank" rel="noopener noreferrer">{a.label} ↗</a>
                      ) : (
                        <button key={a.label} type="button" onClick={() => onAction(a)}>{a.label}</button>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ),
          )}
        </div>
      ) : (
        <p className="cw-opener">{opener}</p>
      )}

      {chips.length > 0 ? (
        <div className="cw-chips">
          {chips.map((c) => (
            <button key={c} type="button" onClick={() => onSend(c)}>{c}</button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          onSend(q);
          setQ("");
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask me anything…" aria-label={`Message ${speaker.label}`} autoComplete="off" />
        <button type="submit" aria-label="Send">↑</button>
      </form>
    </section>
  );
}
