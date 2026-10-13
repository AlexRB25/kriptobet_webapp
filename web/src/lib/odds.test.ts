import assert from "node:assert/strict";
import { test } from "node:test";
import { finalScore, toSyncEvent, type FeedEvent } from "./odds.ts";

const base = { id: "e1", sport_key: "soccer_epl", sport_title: "EPL", commence_time: "2026-11-01T18:00:00Z", home_team: "Leeds", away_team: "Fulham" };
const h2h = (home: number, away: number, draw?: number) => ({
  key: "h2h",
  outcomes: [
    { name: "Leeds", price: home },
    { name: "Fulham", price: away },
    ...(draw ? [{ name: "Draw", price: draw }] : []),
  ],
});
const totals = (point: number, over: number, under: number) => ({
  key: "totals",
  outcomes: [
    { name: "Over", price: over, point },
    { name: "Under", price: under, point },
  ],
});

test("cuotas: mediana por resultado y la línea de totales más cotizada", () => {
  const event: FeedEvent = {
    ...base,
    bookmakers: [
      { key: "a", markets: [h2h(2.0, 3.6, 3.4), totals(2.5, 1.9, 1.9)] },
      { key: "b", markets: [h2h(2.1, 3.5, 3.3), totals(2.5, 2.0, 1.8)] },
      { key: "c", markets: [h2h(2.2, 3.4, 3.2), totals(3.5, 2.6, 1.5)] },
    ],
  };
  assert.deepEqual(toSyncEvent(event).odds, [
    { market: "h2h", outcome: "home", point: null, price: 2.1 },
    { market: "h2h", outcome: "draw", point: null, price: 3.3 },
    { market: "h2h", outcome: "away", point: null, price: 3.5 },
    { market: "totals", outcome: "over", point: 2.5, price: 1.95 },
    { market: "totals", outcome: "under", point: 2.5, price: 1.85 },
  ]);
});

test("cuotas: sin empate en mercados de dos resultados, margen extra y eventos sin casas", () => {
  const twoWay = toSyncEvent({ ...base, bookmakers: [{ key: "a", markets: [h2h(1.5, 2.6)] }] });
  assert.deepEqual(twoWay.odds.map((odd) => odd.outcome), ["home", "away"]);

  const withMargin = toSyncEvent({ ...base, bookmakers: [{ key: "a", markets: [h2h(2.0, 3.0)] }] }, 0.1);
  assert.deepEqual(withMargin.odds.map((odd) => odd.price), [1.9, 2.8]);

  assert.deepEqual(toSyncEvent({ ...base, bookmakers: [] }).odds, []);
  // Falta un lado del mercado: no se ofrece.
  const oneSided = toSyncEvent({ ...base, bookmakers: [{ key: "a", markets: [{ key: "h2h", outcomes: [{ name: "Leeds", price: 2 }] }] }] });
  assert.deepEqual(oneSided.odds, []);
});

test("marcadores: solo eventos terminados con los dos puntajes", () => {
  const score = { id: "e1", home_team: "Leeds", away_team: "Fulham" };
  assert.deepEqual(finalScore({ ...score, completed: true, scores: [{ name: "Fulham", score: "1" }, { name: "Leeds", score: "3" }] }), { home: 3, away: 1 });
  assert.equal(finalScore({ ...score, completed: false, scores: [{ name: "Fulham", score: "1" }, { name: "Leeds", score: "3" }] }), null);
  assert.equal(finalScore({ ...score, completed: true, scores: null }), null);
  assert.equal(finalScore({ ...score, completed: true, scores: [{ name: "Leeds", score: "3" }] }), null);
});
