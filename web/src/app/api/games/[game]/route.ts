import {
  BLACKJACK_RETURNS,
  CRASH_MAX_TARGET,
  CRASH_MIN_TARGET,
  actBlackjack,
  cashOutMines,
  dealBlackjack,
  diceMultiplier,
  playCrash,
  playDice,
  playRoulette,
  playSlots,
  revealMine,
  round2,
  startMines,
  validDice,
  validMineCount,
  validRouletteBets,
  type BlackjackSecret,
  type MinesSecret,
} from "@/lib/games/engine";
import type { BlackjackState, GameId, MinesState } from "@/lib/games/types";
import { adminClient, amount, authUser, fail, failFrom, json, rng, serverConfigured, settings } from "@/lib/server";

type Context = { params: Promise<{ game: string }> };
type OpenRound<State, Secret> = { id: string; bet: number; state: State; secret: Secret; version: number };

/** The user's round in progress of a multi-step game, if any. */
async function openRound<State, Secret>(user: string, game: GameId) {
  const { data, error } = await adminClient()
    .from("game_rounds")
    .select("id, bet, state, secret, version")
    .eq("user_id", user)
    .eq("game", game)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as OpenRound<State, Secret> | null;
}

/** Lets the client resume a minas or blackjack round after a reload. */
export async function GET(request: Request, { params }: Context) {
  const { game } = await params;
  if (!serverConfigured()) return fail("not_configured", 503);
  const user = await authUser(request);
  if (!user) return fail("not_authenticated", 401);
  if (game !== "minas" && game !== "blackjack") return json({ round: null });
  const round = await openRound(user, game);
  return json({ round: round && { id: round.id, bet: Number(round.bet), state: round.state } });
}

export async function POST(request: Request, { params }: Context) {
  const { game } = await params;
  if (!serverConfigured()) return fail("not_configured", 503);
  const user = await authUser(request);
  if (!user) return fail("not_authenticated", 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("bad_request");

  const limits = await settings();
  const db = adminClient();
  const capped = (payout: number) => Math.min(round2(payout), limits.max_payout);

  // The outcome is always decided before the bet is charged; if charging fails (no funds, limits,
  // self-exclusion) the outcome is thrown away without the player ever seeing it.

  /** One-step round: charge, pay and record in a single database call. */
  async function single(bet: number, payout: number, state: unknown) {
    const paid = capped(payout);
    const { data, error } = await db.rpc("game_play", { p_user: user, p_game: game, p_bet: bet, p_payout: paid, p_state: state });
    if (error) return failFrom(error);
    return json({ state, payout: paid, balance: data.balance, roundId: data.round_id, bet });
  }

  async function open(bet: number, state: unknown, secret: unknown) {
    const { data, error } = await db.rpc("game_open", { p_user: user, p_game: game, p_bet: bet, p_state: state, p_secret: secret });
    if (error) return failFrom(error);
    return json({ state, payout: 0, balance: data.balance, roundId: data.round_id, bet });
  }

  async function update(round: OpenRound<unknown, unknown>, state: unknown) {
    const { data, error } = await db.rpc("game_update", {
      p_user: user,
      p_round: round.id,
      p_version: round.version,
      p_state: state,
      p_secret: round.secret,
    });
    if (error) return failFrom(error);
    return json({ state, payout: 0, balance: data.balance, roundId: round.id, bet: Number(round.bet) });
  }

  async function close(round: OpenRound<unknown, unknown>, state: unknown, payout: number, extraBet = 0) {
    const paid = capped(payout);
    const { data, error } = await db.rpc("game_close", {
      p_user: user,
      p_round: round.id,
      p_version: round.version,
      p_state: state,
      p_payout: paid,
      p_extra_bet: extraBet,
    });
    if (error) return failFrom(error);
    return json({ state, payout: paid, balance: data.balance, roundId: round.id, bet: round2(Number(round.bet) + extraBet) });
  }

  switch (game) {
    case "dados": {
      const bet = amount(body.bet);
      const dice = { chance: Number(body.chance), direction: body.direction };
      if (!bet || !validDice(dice)) return fail("bad_request");
      if (bet * diceMultiplier(dice.chance) > limits.max_payout) return fail("max_payout");
      const state = playDice(dice, rng);
      return single(bet, state.win ? bet * state.multiplier : 0, state);
    }

    case "crash": {
      const bet = amount(body.bet);
      const target = amount(body.target);
      if (!bet || !target || target < CRASH_MIN_TARGET || target > CRASH_MAX_TARGET) return fail("bad_request");
      if (bet * target > limits.max_payout) return fail("max_payout");
      const state = playCrash(target, rng);
      return single(bet, state.win ? bet * target : 0, state);
    }

    case "ruleta": {
      if (!validRouletteBets(body.bets)) return fail("bad_request");
      const result = playRoulette(body.bets, rng);
      return single(result.bet, result.payout, result.state);
    }

    case "slots": {
      const bet = amount(body.bet);
      if (!bet) return fail("bad_request");
      const state = playSlots(rng);
      return single(bet, bet * state.multiplier, state);
    }

    case "minas": {
      if (body.action === "start") {
        const bet = amount(body.bet);
        if (!bet || !validMineCount(body.mines)) return fail("bad_request");
        const { state, secret } = startMines(body.mines, rng);
        return open(bet, state, secret);
      }
      const round = await openRound<MinesState, MinesSecret>(user, game);
      if (!round) return fail("no_round", 409);
      if (body.action === "reveal") {
        const step = revealMine(round.state, round.secret, body.tile);
        if (!step) return fail("bad_move");
        return step.done ? close(round, step.state, Number(round.bet) * step.state.multiplier) : update(round, step.state);
      }
      if (body.action === "cashout") {
        const state = cashOutMines(round.state, round.secret);
        if (!state) return fail("bad_move");
        return close(round, state, Number(round.bet) * state.multiplier);
      }
      return fail("bad_request");
    }

    case "blackjack": {
      if (body.action === "deal") {
        const bet = amount(body.bet);
        if (!bet) return fail("bad_request");
        const { state, secret } = dealBlackjack(rng);
        // A natural on either side ends the hand on the deal.
        return state.outcome ? single(bet, bet * BLACKJACK_RETURNS[state.outcome], state) : open(bet, state, secret);
      }
      if (body.action !== "hit" && body.action !== "stand" && body.action !== "double") return fail("bad_request");
      const round = await openRound<BlackjackState, BlackjackSecret>(user, game);
      if (!round) return fail("no_round", 409);
      const state = actBlackjack(round.state, round.secret, body.action, rng);
      if (!state) return fail("bad_move");
      if (!state.outcome) return update(round, state);
      // Doubling charges a second bet of the same size; it always ends the hand.
      const extra = body.action === "double" ? Number(round.bet) : 0;
      return close(round, state, (Number(round.bet) + extra) * BLACKJACK_RETURNS[state.outcome], extra);
    }

    default:
      return fail("bad_request", 404);
  }
}
