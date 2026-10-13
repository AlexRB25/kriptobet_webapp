"use client";

import { useState } from "react";
import { BetSlip } from "@/components/bet-slip";
import { EventCard, useEvents } from "@/components/events";

export default function SportsPage() {
  const { sports, events, loading, error } = useEvents();
  const [selected, setSelected] = useState<string | null>(null);

  // Only leagues that have something to bet on get a tab.
  const withEvents = sports.filter((sport) => events.some((event) => event.sport_key === sport.key));
  const visible = selected ? events.filter((event) => event.sport_key === selected) : events;

  return (
    <div className="flex flex-col gap-4">
      <h1>Deportes</h1>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button type="button" className={`chip ${selected === null ? "chip-on" : ""}`} onClick={() => setSelected(null)}>
          Todos
        </button>
        {withEvents.map((sport) => (
          <button key={sport.key} type="button" className={`chip ${selected === sport.key ? "chip-on" : ""}`} onClick={() => setSelected(sport.key)}>
            {sport.title}
          </button>
        ))}
      </div>
      <div className="flex gap-4">
        <div className="grid min-w-0 flex-1 gap-3 self-start lg:grid-cols-2">
          {visible.map((event) => (
            <EventCard key={event.id} event={event} sport={selected ? undefined : sports.find((sport) => sport.key === event.sport_key)} />
          ))}
          {loading && <p className="text-sm text-muted">Cargando partidos…</p>}
          {error && <p className="error">No se pudieron cargar los partidos. Revisa tu conexión.</p>}
          {!loading && !error && visible.length === 0 && <p className="text-sm text-muted">No hay partidos abiertos por ahora. Vuelve en un rato.</p>}
        </div>
        <BetSlip />
      </div>
      <p className="text-xs text-muted">
        Las apuestas cierran al inicio del partido. «Ganador» se resuelve con el marcador final que publica el proveedor de resultados;
        «Total» suma los puntos o goles de ambos equipos. Un total exacto a la línea, un empate en un mercado sin empate o un evento cancelado
        anulan la selección: en una combinada cuenta como cuota 1.00.
      </p>
    </div>
  );
}
