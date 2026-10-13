import type { Metadata } from "next";
import Link from "next/link";
import { Header, MobileNav } from "@/components/header";
import { AccountProvider } from "@/lib/account";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title: { default: "KriptoBet · Apuestas deportivas y casino con cripto", template: "%s · KriptoBet" },
  description: "Apuesta en fútbol, NFL, NBA y más, y juega ruleta, blackjack, slots y crash. Depósitos y retiros en criptomonedas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <AccountProvider>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-10">{children}</main>
          <footer className="border-t border-line px-4 pt-6 pb-24 text-center text-xs text-muted md:pb-6">
            <p>
              <span className="mr-2 rounded border border-muted px-1.5 py-0.5 font-bold">18+</span>
              Solo para mayores de edad. Jugar puede causar adicción: juega con moderación y nunca apuestes dinero que necesites.
            </p>
            <p className="mt-2">
              <Link href="/cuenta" className="underline">
                Juego responsable: límites y autoexclusión
              </Link>
            </p>
          </footer>
          <MobileNav />
        </AccountProvider>
      </body>
    </html>
  );
}
