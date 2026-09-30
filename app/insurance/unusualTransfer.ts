export const formatEuro = (amount: number) => `€${Math.round(amount).toLocaleString("en-BE")}`;

const AGREED_TRANSFER_LIMIT_EUR = 1000;

/**
 * A mock fraud-detection alert, not in the data lake: KBC holds a large transfer out of the grandparents'
 * savings and asks Koen, who has a proxy mandate on their accounts, to check it with them.
 */
export const UNUSUAL_TRANSFER = {
  reviewerId: "P01",
  initiatorId: "P03",
  accountId: "acc:A11",
  amountEur: 10000,
  counterpartyName: "NOVA VEILIGE REKENING",
  counterpartyIban: "LT62 3250 0947 1128 0413",
  when: "Today, 09:41",
  signals: [
    "New beneficiary, added minutes before the transfer",
    "Foreign account (Lithuania)",
    `Well above Jozef's ${formatEuro(AGREED_TRANSFER_LIMIT_EUR)} transfer limit agreed at the branch in June`,
    "Same pattern as the phishing transfer KBC blocked on 17 Jun 2026",
  ],
  /** The cover that pays out after scams and unauthorised payments. */
  coverProductId: "kbc:cybersecure",
} as const;

export type ReviewOutcome = "pending" | "dismissed" | "confirmed" | "reported";

/** "Later" only snoozes the toast: the transfer stays on hold until the reviewer decides. */
export const isReviewHandled = (outcome: ReviewOutcome) => outcome === "confirmed" || outcome === "reported";
