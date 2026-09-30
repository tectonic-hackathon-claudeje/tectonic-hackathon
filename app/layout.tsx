import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SiteChrome } from "./SiteChrome";

export const metadata: Metadata = {
  title: {
    default: "KBC product explorer (mock)",
    template: "%s · KBC product explorer (mock)",
  },
  description:
    "Hackathon starter that visualises mock KBC insurance and bank products in an accessible layout.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <SiteChrome>
        <header className="site-header">
          <Link className="brand" href="/">
            Product explorer
          </Link>
          <nav className="site-nav" aria-label="Primary">
            <Link href="/">All products</Link>
            <Link href="/insurance">Family cover map</Link>
          </nav>
        </header>
        </SiteChrome>
        {children}
        <SiteChrome>
        <footer className="site-footer">
          <p className="disclaimer">
            Unofficial hackathon prototype. Product names, prices, and cover
            details are mock data and are not KBC offers.
          </p>
        </footer>
        </SiteChrome>
      </body>
    </html>
  );
}
