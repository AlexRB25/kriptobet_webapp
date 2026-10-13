"use client";

import Link from "next/link";
import { BetSlip } from "@/components/bet-slip";
import { EventCard, useEvents } from "@/components/events";
import { useAccount } from "@/lib/account";
import { GAMES, GAME_IDS } from "@/lib/games/types";

export default function HomePage() {
  const { session, loading } = useAccount();
  const { sports, events, loading: loadingEvents } = useEvents();

  return (
    <div className="flex flex-col gap-8">
      <section className="glow relative overflow-hidden rounded-2xl border border-line bg-panel px-6 py-10 sm:px-10">
        <p className="text-sm font-semibold text-brand">Apuestas deportivas · Casino · Cripto</p>
        <h1 className="mt-2 max-w-xl text-3xl sm:text-4xl">Apuestas deportivas y casino con criptomonedas.</h1>
        <p className="mt-3 max-w-xl text-muted">
          Fútbol, NFL, NBA y MLB con cuotas actualizadas, y seis juegos de casino. Deposita con USDT, Bitcoin, Ethereum y más.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {!loading && !session && (
            <Link href="/entrar?modo=registro" className="btn btn-primary btn-lg">
              Crear cuenta
            </Link>
          )}
          <Link href="/deportes" className={`btn btn-lg ${session ? "btn-primary" : ""}`}>
            Ver deportes
          </Link>
          <Link href="/casino" className="btn btn-lg">
            Ir al casino
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <h2>Casino</h2>
          <Link href="/casino" className="text-sm text-brand">
            Ver todo
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {GAME_IDS.map((id) => (
            <Link key={id} href={`/casino/${id}`} className="card flex flex-col items-center gap-1 py-5 transition hover:border-brand">
              <span className="text-4xl">{GAMES[id].emoji}</span>
              <span className="text-sm font-semibold">{GAMES[id].title}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <h2>Próximos partidos</h2>
          <Link href="/deportes" className="text-sm text-brand">
            Ver todos
          </Link>
        </div>
        <div className="flex gap-4">
          <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-2">
            {events.slice(0, 6).map((event) => (
              <EventCard key={event.id} event={event} sport={sports.find((sport) => sport.key === event.sport_key)} />
            ))}
            {!loadingEvents && events.length === 0 && <p className="text-sm text-muted">Todavía no hay partidos cargados. Vuelve en un rato.</p>}
          </div>
          <BetSlip />
        </div>
      </section>
    </div>
  );
}
