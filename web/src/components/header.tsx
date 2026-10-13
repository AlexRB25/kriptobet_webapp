"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/lib/account";
import { money } from "@/lib/format";

const LINKS = [
  { href: "/deportes", label: "Deportes", icon: "⚽" },
  { href: "/casino", label: "Casino", icon: "🎰" },
  { href: "/mis-apuestas", label: "Mis apuestas", icon: "🧾" },
];

export function Logo() {
  return (
    <Link href="/" className="text-xl font-black tracking-tight">
      KRIPTO<span className="text-brand">BET</span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const { session, loading, balance, profile } = useAccount();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Logo />
        <nav className="hidden flex-1 gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition hover:text-white ${
                pathname.startsWith(link.href) ? "bg-raised text-white" : "text-muted"
              }`}>
              {link.label}
            </Link>
          ))}
          {profile?.is_admin && (
            <Link href="/admin" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gold">
              Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {loading ? null : session ? (
            <>
              <Link href="/cartera" className="tabular rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-bold">
                {money(balance)} <span className="text-xs font-medium text-muted">USDT</span>
              </Link>
              <Link href="/cartera" className="btn btn-primary">
                Depositar
              </Link>
              <Link href="/cuenta" aria-label="Mi cuenta" className="btn hidden px-2.5 sm:inline-flex">
                👤
              </Link>
            </>
          ) : (
            <>
              <Link href="/entrar" className="btn">
                Entrar
              </Link>
              <Link href="/entrar?modo=registro" className="btn btn-primary">
                Registrarme
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Bottom tab bar on phones. */
export function MobileNav() {
  const pathname = usePathname();
  const tabs = [{ href: "/", label: "Inicio", icon: "🏠" }, ...LINKS.map((link) => ({ ...link, label: link.label.replace("Mis a", "A") })), { href: "/cuenta", label: "Cuenta", icon: "👤" }];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-ink/95 backdrop-blur md:hidden">
      {tabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-brand" : "text-muted"}`}>
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
