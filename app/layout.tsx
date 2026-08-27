import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const publicUrl = "https://kevinlabens-del.github.io/CR3-TIX-LEARN-LINUX-/";

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  title: "CR3@TIX Learn Linux V2 — De zéro au niveau pro",
  description: "Apprends Linux sans compte : 162 entraînements adaptatifs, SimShell 2.0 sécurisé, examens pratiques et 15 laboratoires professionnels.",
  applicationName: "CR3@TIX Learn Linux",
  authors: [{ name: "CR3@TIX" }],
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: publicUrl,
    siteName: "CR3@TIX Learn Linux",
    title: "CR3@TIX Learn Linux V2 — Apprends en pratiquant",
    description: "Sans compte : parcours adaptatif, terminal isolé et 15 missions professionnelles.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CR3@TIX Learn Linux" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CR3@TIX Learn Linux V2",
    description: "De zéro au niveau pro, sans compte et commande après commande.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060913" },
    { media: "(prefers-color-scheme: light)", color: "#eef3f9" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        {children}
        <Script
          src="https://kevinlabens-del.github.io/CR3-TIX-ANALYTIX./analytics.js"
          data-project-id="80eec10c-7b77-49ec-acf4-a6aa2ad8e779"
          data-project-key="a1b81feb-93ae-4616-b4dd-99c905c7b52d"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
