import type { Metadata, Viewport } from "next";
import "./globals.css";

const publicUrl = "https://kevinlabens-del.github.io/CR3-TIX-LEARN-LINUX-/";

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  title: "CR3@TIX Learn Linux — De zéro au niveau pro",
  description: "Apprends Linux dans un terminal interactif sécurisé : 5 niveaux, 27 modules, exercices, examens, XP et laboratoires professionnels.",
  applicationName: "CR3@TIX Learn Linux",
  authors: [{ name: "CR3@TIX" }],
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: publicUrl,
    siteName: "CR3@TIX Learn Linux",
    title: "Apprends Linux. Commande après commande.",
    description: "Un parcours interactif complet, du premier ls à l'administration système.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CR3@TIX Learn Linux" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CR3@TIX Learn Linux",
    description: "De zéro au niveau pro, commande après commande.",
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
  return <html lang="fr" suppressHydrationWarning><body>{children}</body></html>;
}
