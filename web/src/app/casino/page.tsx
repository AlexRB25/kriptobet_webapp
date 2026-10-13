import type { Metadata } from "next";
import Link from "next/link";
import { GAMES, GAME_IDS } from "@/lib/games/types";

export const metadata: Metadata = { title: "Casino" };

export default function CasinoPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1>Casino</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GAME_IDS.map((id) => (
          <Link key={id} href={`/casino/${id}`} className="card glow flex items-center gap-4 py-6 transition hover:border-brand">
            <span className="text-5xl">{GAMES[id].emoji}</span>
            <span>
              <span className="block text-lg font-bold">{GAMES[id].title}</span>
              <span className="block text-sm text-muted">{GAMES[id].tagline}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
