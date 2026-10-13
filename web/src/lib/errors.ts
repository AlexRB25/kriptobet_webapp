// Error codes raised by supabase/schema.sql and by the API → message for the user.
// The mobile app keeps a copy in mobile/src/lib/errors.ts — change both.

const MESSAGES: Record<string, string> = {
  not_authenticated: "Entra a tu cuenta para continuar.",
  insufficient_funds: "No tienes saldo suficiente. Deposita para seguir jugando.",
  no_profile: "Tu cuenta no tiene perfil. ¿Ya se ejecutó supabase/schema.sql?",
  self_excluded: "Tu cuenta está en autoexclusión: por ahora no puedes apostar, jugar ni depositar.",
  stake_out_of_range: "El importe está fuera de los límites permitidos.",
  bad_selections: "Revisa las selecciones de tu boleto.",
  selection_closed: "Una de tus selecciones ya cerró. Quítala del boleto.",
  odds_changed: "Las cuotas cambiaron. Revisa el boleto y vuelve a confirmar.",
  same_event: "No puedes combinar dos selecciones del mismo partido.",
  max_payout: "El premio posible supera el máximo permitido. Baja el importe.",
  round_open: "Ya tienes una partida abierta de este juego.",
  stale_round: "La partida cambió. Vuelve a intentarlo.",
  no_round: "No hay una partida abierta.",
  bad_move: "Esa jugada no es válida.",
  bad_request: "Revisa los datos e inténtalo de nuevo.",
  deposit_too_small: "El depósito es menor al mínimo.",
  deposit_limit: "Ese depósito supera tu límite diario.",
  too_many_deposits: "Tienes varios depósitos sin pagar. Usa uno de ellos o espera un momento.",
  crypto_not_configured: "Los depósitos en cripto todavía no están activados.",
  provider_error: "El procesador de pagos no respondió. Inténtalo de nuevo en un momento.",
  withdrawal_too_small: "El retiro es menor al mínimo.",
  withdrawal_pending: "Ya tienes un retiro en proceso.",
  bad_address: "Esa dirección no parece válida.",
  bad_network: "Elige una red válida.",
  bad_days: "Elige un periodo válido.",
  bad_limit: "El límite debe ser mayor que cero.",
  demo_has_balance: "El saldo de prueba solo se recarga cuando te quedas sin saldo.",
  demo_disabled: "El modo demo está desactivado.",
  forbidden: "No tienes permiso para esto.",
  not_configured: "El servidor no está configurado todavía.",
  server_error: "Algo falló en el servidor. Inténtalo de nuevo.",
  network: "No se pudo conectar con el servidor. Revisa tu conexión.",
};

export function errorMessage(code: string | undefined | null) {
  return (code && MESSAGES[code]) || (code ? `Algo salió mal (${code}).` : MESSAGES.server_error);
}
