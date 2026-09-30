"""
Mock banking data lake: the Peeters family (Tienen, Belgium).
Fictional bank: NovaBank. Window: 2025-10-01 .. 2026-09-30.
All people, IBANs, employers and amounts are fictional / mock.
"""
import random, csv, json, os, sqlite3, datetime as dt, math, calendar
from collections import defaultdict

random.seed(7)
OUT = "/home/claude/novabank_datalake"
os.makedirs(OUT, exist_ok=True)
START, END = dt.date(2025, 10, 1), dt.date(2026, 9, 30)
TODAY = END

# ---------------------------------------------------------------- helpers
def r2(x): return round(x + 0.0, 2)

def be_iban(bank, acc):
    base = f"{bank:03d}{acc:07d}"
    chk = int(base) % 97 or 97
    bban = f"{base}{chk:02d}"
    cd = 98 - int(bban + "111400") % 97
    return f"BE{cd:02d}{bban}"

def fmt_iban(i): return " ".join(i[k:k+4] for k in range(0, len(i), 4))

def ogm():
    d = random.randint(10**9, 10**10 - 1)
    c = d % 97 or 97
    s = f"{d:010d}{c:02d}"
    return f"+++{s[:3]}/{s[3:7]}/{s[7:]}+++"

def months():
    y, m = START.year, START.month
    while dt.date(y, m, 1) <= END:
        yield y, m
        m += 1
        if m == 13: y, m = y + 1, 1

def bday(d):
    while d.weekday() >= 5: d += dt.timedelta(days=1)
    return d

def last_bday(y, m):
    d = dt.date(y, m, calendar.monthrange(y, m)[1])
    while d.weekday() >= 5: d -= dt.timedelta(days=1)
    return d

def prev_bday(d):
    while d.weekday() >= 5: d -= dt.timedelta(days=1)
    return d

def day(y, m, dd): return dt.date(y, m, min(dd, calendar.monthrange(y, m)[1]))

def in_window(d): return START <= d <= END

def rand_time(h0=8, h1=21):
    return f"{random.randint(h0, h1):02d}:{random.randint(0,59):02d}:{random.randint(0,59):02d}"

def days_of_month(y, m):
    for dd in range(1, calendar.monthrange(y, m)[1] + 1):
        d = dt.date(y, m, dd)
        if in_window(d): yield d

def write_csv(name, rows, cols=None):
    if not rows: return
    cols = cols or list(rows[0].keys())
    with open(f"{OUT}/csv/{name}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v) for k, v in r.items()})
    TABLES[name] = (cols, rows)

TABLES = {}
os.makedirs(f"{OUT}/csv", exist_ok=True)

# ---------------------------------------------------------------- persons
persons = [
    dict(person_id="P01", first_name="Koen", last_name="Peeters", birth_date="1974-03-11", gender="M",
         household_role="father / primary user", occupation="Project engineer", employer="Vandermeulen Engineering NV",
         street="Leuvenselaan 112", postal_code="3300", city="Tienen", email="koen.peeters@example.be",
         phone="+32 470 11 22 33", language="nl", customer_since="1998-09-01", marital_status="married",
         digital_literacy="high", kyc_status="verified", segment="mass_affluent", preferred_channel="mobile_app"),
    dict(person_id="P02", first_name="Els", last_name="Janssens", birth_date="1976-07-02", gender="F",
         household_role="mother / co-owner joint account", occupation="Secondary school teacher", employer="Onderwijs Vlaanderen",
         street="Leuvenselaan 112", postal_code="3300", city="Tienen", email="els.janssens@example.be",
         phone="+32 475 44 55 66", language="nl", customer_since="2001-05-14", marital_status="married",
         digital_literacy="medium", kyc_status="verified", segment="mass_affluent", preferred_channel="mobile_app"),
    dict(person_id="P03", first_name="Jozef", last_name="Peeters", birth_date="1944-01-20", gender="M",
         household_role="grandfather (Koen's father)", occupation="Retired (former railway technician)", employer="",
         street="Schaffensestraat 45", postal_code="3290", city="Diest", email="",
         phone="+32 13 31 22 44", language="nl", customer_since="1968-02-01", marital_status="married",
         digital_literacy="low", kyc_status="verified", segment="senior", preferred_channel="branch"),
    dict(person_id="P04", first_name="Maria", last_name="Claes", birth_date="1947-05-30", gender="F",
         household_role="grandmother (Koen's mother)", occupation="Retired (former shop assistant)", employer="",
         street="Schaffensestraat 45", postal_code="3290", city="Diest", email="",
         phone="+32 13 31 22 44", language="nl", customer_since="1969-06-01", marital_status="married",
         digital_literacy="very_low", kyc_status="verified", segment="senior", preferred_channel="branch"),
    dict(person_id="P05", first_name="Arne", last_name="Peeters", birth_date="2002-02-14", gender="M",
         household_role="son - working, living at home", occupation="Junior software developer", employer="Cloudwise BV (Brussels)",
         street="Leuvenselaan 112", postal_code="3300", city="Tienen", email="arne.peeters@example.be",
         phone="+32 478 90 12 34", language="nl", customer_since="2002-03-01", marital_status="single",
         digital_literacy="very_high", kyc_status="verified", segment="young_professional", preferred_channel="mobile_app"),
    dict(person_id="P06", first_name="Lotte", last_name="Peeters", birth_date="2005-10-09", gender="F",
         household_role="daughter - student (kot in Leuven)", occupation="Student, 3rd bachelor Psychology, KU Leuven",
         employer="Student job: Delhaize Leuven", street="Leuvenselaan 112 (domicile) / Naamsestraat 88 bus 3 (kot)",
         postal_code="3300", city="Tienen", email="lotte.peeters@example.be", phone="+32 479 56 78 90", language="nl",
         customer_since="2005-11-01", marital_status="single", digital_literacy="very_high", kyc_status="verified",
         segment="student", preferred_channel="mobile_app"),
]
for p in persons:
    b = dt.date.fromisoformat(p["birth_date"])
    p["age_at_snapshot"] = TODAY.year - b.year - ((TODAY.month, TODAY.day) < (b.month, b.day))
    p["household_id"] = "H02" if p["person_id"] in ("P03", "P04") else "H01"

households = [
    dict(household_id="H01", name="Peeters-Janssens household", address="Leuvenselaan 112, 3300 Tienen",
         members=["P01", "P02", "P05", "P06"], head_contact="P01", dwelling="owned house (mortgage)", size=4),
    dict(household_id="H02", name="Peeters-Claes (grandparents)", address="Schaffensestraat 45, 3290 Diest",
         members=["P03", "P04"], head_contact="P03", dwelling="owned house (paid off)", size=2),
]

relationships = [
    ("P01", "P02", "spouse", "1999-08-21"), ("P01", "P03", "child_of", ""), ("P01", "P04", "child_of", ""),
    ("P03", "P04", "spouse", "1966-04-16"), ("P05", "P01", "child_of", ""), ("P05", "P02", "child_of", ""),
    ("P06", "P01", "child_of", ""), ("P06", "P02", "child_of", ""), ("P05", "P06", "sibling", ""),
    ("P05", "P03", "grandchild_of", ""), ("P06", "P03", "grandchild_of", ""),
]
relationships = [dict(relationship_id=f"R{i+1:02d}", person_id=a, related_person_id=b, relation=t, since=s)
                 for i, (a, b, t, s) in enumerate(relationships)]

# ---------------------------------------------------------------- accounts
acc_defs = [
    # id, type, product, owners, nickname, opened, rate, overdraft, opening_balance
    ("A01", "current", "NovaPlus Joint Current Account", ["P01", "P02"], "Household account", "2000-01-10", 0.0, 1500, 4250.00),
    ("A02", "savings", "NovaSave Regulated Savings", ["P01", "P02"], "Emergency buffer", "2003-06-02", 0.0125, 0, 21480.00),
    ("A03", "current", "NovaPlus Current Account", ["P01"], "Koen personal", "1998-09-01", 0.0, 500, 1840.00),
    ("A04", "current", "NovaPlus Current Account", ["P02"], "Els personal", "2001-05-14", 0.0, 500, 3310.00),
    ("A05", "pension_savings", "NovaPension Fund (pensioensparen)", ["P01"], "Koen pension saving", "2004-01-15", None, 0, 38650.00),
    ("A06", "pension_savings", "NovaPension Fund (pensioensparen)", ["P02"], "Els pension saving", "2006-03-01", None, 0, 29120.00),
    ("A07", "credit_card", "NovaCard Mastercard Gold", ["P01"], "Koen credit card", "2012-04-01", 0.1199, 0, 0.00),
    ("A08", "investment", "NovaInvest Portfolio (joint)", ["P01", "P02"], "Long-term investing", "2016-02-01", None, 0, 0.00),
    ("A10", "current", "NovaBasic Joint Current Account", ["P03", "P04"], "Pa & Ma zichtrekening", "1968-02-01", 0.0, 0, 3860.00),
    ("A11", "savings", "NovaSave Regulated Savings", ["P03", "P04"], "Pa & Ma spaarrekening", "1975-01-01", 0.0125, 0, 41230.00),
    ("A12", "term_deposit", "NovaTerm 3y Term Deposit", ["P03", "P04"], "Termijnrekening", "2023-11-15", 0.0275, 0, 25000.00),
    ("A20", "current", "NovaYoung Current Account", ["P05"], "Arne", "2020-02-14", 0.0, 0, 1640.00),
    ("A21", "savings", "NovaSave Regulated Savings", ["P05"], "Apartment fund", "2021-09-01", 0.0125, 0, 14200.00),
    ("A22", "credit_card", "NovaCard Visa Classic", ["P05"], "Arne credit card", "2024-03-01", 0.1199, 0, 0.00),
    ("A23", "investment", "NovaInvest ETF Plan", ["P05"], "Arne ETF plan", "2024-01-10", None, 0, 0.00),
    ("A30", "current", "NovaStudent Current Account", ["P06"], "Lotte", "2023-09-15", 0.0, 0, 212.00),
    ("A31", "savings", "NovaSave Regulated Savings", ["P06"], "Lotte savings", "2005-11-01", 0.0125, 0, 2310.00),
]
accounts, ACC = [], {}
for k, (aid, typ, prod, own, nick, opened, rate, od, ob) in enumerate(acc_defs):
    iban = be_iban(735, 2100000 + k * 7919 + random.randint(0, 999))
    a = dict(account_id=aid, iban=iban, iban_formatted=fmt_iban(iban), account_type=typ, product_name=prod,
             owners=own, holding="joint" if len(own) > 1 else "individual", nickname=nick, currency="EUR",
             opened_date=opened, interest_rate=rate, overdraft_limit=od, opening_balance_at_window_start=ob,
             status="active", household_id="H02" if own[0] in ("P03", "P04") else "H01")
    accounts.append(a); ACC[aid] = a

account_access = [
    ("A01", "P01", "owner"), ("A01", "P02", "owner"), ("A02", "P01", "owner"), ("A02", "P02", "owner"),
    ("A03", "P01", "owner"), ("A04", "P02", "owner"), ("A05", "P01", "owner"), ("A06", "P02", "owner"),
    ("A07", "P01", "owner"), ("A08", "P01", "owner"), ("A08", "P02", "owner"),
    ("A10", "P03", "owner"), ("A10", "P04", "owner"), ("A10", "P01", "proxy_mandate"),
    ("A11", "P03", "owner"), ("A11", "P04", "owner"), ("A11", "P01", "proxy_view_only"),
    ("A12", "P03", "owner"), ("A12", "P04", "owner"), ("A12", "P01", "proxy_view_only"),
    ("A20", "P05", "owner"), ("A21", "P05", "owner"), ("A22", "P05", "owner"), ("A23", "P05", "owner"),
    ("A30", "P06", "owner"), ("A30", "P02", "shared_view"), ("A30", "P01", "shared_view"), ("A31", "P06", "owner"),
]
PERM = {"owner": ["view", "pay", "transfer", "manage_cards", "manage_settings"],
        "proxy_mandate": ["view", "pay", "transfer_to_known_beneficiaries"],
        "proxy_view_only": ["view"], "shared_view": ["view_balance", "view_transactions"]}
account_access = [dict(account_id=a, person_id=p, access_role=r, permissions=PERM[r],
                       granted_on={"A10": "2024-05-06", "A11": "2024-05-06", "A12": "2024-05-06", "A30": "2023-09-20"}.get(a, ACC[a]["opened_date"]) if r != "owner" else ACC[a]["opened_date"])
                  for a, p, r in account_access]

mandates = [
    dict(mandate_id="MD01", grantor_ids=["P03", "P04"], grantee_id="P01", accounts=["A10", "A11", "A12"],
         mandate_type="bank_proxy (volmacht)", scope="A10: view + payments up to 2,500 EUR/tx to known beneficiaries; A11/A12: view only",
         signed_on="2024-05-06", signed_at="Branch NovaBank Diest", valid_until="", notes="Set up after Jozef's hospital stay in spring 2024"),
    dict(mandate_id="MD02", grantor_ids=["P06"], grantee_id="P02", accounts=["A30"], mandate_type="account_sharing (view)",
         scope="balance + transactions view", signed_on="2023-09-20", signed_at="In-app", valid_until="", notes="Lotte shared with both parents when she moved into her kot"),
]

# ---------------------------------------------------------------- cards
card_defs = [
    ("C01", "A01", "P01", "debit", "Bancontact/Maestro"), ("C02", "A01", "P02", "debit", "Bancontact/Maestro"),
    ("C03", "A03", "P01", "debit", "Bancontact/Debit Mastercard"), ("C04", "A04", "P02", "debit", "Bancontact/Debit Mastercard"),
    ("C05", "A07", "P01", "credit", "Mastercard Gold"),
    ("C10", "A10", "P03", "debit", "Bancontact/Maestro"), ("C11", "A10", "P04", "debit", "Bancontact/Maestro"),
    ("C20", "A20", "P05", "debit", "Bancontact/Debit Mastercard"), ("C21", "A22", "P05", "credit", "Visa Classic"),
    ("C30", "A30", "P06", "debit", "Bancontact/Debit Mastercard"),
]
cards = []
for cid, aid, pid, kind, brand in card_defs:
    cards.append(dict(card_id=cid, account_id=aid, holder_id=pid, card_kind=kind, brand=brand,
                      pan_masked=f"{random.choice(['6703','5100','5412','4871'])} XXXX XXXX {random.randint(1000,9999)}",
                      expiry=f"{random.randint(1,12):02d}/{random.randint(27,30)}", status="active",
                      contactless_enabled=True, online_payments_enabled=pid not in ("P04",),
                      abroad_enabled_regions=["EU"] if pid in ("P03", "P04") else ["EU", "WORLD"],
                      weekly_limit=({"P03": 1000, "P04": 500}.get(pid, 2500)), mobile_wallet=("apple_pay" if pid in ("P05", "P06") else "google_pay" if pid == "P01" else "none")))
CARD_OF = {(c["account_id"], c["holder_id"]): c["card_id"] for c in cards}

# ---------------------------------------------------------------- merchants
merchant_rows = [
    ("Colruyt", "groceries", "supermarket", 5411, False), ("Delhaize", "groceries", "supermarket", 5411, False),
    ("Aldi", "groceries", "supermarket", 5411, False), ("Lidl", "groceries", "supermarket", 5411, False),
    ("Carrefour Express", "groceries", "convenience_store", 5411, False), ("Bakkerij Vanhees", "groceries", "bakery", 5462, False),
    ("Slagerij De Smet", "groceries", "butcher", 5422, False),
    ("TotalEnergies", "transport", "fuel", 5541, False), ("Q8", "transport", "fuel", 5541, False),
    ("NMBS/SNCB", "transport", "public_transport", 4112, True), ("De Lijn", "transport", "public_transport", 4131, True),
    ("Garage Wouters", "transport", "car_maintenance", 7538, False), ("Interparking", "transport", "parking", 7523, False),
    ("Apotheek Centrum", "health", "pharmacy", 5912, False), ("Multipharma", "health", "pharmacy", 5912, False),
    ("Huisartsenpraktijk De Linde", "health", "doctor", 8011, False), ("AZ Diest", "health", "hospital", 8062, False),
    ("Netflix", "leisure", "streaming", 4899, True), ("Spotify", "leisure", "music_streaming", 5815, True),
    ("Disney+", "leisure", "streaming", 4899, True), ("Basic-Fit", "leisure", "sport", 7997, False),
    ("Padelclub Tienen", "leisure", "sport", 7997, False), ("Steam", "leisure", "games", 5816, True),
    ("Ticketmaster", "leisure", "events", 7922, True), ("Strava", "leisure", "subscriptions", 5815, True),
    ("Bol.com", "shopping", "online_marketplace", 5999, True), ("Coolblue", "shopping", "electronics", 5732, True),
    ("Zalando", "shopping", "clothing", 5651, True), ("Zeeman", "shopping", "clothing", 5651, False),
    ("ZARA", "shopping", "clothing", 5651, False), ("Standaard Boekhandel", "shopping", "books", 5942, False),
    ("Vinted", "shopping", "secondhand", 5931, True), ("Decathlon", "shopping", "sporting_goods", 5941, False),
    ("IKEA", "shopping", "home_furniture", 5712, False), ("Hubo", "shopping", "diy", 5200, False),
    ("Fnac", "shopping", "electronics", 5732, False),
    ("Alma Studentenrestaurant", "eating_out", "student_restaurant", 5812, False), ("Café Commerce", "eating_out", "cafe_bar", 5813, False),
    ("De Werf", "eating_out", "cafe_bar", 5813, False), ("Brasserie Het Gasthuis", "eating_out", "restaurant", 5812, False),
    ("Pizzeria Da Mario", "eating_out", "restaurant", 5812, False), ("Takeaway.com", "eating_out", "takeaway", 5814, True),
    ("Starbucks", "eating_out", "coffee", 5814, False), ("Frituur 't Pleintje", "eating_out", "takeaway", 5814, False),
    ("Vinci Autoroutes", "travel", "tolls", 4784, False), ("Airbnb", "travel", "accommodation", 7011, True),
    ("Brussels Airlines", "travel", "flights", 3000, True),
    ("Kapsalon Nathalie", "personal_care", "hairdresser", 7230, False), ("Kruidvat", "personal_care", "drugstore", 5912, False),
    ("HealthPlus Supplements Ltd", "shopping", "online_subscription", 5968, True),
    ("Proximus Shop", "utilities", "telecom", 4814, False),
]
merchants, MID = [], {}
for i, (n, c, s, mcc, online) in enumerate(merchant_rows):
    mid = f"M{i+1:03d}"
    merchants.append(dict(merchant_id=mid, name=n, category=c, subcategory=s, mcc=mcc, online=online,
                          country="GB" if "Ltd" in n else ("FR" if n == "Vinci Autoroutes" else "BE")))
    MID[n] = mid

# ---------------------------------------------------------------- transaction engine
txs = []
recurring = []
TXN = [0]
TR = [0]

def add(acc, date, amount, cp, cat, sub, channel, person=None, desc=None, cp_iban="", merchant=None, city="",
        rec_id=None, transfer_id=None, status="booked", time=None, ref="", flags=None, card=None):
    if not in_window(date): return None
    TXN[0] += 1
    tid = f"T{TXN[0]:06d}"
    if merchant and not card and person:
        card = CARD_OF.get((acc, person))
    t = dict(tx_id=tid, account_id=acc, booking_date=date.isoformat(),
             value_date=(date if channel not in ("card_payment", "card_online") else date - dt.timedelta(days=random.choice([0, 0, 1]))).isoformat(),
             time=time or (rand_time() if channel.startswith("card") or channel in ("atm_withdrawal", "payconiq") else "00:00:00"),
             amount=r2(amount), currency="EUR", direction="credit" if amount > 0 else "debit",
             counterparty_name=cp, counterparty_iban=cp_iban, merchant_id=MID.get(merchant, "") if merchant else "",
             category=cat, subcategory=sub, channel=channel, card_id=card or "", initiated_by=person or "",
             location_city=city, structured_reference=ref, recurring_id=rec_id or "", transfer_id=transfer_id or "",
             status=status, flags=flags or [], raw_description="", balance_after=None)
    t["raw_description"] = desc or raw_desc(t)
    txs.append(t)
    return t

def raw_desc(t):
    """Mimic the messy, unstructured descriptions current banking apps show."""
    d = dt.date.fromisoformat(t["booking_date"])
    ch = t["channel"]
    if ch in ("card_payment", "card_online"):
        return f"BETALING MET DEBETKAART NR {random.randint(4000,4999)} XXXX {t['counterparty_name'].upper()[:22]} {t['location_city'].upper()} {d.strftime('%d/%m')} OM {t['time'][:5]} UUR BANCONTACT"
    if ch == "atm_withdrawal":
        return f"GELDOPNEMING AAN ONZE AUTOMATEN {t['location_city'].upper()} {d.strftime('%d/%m')} {t['time'][:5]} KAART NR XXXX"
    if ch == "direct_debit":
        return f"EUROPESE DOMICILIERING VAN {t['counterparty_name'].upper()} MANDAAT NR {random.randint(10**8,10**9)} REF. {t['structured_reference'] or random.randint(10**6,10**7)}"
    if ch == "payconiq":
        return f"PAYCONIQ BETALING {t['counterparty_name'].upper()} {d.strftime('%d/%m/%Y')}"
    if t["amount"] > 0:
        return f"STORTING VAN {t['counterparty_name'].upper()} {t['counterparty_iban']} MEDEDELING: {t['structured_reference'] or t['subcategory'].replace('_',' ').upper()}"
    return f"OVERSCHRIJVING NAAR {t['counterparty_name'].upper()} {t['counterparty_iban']} {t['structured_reference'] or ''}".strip()

def transfer(frm, to, date, amount, desc, person, sub="internal_transfer", rec_id=None, channel="instant_transfer", cat_from="transfers", cat_to="transfers"):
    if not in_window(date): return
    TR[0] += 1
    trid = f"TR{TR[0]:05d}"
    o_to = " & ".join(p["first_name"] + " " + p["last_name"] for p in persons if p["person_id"] in ACC[to]["owners"])
    o_fr = " & ".join(p["first_name"] + " " + p["last_name"] for p in persons if p["person_id"] in ACC[frm]["owners"])
    add(frm, date, -amount, o_to, cat_from, sub, channel, person, cp_iban=ACC[to]["iban"], rec_id=rec_id, transfer_id=trid, ref=desc,
        desc=f"OVERSCHRIJVING NAAR {ACC[to]['iban']} {o_to.upper()} {desc}")
    add(to, date, amount, o_fr, cat_to, sub, channel, person, cp_iban=ACC[frm]["iban"], rec_id=rec_id, transfer_id=trid, ref=desc,
        desc=f"STORTING VAN {ACC[frm]['iban']} {o_fr.upper()} {desc}")

def ext_iban(): return be_iban(random.choice([1, 63, 68, 96, 310, 363, 635, 734, 751]), random.randint(10**6, 10**7 - 1))

RID = [0]
EXT = {}
def cp_iban(name):
    if name not in EXT: EXT[name] = ext_iban()
    return EXT[name]

def rec(acc, kind, cp, amount_fn, day_fn, cat, sub, person, start=START, end=END, months_filter=None, channel=None,
        frequency="monthly", note="", merchant=None):
    RID[0] += 1
    rid = f"RC{RID[0]:03d}"
    ch = channel or ("direct_debit" if kind == "direct_debit" else "standing_order" if kind == "standing_order" else "card_online")
    sample = amount_fn(2026, 1)
    recurring.append(dict(recurring_id=rid, account_id=acc, kind=kind, counterparty=cp, counterparty_iban=cp_iban(cp) if kind != "card_subscription" else "",
                          typical_amount=r2(sample), frequency=frequency, category=cat, subcategory=sub, owner_id=person,
                          start_date=start.isoformat(), end_date=end.isoformat() if end != END else "", note=note,
                          mandate_reference=f"DOM{random.randint(10**7,10**8)}" if kind == "direct_debit" else ""))
    for y, m in months():
        if months_filter and m not in months_filter: continue
        d = day_fn(y, m)
        if d < start or d > end: continue
        amt = amount_fn(y, m)
        if amt == 0: continue
        add(acc, d, amt, cp, cat, sub, ch, person, cp_iban=cp_iban(cp) if kind != "card_subscription" else "", rec_id=rid,
            merchant=merchant, ref=ogm() if kind == "direct_debit" else "", city="online" if merchant else "")
    return rid

def rec_transfer(frm, to, amount, dayfn, desc, person, start=START, end=END, months_filter=None, cat_from="transfers", cat_to="transfers", sub="internal_transfer"):
    RID[0] += 1
    rid = f"RC{RID[0]:03d}"
    recurring.append(dict(recurring_id=rid, account_id=frm, kind="standing_order", counterparty=f"own/family account {to}",
                          counterparty_iban=ACC[to]["iban"], typical_amount=-amount, frequency="monthly", category=cat_from,
                          subcategory=sub, owner_id=person, start_date=start.isoformat(), end_date="", note=desc, mandate_reference=""))
    for y, m in months():
        if months_filter and m not in months_filter: continue
        d = bday(dayfn(y, m))
        if start <= d <= end:
            transfer(frm, to, d, amount, desc, person, sub=sub, rec_id=rid, channel="standing_order", cat_from=cat_from, cat_to=cat_to)
    return rid

def spend(acc, person, d, merchant, lo, hi, city, online=False, flags=None, cat=None, sub=None):
    m = next(x for x in merchants if x["name"] == merchant)
    return add(acc, d, -random.uniform(lo, hi), merchant, cat or m["category"], sub or m["subcategory"],
               "card_online" if online or m["online"] else random.choice(["card_payment"] * 5 + ["mobile_wallet"]),
               person, merchant=merchant, city="online" if (online or m["online"]) else city, flags=flags)

# ================================================================ INCOME
def salary_koen(y, m):
    base = 3960.0 if (y, m) < (2026, 1) else 4035.0      # index increase Jan 2026
    return base
rid_ks = rec("A03", "incoming", "Vandermeulen Engineering NV", lambda y, m: salary_koen(y, m), lambda y, m: prev_bday(day(y, m, 25)),
             "income", "salary", "P01", channel="sepa_credit_transfer", note="Net monthly salary")
add("A03", bday(dt.date(2025, 12, 18)), 3310.00, "Vandermeulen Engineering NV", "income", "end_of_year_bonus", "sepa_credit_transfer", "P01", cp_iban=cp_iban("Vandermeulen Engineering NV"))
add("A03", bday(dt.date(2026, 5, 28)), 3420.00, "Vandermeulen Engineering NV", "income", "holiday_pay", "sepa_credit_transfer", "P01", cp_iban=cp_iban("Vandermeulen Engineering NV"))
add("A03", bday(dt.date(2026, 3, 30)), 1150.00, "Vandermeulen Engineering NV", "income", "bonus_warrants", "sepa_credit_transfer", "P01", cp_iban=cp_iban("Vandermeulen Engineering NV"))

rid_es = rec("A04", "incoming", "Onderwijs Vlaanderen - AgODi", lambda y, m: 3085.0 if (y, m) < (2026, 1) else 3140.0,
             lambda y, m: last_bday(y, m), "income", "salary", "P02", channel="sepa_credit_transfer", note="Net teacher salary, paid last working day")
add("A04", bday(dt.date(2025, 10, 16)), 1180.00, "Onderwijs Vlaanderen - AgODi", "income", "end_of_year_bonus", "sepa_credit_transfer", "P02", cp_iban=cp_iban("Onderwijs Vlaanderen - AgODi"))
add("A04", bday(dt.date(2026, 5, 29)), 2890.00, "Onderwijs Vlaanderen - AgODi", "income", "holiday_pay", "sepa_credit_transfer", "P02", cp_iban=cp_iban("Onderwijs Vlaanderen - AgODi"))

rec("A01", "incoming", "Groeipakket - Infino", lambda y, m: 172.60, lambda y, m: bday(day(y, m, 10)), "income", "child_benefit", "P02",
    channel="sepa_credit_transfer", note="Groeipakket for Lotte (student < 25)")
add("A01", dt.date(2026, 8, 12), 255.00, "Groeipakket - Infino", "income", "school_bonus", "sepa_credit_transfer", "P02", cp_iban=cp_iban("Groeipakket - Infino"))
add("A01", dt.date(2026, 9, 8), 1236.48, "FOD Financien", "income", "tax_refund", "sepa_credit_transfer", "P01", cp_iban=cp_iban("FOD Financien"), ref="Personenbelasting AJ 2026")

rec("A10", "incoming", "Federale Pensioendienst", lambda y, m: 1928.40 if (y, m) < (2026, 1) else 1966.20, lambda y, m: bday(day(y, m, 1)) if m != 1 else dt.date(y, 1, 2),
    "income", "pension", "P03", channel="sepa_credit_transfer", note="Jozef state pension")
rec("A10", "incoming", "Federale Pensioendienst", lambda y, m: 1052.10 if (y, m) < (2026, 1) else 1072.90, lambda y, m: bday(day(y, m, 1)) if m != 1 else dt.date(y, 1, 2),
    "income", "pension", "P04", channel="sepa_credit_transfer", note="Maria state pension")
add("A10", dt.date(2026, 5, 4), 612.30, "Federale Pensioendienst", "income", "holiday_allowance_pension", "sepa_credit_transfer", "P03", cp_iban=cp_iban("Federale Pensioendienst"))
add("A10", dt.date(2026, 5, 4), 318.70, "Federale Pensioendienst", "income", "holiday_allowance_pension", "sepa_credit_transfer", "P04", cp_iban=cp_iban("Federale Pensioendienst"))
rec("A10", "incoming", "Vlaamse Sociale Bescherming - Zorgbudget", lambda y, m: 140.0, lambda y, m: bday(day(y, m, 20)), "income", "care_allowance", "P03",
    start=dt.date(2026, 4, 1), channel="sepa_credit_transfer", note="Zorgbudget voor zwaar zorgbehoevenden - approved March 2026")

rec("A20", "incoming", "Cloudwise BV", lambda y, m: 2485.0 if (y, m) < (2026, 3) else 2710.0, lambda y, m: prev_bday(day(y, m, 28)),
    "income", "salary", "P05", channel="sepa_credit_transfer", note="Net salary - raise from March 2026")
add("A20", bday(dt.date(2025, 12, 19)), 2140.00, "Cloudwise BV", "income", "end_of_year_bonus", "sepa_credit_transfer", "P05", cp_iban=cp_iban("Cloudwise BV"))
add("A20", bday(dt.date(2026, 6, 5)), 2280.00, "Cloudwise BV", "income", "holiday_pay", "sepa_credit_transfer", "P05", cp_iban=cp_iban("Cloudwise BV"))
rec("A20", "incoming", "Cloudwise BV", lambda y, m: 64.80, lambda y, m: prev_bday(day(y, m, 28)), "income", "expense_reimbursement", "P05",
    channel="sepa_credit_transfer", note="Home-work (train) reimbursement")

lotte_job = {10: 310, 11: 280, 12: 520, 1: 150, 2: 260, 3: 300, 4: 380, 5: 120, 6: 90, 7: 1180, 8: 1240, 9: 410}
rec("A30", "incoming", "Delhaize Le Lion SA (studentenjob)", lambda y, m: lotte_job[m] + random.uniform(-25, 25), lambda y, m: bday(day(y, m, 6)),
    "income", "student_job", "P06", channel="sepa_credit_transfer", note="Variable student-job pay (hours based)")

# gifts from grandparents (birthdays + Christmas)
transfer("A10", "A31", dt.date(2025, 10, 9), 100, "Gelukkige verjaardag Lotte", "P01", sub="gift", cat_from="family", cat_to="income")
transfer("A10", "A30", dt.date(2025, 12, 23), 50, "Kerstmis", "P01", sub="gift", cat_from="family", cat_to="income")
transfer("A10", "A20", dt.date(2025, 12, 23), 50, "Kerstmis", "P01", sub="gift", cat_from="family", cat_to="income")
transfer("A10", "A20", dt.date(2026, 2, 13), 100, "Gelukkige verjaardag Arne", "P01", sub="gift", cat_from="family", cat_to="income")

# ================================================================ FAMILY TRANSFERS / SAVINGS
rec_transfer("A03", "A01", 3000, lambda y, m: day(y, m, 26), "Bijdrage gezamenlijke rekening", "P01", sub="household_contribution")
rec_transfer("A04", "A01", 2600, lambda y, m: day(y, m, 1), "Bijdrage gezamenlijke rekening", "P02", sub="household_contribution")
rec_transfer("A20", "A01", 300, lambda y, m: day(y, m, 1), "Bijdrage thuis Arne", "P05", sub="household_contribution", cat_from="family", cat_to="income")
rec_transfer("A01", "A30", 250, lambda y, m: day(y, m, 28), "Zakgeld + eten Lotte", "P02", sub="allowance", cat_from="family", cat_to="income")
rec_transfer("A01", "A02", 550, lambda y, m: day(y, m, 27), "Maandelijks sparen", "P01", sub="savings_transfer", cat_from="savings_investments", cat_to="savings_investments")
rec_transfer("A20", "A21", 750, lambda y, m: day(y, m, 29), "Appartement sparen", "P05", sub="savings_transfer", cat_from="savings_investments", cat_to="savings_investments",
             end=dt.date(2026, 2, 28))
rec_transfer("A20", "A21", 1150, lambda y, m: day(y, m, 29), "Appartement sparen", "P05", sub="savings_transfer", cat_from="savings_investments", cat_to="savings_investments",
             start=dt.date(2026, 3, 1))
rec_transfer("A30", "A31", 25, lambda y, m: day(y, m, 7), "Spaarpotje", "P06", sub="savings_transfer", cat_from="savings_investments", cat_to="savings_investments")
transfer("A20", "A21", dt.date(2025, 12, 22), 1500, "Bonus naar spaar", "P05", sub="savings_transfer", cat_from="savings_investments", cat_to="savings_investments")
transfer("A20", "A21", dt.date(2026, 6, 8), 1800, "Vakantiegeld naar spaar", "P05", sub="savings_transfer", cat_from="savings_investments", cat_to="savings_investments")
transfer("A03", "A02", dt.date(2025, 12, 20), 2000, "Eindejaarspremie sparen", "P01", sub="savings_transfer", cat_from="savings_investments", cat_to="savings_investments")
transfer("A02", "A01", dt.date(2026, 2, 16), 1650, "Terug van spaar - vakantie", "P02")
transfer("A31", "A30", dt.date(2026, 4, 28), 60, "", "P06")
# Koen tops up parents occasionally? No: Koen pays parents' bills from their account via proxy (see below)

rec_transfer("A10", "A11", 1000, lambda y, m: day(y, m, 3), "Maandelijks sparen", "P03", sub="savings_transfer", cat_from="savings_investments", cat_to="savings_investments")
transfer("A11", "A10", dt.date(2026, 2, 25), 700, "Ziekenhuisfactuur", "P01")
# pension savings (annual cap) + investment plans
rec_transfer("A03", "A05", 87.50, lambda y, m: day(y, m, 5), "Pensioensparen", "P01", sub="pension_savings", cat_from="savings_investments", cat_to="savings_investments")
rec_transfer("A04", "A06", 87.50, lambda y, m: day(y, m, 5), "Pensioensparen", "P02", sub="pension_savings", cat_from="savings_investments", cat_to="savings_investments")
rec_transfer("A01", "A08", 250, lambda y, m: day(y, m, 10), "Beleggingsplan", "P01", sub="investment_plan", cat_from="savings_investments", cat_to="savings_investments")
rec_transfer("A20", "A23", 150, lambda y, m: day(y, m, 2), "ETF plan", "P05", sub="investment_plan", cat_from="savings_investments", cat_to="savings_investments")

# ================================================================ JOINT ACCOUNT FIXED COSTS
rec("A01", "direct_debit", "NovaBank Woonkrediet L01", lambda y, m: -1087.44, lambda y, m: day(y, m, 1), "housing", "mortgage", "P01", note="Mortgage installment (see loans)")
rec("A01", "direct_debit", "NovaBank Autolening L02", lambda y, m: -392.18, lambda y, m: day(y, m, 5), "transport", "car_loan", "P01", note="Car loan - last installment March 2027")
rec("A01", "direct_debit", "Engie", lambda y, m: -198.0 if (y, m) < (2026, 3) else -176.0, lambda y, m: bday(day(y, m, 8)), "utilities", "energy", "P01",
    note="Monthly advance gas+electricity; lowered after annual settlement")
add("A01", dt.date(2026, 2, 24), 214.63, "Engie", "utilities", "energy_settlement_refund", "sepa_credit_transfer", "P01", cp_iban=cp_iban("Engie"), ref="Jaarafrekening 2025")
rec("A01", "direct_debit", "De Watergroep", lambda y, m: -96.40, lambda y, m: bday(day(y, m, 15)), "utilities", "water", "P01", months_filter=[1, 4, 7, 10], frequency="quarterly")
rec("A01", "direct_debit", "Telenet", lambda y, m: -139.95 if (y, m) < (2026, 2) else -146.95, lambda y, m: bday(day(y, m, 12)), "utilities", "internet_tv_mobile", "P01",
    note="Bundle: internet + TV + 3 mobile lines; price increase Feb 2026")
rec("A01", "direct_debit", "AG Insurance", lambda y, m: -684.20, lambda y, m: bday(day(y, m, 14)), "housing", "home_insurance", "P01", months_filter=[11], frequency="yearly",
    note="Fire/home insurance - renews each November")
rec("A01", "direct_debit", "Ethias", lambda y, m: -91.35, lambda y, m: bday(day(y, m, 3)), "transport", "car_insurance", "P01")
rec("A01", "direct_debit", "DKV Belgium", lambda y, m: -58.20, lambda y, m: bday(day(y, m, 4)), "health", "hospitalisation_insurance", "P02",
    note="Family top-up; kids covered until 25")
rec("A01", "direct_debit", "CM Christelijke Mutualiteit", lambda y, m: -128.00, lambda y, m: bday(day(y, m, 20)), "health", "mutuality", "P02", months_filter=[1], frequency="yearly")
rec("A01", "direct_debit", "Pluxee Dienstencheques", lambda y, m: -180.00, lambda y, m: bday(day(y, m, 2)), "household_services", "cleaning_service_vouchers", "P02")
rec("A01", "outgoing", "Vlaamse Belastingdienst", lambda y, m: -331.52, lambda y, m: dt.date(y, m, 17), "taxes", "vehicle_tax", "P01", months_filter=[3], frequency="yearly", channel="sepa_credit_transfer")
rec("A01", "outgoing", "Vlaamse Belastingdienst", lambda y, m: -1392.60, lambda y, m: dt.date(y, m, 23), "taxes", "property_tax", "P01", months_filter=[7], frequency="yearly",
    channel="sepa_credit_transfer", note="Onroerende voorheffing")
rec("A01", "outgoing", "Verhuurder Vandenbroeck (kot)", lambda y, m: -495.0, lambda y, m: day(y, m, 1), "education", "student_housing", "P02",
    months_filter=[10, 11, 12, 1, 2, 3, 4, 5, 6, 9], channel="standing_order", note="Lotte's kot rent - contract Sep-Jun")
add("A01", dt.date(2025, 10, 6), -1092.10, "KU Leuven", "education", "tuition", "sepa_credit_transfer", "P02", cp_iban=cp_iban("KU Leuven"), ref=ogm())
add("A01", dt.date(2026, 9, 22), -1121.80, "KU Leuven", "education", "tuition", "sepa_credit_transfer", "P02", cp_iban=cp_iban("KU Leuven"), ref=ogm())
add("A01", dt.date(2026, 9, 1), -990.00, "Verhuurder Vandenbroeck (kot)", "education", "student_housing_deposit_topup", "sepa_credit_transfer", "P02", cp_iban=cp_iban("Verhuurder Vandenbroeck (kot)"),
    ref="Nieuw contract 2026-2027 + indexatie")
rec("A01", "card_subscription", "Netflix", lambda y, m: -13.99, lambda y, m: day(y, m, 18), "leisure", "streaming", "P01", merchant="Netflix")
rec("A01", "card_subscription", "Spotify", lambda y, m: -21.99, lambda y, m: day(y, m, 9), "leisure", "music_streaming", "P01", merchant="Spotify", note="Family plan - Arne & Lotte on it")
rec("A01", "card_subscription", "Disney+", lambda y, m: -9.99, lambda y, m: day(y, m, 26), "leisure", "streaming", "P02", merchant="Disney+", start=dt.date(2025, 12, 26),
    note="Started Christmas 2025; almost never used since Feb (see app_events)")
for y, m in months():
    add("A01", last_bday(y, m), -4.50, "NovaBank", "fees", "account_package_fee", "bank_fee", desc="BEHEERSKOSTEN NOVAPLUS PAKKET")
    add("A10", last_bday(y, m), -2.25, "NovaBank", "fees", "account_package_fee", "bank_fee", desc="BEHEERSKOSTEN NOVABASIC PAKKET")

# holidays / one-offs joint
add("A01", dt.date(2026, 2, 17), -1640.00, "Airbnb", "travel", "accommodation", "card_online", "P02", merchant="Airbnb", city="online", card="C02")
for d, amt in [(dt.date(2026, 7, 11), -38.40), (dt.date(2026, 7, 11), -27.10), (dt.date(2026, 7, 25), -41.90), (dt.date(2026, 7, 25), -22.60)]:
    add("A01", d, amt, "Vinci Autoroutes", "travel", "tolls", "card_payment", "P01", merchant="Vinci Autoroutes", city="Lyon", flags=["foreign"], card="C01")
for d in [dt.date(2026, 7, x) for x in range(12, 25, 2)]:
    add("A01", d, -random.uniform(45, 120), random.choice(["Carrefour Market Apt", "Restaurant Le Mas", "Boulangerie Paul Gordes", "Intermarché Cavaillon"]),
        random.choice(["groceries", "eating_out"]), "holiday_spend", "card_payment", random.choice(["P01", "P02"]), city="Provence", flags=["foreign"], card="C01")
add("A01", dt.date(2026, 3, 14), -749.00, "Coolblue", "shopping", "home_appliances", "card_online", "P02", merchant="Coolblue", city="online", card="C02", ref="Wasmachine Bosch Serie 6")
add("A01", dt.date(2025, 11, 22), -486.00, "Garage Wouters", "transport", "car_maintenance", "card_payment", "P01", merchant="Garage Wouters", city="Tienen", card="C01", ref="Winterbanden")
add("A01", dt.date(2026, 4, 17), -412.80, "Garage Wouters", "transport", "car_maintenance", "card_payment", "P01", merchant="Garage Wouters", city="Tienen", card="C01", ref="Onderhoud 90.000 km")
add("A01", dt.date(2026, 9, 24), -1180.00, "Garage Wouters", "transport", "car_maintenance", "card_payment", "P01", merchant="Garage Wouters", city="Tienen", card="C01",
    ref="Distributieriem + remmen", flags=["unusually_large"])
for d, mer, amt in [(dt.date(2025, 12, 6), "Bol.com", -186.40), (dt.date(2025, 12, 12), "Fnac", -249.00), (dt.date(2025, 12, 18), "Coolblue", -329.00),
                    (dt.date(2025, 12, 20), "Standaard Boekhandel", -64.80), (dt.date(2025, 12, 23), "Slagerij De Smet", -148.30)]:
    add("A01", d, amt, mer, next(x for x in merchants if x["name"] == mer)["category"], "christmas_gifts" if mer != "Slagerij De Smet" else "butcher",
        "card_online" if mer in ("Bol.com", "Coolblue") else "card_payment", "P02", merchant=mer, city="Tienen", card="C02")

# joint variable spending
for y, m in months():
    for d in days_of_month(y, m):
        wd = d.weekday()
        if d.month == 7 and 11 <= d.day <= 25: continue  # on holiday
        if wd == 5: spend("A01", random.choice(["P01", "P02"]), d, "Colruyt", 115, 195, "Tienen")
        if wd == 2 and random.random() < 0.8: spend("A01", "P02", d, "Delhaize", 28, 75, "Tienen")
        if wd in (5, 6) and random.random() < 0.7: spend("A01", "P02", d, "Bakkerij Vanhees", 6, 18, "Tienen")
        if wd == 4 and random.random() < 0.35: spend("A01", "P01", d, random.choice(["Pizzeria Da Mario", "Brasserie Het Gasthuis", "Takeaway.com", "Frituur 't Pleintje"]), 28, 95, "Tienen")
        if random.random() < 0.09: spend("A01", "P01", d, random.choice(["TotalEnergies", "Q8"]), 62, 88, random.choice(["Tienen", "Leuven", "Heverlee"]))
        if random.random() < 0.06: spend("A01", "P02", d, random.choice(["TotalEnergies", "Q8"]), 48, 70, "Tienen")
        if random.random() < 0.05: spend("A01", "P02", d, random.choice(["Apotheek Centrum", "Kruidvat"]), 9, 42, "Tienen")
        if random.random() < 0.035: spend("A01", random.choice(["P01", "P02"]), d, random.choice(["Hubo", "IKEA", "Bol.com", "Decathlon"]), 15, 140, "Tienen")
        if random.random() < 0.015:
            add("A01", d, -random.choice([50, 100]), "ATM NovaBank Tienen", "cash", "atm", "atm_withdrawal", random.choice(["P01", "P02"]), city="Tienen", card="C01")
    # doctor & mutuality refunds
    if random.random() < 0.6:
        dd = bday(day(y, m, random.randint(3, 25)))
        add("A01", dd, -30.00, "Huisartsenpraktijk De Linde", "health", "doctor", "payconiq", "P02", merchant="Huisartsenpraktijk De Linde", city="Tienen")
        add("A01", dd + dt.timedelta(days=9), 25.00 - 4.0, "CM Christelijke Mutualiteit", "health", "mutuality_refund", "sepa_credit_transfer", "P02", cp_iban=cp_iban("CM Christelijke Mutualiteit"))

# ================================================================ KOEN PERSONAL + CREDIT CARD
for y, m in months():
    for d in days_of_month(y, m):
        wd = d.weekday()
        if wd < 5 and random.random() < 0.3 and not (d.month == 7 and 11 <= d.day <= 25):
            add("A03", d, -random.uniform(6.5, 13.5), "Vandermeulen Bedrijfsrestaurant", "eating_out", "work_lunch", "card_payment", "P01", city="Leuven", card="C03")
        if wd == 1 and random.random() < 0.8: spend("A03", "P01", d, "Padelclub Tienen", 9, 16, "Tienen")
        if random.random() < 0.07: spend("A07", "P01", d, random.choice(["Decathlon", "Bol.com", "Coolblue", "Standaard Boekhandel"]), 20, 180, "Leuven")
        if wd == 6 and random.random() < 0.25: spend("A03", "P01", d, "Café Commerce", 8, 24, "Tienen")
    rec_day = day(y, m, 14)
    add("A07", rec_day, -random.uniform(35, 90), "Strava" if m == 3 else "Brussels Airlines" if (y, m) == (2026, 4) else "Interparking",
        "leisure" if m == 3 else "travel" if (y, m) == (2026, 4) else "transport", "subscriptions" if m == 3 else "flights" if (y, m) == (2026, 4) else "parking",
        "card_online", "P01", merchant="Strava" if m == 3 else "Brussels Airlines" if (y, m) == (2026, 4) else "Interparking", city="Brussel", card="C05")
add("A07", dt.date(2026, 4, 2), -312.40, "Brussels Airlines", "travel", "flights", "card_online", "P01", merchant="Brussels Airlines", city="online", card="C05", ref="Business trip - reimbursable")
add("A03", dt.date(2026, 4, 30), 312.40, "Vandermeulen Engineering NV", "income", "expense_reimbursement", "sepa_credit_transfer", "P01", cp_iban=cp_iban("Vandermeulen Engineering NV"))
add("A07", dt.date(2026, 5, 10), -1349.00, "Bike Republic Leuven", "leisure", "hobbies", "card_payment", "P01", city="Leuven", card="C05", ref="Gravel bike")
transfer("A03", "A08", dt.date(2026, 5, 29), 2500, "Extra belegging vakantiegeld", "P01", sub="investment_lump_sum", cat_from="savings_investments", cat_to="savings_investments")
transfer("A04", "A01", dt.date(2026, 6, 1), 2000, "Vakantiegeld voor reis", "P02")
transfer("A03", "A02", dt.date(2026, 6, 2), 1500, "Vakantiegeld sparen", "P01", sub="savings_transfer", cat_from="savings_investments", cat_to="savings_investments")

# ================================================================ ELS PERSONAL
for y, m in months():
    for d in days_of_month(y, m):
        wd = d.weekday()
        if random.random() < 0.06: spend("A04", "P02", d, random.choice(["Zeeman", "ZARA", "Zalando", "Kruidvat", "Standaard Boekhandel"]), 12, 85, "Leuven")
        if wd == 3 and random.random() < 0.8: add("A04", d, -14.0, "Yogastudio Prana", "leisure", "sport", "payconiq", "P02", city="Tienen")
        if wd < 5 and random.random() < 0.08: spend("A04", "P02", d, "Starbucks", 4, 8, "Leuven")
    if m in (10, 12, 2, 4, 6, 8):
        spend("A04", "P02", bday(day(y, m, 12)), "Kapsalon Nathalie", 55, 72, "Tienen")
add("A04", dt.date(2026, 5, 9), -89.00, "Bloemen Floralia", "family", "gifts", "card_payment", "P02", city="Tienen", card="C04", ref="Moederdag Maria")
add("A04", dt.date(2026, 9, 12), -145.00, "Pluxee Dienstencheques", "household_services", "cleaning_service_vouchers", "sepa_credit_transfer", "P02", cp_iban=cp_iban("Pluxee Dienstencheques"),
    ref="Extra cheques voor Pa & Ma")

# ================================================================ GRANDPARENTS (A10)
rec("A10", "direct_debit", "Luminus", lambda y, m: -158.0, lambda y, m: bday(day(y, m, 7)), "utilities", "energy", "P03")
rec("A10", "direct_debit", "Proximus", lambda y, m: -71.99, lambda y, m: bday(day(y, m, 16)), "utilities", "internet_tv_landline", "P03")
# duplicate Proximus charge in June 2026
add("A10", dt.date(2026, 6, 19), -71.99, "Proximus", "utilities", "internet_tv_landline", "direct_debit", "P03", cp_iban=cp_iban("Proximus"),
    ref=ogm(), flags=["possible_duplicate"])
add("A10", dt.date(2026, 7, 8), 71.99, "Proximus", "utilities", "refund", "sepa_credit_transfer", "P01", cp_iban=cp_iban("Proximus"), ref="Terugbetaling dubbele facturatie")
rec("A10", "direct_debit", "De Watergroep", lambda y, m: -71.20, lambda y, m: bday(day(y, m, 15)), "utilities", "water", "P03", months_filter=[1, 4, 7, 10], frequency="quarterly")
rec("A10", "direct_debit", "Mediahuis - Het Nieuwsblad", lambda y, m: -33.50, lambda y, m: bday(day(y, m, 3)), "leisure", "newspaper", "P03")
rec("A10", "direct_debit", "Pluxee Dienstencheques", lambda y, m: -108.00 if (y, m) < (2026, 4) else -162.00, lambda y, m: bday(day(y, m, 2)),
    "household_services", "cleaning_service_vouchers", "P04", note="Increased from 12 to 18 cheques/month in April 2026")
rec("A10", "direct_debit", "Wit-Gele Kruis Vlaams-Brabant", lambda y, m: -round(random.uniform(22, 48), 2) if (y, m) >= (2026, 3) else 0.0, lambda y, m: bday(day(y, m, 11)),
    "health", "home_nursing_copay", "P03", start=dt.date(2026, 3, 1), note="Home nursing after hip surgery; ongoing")
rec("A10", "outgoing", "OCMW Diest - Maaltijden aan huis", lambda y, m: -round(8.60 * random.randint(24, 30), 2), lambda y, m: bday(day(y, m, 5)),
    "household_services", "meals_on_wheels", "P01", start=dt.date(2026, 4, 1), channel="sepa_credit_transfer", note="Paid by Koen via proxy mandate")
rec("A10", "direct_debit", "AG Insurance", lambda y, m: -512.40, lambda y, m: bday(day(y, m, 20)), "housing", "home_insurance", "P03", months_filter=[2], frequency="yearly")
rec("A10", "outgoing", "Vlaamse Belastingdienst", lambda y, m: -948.30, lambda y, m: dt.date(y, m, 23), "taxes", "property_tax", "P01", months_filter=[7], frequency="yearly",
    channel="sepa_credit_transfer")
rec("A10", "direct_debit", "CM Christelijke Mutualiteit", lambda y, m: -128.00, lambda y, m: bday(day(y, m, 20)), "health", "mutuality", "P03", months_filter=[1], frequency="yearly")
rec("A10", "standing_order", "Rode Kruis Vlaanderen", lambda y, m: -15.00, lambda y, m: bday(day(y, m, 15)), "charity", "donation", "P04")
add("A10", dt.date(2026, 2, 26), -684.35, "AZ Diest", "health", "hospital", "sepa_credit_transfer", "P01", merchant="AZ Diest", cp_iban=cp_iban("AZ Diest"),
    ref=ogm(), flags=["paid_via_proxy"])
add("A10", dt.date(2026, 3, 30), -122.50, "Thuiszorgwinkel Diest", "health", "care_equipment", "card_payment", "P04", city="Diest", card="C11", ref="Rollator")

pharm_trend = lambda d: 1 + max(0, (d - dt.date(2026, 2, 1)).days) / 365 * 0.9   # pharmacy spend rises after Feb 2026
for y, m in months():
    for d in days_of_month(y, m):
        wd = d.weekday()
        if wd == 1: spend("A10", "P04", d, "Colruyt", 45, 90, "Diest")
        if wd == 4 and random.random() < 0.7: spend("A10", "P04", d, "Bakkerij Vanhees", 5, 14, "Diest")
        if wd == 3 and random.random() < 0.55:
            add("A10", d, -random.uniform(14, 38) * pharm_trend(d), "Apotheek Centrum", "health", "pharmacy", "card_payment", "P04",
                merchant="Apotheek Centrum", city="Diest", card="C11")
        if wd in (0, 3) and not (wd == 3 and random.random() < .5):
            add("A10", d, -random.choice([100, 120, 150]), "ATM NovaBank Diest", "cash", "atm", "atm_withdrawal", "P03", city="Diest", card="C10", time=rand_time(9, 11))
        if wd == 5 and random.random() < 0.2: spend("A10", "P03", d, "Slagerij De Smet", 18, 42, "Diest")
        if wd == 6 and random.random() < 0.2: add("A10", d, -random.uniform(28, 55), "Brasserie De Hofstad", "eating_out", "restaurant", "card_payment", "P03", city="Diest", card="C10")

# fraud: fake trial subscription on Maria's card (not recognised) + phishing attempt
for d, amt in [(dt.date(2026, 7, 3), -4.95), (dt.date(2026, 7, 17), -49.99), (dt.date(2026, 8, 17), -49.99), (dt.date(2026, 9, 17), -49.99)]:
    add("A10", d, amt, "HealthPlus Supplements Ltd", "shopping", "online_subscription", "card_online", "P04", merchant="HealthPlus Supplements Ltd",
        city="online", card="C11", flags=["foreign_merchant", "new_recurring", "possible_unwanted_subscription"])
phish = add("A10", dt.date(2026, 6, 17), -4850.00, "SAFE ACCOUNT NOVA SECURITY", "transfers", "external_transfer", "instant_transfer", "P03",
            cp_iban="LT213250098765432101", status="blocked_by_fraud_engine", time="14:22:08",
            flags=["new_beneficiary", "new_device", "foreign_iban", "amount_anomaly", "phishing_pattern"], ref="Beveiliging rekening")

# ================================================================ ARNE
rec("A20", "card_subscription", "Basic-Fit", lambda y, m: -29.99, lambda y, m: day(y, m, 4), "leisure", "sport", "P05", merchant="Basic-Fit")
rec("A20", "direct_debit", "Orange Belgium", lambda y, m: -0.0, lambda y, m: day(y, m, 4), "utilities", "mobile", "P05") if False else None
add("A20", dt.date(2026, 2, 12), -254.50, "Ticketmaster", "leisure", "events", "card_online", "P05", merchant="Ticketmaster", city="online", card="C20", ref="Pukkelpop 2026 combi")
add("A22", dt.date(2026, 5, 20), -389.00, "Brussels Airlines", "travel", "flights", "card_online", "P05", merchant="Brussels Airlines", city="online", card="C21", ref="Lissabon juni")
add("A22", dt.date(2026, 5, 21), -412.00, "Airbnb", "travel", "accommodation", "card_online", "P05", merchant="Airbnb", city="online", card="C21")
for y, m in months():
    for d in days_of_month(y, m):
        wd = d.weekday()
        if wd < 5 and random.random() < 0.25: spend("A20", "P05", d, random.choice(["Starbucks", "Carrefour Express"]), 4, 14, "Brussel")
        if wd in (4, 5) and random.random() < 0.55:
            add("A20", d, -random.uniform(12, 55), random.choice(["De Werf", "Café Commerce", "Pizzeria Da Mario", "Frituur 't Pleintje"]), "eating_out", "cafe_bar",
                random.choice(["card_payment", "mobile_wallet", "payconiq"]), "P05", city=random.choice(["Leuven", "Tienen"]), card="C20", time=rand_time(19, 23))
        if random.random() < 0.05: spend("A22", "P05", d, random.choice(["Steam", "Bol.com", "Zalando", "Coolblue", "Decathlon"]), 15, 120, "online")
        if random.random() < 0.04:
            add("A20", d, random.choice([-1, 1]) * random.uniform(8, 35), random.choice(["Jonas V.", "Pieter D.", "Sofie M.", "Ruben L."]), "transfers", "friend_split",
                "payconiq", "P05", cp_iban=ext_iban())
    # pay off credit card
    for acc_cc, acc_cur, who in (("A22", "A20", "P05"), ("A07", "A03", "P01")):
        pass
for dd in [dt.date(2026, 6, x) for x in range(12, 17)]:
    add("A20", dd, -random.uniform(30, 85), random.choice(["Time Out Market Lisboa", "Pingo Doce", "Uber PT"]), random.choice(["eating_out", "groceries", "transport"]), "holiday_spend", "card_payment", "P05", city="Lisboa", card="C20", flags=["foreign"])
# apartment-hunting signals Aug-Sep 2026
add("A20", dt.date(2026, 8, 19), -24.95, "Immoweb", "housing", "property_search_subscription", "card_online", "P05", city="online", card="C20", flags=["life_event_signal"])
add("A20", dt.date(2026, 9, 19), -24.95, "Immoweb", "housing", "property_search_subscription", "card_online", "P05", city="online", card="C20", flags=["life_event_signal"])
add("A20", dt.date(2026, 9, 11), -150.00, "Notariskantoor Verhaegen", "housing", "notary_advice", "sepa_credit_transfer", "P05", cp_iban=cp_iban("Notariskantoor Verhaegen"),
    ref="Adviesgesprek aankoop", flags=["life_event_signal"])
add("A20", dt.date(2026, 9, 26), -320.00, "Bouwkundig Expert Claes", "housing", "property_inspection", "sepa_credit_transfer", "P05", cp_iban=cp_iban("Bouwkundig Expert Claes"),
    ref="Keuring appartement Kessel-Lo", flags=["life_event_signal"])

# ================================================================ LOTTE
for y, m in months():
    for d in days_of_month(y, m):
        wd = d.weekday()
        in_term = not (m in (7, 8) or (m == 9 and d.day < 20) or (m in (12, 1) and 22 <= d.day or (m == 1 and d.day < 3)))
        city = "Leuven" if in_term else "Tienen"
        if in_term and wd < 5 and random.random() < 0.55: spend("A30", "P06", d, "Alma Studentenrestaurant", 3.8, 6.5, "Leuven")
        if random.random() < 0.4: spend("A30", "P06", d, random.choice(["Carrefour Express", "Aldi", "Lidl", "Delhaize"]), 6, 38, city)
        if wd in (1, 2, 3, 5) and random.random() < (0.55 if in_term else 0.3):
            add("A30", d, -random.uniform(6, 28), random.choice(["De Werf", "Café Commerce"]), "eating_out", "cafe_bar", random.choice(["card_payment", "payconiq", "mobile_wallet"]),
                "P06", city="Leuven", card="C30", time=rand_time(20, 23))
        if random.random() < 0.09: spend("A30", "P06", d, random.choice(["Vinted", "Zalando", "Kruidvat", "ZARA", "Standaard Boekhandel"]), 8, 55, "Leuven")
        if in_term and wd == 4 and random.random() < 0.6:
            add("A30", d, -random.choice([5.10, 6.40]), "NMBS/SNCB", "transport", "public_transport", "card_online", "P06", merchant="NMBS/SNCB", city="online", card="C30")
        if random.random() < 0.06:
            add("A30", d, random.choice([-1, -1, 1]) * random.uniform(5, 25), random.choice(["Hanne V.", "Emma D.", "Noor B.", "Jules S."]), "transfers", "friend_split",
                "payconiq", "P06", cp_iban=ext_iban())
    if m == 9 and y == 2026:
        add("A30", dt.date(2026, 9, 23), -86.40, "Acco Leuven", "education", "study_books", "card_payment", "P06", city="Leuven", card="C30")
    if m == 10 and y == 2025:
        add("A30", dt.date(2025, 10, 7), -112.30, "Acco Leuven", "education", "study_books", "card_payment", "P06", city="Leuven", card="C30")
# money requests from Lotte to parents (ad hoc top-ups)
for d, amt, msg in [(dt.date(2025, 11, 24), 50, "Top-up aanvraag Lotte"), (dt.date(2026, 2, 23), 80, "Top-up aanvraag Lotte"),
                    (dt.date(2026, 4, 24), 60, "Top-up aanvraag Lotte"), (dt.date(2026, 5, 25), 75, "Examenperiode"), (dt.date(2026, 9, 25), 100, "Start academiejaar")]:
    transfer("A01", "A30", d, amt, msg, "P02", sub="allowance_topup", cat_from="family", cat_to="income")
transfer("A30", "A31", dt.date(2026, 8, 10), 1400, "Zomerjob sparen - Erasmus", "P06", sub="savings_transfer", cat_from="savings_investments", cat_to="savings_investments")
add("A30", dt.date(2026, 7, 20), -289.00, "Ryanair", "travel", "flights", "card_online", "P06", city="online", card="C30", ref="Barcelona met vrienden")
for dd in [dt.date(2026, 8, x) for x in (1, 2, 3, 4, 5)]:
    add("A30", dd, -random.uniform(25, 60), random.choice(["Mercadona", "Bar La Plata", "Sagrada Familia Tickets"]), random.choice(["groceries", "eating_out", "leisure"]), "holiday_spend", "card_payment", "P06", city="Barcelona", card="C30", flags=["foreign"])
add("A30", dt.date(2026, 3, 3), -165.00, "Ticketmaster", "leisure", "events", "card_online", "P06", merchant="Ticketmaster", city="online", card="C30", ref="Pukkelpop dagticket x2")
add("A30", dt.date(2026, 9, 18), -35.00, "KU Leuven International Office", "education", "exchange_application_fee", "card_online", "P06", city="online", card="C30",
    ref="Erasmus aanvraag Lissabon sem 2 2026-27", flags=["life_event_signal"])

# ================================================================ INTEREST on savings (Jan) & term deposit
for aid, bal, rate in (("A02", 21480, .0125), ("A11", 41230, .0125), ("A21", 17000, .0125), ("A31", 2400, .0125)):
    base = bal * 0.0085; fid = bal * 0.004
    add(aid, dt.date(2026, 1, 2), r2(base), "NovaBank", "income", "interest_base", "interest", desc="BASISRENTE 2025")
    add(aid, dt.date(2026, 1, 2), r2(fid), "NovaBank", "income", "interest_fidelity_premium", "interest", desc="GETROUWHEIDSPREMIE")
add("A10", dt.date(2025, 11, 15), r2(25000 * 0.0275 * 0.7), "NovaBank", "income", "term_deposit_interest", "interest", desc="INTEREST TERMIJNREKENING (NETTO)")

# ================================================================ Credit card monthly settlement
def settle_cc(cc, cur, who):
    for y, m in months():
        d0 = dt.date(y, m, 1); d1 = day(y, m, calendar.monthrange(y, m)[1])
        tot = -sum(t["amount"] for t in txs if t["account_id"] == cc and d0 <= dt.date.fromisoformat(t["booking_date"]) <= d1 and t["amount"] < 0)
        pay = bday(dt.date(y + (m == 12), (m % 12) + 1, 10)) if True else None
        if tot > 0 and in_window(pay):
            transfer(cur, cc, pay, r2(tot), f"Afrekening kredietkaart {m:02d}/{y}", who, sub="credit_card_settlement", channel="direct_debit")
settle_cc("A07", "A03", "P01"); settle_cc("A22", "A20", "P05")

# ================================================================ LOANS
def amort(principal, rate, n, start):
    r = rate / 12; pmt = principal * r / (1 - (1 + r) ** -n)
    rows, out = [], principal
    for i in range(n):
        y = start.year + (start.month - 1 + i) // 12; m = (start.month - 1 + i) % 12 + 1
        it = out * r; pr = pmt - it; out -= pr
        rows.append((dt.date(y, m, start.day), r2(pmt), r2(pr), r2(it), r2(max(out, 0))))
    return pmt, rows
loans, loan_schedule = [], []
for lid, acc, own, kind, prin, rate, n, start, purpose, collat in [
        ("L01", "A01", ["P01", "P02"], "mortgage", 245000, 0.0235, 300, dt.date(2014, 6, 1), "Purchase house Leuvenselaan 112, Tienen", "Mortgage registration on property"),
        ("L02", "A01", ["P01", "P02"], "car_loan", 21500, 0.0349, 60, dt.date(2022, 4, 5), "Skoda Octavia Combi (2022)", "none")]:
    pmt, rows = amort(prin, rate, n, start)
    outst = next(r[4] for r in rows if r[0] >= TODAY.replace(day=1))
    end = rows[-1][0]
    loans.append(dict(loan_id=lid, debit_account_id=acc, borrowers=own, loan_type=kind, principal=prin, annual_rate=rate, rate_type="fixed",
                      term_months=n, start_date=start.isoformat(), end_date=end.isoformat(), monthly_installment=r2(pmt),
                      outstanding_at_snapshot=outst, remaining_installments=sum(1 for r in rows if r[0] > TODAY), purpose=purpose, collateral=collat,
                      linked_insurance="Schuldsaldoverzekering NovaLife (50/50)" if kind == "mortgage" else ""))
    for r in rows:
        loan_schedule.append(dict(loan_id=lid, due_date=r[0].isoformat(), installment=r[1], principal_part=r[2], interest_part=r[3], outstanding_after=r[4],
                                  status="paid" if r[0] <= TODAY else "scheduled"))

# ================================================================ INVESTMENTS
instruments = [
    ("I01", "NovaBank Balanced Growth Fund", "fund", "BE6300000001", "mixed", 3, 0.0165),
    ("I02", "iShares Core MSCI World UCITS ETF (Acc)", "etf", "IE00B4L5Y983", "equity_global", 4, 0.0020),
    ("I03", "Vanguard FTSE All-World UCITS ETF (Acc)", "etf", "IE00BK5BQT80", "equity_global", 4, 0.0022),
    ("I04", "NovaPension Stability (pension fund)", "pension_fund", "BE6300000002", "mixed_defensive", 3, 0.0120),
    ("I05", "Belgian State Note 1y", "bond", "BE0000000001", "government_bond", 1, 0.0),
]
instruments_t = [dict(instrument_id=i, name=n, kind=k, isin=isin, asset_class=ac, sri_risk_class=risk, ongoing_charges=oc) for i, n, k, isin, ac, risk, oc in instruments]
prices = {}
for iid, *_ in instruments:
    p = {"I01": 112.4, "I02": 98.3, "I03": 131.7, "I04": 214.9, "I05": 100.0}[iid]
    vol = {"I01": .018, "I02": .035, "I03": .034, "I04": .012, "I05": .001}[iid]
    for y, m in months():
        p *= math.exp(random.gauss(0.005, vol)); prices[(iid, y, m)] = r2(p)
price_rows = [dict(instrument_id=k[0], month_end=day(k[1], k[2], 31).isoformat(), nav_price=v) for k, v in prices.items()]
holdings_start = {("A08", "I01"): 310.0, ("A08", "I02"): 165.0, ("A23", "I03"): 22.0, ("A05", "I04"): 179.9, ("A06", "I04"): 135.5}
inv_tx, units = [], dict(holdings_start)
buy_map = {"A08": ["I01", "I02"], "A23": ["I03"], "A05": ["I04"], "A06": ["I04"]}
for t in txs:
    if t["account_id"] in buy_map and t["amount"] > 0:
        d = dt.date.fromisoformat(t["booking_date"])
        split = t["amount"] / len(buy_map[t["account_id"]])
        for iid in buy_map[t["account_id"]]:
            px = prices[(iid, d.year, d.month)]
            u = round(split / px, 4); units[(t["account_id"], iid)] = units.get((t["account_id"], iid), 0) + u
            inv_tx.append(dict(order_id=f"O{len(inv_tx)+1:05d}", account_id=t["account_id"], instrument_id=iid, trade_date=d.isoformat(),
                               side="buy", units=u, price=px, gross_amount=r2(split), fees=r2(split * 0.0) , tax_tob=r2(split * 0.0012 if iid in ("I02", "I03") else 0),
                               source_tx_id=t["tx_id"], trigger="savings_plan" if t["recurring_id"] else "manual"))
for o in inv_tx:
    add(o["account_id"], dt.date.fromisoformat(o["trade_date"]), -o["gross_amount"], next(x["name"] for x in instruments_t if x["instrument_id"] == o["instrument_id"]),
        "savings_investments", "fund_purchase", "securities_order", o["account_id"] and ("P05" if o["account_id"] == "A23" else "P02" if o["account_id"] == "A06" else "P01"),
        desc=f"AANKOOP {o['units']} DEELBEWIJZEN {o['instrument_id']} AAN {o['price']} EUR")
# ================================================================ declines + balances
txs.sort(key=lambda t: (t["account_id"], t["booking_date"], -t["amount"] if t["amount"] > 0 else 0, t["time"]))
bal = {a["account_id"]: a["opening_balance_at_window_start"] for a in accounts}
for t in txs:
    a = ACC[t["account_id"]]
    if t["status"] != "booked":
        t["balance_after"] = r2(bal[a["account_id"]]); continue
    if a["account_type"] == "current" and t["amount"] < 0 and bal[a["account_id"]] + t["amount"] < -a["overdraft_limit"] \
            and t["channel"] in ("card_payment", "card_online", "mobile_wallet", "payconiq"):
        t["status"] = "declined_insufficient_funds"; t["flags"] = t["flags"] + ["declined"]
        t["balance_after"] = r2(bal[a["account_id"]]); continue
    bal[a["account_id"]] += t["amount"]
    t["balance_after"] = r2(bal[a["account_id"]])
    if a["account_type"] == "current" and bal[a["account_id"]] < 0: t["flags"] = t["flags"] + ["overdraft_used"]
    if a["account_type"] == "current" and 0 <= bal[a["account_id"]] < 50 and t["amount"] < 0: t["flags"] = t["flags"] + ["low_balance"]
for a in accounts: a["balance_at_snapshot"] = r2(bal[a["account_id"]])

holdings = [dict(account_id=a, instrument_id=i, units=round(u, 4), price_at_snapshot=prices[(i, 2026, 9)], market_value=r2(u * prices[(i, 2026, 9)]),
                 valuation_date=END.isoformat()) for (a, i), u in units.items()]
holdings.append(dict(account_id="A12", instrument_id="TERM", units=1, price_at_snapshot=25000, market_value=25000, valuation_date=END.isoformat()))
for a in accounts:
    if a["account_type"] in ("investment", "pension_savings"):
        a["balance_at_snapshot"] = r2(sum(h["market_value"] for h in holdings if h["account_id"] == a["account_id"]))
ACC["A12"]["maturity_date"] = "2026-11-15"

# ================================================================ INSURANCE
insurance = [
    dict(policy_id="INS01", insurer="AG Insurance", product="Home & fire (Top Woning)", insured=["P01", "P02"], object="Leuvenselaan 112, Tienen", premium=684.20, frequency="yearly", renewal_date="2026-11-14", paid_from="A01", via_bank=False),
    dict(policy_id="INS02", insurer="Ethias", product="Car insurance (BA + omnium)", insured=["P01"], object="Skoda Octavia 2022", premium=91.35, frequency="monthly", renewal_date="2027-04-01", paid_from="A01", via_bank=False,
         note="Omnium on 4.5-year-old car: value declining"),
    dict(policy_id="INS03", insurer="DKV Belgium", product="Hospitalisation (family)", insured=["P01", "P02", "P05", "P06"], object="", premium=58.20, frequency="monthly", renewal_date="2027-01-01", paid_from="A01", via_bank=False,
         note="Arne covered as dependant; employer also offers group cover"),
    dict(policy_id="INS04", insurer="NovaLife", product="Mortgage protection (schuldsaldo)", insured=["P01", "P02"], object="Loan L01", premium=412.00, frequency="yearly", renewal_date="2027-06-01", paid_from="A01", via_bank=True),
    dict(policy_id="INS05", insurer="AG Insurance", product="Home & fire", insured=["P03", "P04"], object="Schaffensestraat 45, Diest", premium=512.40, frequency="yearly", renewal_date="2027-02-20", paid_from="A10", via_bank=False),
    dict(policy_id="INS06", insurer="NovaBank Card Insurance", product="Travel & purchase protection (Mastercard Gold)", insured=["P01", "P02"], object="Card C05", premium=0, frequency="included", renewal_date="", paid_from="A07", via_bank=True),
]

# ================================================================ GOALS / BUDGETS
savings_goals = [
    dict(goal_id="G01", owner_ids=["P05"], account_id="A21", name="Apartment down payment", target_amount=45000, target_date="2027-12-31",
         current_amount=ACC["A21"]["balance_at_snapshot"], created="2024-09-01", status="active"),
    dict(goal_id="G02", owner_ids=["P01", "P02"], account_id="A02", name="Emergency buffer (6 months)", target_amount=24000, target_date="",
         current_amount=ACC["A02"]["balance_at_snapshot"], created="2019-01-10", status="active"),
    dict(goal_id="G03", owner_ids=["P06"], account_id="A31", name="Erasmus Lisbon", target_amount=2500, target_date="2027-02-01",
         current_amount=ACC["A31"]["balance_at_snapshot"], created="2026-09-18", status="active"),
    dict(goal_id="G04", owner_ids=["P01", "P02"], account_id="A02", name="Summer holiday 2027", target_amount=3500, target_date="2027-06-30",
         current_amount=0, created="", status="suggested_not_created"),
]
budgets = [
    dict(budget_id="B01", scope="account", account_id="A01", owner_id="P02", category="groceries", monthly_limit=850, created="2025-01-05", alert_at_pct=90),
    dict(budget_id="B02", scope="account", account_id="A01", owner_id="P02", category="eating_out", monthly_limit=200, created="2025-01-05", alert_at_pct=90),
    dict(budget_id="B03", scope="account", account_id="A30", owner_id="P06", category="eating_out", monthly_limit=150, created="2025-09-30", alert_at_pct=80),
    dict(budget_id="B04", scope="account", account_id="A20", owner_id="P05", category="eating_out", monthly_limit=300, created="2026-03-01", alert_at_pct=90),
]

# ================================================================ BENEFICIARIES
beneficiaries = []
def ben(owner_acc, name, iban, added, by, trusted=True, note=""):
    beneficiaries.append(dict(beneficiary_id=f"BN{len(beneficiaries)+1:03d}", account_id=owner_acc, name=name, iban=iban, added_on=added, added_by=by,
                              verified_name_match=trusted, note=note))
for acc, name, by in [("A01", "Verhuurder Vandenbroeck (kot)", "P02"), ("A01", "KU Leuven", "P02"), ("A01", "Vlaamse Belastingdienst", "P01"),
                      ("A10", "OCMW Diest - Maaltijden aan huis", "P01"), ("A10", "AZ Diest", "P01"), ("A20", "Notariskantoor Verhaegen", "P05")]:
    ben(acc, name, cp_iban(name), "2024-05-10" if acc == "A10" else "2023-09-01", by)
ben("A10", "Koen Peeters", ACC["A03"]["iban"], "2024-05-06", "P01")
ben("A10", "SAFE ACCOUNT NOVA SECURITY", "LT213250098765432101", "2026-06-17", "P03", trusted=False, note="Added during phishing call; blocked & removed 2026-06-17 15:05")

# ================================================================ DEVICES / SECURITY
devices = [
    dict(device_id="D01", person_id="P01", type="smartphone", os="Android 15", model="Samsung Galaxy S24", first_seen="2024-03-02", trusted=True, biometrics=True),
    dict(device_id="D02", person_id="P01", type="laptop", os="Windows 11", model="Web browser (Edge)", first_seen="2021-01-11", trusted=True, biometrics=False),
    dict(device_id="D03", person_id="P02", type="smartphone", os="iOS 19", model="iPhone 14", first_seen="2023-02-18", trusted=True, biometrics=True),
    dict(device_id="D04", person_id="P03", type="tablet", os="Android 13", model="Samsung Galaxy Tab A8", first_seen="2024-06-01", trusted=True, biometrics=False),
    dict(device_id="D05", person_id="P03", type="desktop", os="Windows 10", model="Web browser (Chrome) - remote session", first_seen="2026-06-17", trusted=False, biometrics=False),
    dict(device_id="D06", person_id="P05", type="smartphone", os="iOS 19", model="iPhone 16", first_seen="2024-10-01", trusted=True, biometrics=True),
    dict(device_id="D07", person_id="P05", type="laptop", os="macOS", model="Web browser (Firefox)", first_seen="2025-02-11", trusted=True, biometrics=False),
    dict(device_id="D08", person_id="P06", type="smartphone", os="iOS 19", model="iPhone 13", first_seen="2023-09-15", trusted=True, biometrics=True),
]
security_events = [
    dict(event_id="SE01", person_id="P03", timestamp="2026-06-17T13:58:40", type="incoming_call_reported_after", detail="Caller claimed to be NovaBank security; asked to install remote-support app", source="support_call"),
    dict(event_id="SE02", person_id="P03", timestamp="2026-06-17T14:12:03", type="login_new_device", detail="D05, IP geolocated outside BE, remote-desktop tool signature", source="auth"),
    dict(event_id="SE03", person_id="P03", timestamp="2026-06-17T14:19:55", type="beneficiary_added", detail="LT IBAN, name mismatch", source="payments"),
    dict(event_id="SE04", person_id="P03", timestamp="2026-06-17T14:22:08", type="transaction_blocked", detail=f"{phish['tx_id']} -4850 EUR, risk score 0.97", source="fraud_engine"),
    dict(event_id="SE05", person_id="P01", timestamp="2026-06-17T14:22:40", type="proxy_alert_sent", detail="Push to Koen (proxy) about blocked transfer on A10", source="notifications"),
    dict(event_id="SE06", person_id="P03", timestamp="2026-06-17T15:05:12", type="device_revoked_password_reset", detail="Done by fraud desk after Koen called", source="support"),
    dict(event_id="SE07", person_id="P06", timestamp="2026-03-02T01:14:22", type="failed_login_x3", detail="Wrong PIN, same trusted device", source="auth"),
    dict(event_id="SE08", person_id="P04", timestamp="2026-07-03T10:41:00", type="card_online_first_use", detail="C11 first ever online payment, merchant GB", source="fraud_engine_low_risk"),
    dict(event_id="SE09", person_id="P05", timestamp="2026-05-20T21:03:11", type="3ds_challenge_passed", detail="Brussels Airlines", source="auth"),
]

# ================================================================ APP SESSIONS + EVENTS
sessions, events = [], []
S = [0]; E = [0]
SCREENS = {
    "P01": [("home", 1), ("account_detail:A01", .9), ("account_detail:A10", .0), ("transactions:A01", .6), ("transactions:A03", .3), ("transfer", .15),
            ("credit_card:A07", .15), ("investments:A08", .2), ("loan:L01", .03), ("search", .05)],
    "P02": [("home", 1), ("account_detail:A01", .8), ("budgets", .35), ("transactions:A01", .5), ("account_detail:A30", .3), ("transactions:A04", .3), ("transfer", .1)],
    "P03": [("home", 1), ("account_detail:A10", .9), ("transactions:A10", .5)],
    "P05": [("home", 1), ("account_detail:A20", .8), ("investments:A23", .45), ("savings_goal:G01", .3), ("transactions:A20", .4), ("credit_card:A22", .2), ("payconiq_scan", .15)],
    "P06": [("home", 1), ("account_detail:A30", .95), ("payconiq_scan", .35), ("transactions:A30", .5), ("request_money", .05), ("budgets", .1)],
}
FREQ = {"P01": .75, "P02": .45, "P03": .03, "P05": 1.4, "P06": 2.0}
DEV = {"P01": ["D01"] * 9 + ["D02"], "P02": ["D03"], "P03": ["D04"], "P05": ["D06"] * 8 + ["D07"] * 2, "P06": ["D08"]}

def session(pid, d, hour=None, extra=None, device=None):
    S[0] += 1; sid = f"S{S[0]:06d}"
    ts = dt.datetime.combine(d, dt.time(hour if hour is not None else random.choice([7, 8, 12, 13, 18, 20, 21, 22]), random.randint(0, 59), random.randint(0, 59)))
    screens = [s for s, p in SCREENS[pid] if random.random() < p] + (extra or [])
    t = ts
    for sc in screens:
        E[0] += 1
        t += dt.timedelta(seconds=random.randint(3, 60))
        et = "screen_view"
        meta = {}
        if sc == "search":
            meta = {"query": random.choice(["engie", "telenet", "parking", "netflix", "belastingen"])}
        if sc.startswith("search:"):
            meta = {"query": sc.split(":", 1)[1]}; sc = "search"
        if sc.startswith("tool:"):
            et = "feature_use"; meta = {"feature": sc.split(":", 1)[1]}
        events.append(dict(event_id=f"E{E[0]:07d}", session_id=sid, person_id=pid, timestamp=t.isoformat(), event_type=et, screen=sc.split(":")[0],
                           target=sc.split(":")[1] if ":" in sc and et == "screen_view" else "", metadata=meta))
    dur = int((t - ts).total_seconds()) + random.randint(5, 30)
    sessions.append(dict(session_id=sid, person_id=pid, device_id=device or random.choice(DEV[pid]), start=ts.isoformat(), duration_s=dur,
                         login_method="biometric" if pid != "P03" else "pin + card reader", channel="mobile_app" if (device or DEV[pid][0]) not in ("D02", "D07") else "web",
                         screens_viewed=len(screens)))

d = START
while d <= END:
    for pid in FREQ:
        n = FREQ[pid]
        k = int(n) + (1 if random.random() < n - int(n) else 0)
        for _ in range(k): session(pid, d)
    # Koen checks parents' account every Monday evening (strong pattern) — increasing after Feb 2026
    if d.weekday() == 0 or (d >= dt.date(2026, 3, 1) and d.weekday() == 3):
        session("P01", d, hour=20, extra=["account_detail:A10", "transactions:A10"])
    # Lotte checks balance often near month end
    if d.day >= 22 and random.random() < 0.6: session("P06", d, hour=random.choice([11, 17, 23]), extra=["account_detail:A30"])
    # Arne checks after salary
    d += dt.timedelta(days=1)
# specific behavioural signals
for dd in [dt.date(2026, 8, x) for x in (3, 9, 16, 19, 23, 30)] + [dt.date(2026, 9, x) for x in (2, 6, 11, 13, 20, 26, 28)]:
    session("P05", dd, hour=22, extra=["tool:mortgage_simulator", "savings_goal:G01", random.choice(["search:woonlening", "search:registratierechten", "search:notaris kosten"])])
for dd in [dt.date(2026, 9, 18), dt.date(2026, 9, 21), dt.date(2026, 9, 27)]:
    session("P06", dd, hour=23, extra=["search:kosten betalen buitenland", "search:erasmus", "card_settings:C30"])
for dd in [dt.date(2026, 3, 12), dt.date(2026, 5, 7), dt.date(2026, 8, 20)]:
    session("P01", dd, hour=21, extra=["search:zorgbudget", "search:volmacht", "account_detail:A11"])
session("P03", dt.date(2026, 6, 17), hour=14, extra=["transfer", "tool:add_beneficiary"], device="D05")
for dd in [dt.date(2025, 12, 28), dt.date(2026, 1, 4), dt.date(2026, 1, 18)]:
    session("P02", dd, hour=21, extra=["search:disney"])

# ================================================================ NOTIFICATIONS
notifications = []
def notif(pid, ts, kind, title, body, related="", opened=None, action=""):
    notifications.append(dict(notification_id=f"N{len(notifications)+1:05d}", person_id=pid, sent_at=ts, kind=kind, title=title, body=body,
                              related_id=related, opened=opened if opened is not None else random.random() < .6,
                              action_taken=action))
for t in txs:
    if t["subcategory"] == "salary":
        pid = t["initiated_by"]
        notif(pid, f"{t['booking_date']}T07:30:00", "income_received", "Salary received", f"{t['amount']:.2f} EUR on {ACC[t['account_id']]['nickname']}", t["tx_id"])
    if t["status"].startswith("declined"):
        notif(t["initiated_by"], f"{t['booking_date']}T{t['time']}", "payment_declined", "Payment declined", f"{t['counterparty_name']} {abs(t['amount']):.2f} EUR - insufficient balance", t["tx_id"], opened=True)
    if "low_balance" in t["flags"] and t["account_id"] == "A30":
        notif("P06", f"{t['booking_date']}T{t['time']}", "low_balance", "Low balance", f"Balance {t['balance_after']:.2f} EUR", t["tx_id"])
    if t["amount"] < -900 and t["account_id"] in ("A01", "A10") and t["status"] == "booked":
        notif("P01", f"{t['booking_date']}T09:00:00", "large_debit", "Large payment", f"{t['counterparty_name']} {abs(t['amount']):.2f} EUR on {ACC[t['account_id']]['nickname']}", t["tx_id"])
notif("P03", "2026-06-17T14:22:09", "fraud_block", "Overschrijving geblokkeerd", "We blokkeerden een verdachte overschrijving van 4850 EUR. Bel ons.", phish["tx_id"], True, "called_support")
notif("P01", "2026-06-17T14:22:40", "proxy_alert", "Unusual activity on Pa & Ma account", "Blocked transfer of 4850 EUR to a new foreign beneficiary.", phish["tx_id"], True, "called_support")
notif("P01", "2026-06-20T08:00:00", "duplicate_charge", "Possible duplicate: Proximus", "Proximus charged 71.99 EUR twice this month on Pa & Ma account.", "", True, "contacted_merchant")
notif("P03", "2026-07-03T10:41:05", "first_online_payment", "Eerste online betaling met kaart", "HealthPlus Supplements Ltd 4.95 EUR", "", False)
notif("P01", "2026-09-01T09:00:00", "maturity_upcoming", "Term deposit matures 15 Nov", "Pa & Ma's 25,000 EUR term deposit matures in 75 days.", "A12", False)
notif("P02", "2026-10-01T08:00:00", "renewal_upcoming", "Home insurance renews in November", "684 EUR expected mid November.", "INS01", False) if False else None

# ================================================================ SUPPORT INTERACTIONS
support = [
    dict(case_id="CS01", person_id="P03", date="2025-11-06", channel="branch", topic="Card PIN forgotten", resolution="New PIN letter sent", duration_min=25, sentiment="neutral", handled_by="Branch Diest"),
    dict(case_id="CS02", person_id="P02", date="2025-12-29", channel="chat", topic="How to cancel a card subscription (Disney+)", resolution="Explained - merchant must cancel; offered card-subscription view", duration_min=9, sentiment="slightly_negative", handled_by="Chatbot -> agent"),
    dict(case_id="CS03", person_id="P01", date="2026-03-11", channel="phone", topic="Can I see my parents' savings and set up meals on wheels payment?", resolution="Proxy scope explained; view on A11/A12, pay only from A10", duration_min=18, sentiment="neutral", handled_by="Contact center"),
    dict(case_id="CS04", person_id="P01", date="2026-06-17", channel="phone", topic="Fraud - parents targeted by fake bank employee", resolution="Device revoked, beneficiary removed, credentials reset; nothing lost", duration_min=41, sentiment="stressed_then_relieved", handled_by="Fraud desk"),
    dict(case_id="CS05", person_id="P03", date="2026-06-18", channel="branch", topic="Follow-up after fraud attempt; wants 'something simpler'", resolution="Suggested lowering transfer limit to 1000 EUR; accepted", duration_min=35, sentiment="anxious", handled_by="Branch Diest"),
    dict(case_id="CS06", person_id="P06", date="2026-03-02", channel="chat", topic="Locked out after wrong PIN", resolution="Unlocked via itsme", duration_min=6, sentiment="neutral", handled_by="Chatbot"),
    dict(case_id="CS07", person_id="P05", date="2026-09-03", channel="chat", topic="How much can I borrow for an apartment with 20k own funds?", resolution="Referred to mortgage advisor; no appointment booked yet", duration_min=11, sentiment="positive", handled_by="Chatbot -> agent"),
    dict(case_id="CS08", person_id="P04", date="2026-09-24", channel="branch", topic="Asked what 'HealthPlus' charges are - doesn't recognise them", resolution="Open: dispute form to be signed; Koen to assist", duration_min=30, sentiment="confused", handled_by="Branch Diest"),
]

# ================================================================ DOCUMENTS
documents = [
    dict(doc_id="DOC01", person_ids=["P01"], type="tax_certificate", title="Fiscaal attest pensioensparen 2025", issued="2026-02-10", related="A05", read=True),
    dict(doc_id="DOC02", person_ids=["P02"], type="tax_certificate", title="Fiscaal attest pensioensparen 2025", issued="2026-02-10", related="A06", read=False),
    dict(doc_id="DOC03", person_ids=["P01", "P02"], type="tax_certificate", title="Attest woonkrediet 2025 (interest & capital)", issued="2026-02-14", related="L01", read=True),
    dict(doc_id="DOC04", person_ids=["P01", "P02"], type="annual_statement", title="Jaaroverzicht kosten & rente 2025", issued="2026-01-31", related="A01", read=False),
    dict(doc_id="DOC05", person_ids=["P03", "P04"], type="annual_statement", title="Jaaroverzicht 2025", issued="2026-01-31", related="A10", read=False),
    dict(doc_id="DOC06", person_ids=["P03", "P04"], type="maturity_notice", title="Termijnrekening vervalt 15/11/2026 - uw keuze", issued="2026-09-15", related="A12", read=False),
    dict(doc_id="DOC07", person_ids=["P05"], type="investment_report", title="Kwartaalrapport ETF-plan Q2 2026", issued="2026-07-08", related="A23", read=True),
    dict(doc_id="DOC08", person_ids=["P01", "P02"], type="loan_notice", title="Autolening: nog 6 aflossingen", issued="2026-09-05", related="L02", read=False),
]

# ================================================================ CONSENTS / PREFERENCES
preferences = [
    dict(person_id="P01", language="nl", push_enabled=True, email_enabled=True, marketing_consent=False, data_insights_consent=True, household_view_consent=True, font_size="default", simplified_mode=False),
    dict(person_id="P02", language="nl", push_enabled=True, email_enabled=False, marketing_consent=True, data_insights_consent=True, household_view_consent=True, font_size="default", simplified_mode=False),
    dict(person_id="P03", language="nl", push_enabled=True, email_enabled=False, marketing_consent=False, data_insights_consent=True, household_view_consent=True, font_size="large", simplified_mode=False),
    dict(person_id="P04", language="nl", push_enabled=False, email_enabled=False, marketing_consent=False, data_insights_consent=True, household_view_consent=True, font_size="large", simplified_mode=False),
    dict(person_id="P05", language="nl", push_enabled=True, email_enabled=True, marketing_consent=True, data_insights_consent=True, household_view_consent=False, font_size="default", simplified_mode=False),
    dict(person_id="P06", language="nl", push_enabled=True, email_enabled=False, marketing_consent=True, data_insights_consent=True, household_view_consent=True, font_size="default", simplified_mode=False),
]

external_accounts = [
    dict(ext_id="X01", person_id="P05", provider="Revolut", account_type="current (PSD2-linked)", iban="LT000000000000000000 (masked)", balance_at_snapshot=412.80, consent_expires="2026-12-01"),
    dict(ext_id="X02", person_id="P01", provider="Employer group insurance (AG)", account_type="occupational pension (read-only, via mypension.be export)", iban="", balance_at_snapshot=61240.00, consent_expires=""),
]

# ================================================================ GROUND TRUTH: anticipated needs
anticipated = [
    ("P05", "life_event", "Buying first home", "2026-Q4 to 2027-Q2", .85,
     "Immoweb subscription (Aug-Sep), notary advice + building inspection payments, 13 mortgage-simulator sessions, chat CS07, savings goal G01 at ~{:.0f}%".format(100 * ACC['A21']['balance_at_snapshot'] / 45000),
     "Proactive mortgage pre-approval + advisor booking; show own-funds vs notary/registration costs; move-out budget; stop 'bijdrage thuis' standing order on move"),
    ("P01", "care_need", "Parents' care needs increasing", "ongoing", .8,
     "Hospital bill Feb, home nursing since Mar, meals on wheels since Apr, zorgbudget since Apr, rollator, pharmacy spend +~50% YoY, more cleaning vouchers, Koen's A10 checks doubled",
     "Caregiver dashboard for Koen: parents' fixed costs vs pension, upcoming bills, suggest expanding mandate scope / info on tax & care allowances"),
    ("P03", "fraud_vulnerability", "Grandparents are fraud targets", "now", .9,
     "Phishing attempt 17 Jun (blocked); unrecognised HealthPlus recurring card charges since Jul; Maria confused at branch",
     "Auto-flag new recurring merchants to proxy (Koen); one-tap dispute; trusted-contact approval for new beneficiaries; simplified senior mode"),
    ("P03", "product_event", "Term deposit maturity", "2026-11-15", 1.0, "A12 25,000 EUR matures; notice DOC06 unread",
     "Nudge Koen + parents 30 days before with 2-3 simple options; avoid auto-rollover surprise"),
    ("P06", "life_event", "Erasmus semester in Lisbon", "2027-02", .75, "Exchange application fee, 'kosten buitenland' searches, new savings goal G03",
     "Travel mode for card, FX-fee explainer, travel insurance check (DKV/Card), budget in Lisbon, parents' allowance adjustment"),
    ("P06", "cashflow", "Month-end shortfalls", "monthly", .8, "Declined payments & low-balance at month end; recurring 'top-up' transfers from parents",
     "Salary-day-aware budget; parents' auto top-up rule with limit; nudge to move student-job summer surplus to savings"),
    ("P01", "product_event", "Car loan ends March 2027", "2027-03-05", 1.0, "L02 remaining installments ≤ 6; big garage bill Sep 2026 on ageing car",
     "Show freed-up 392 EUR/month; suggest redirecting to savings/pension or plan next car; review omnium on older car"),
    ("P02", "subscription_waste", "Unused Disney+ subscription", "now", .7, "Paid monthly since Dec 2025; searches 'disney' + chat about cancelling; low usage",
     "Subscription overview with cancel links; household subscription audit (Spotify family, Netflix, Telenet price hike)"),
    ("P01", "bill_forecast", "November home insurance + year-end spikes", "2026-11", .95, "INS01 renewal 684 EUR, Dec gift spike last year ~980 EUR",
     "Cash-flow forecast on joint account with upcoming lumpy bills; suggest buffer transfer"),
    ("P05", "household", "Arne moving out changes household cashflow", "2027", .6, "Arne contributes 300 EUR/month to A01; Groeipakket for Lotte ends at 25",
     "Scenario view for Koen & Els: household budget without Arne's contribution"),
    ("P01", "tax", "Pension-saving tax optimisation", "2026-12", .6, "Both Koen and Els contribute 87.50/month (1,050/yr); annual attestations",
     "Year-end reminder on pension-saving cap choice; long-term savings/insurance tax info"),
    ("P05", "idle_cash", "Excess cash on current account", "now", .7, "Arne's current account balance keeps growing month over month well above spending needs",
     "Suggest sweep to apartment fund / explain deposit-guarantee & interest difference; tie to home-buying goal"),
    ("P01", "idle_cash", "Excess cash on Koen's personal account", "now", .65, "Personal account builds up after bonus/holiday pay months",
     "Suggest auto-sweep rule above a threshold to joint savings or pension/long-term savings"),
    ("P01", "duplicate_charge", "Duplicate charges detection", "resolved", 1.0, "Proximus double debit June (refunded July)",
     "Auto-detect duplicates and offer one-tap refund request, especially on proxy-managed accounts"),
]
anticipated = [dict(need_id=f"N{i+1:02d}", person_id=p, need_type=t, title=ti, expected_timing=tm, confidence=c, evidence=ev, suggested_proactive_action=ac)
               for i, (p, t, ti, tm, c, ev, ac) in enumerate(anticipated)]

# ================================================================ monthly balance snapshots
snapshots = []
for a in accounts:
    rows = [t for t in txs if t["account_id"] == a["account_id"] and t["status"] == "booked"]
    b = a["opening_balance_at_window_start"]
    for y, m in months():
        mt = [t for t in rows if t["booking_date"][:7] == f"{y}-{m:02d}"]
        inflow = sum(t["amount"] for t in mt if t["amount"] > 0); outflow = sum(t["amount"] for t in mt if t["amount"] < 0)
        b += inflow + outflow
        snapshots.append(dict(account_id=a["account_id"], month=f"{y}-{m:02d}", inflow=r2(inflow), outflow=r2(outflow), closing_balance=r2(b), tx_count=len(mt)))

categories = sorted({(t["category"], t["subcategory"]) for t in txs})
categories = [dict(category=c, subcategory=s) for c, s in categories]

# ================================================================ WRITE
tx_cols = ["tx_id", "account_id", "booking_date", "value_date", "time", "amount", "currency", "direction", "balance_after", "status",
           "counterparty_name", "counterparty_iban", "merchant_id", "category", "subcategory", "channel", "card_id", "initiated_by",
           "location_city", "structured_reference", "recurring_id", "transfer_id", "flags", "raw_description"]
for name, rows, cols in [
    ("persons", persons, None), ("households", households, None), ("relationships", relationships, None), ("mandates", mandates, None),
    ("accounts", accounts, None), ("account_access", account_access, None), ("cards", cards, None), ("merchants", merchants, None),
    ("categories", categories, None), ("transactions", txs, tx_cols), ("recurring_payments", recurring, None),
    ("loans", loans, None), ("loan_schedule", loan_schedule, None), ("instruments", instruments_t, None), ("instrument_prices", price_rows, None),
    ("investment_orders", inv_tx, None), ("holdings", holdings, None), ("insurance_policies", insurance, None),
    ("savings_goals", savings_goals, None), ("budgets", budgets, None), ("beneficiaries", beneficiaries, None), ("devices", devices, None),
    ("security_events", security_events, None), ("app_sessions", sessions, None), ("app_events", events, None),
    ("notifications", notifications, None), ("support_interactions", support, None), ("documents", documents, None),
    ("preferences_consents", preferences, None), ("external_accounts", external_accounts, None),
    ("monthly_balances", snapshots, None), ("anticipated_needs_ground_truth", anticipated, None)]:
    if cols is None:
        cols = []
        for r in rows:
            for k in r:
                if k not in cols: cols.append(k)
        rows = [{c: r.get(c, "") for c in cols} for r in rows]
    write_csv(name, rows, cols)

# SQLite
db = f"{OUT}/novabank_datalake.sqlite"
if os.path.exists(db): os.remove(db)
con = sqlite3.connect(db)
for name, (cols, rows) in TABLES.items():
    con.execute(f"CREATE TABLE {name} ({', '.join(f'\"{c}\"' for c in cols)})")
    con.executemany(f"INSERT INTO {name} VALUES ({','.join('?'*len(cols))})",
                    [[json.dumps(r.get(c)) if isinstance(r.get(c), (list, dict)) else r.get(c) for c in cols] for r in rows])
con.commit(); con.close()

# nested JSON per person (API-like view)
os.makedirs(f"{OUT}/json", exist_ok=True)
for p in persons:
    acc_ids = [x["account_id"] for x in account_access if x["person_id"] == p["person_id"]]
    doc = dict(person=p, access=[x for x in account_access if x["person_id"] == p["person_id"]],
               accounts=[ACC[a] for a in acc_ids], cards=[c for c in cards if c["holder_id"] == p["person_id"]],
               recent_transactions=[t for t in txs if t["account_id"] in acc_ids and t["booking_date"] >= "2026-09-01"])
    with open(f"{OUT}/json/{p['person_id']}_{p['first_name'].lower()}.json", "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)

print({k: len(v[1]) for k, v in TABLES.items()})
for a in accounts: print(a["account_id"], a["nickname"], a["balance_at_snapshot"])
print("min balances:", {a["account_id"]: min([t["balance_after"] for t in txs if t["account_id"] == a["account_id"]] or [0]) for a in accounts})
print("declined:", sum(1 for t in txs if t["status"].startswith("declined")))
