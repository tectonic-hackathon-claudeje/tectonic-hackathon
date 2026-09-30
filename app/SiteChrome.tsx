"use client";

import { usePathname } from "next/navigation";

/** The starter's header and footer, hidden on routes that bring their own full-screen shell. */
const OWN_SHELL = ["/insurance"];

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "";
  return OWN_SHELL.some((p) => path.startsWith(p)) ? null : <>{children}</>;
}
