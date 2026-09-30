"use client";

import { useEffect, useRef } from "react";
import type { Asset, EgoModel } from "@/lib/insurance/ego";
import type { Status } from "@/lib/insurance/model";
import { formatEuro, UNUSUAL_TRANSFER, type ReviewOutcome } from "./unusualTransfer";

const INSURED_LABEL: Record<Status, string> = { covered: "Insured", shared: "Insured via family", gap: "Not insured", upcoming: "Needed soon", na: "Not relevant" };
const INSURED_CLASS: Record<Status, string> = { covered: "ok", shared: "via", gap: "gap", upcoming: "soon", na: "" };
const OWNER_ROLE = "owner";

type OwnerCover = { personId: string; name: string; state: Status | undefined; via: Asset | undefined };

export function UnusualActivityReview({
  ego,
  nameOf,
  outcome,
  proposal,
  onClose,
  onDecide,
  onShowAccount,
  onOpenForPerson,
  onToggleProposal,
}: {
  ego: EgoModel;
  nameOf: (personId: string) => string;
  outcome: ReviewOutcome;
  proposal: string[];
  onClose: () => void;
  onDecide: (outcome: ReviewOutcome) => void;
  onShowAccount: () => void;
  onOpenForPerson: (personId: string, assetId: string) => void;
  onToggleProposal: (coverId: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const tx = UNUSUAL_TRANSFER;
  const account = ego.assets[tx.accountId];
  const cover = ego.assets[tx.coverProductId];
  const initiator = nameOf(tx.initiatorId);
  const reviewer = nameOf(tx.reviewerId);
  if (!account || !cover) return null;

  const fact = (key: string) => account.facts.find((f) => f.k === key)?.v ?? "unknown";
  const owners: OwnerCover[] = account.personIds
    .filter((id) => account.roles[id] === OWNER_ROLE)
    .map((id) => ({ personId: id, name: nameOf(id), state: cover.personState[id], via: ego.assets[cover.via?.[id] ?? ""] }));
  const insuredOwners = owners.filter((o) => o.state === "covered" || o.state === "shared");
  const offer = owners.map((o) => o.via).find((a): a is Asset => a?.kind === "gap" && Boolean(a.product && a.coverId));
  const reviewerAccess = account.roles[tx.reviewerId];

  return (
    <dialog
      ref={dialogRef}
      className="cw-review"
      aria-labelledby="cw-review-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="cw-review-head">
        <p className="cw-kind">Unusual activity · for {reviewer} to check</p>
        <h2 id="cw-review-title">{formatEuro(tx.amountEur)} from {account.label}</h2>
        <button type="button" className="cw-toast-close" onClick={onClose} aria-label="Close review">×</button>
      </header>

      <ol className="cw-review-steps">
        <li>
          <h3>The transaction</h3>
          <dl className="cw-rows">
            <div><dt>Amount</dt><dd>{formatEuro(tx.amountEur)} · on hold</dd></div>
            <div><dt>Made by</dt><dd>{initiator}</dd></div>
            <div><dt>To</dt><dd>{tx.counterpartyName}<br /><span className="cw-muted">{tx.counterpartyIban}</span></dd></div>
            <div><dt>When</dt><dd>{tx.when}</dd></div>
          </dl>
          <p className="cw-review-sub">Why KBC flagged it</p>
          <ul className="cw-review-signals">
            {tx.signals.map((signal) => <li key={signal}>{signal}</li>)}
          </ul>
        </li>

        <li>
          <h3>The account</h3>
          <dl className="cw-rows">
            <div><dt>Account</dt><dd>{account.label}</dd></div>
            <div><dt>IBAN</dt><dd>{fact("IBAN")}</dd></div>
            <div><dt>Balance</dt><dd>{fact("Balance")}</dd></div>
            <div><dt>Held by</dt><dd>{owners.map((o) => o.name).join(" & ")}</dd></div>
            {reviewerAccess ? <div><dt>{reviewer}&apos;s access</dt><dd>{reviewerAccess}</dd></div> : null}
          </dl>
          <button type="button" className="cw-open" onClick={onShowAccount}>Show account on the map</button>
        </li>

        <li>
          <h3>Is this insured?</h3>
          <p className={`cw-review-verdict cw-${insuredOwners.length === owners.length ? "ok" : "gap"}`}>
            {insuredOwners.length === owners.length
              ? `Yes: ${cover.label} covers ${owners.map((o) => o.name).join(" and ")} for certain scams and fraud.`
              : insuredOwners.length === 0
                ? `No: ${owners.map((o) => o.name).join(" and ")} have no fraud cover on file. A scam payment ${initiator} approves himself may not be refunded.`
                : `Partly: only ${insuredOwners.map((o) => o.name).join(" and ")} ${insuredOwners.length === 1 ? "has" : "have"} fraud cover.`}
          </p>
          <ul className="cw-review-owners">
            {owners.map((o) => (
              <li key={o.personId}>
                <span>{o.name}</span>
                <span className={`cw-state cw-${o.state ? INSURED_CLASS[o.state] : "gap"}`}>{o.state ? INSURED_LABEL[o.state] : "No cover on file"}</span>
                {o.via ? (
                  <button type="button" onClick={() => onOpenForPerson(o.personId, o.via?.id ?? "")}>Open on {o.name}&apos;s map</button>
                ) : null}
              </li>
            ))}
          </ul>
          {offer?.product && offer.coverId ? (
            <div className="cw-offer">
              <p className="cw-kind">Would cover this next time</p>
              <p className="cw-offer-name">{offer.product.name}</p>
              <p>{offer.product.pitch}</p>
              <p className="cw-muted">From €{offer.product.monthly} / month (mock price)</p>
              <button type="button" className="cw-add" aria-pressed={proposal.includes(offer.coverId)} onClick={() => onToggleProposal(offer.coverId as string)}>
                {proposal.includes(offer.coverId) ? "Remove from proposal" : "Add to proposal"}
              </button>
            </div>
          ) : null}
        </li>

        <li>
          <h3>What now</h3>
          {outcome === "confirmed" ? (
            <p className="cw-review-verdict cw-ok" role="status">{initiator} confirmed the payment. KBC releases it (mock).</p>
          ) : outcome === "reported" ? (
            <p className="cw-review-verdict cw-gap" role="status">Kept blocked. KBC&apos;s fraud desk removes the beneficiary and calls {initiator} (mock).</p>
          ) : (
            <>
              <p className="cw-muted">Call {initiator} and ask whether he made this payment himself, and whether anyone asked him to.</p>
              <div className="cw-toast-actions">
                <button type="button" className="cw-add" onClick={() => onDecide("reported")}>Not recognised: keep it blocked</button>
                <button type="button" className="cw-open" onClick={() => onDecide("confirmed")}>{initiator} confirms it&apos;s his</button>
              </div>
            </>
          )}
        </li>
      </ol>
    </dialog>
  );
}
