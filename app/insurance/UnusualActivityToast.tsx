"use client";

import { useEffect, useState } from "react";
import { formatEuro, UNUSUAL_TRANSFER } from "./unusualTransfer";

const APPEAR_DELAY_MS = 1200;

export function UnusualActivityToast({
  visible,
  initiatorName,
  reviewerName,
  accountLabel,
  onReview,
  onDismiss,
}: {
  visible: boolean;
  initiatorName: string;
  reviewerName: string;
  accountLabel: string;
  onReview: () => void;
  onDismiss: () => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), APPEAR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible || !ready) return null;
  const tx = UNUSUAL_TRANSFER;
  return (
    <div className="cw-toast" role="alert" aria-labelledby="cw-toast-title">
      <span className="cw-toast-icon" aria-hidden="true">!</span>
      <div className="cw-toast-body">
        <p className="cw-kind">KBC detected unusual activity</p>
        <p id="cw-toast-title" className="cw-toast-title">
          {initiatorName} transferred {formatEuro(tx.amountEur)} · on hold
        </p>
        <p className="cw-toast-detail">
          From {accountLabel} to a new foreign account · {tx.when}. {reviewerName}, KBC is holding the payment until you check with {initiatorName} that it was intended.
        </p>
        <div className="cw-toast-actions">
          <button type="button" className="cw-add" onClick={onReview}>Review transaction</button>
          <button type="button" className="cw-open" onClick={onDismiss}>Later</button>
        </div>
      </div>
      <button type="button" className="cw-toast-close" onClick={onDismiss} aria-label="Dismiss alert">×</button>
    </div>
  );
}
