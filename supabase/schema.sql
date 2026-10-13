-- KriptoBet · esquema completo de Supabase.
-- Pégalo entero en SQL Editor y ejecútalo. Se puede volver a ejecutar cuando cambie.
--
-- Reglas del diseño:
--   · El saldo (USDT) solo se mueve dentro de funciones de este archivo, siempre junto con una fila en `ledger`.
--   · Desde la app (clave publicable) solo se puede: leer lo propio, apostar en deportes (`place_bet`),
--     pedir retiros (`request_withdrawal`) y ajustar límites de juego responsable.
--   · Juegos de casino, depósitos y liquidación de apuestas los ejecuta el servidor web con la clave secreta.

-- ───────────────────────────── Ajustes ─────────────────────────────

create table if not exists public.settings (
  id boolean primary key default true check (id),
  min_bet numeric(14,2) not null default 0.10,
  max_bet numeric(14,2) not null default 500,
  -- Premio máximo de una sola apuesta o jugada.
  max_payout numeric(14,2) not null default 10000,
  max_selections int not null default 12,
  min_deposit numeric(14,2) not null default 10,
  min_withdrawal numeric(14,2) not null default 20
);
insert into public.settings default values on conflict do nothing;

-- ───────────────────────────── Usuarios y saldo ─────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  balance numeric(14,2) not null default 0 check (balance >= 0),
  is_admin boolean not null default false,
  -- Autoexclusión: hasta esta fecha la cuenta no puede apostar, jugar ni depositar.
  excluded_until timestamptz,
  -- Tope de depósitos en 24 horas que el propio usuario se pone. null = sin tope.
  daily_deposit_limit numeric(14,2) check (daily_deposit_limit > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  amount numeric(14,2) not null,
  balance_after numeric(14,2) not null,
  kind text not null check (kind in (
    'deposit', 'withdrawal', 'withdrawal_refund', 'bet', 'bet_win', 'bet_refund', 'game_bet', 'game_win', 'demo', 'adjustment'
  )),
  -- Id de lo que originó el movimiento (depósito, retiro, apuesta o ronda).
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on public.ledger (user_id, id desc);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', ''), 40))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cuentas creadas antes de ejecutar este archivo.
insert into public.profiles (id, name)
select id, left(coalesce(raw_user_meta_data ->> 'name', ''), 40) from auth.users
on conflict (id) do nothing;

/** Único lugar donde cambia un saldo. Falla con `insufficient_funds` si quedaría en negativo. */
create or replace function public.wallet_move(p_user uuid, p_amount numeric, p_kind text, p_ref text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_balance numeric;
begin
  update public.profiles set balance = balance + p_amount
  where id = p_user and balance + p_amount >= 0
  returning balance into v_balance;
  if not found then
    if exists (select 1 from public.profiles where id = p_user) then
      raise exception 'insufficient_funds';
    end if;
    raise exception 'no_profile';
  end if;
  insert into public.ledger (user_id, amount, balance_after, kind, ref) values (p_user, p_amount, v_balance, p_kind, p_ref);
  return v_balance;
end $$;

create or replace function public.assert_can_play(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = p_user and excluded_until > now()) then
    raise exception 'self_excluded';
  end if;
end $$;

-- ───────────────────────────── Juego responsable ─────────────────────────────

/** Bloquea la cuenta propia durante p_days días. No se puede acortar. */
create or replace function public.self_exclude(p_days int) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_days is null or p_days < 1 or p_days > 3650 then raise exception 'bad_days'; end if;
  update public.profiles
  set excluded_until = greatest(coalesce(excluded_until, now()), now() + make_interval(days => p_days))
  where id = auth.uid()
  returning excluded_until into v_until;
  return v_until;
end $$;

/** Tope de depósitos en 24 h. null lo quita. */
create or replace function public.set_deposit_limit(p_limit numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_limit is not null and p_limit <= 0 then raise exception 'bad_limit'; end if;
  update public.profiles set daily_deposit_limit = round(p_limit, 2) where id = auth.uid();
end $$;

-- ───────────────────────────── Depósitos y retiros en cripto ─────────────────────────────

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  -- Lo que el usuario pidió acreditar, en USD.
  amount numeric(14,2) not null check (amount > 0),
  pay_currency text not null,
  pay_amount numeric(30,12),
  pay_address text,
  -- Id del pago en el procesador (NOWPayments).
  provider_id text unique,
  status text not null default 'waiting' check (status in ('waiting', 'confirming', 'credited', 'expired', 'failed')),
  credited numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deposits_user_idx on public.deposits (user_id, created_at desc);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  network text not null,
  address text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  tx_hash text,
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists withdrawals_user_idx on public.withdrawals (user_id, created_at desc);
create index if not exists withdrawals_pending_idx on public.withdrawals (created_at) where status = 'pending';

/** Registra un depósito antes de pedirle la dirección de pago al procesador. Solo servidor. */
create or replace function public.open_deposit(p_user uuid, p_amount numeric, p_currency text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_settings public.settings;
  v_profile public.profiles;
  v_recent numeric;
  v_id uuid;
begin
  perform public.assert_can_play(p_user);
  select * into v_settings from public.settings;
  select * into v_profile from public.profiles where id = p_user;
  if not found then raise exception 'no_profile'; end if;
  p_amount := round(p_amount, 2);
  if p_amount is null or p_amount < v_settings.min_deposit then raise exception 'deposit_too_small'; end if;

  if (select count(*) from public.deposits where user_id = p_user and status = 'waiting' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_deposits';
  end if;
  if v_profile.daily_deposit_limit is not null then
    select coalesce(sum(case when status = 'credited' then credited else amount end), 0) into v_recent
    from public.deposits
    where user_id = p_user and created_at > now() - interval '24 hours' and status in ('waiting', 'confirming', 'credited');
    if v_recent + p_amount > v_profile.daily_deposit_limit then raise exception 'deposit_limit'; end if;
  end if;

  insert into public.deposits (user_id, amount, pay_currency) values (p_user, p_amount, p_currency) returning id into v_id;
  return v_id;
end $$;

/** Acredita un depósito una sola vez. Devuelve false si ya estaba acreditado. Solo servidor. */
create or replace function public.credit_deposit(p_deposit uuid, p_amount numeric) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_deposit public.deposits;
begin
  select * into v_deposit from public.deposits where id = p_deposit for update;
  if not found then raise exception 'no_deposit'; end if;
  if v_deposit.status = 'credited' then return false; end if;
  p_amount := round(p_amount, 2);
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if;
  update public.deposits set status = 'credited', credited = p_amount, updated_at = now() where id = p_deposit;
  perform public.wallet_move(v_deposit.user_id, p_amount, 'deposit', p_deposit::text);
  return true;
end $$;

/** El usuario pide un retiro: el importe sale del saldo en ese momento y queda retenido hasta que se pague o rechace. */
create or replace function public.request_withdrawal(p_amount numeric, p_network text, p_address text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_min numeric;
  v_id uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select min_withdrawal into v_min from public.settings;
  p_amount := round(p_amount, 2);
  p_address := btrim(coalesce(p_address, ''));
  if p_amount is null or p_amount < v_min then raise exception 'withdrawal_too_small'; end if;
  if length(p_address) < 20 or length(p_address) > 120 or p_address !~ '^[A-Za-z0-9:]+$' then raise exception 'bad_address'; end if;
  if coalesce(p_network, '') not in ('usdttrc20', 'usdtbsc', 'usdterc20', 'btc', 'eth', 'ltc', 'trx', 'sol') then
    raise exception 'bad_network';
  end if;
  if exists (select 1 from public.withdrawals where user_id = v_user and status = 'pending') then
    raise exception 'withdrawal_pending';
  end if;

  perform public.wallet_move(v_user, -p_amount, 'withdrawal', v_id::text);
  insert into public.withdrawals (id, user_id, amount, network, address) values (v_id, v_user, p_amount, p_network, p_address);
  return v_id;
end $$;

/**
 * Cierra un retiro pendiente: 'paid' (ya enviaste la cripto; guarda el hash) o 'rejected' (devuelve el saldo).
 * Solo servidor / SQL Editor.
 */
create or replace function public.admin_set_withdrawal(p_id uuid, p_status text, p_tx_hash text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_withdrawal public.withdrawals;
begin
  if p_status not in ('paid', 'rejected') then raise exception 'bad_status'; end if;
  select * into v_withdrawal from public.withdrawals where id = p_id for update;
  if not found then raise exception 'no_withdrawal'; end if;
  if v_withdrawal.status <> 'pending' then raise exception 'already_resolved'; end if;
  update public.withdrawals set status = p_status, tx_hash = p_tx_hash, note = p_note, resolved_at = now() where id = p_id;
  if p_status = 'rejected' then
    perform public.wallet_move(v_withdrawal.user_id, v_withdrawal.amount, 'withdrawal_refund', p_id::text);
  end if;
end $$;

/** Saldo de prueba para el modo demo (PB_DEMO_MODE=1 en la web). Solo servidor. */
create or replace function public.demo_topup(p_user uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
begin
  if (select balance from public.profiles where id = p_user) >= 1 then raise exception 'demo_has_balance'; end if;
  return public.wallet_move(p_user, 1000, 'demo');
end $$;

-- ───────────────────────────── Deportes: eventos y cuotas ─────────────────────────────

create table if not exists public.sports (
  key text primary key,
  title text not null,
  group_name text not null default '',
  active boolean not null default true,
  sort int not null default 100
);

create table if not exists public.events (
  -- Id del evento en el proveedor de cuotas (The Odds API).
  id text primary key,
  sport_key text not null references public.sports on delete cascade,
  home_team text not null,
  away_team text not null,
  commence_time timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'finished', 'cancelled')),
  home_score int,
  away_score int,
  updated_at timestamptz not null default now()
);
create index if not exists events_upcoming_idx on public.events (commence_time) where status = 'upcoming';

create table if not exists public.odds (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events on delete cascade,
  -- h2h = ganador del partido (con empate donde aplica); totals = más/menos de `point` puntos o goles.
  market text not null check (market in ('h2h', 'totals')),
  outcome text not null check (outcome in ('home', 'draw', 'away', 'over', 'under')),
  point numeric(6,2),
  -- Cuota decimal: lo que se cobra por cada 1 apostado.
  price numeric(8,2) not null check (price > 1),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (event_id, market, outcome)
);

/**
 * Guarda las cuotas recién leídas de un deporte. Solo servidor.
 * p_events: [{ id, home_team, away_team, commence_time, odds: [{ market, outcome, point, price }] }]
 * Las cuotas que ya no vienen en la lectura se cierran; nada se borra, porque hay apuestas que las referencian.
 */
create or replace function public.sync_odds(p_sport text, p_events jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  insert into public.events (id, sport_key, home_team, away_team, commence_time)
  select e ->> 'id', p_sport, e ->> 'home_team', e ->> 'away_team', (e ->> 'commence_time')::timestamptz
  from jsonb_array_elements(p_events) e
  on conflict (id) do update
    set home_team = excluded.home_team, away_team = excluded.away_team, commence_time = excluded.commence_time, updated_at = now()
    where events.status = 'upcoming';
  get diagnostics v_count = row_count;

  update public.odds o set active = false
  from public.events e
  where e.id = o.event_id and e.sport_key = p_sport and e.status = 'upcoming' and o.active;

  insert into public.odds (event_id, market, outcome, point, price)
  select e ->> 'id', o ->> 'market', o ->> 'outcome', (o ->> 'point')::numeric, (o ->> 'price')::numeric
  from jsonb_array_elements(p_events) e, jsonb_array_elements(e -> 'odds') o
  where exists (select 1 from public.events x where x.id = e ->> 'id' and x.status = 'upcoming')
  on conflict (event_id, market, outcome) do update
    set point = excluded.point, price = excluded.price, active = true, updated_at = now();
  return v_count;
end $$;

-- ───────────────────────────── Deportes: apuestas ─────────────────────────────

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  stake numeric(14,2) not null check (stake > 0),
  -- Producto de las cuotas de todas las selecciones (1 selección = apuesta simple; varias = combinada).
  total_odds numeric(14,2) not null default 1,
  potential_payout numeric(14,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'void')),
  payout numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists bets_user_idx on public.bets (user_id, created_at desc);

create table if not exists public.bet_selections (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets on delete cascade,
  event_id text not null references public.events,
  market text not null,
  outcome text not null,
  point numeric(6,2),
  -- Cuota con la que se aceptó la apuesta; no cambia aunque la del evento se mueva después.
  price numeric(8,2) not null,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'void')),
  home_team text not null,
  away_team text not null,
  commence_time timestamptz not null
);
create index if not exists bet_selections_bet_idx on public.bet_selections (bet_id);
create index if not exists bet_selections_event_idx on public.bet_selections (event_id) where status = 'pending';

/**
 * Coloca una apuesta simple o combinada con el saldo del usuario que llama.
 * p_selections: [{ odds_id, price }] — `price` es la cuota que el usuario vio; si ya cambió, falla con
 * `odds_changed` para que la app la vuelva a mostrar en vez de apostar a otra cuota.
 */
create or replace function public.place_bet(p_stake numeric, p_selections jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_settings public.settings;
  v_count int;
  v_total numeric := 1;
  v_payout numeric;
  v_bet uuid;
  v_balance numeric;
  v_events text[] := '{}';
  v_sel record;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_play(v_user);
  select * into v_settings from public.settings;

  p_stake := round(p_stake, 2);
  if p_stake is null or p_stake < v_settings.min_bet or p_stake > v_settings.max_bet then raise exception 'stake_out_of_range'; end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' then raise exception 'bad_selections'; end if;
  v_count := jsonb_array_length(p_selections);
  if v_count < 1 or v_count > v_settings.max_selections then raise exception 'bad_selections'; end if;

  insert into public.bets (user_id, stake) values (v_user, p_stake) returning id into v_bet;

  for v_sel in
    select o.id, o.event_id, o.market, o.outcome, o.point, o.price, o.active,
           e.home_team, e.away_team, e.commence_time, e.status, (s.value ->> 'price')::numeric as seen_price
    from jsonb_array_elements(p_selections) s(value)
    left join public.odds o on o.id::text = s.value ->> 'odds_id'
    left join public.events e on e.id = o.event_id
  loop
    if v_sel.id is null or not v_sel.active or v_sel.status <> 'upcoming' or v_sel.commence_time <= now() then
      raise exception 'selection_closed';
    end if;
    if v_sel.seen_price is distinct from v_sel.price then raise exception 'odds_changed'; end if;
    -- Dos selecciones del mismo partido están correlacionadas: no se combinan.
    if v_sel.event_id = any (v_events) then raise exception 'same_event'; end if;
    v_events := v_events || v_sel.event_id;
    v_total := v_total * v_sel.price;

    insert into public.bet_selections (bet_id, event_id, market, outcome, point, price, home_team, away_team, commence_time)
    values (v_bet, v_sel.event_id, v_sel.market, v_sel.outcome, v_sel.point, v_sel.price, v_sel.home_team, v_sel.away_team, v_sel.commence_time);
  end loop;

  v_total := round(v_total, 2);
  v_payout := round(p_stake * v_total, 2);
  if v_payout > v_settings.max_payout then raise exception 'max_payout'; end if;
  update public.bets set total_odds = v_total, potential_payout = v_payout where id = v_bet;
  v_balance := public.wallet_move(v_user, -p_stake, 'bet', v_bet::text);

  return jsonb_build_object('bet_id', v_bet, 'balance', v_balance, 'total_odds', v_total, 'potential_payout', v_payout);
end $$;

/** Cierra las apuestas pendientes que tocan un evento ya resuelto. Interna. */
create or replace function public.settle_bets_of_event(p_event text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_bet public.bets;
  v_lost int;
  v_pending int;
  v_won int;
  v_void int;
  v_odds numeric;
  v_price numeric;
  v_payout numeric;
  v_settled int := 0;
begin
  for v_bet in
    select b.* from public.bets b
    where b.status = 'pending' and exists (select 1 from public.bet_selections s where s.bet_id = b.id and s.event_id = p_event)
    for update
  loop
    select count(*) filter (where status = 'lost'), count(*) filter (where status = 'pending'),
           count(*) filter (where status = 'won'), count(*) filter (where status = 'void')
    into v_lost, v_pending, v_won, v_void
    from public.bet_selections where bet_id = v_bet.id;

    if v_lost > 0 then
      -- Una selección perdida pierde la combinada entera, aunque queden partidos por jugarse.
      update public.bets set status = 'lost', settled_at = now() where id = v_bet.id;
    elsif v_pending > 0 then
      continue;
    elsif v_won = 0 then
      update public.bets set status = 'void', payout = stake, settled_at = now() where id = v_bet.id;
      perform public.wallet_move(v_bet.user_id, v_bet.stake, 'bet_refund', v_bet.id::text);
    else
      if v_void = 0 then
        v_payout := v_bet.potential_payout;
      else
        -- Las selecciones anuladas cuentan como cuota 1.
        v_odds := 1;
        for v_price in select price from public.bet_selections where bet_id = v_bet.id and status = 'won' loop
          v_odds := v_odds * v_price;
        end loop;
        v_payout := round(v_bet.stake * round(v_odds, 2), 2);
      end if;
      update public.bets set status = 'won', payout = v_payout, settled_at = now() where id = v_bet.id;
      perform public.wallet_move(v_bet.user_id, v_payout, 'bet_win', v_bet.id::text);
    end if;
    v_settled := v_settled + 1;
  end loop;
  return v_settled;
end $$;

/**
 * Registra el marcador final de un evento y liquida sus apuestas. Solo servidor / SQL Editor.
 * Repetirlo no hace nada: solo actúa sobre eventos todavía 'upcoming'.
 */
create or replace function public.settle_event(p_event text, p_home int, p_away int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_has_draw boolean;
begin
  if p_home is null or p_away is null then raise exception 'bad_score'; end if;
  update public.events set status = 'finished', home_score = p_home, away_score = p_away, updated_at = now()
  where id = p_event and status = 'upcoming';
  if not found then return 0; end if;
  update public.odds set active = false where event_id = p_event;

  -- En mercados de dos resultados (sin cuota de empate) un empate anula la selección.
  select exists (select 1 from public.odds where event_id = p_event and market = 'h2h' and outcome = 'draw') into v_has_draw;

  update public.bet_selections s set status = case
    when s.market = 'h2h' then case
      when p_home = p_away and not v_has_draw then 'void'
      when (s.outcome = 'home' and p_home > p_away) or (s.outcome = 'away' and p_away > p_home)
        or (s.outcome = 'draw' and p_home = p_away) then 'won'
      else 'lost' end
    when s.market = 'totals' then case
      when p_home + p_away = s.point then 'void'
      when (s.outcome = 'over') = (p_home + p_away > s.point) then 'won'
      else 'lost' end
    else 'void' end
  where s.event_id = p_event and s.status = 'pending';

  return public.settle_bets_of_event(p_event);
end $$;

/** Evento cancelado o sin resultado: sus selecciones se anulan (cuota 1) y se liquidan las apuestas. */
create or replace function public.void_event(p_event text) returns int
language plpgsql security definer set search_path = '' as $$
begin
  update public.events set status = 'cancelled', updated_at = now() where id = p_event and status = 'upcoming';
  if not found then return 0; end if;
  update public.odds set active = false where event_id = p_event;
  update public.bet_selections set status = 'void' where event_id = p_event and status = 'pending';
  return public.settle_bets_of_event(p_event);
end $$;

-- ───────────────────────────── Casino ─────────────────────────────

create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  game text not null check (game in ('dados', 'crash', 'ruleta', 'slots', 'minas', 'blackjack')),
  bet numeric(14,2) not null check (bet > 0),
  payout numeric(14,2) not null default 0,
  -- 'open' = partida en curso (minas, blackjack); el resto nace 'done'.
  status text not null default 'done' check (status in ('open', 'done')),
  -- Lo que el jugador puede ver de la ronda.
  state jsonb not null default '{}',
  -- Lo que solo conoce el servidor mientras la ronda sigue abierta (posición de las minas, carta tapada).
  secret jsonb,
  version int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists game_rounds_user_idx on public.game_rounds (user_id, created_at desc);
create unique index if not exists game_rounds_one_open on public.game_rounds (user_id, game) where status = 'open';

create or replace function public.assert_game_bet(p_user uuid, p_bet numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_settings public.settings;
begin
  perform public.assert_can_play(p_user);
  select * into v_settings from public.settings;
  if p_bet is null or p_bet <> round(p_bet, 2) or p_bet < v_settings.min_bet or p_bet > v_settings.max_bet then
    raise exception 'stake_out_of_range';
  end if;
end $$;

/** Ronda de un solo paso (dados, crash, ruleta, slots): cobra la apuesta, paga el premio y la registra. */
create or replace function public.game_play(p_user uuid, p_game text, p_bet numeric, p_payout numeric, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_round uuid := gen_random_uuid();
  v_balance numeric;
begin
  perform public.assert_game_bet(p_user, p_bet);
  if p_payout is null or p_payout < 0 then raise exception 'bad_amount'; end if;
  v_balance := public.wallet_move(p_user, -p_bet, 'game_bet', v_round::text);
  if p_payout > 0 then
    v_balance := public.wallet_move(p_user, round(p_payout, 2), 'game_win', v_round::text);
  end if;
  insert into public.game_rounds (id, user_id, game, bet, payout, state, finished_at)
  values (v_round, p_user, p_game, p_bet, round(p_payout, 2), p_state, now());
  return jsonb_build_object('round_id', v_round, 'balance', v_balance);
end $$;

/** Abre una partida de varios pasos y cobra la apuesta. Falla con `round_open` si ya hay una abierta de ese juego. */
create or replace function public.game_open(p_user uuid, p_game text, p_bet numeric, p_state jsonb, p_secret jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_round uuid := gen_random_uuid();
  v_balance numeric;
begin
  perform public.assert_game_bet(p_user, p_bet);
  if exists (select 1 from public.game_rounds where user_id = p_user and game = p_game and status = 'open') then
    raise exception 'round_open';
  end if;
  v_balance := public.wallet_move(p_user, -p_bet, 'game_bet', v_round::text);
  insert into public.game_rounds (id, user_id, game, bet, status, state, secret)
  values (v_round, p_user, p_game, p_bet, 'open', p_state, p_secret);
  return jsonb_build_object('round_id', v_round, 'balance', v_balance);
end $$;

/** Avanza una partida abierta. `p_version` evita que dos peticiones simultáneas jueguen el mismo paso. */
create or replace function public.game_update(p_user uuid, p_round uuid, p_version int, p_state jsonb, p_secret jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.game_rounds set state = p_state, secret = p_secret, version = version + 1
  where id = p_round and user_id = p_user and status = 'open' and version = p_version;
  if not found then raise exception 'stale_round'; end if;
  return jsonb_build_object('balance', (select balance from public.profiles where id = p_user));
end $$;

/** Termina una partida abierta y paga. `p_extra_bet` cobra antes un aumento de apuesta (doblar en blackjack). */
create or replace function public.game_close(
  p_user uuid, p_round uuid, p_version int, p_state jsonb, p_payout numeric, p_extra_bet numeric default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_balance numeric;
begin
  if p_payout is null or p_payout < 0 or p_extra_bet is null or p_extra_bet < 0 then raise exception 'bad_amount'; end if;
  update public.game_rounds
  set state = p_state, payout = round(p_payout, 2), bet = bet + p_extra_bet, status = 'done', version = version + 1, finished_at = now()
  where id = p_round and user_id = p_user and status = 'open' and version = p_version;
  if not found then raise exception 'stale_round'; end if;

  if p_extra_bet > 0 then
    v_balance := public.wallet_move(p_user, -p_extra_bet, 'game_bet', p_round::text);
  end if;
  if p_payout > 0 then
    v_balance := public.wallet_move(p_user, round(p_payout, 2), 'game_win', p_round::text);
  end if;
  if v_balance is null then
    select balance into v_balance from public.profiles where id = p_user;
  end if;
  return jsonb_build_object('balance', v_balance);
end $$;

-- ───────────────────────────── Panel del operador ─────────────────────────────

/** Totales para /admin. Solo servidor. */
create or replace function public.admin_stats() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'balances', (select coalesce(sum(balance), 0) from public.profiles),
    'deposits', (select coalesce(sum(amount), 0) from public.ledger where kind = 'deposit'),
    'withdrawals_paid', (select coalesce(sum(amount), 0) from public.withdrawals where status = 'paid'),
    'withdrawals_pending', (select coalesce(sum(amount), 0) from public.withdrawals where status = 'pending'),
    -- Lo apostado menos lo pagado: positivo = gana la casa.
    'sports_margin', (select coalesce(-sum(amount), 0) from public.ledger where kind in ('bet', 'bet_win', 'bet_refund')),
    'casino_margin', (select coalesce(-sum(amount), 0) from public.ledger where kind in ('game_bet', 'game_win')),
    'pending_bets', (select count(*) from public.bets where status = 'pending'),
    'pending_exposure', (select coalesce(sum(potential_payout), 0) from public.bets where status = 'pending')
  );
$$;

-- ───────────────────────────── Seguridad ─────────────────────────────

alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.ledger enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.sports enable row level security;
alter table public.events enable row level security;
alter table public.odds enable row level security;
alter table public.bets enable row level security;
alter table public.bet_selections enable row level security;
alter table public.game_rounds enable row level security;

-- Nadie escribe tablas con la clave publicable: todo cambio pasa por las funciones de arriba.
revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant select on public.settings, public.sports, public.events, public.odds to anon, authenticated;
grant select on public.profiles, public.ledger, public.deposits, public.withdrawals, public.bets, public.bet_selections to authenticated;
-- De las rondas se puede leer todo menos `secret`.
grant select (id, user_id, game, bet, payout, status, state, created_at, finished_at) on public.game_rounds to authenticated;

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
drop policy if exists sports_read on public.sports;
create policy sports_read on public.sports for select using (true);
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (true);
drop policy if exists odds_read on public.odds;
create policy odds_read on public.odds for select using (true);

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists ledger_own on public.ledger;
create policy ledger_own on public.ledger for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists deposits_own on public.deposits;
create policy deposits_own on public.deposits for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists withdrawals_own on public.withdrawals;
create policy withdrawals_own on public.withdrawals for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists bets_own on public.bets;
create policy bets_own on public.bets for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists bet_selections_own on public.bet_selections;
create policy bet_selections_own on public.bet_selections for select to authenticated
  using (exists (select 1 from public.bets b where b.id = bet_id and b.user_id = (select auth.uid())));
drop policy if exists game_rounds_own on public.game_rounds;
create policy game_rounds_own on public.game_rounds for select to authenticated using (user_id = (select auth.uid()));

-- Funciones: por defecto ninguna se puede llamar desde la app; después se abren las cuatro del usuario.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.place_bet(numeric, jsonb) to authenticated;
grant execute on function public.request_withdrawal(numeric, text, text) to authenticated;
grant execute on function public.self_exclude(int) to authenticated;
grant execute on function public.set_deposit_limit(numeric) to authenticated;

-- El saldo se actualiza solo en la app cuando entra un depósito o se liquida una apuesta.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles')
  then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- Para darte acceso a /admin, ejecuta aparte (con tu correo):
--   update public.profiles set is_admin = true where id = (select id from auth.users where email = 'tu@correo.com');
