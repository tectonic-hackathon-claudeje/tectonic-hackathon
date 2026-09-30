#!/usr/bin/env python3
"""Writes mock PDFs to public/documents/ for the family cover map.

Policy conditions and key-information sheets for each policy, a key-information sheet for each KBC
catalogue product, and the bank's own notices from the data lake. All of them say they are mock.
Run: npm run build:documents
"""
import csv, json, os, textwrap

OUT = "public/documents"
LAKE = "data/novabank_datalake/csv"
os.makedirs(OUT, exist_ok=True)


def esc(s):
    s = s.encode("latin-1", "replace").decode("latin-1")
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def pdf(path, title, sections):
    """A one-page PDF: a title, then headed paragraphs."""
    lines = [("title", title), ("gap", "")]
    for head, body in sections:
        lines.append(("head", head))
        for para in textwrap.wrap(body, 88) or [""]:
            lines.append(("body", para))
        lines.append(("gap", ""))
    y = 800
    ops = []
    for kind, text in lines:
        if kind == "title":
            ops.append(f"BT /F2 17 Tf 56 {y} Td ({esc(text)}) Tj ET"); y -= 28
        elif kind == "head":
            ops.append(f"BT /F2 11 Tf 56 {y} Td ({esc(text)}) Tj ET"); y -= 16
        elif kind == "body":
            ops.append(f"BT /F1 10 Tf 56 {y} Td ({esc(text)}) Tj ET"); y -= 14
        else:
            y -= 8
    stream = "\n".join(ops).encode("latin-1")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 6 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    with open(path, "wb") as f:
        f.write(out)


MOCK = "MOCK DOCUMENT made for a hackathon demo. It is not an official KBC or insurer document, and the figures are invented."
persons = {r["person_id"]: f'{r["first_name"]} {r["last_name"]}' for r in csv.DictReader(open(f"{LAKE}/persons.csv"))}
count = 0

for p in csv.DictReader(open(f"{LAKE}/insurance_policies.csv")):
    who = ", ".join(persons.get(i, i) for i in json.loads(p["insured"]))
    facts = f'Insurer: {p["insurer"]}. Policy {p["policy_id"]}. Insured: {who}. Premium: {p["premium"]} ({p["frequency"]}).' + (f' Renewal: {p["renewal_date"]}.' if p["renewal_date"] else "")
    pdf(f'{OUT}/policy-{p["policy_id"]}-conditions.pdf', f'Policy conditions: {p["product"]}', [
        ("About this document", MOCK),
        ("Your policy", facts),
        ("What is insured", "Sample text. The cover described in the product name, for the people and the object named above, within the limits agreed at signing."),
        ("What is not insured", "Sample text. Intentional damage, war, and anything excluded in the special conditions."),
        ("Claims", "Report a claim as soon as possible through your advisor or the app. Keep bills and photos."),
        ("Ending the contract", "Sample text. Notice periods and renewal follow the contract. Ask your advisor before the renewal date."),
    ])
    pdf(f'{OUT}/policy-{p["policy_id"]}-key-information.pdf', f'Key information: {p["product"]}', [
        ("About this document", MOCK),
        ("What kind of insurance is this?", p["product"] + "."),
        ("What is insured?", "Sample text. See the policy conditions for the full list."),
        ("What is not insured?", "Sample text. See the policy conditions for exclusions."),
        ("Where am I covered?", "Sample text. Usually in Belgium; some covers extend abroad."),
        ("What do I pay?", f'{p["premium"]} ({p["frequency"]}). Mock figure.'),
    ])
    count += 2

cat = json.load(open("data/kbc-insurance-catalogue.json"))
for pr in cat["products"]:
    pdf(f'{OUT}/product-{pr["id"]}.pdf', f'Key information: {pr["name"]}', [
        ("About this document", MOCK),
        ("What it covers", pr["covers"] + "."),
        ("Who it is for", "Sample text. Check with your advisor whether this fits your situation; you can also decide you do not need it."),
        ("What to check first", "Sample text. Whether you are already covered elsewhere (employer, partner, parents, mutuality, another insurer)."),
        ("Price", "Depends on your profile and is only known after acceptance. Any figure shown in the app is an estimate."),
    ])
    count += 1

for d in csv.DictReader(open(f"{LAKE}/documents.csv")):
    pdf(f'{OUT}/doc-{d["doc_id"]}.pdf', d["title"], [
        ("About this document", MOCK),
        ("Details", f'Type: {d["type"].replace("_", " ")}. Issued: {d["issued"]}. Related to: {d["related"]}.'),
    ])
    count += 1
print(count, "documents in", OUT)
