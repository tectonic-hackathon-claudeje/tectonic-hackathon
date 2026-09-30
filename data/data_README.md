# NovaBank mock data lake — the Peeters family

Fictional bank, fictional people, fictional IBANs (valid Belgian check digits). Window: **1 Oct 2025 – 30 Sep 2026** (snapshot date 30 Sep 2026). Belgian context: EUR, Dutch-language raw bank descriptions, Belgian merchants, domiciliations, OGM structured references, Groeipakket, dienstencheques, pensioensparen, onroerende voorheffing.

Same data in three shapes: `csv/` (one file per table), `novabank_datalake.sqlite` (all tables, query with SQL), `json/` (nested per-person "API view" of what each person can see). `generate_datalake.py` regenerates everything (seeded, so reproducible) and is easy to extend.

## The family

| ID | Person | Age | Situation | Digital |
|---|---|---|---|---|
| P01 | Koen Peeters | 52 | Engineer, Tienen. Joint account with Els. Holds a **proxy mandate** on his parents' account | high |
| P02 | Els Janssens | 50 | Teacher. Co-owner of joint account; has view access on Lotte's account | medium |
| P03 | Jozef Peeters | 82 | Retired, Diest. Hip surgery Feb 2026, care needs rising. Target of a phishing attempt | low |
| P04 | Maria Claes | 79 | Retired, no smartphone. Unknowingly signed up for a fake "trial" subscription | very low |
| P05 | Arne Peeters | 24 | Junior developer in Brussels, lives at home, pays €300/month to parents, saving for an apartment | very high |
| P06 | Lotte Peeters | 20 | Psychology student at KU Leuven, kot in Leuven, student job, often short at month end | very high |

## Tables

**Who & access:** `persons`, `households`, `relationships`, `mandates` (grandparents → Koen proxy; Lotte → parents sharing), `account_access` (owner / proxy_mandate / proxy_view_only / shared_view with permissions), `preferences_consents`, `devices`.

**Products:** `accounts` (17: joint current & savings, personal accounts, pension savings, credit cards, investment, parents' current/savings/term deposit, kids' accounts), `cards`, `loans` + `loan_schedule` (mortgage, car loan), `insurance_policies`, `instruments` + `instrument_prices` + `holdings` + `investment_orders`, `external_accounts` (PSD2-linked).

**Money movements:** `transactions` (~2,000 rows) — each row has both the messy `raw_description` (what today's apps show) and clean enriched fields: `category/subcategory`, `merchant_id`, `channel`, `card_id`, `initiated_by`, `recurring_id`, `transfer_id` (links both legs of internal/family transfers), `status` (booked / declined / blocked_by_fraud_engine), `flags` (low_balance, foreign, possible_duplicate, life_event_signal…), running `balance_after`. Also `recurring_payments` (direct debits, standing orders, card subscriptions), `beneficiaries`, `monthly_balances`, `merchants`, `categories`.

**Behaviour & service:** `app_sessions` + `app_events` (screens, searches, feature use such as the mortgage simulator), `notifications` (sent/opened/action), `support_interactions`, `documents`, `security_events`, `budgets`, `savings_goals`.

**Ground truth:** `anticipated_needs_ground_truth` — the needs the app *should* detect, with the evidence planted in the data and a suggested proactive action. Use it to test whether your design (or a model) surfaces the right thing.

## Scenarios planted in the data

1. **Caregiver son** — Koen checks his parents' account every Monday (twice a week from March). Their costs shift: hospital bill, home nursing, meals on wheels, extra cleaning vouchers, rising pharmacy spend, new zorgbudget income.
2. **Elderly fraud** — 17 Jun 2026: fake bank call → new remote device → new LT beneficiary → €4,850 transfer blocked → proxy alert to Koen. Separately Maria's card has unrecognised recurring charges since July (open case).
3. **Duplicate bill** — Proximus debited twice on the parents' account in June, refunded in July.
4. **First home** — Arne: raise in March, bigger savings transfers, Immoweb, notary, building inspection, repeated mortgage-simulator sessions and searches.
5. **Student cash-flow** — Lotte's declined payments and low balance at month end, top-up transfers from parents, summer job surplus, Erasmus application for Lisbon (Feb 2027).
6. **Lumpy household costs** — Tuition, kot rent and new-contract deposit, property tax, car tax, insurance renewal, Christmas spike, holiday in Provence, a large garage bill on an ageing car.
7. **Product milestones** — Grandparents' term deposit matures 15 Nov 2026 (notice unread); car loan ends March 2027 (frees ~€392/month).
8. **Subscriptions** — Disney+ started at Christmas, barely used, searched for "disney" and asked support how to cancel; Telenet price increase.
9. **Idle cash** — Money piling up on Koen's and Arne's current accounts.

## Notes
Amounts, tax/benefit figures and rates are plausible but mock, not official values. `balance_after` on investment/pension accounts is the cash leg only; portfolio value is in `holdings`. JSON fields in CSVs (lists such as `owners`, `flags`) are JSON-encoded strings.
