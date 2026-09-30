import type { Metadata } from "next";
import { buildEgo } from "@/lib/insurance/ego";
import { buildModel } from "@/lib/insurance/model";
import { InsuranceTree } from "./InsuranceTree";
import "./insurance.css";

export const metadata: Metadata = {
  title: "Insurance",
  description: "What the Peeters family has, who is covered through whom, and what is still missing.",
};

export default async function InsurancePage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; person?: string }>;
}) {
  const { theme, person } = await searchParams;
  const model = buildModel();
  const ego = buildEgo(model);
  const initialPerson = model.people.some((p) => p.id === person) ? (person as string) : "P01";
  return (
    <main id="main" className="cw-main">
      <InsuranceTree model={model} ego={ego} initialTheme={theme === "plain" || theme === "kbc" ? theme : "dark"} initialPerson={initialPerson} />
    </main>
  );
}
