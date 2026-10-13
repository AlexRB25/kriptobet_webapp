import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Only the publishable key ships in the app. The secret key lives in the web server.
export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || 'https://sin-configurar.supabase.co', key || 'sin-configurar', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Supabase auth error codes → message for the user. */
export function authErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Correo o contraseña incorrectos.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Ya existe una cuenta con ese correo.';
    case 'weak_password':
      return 'La contraseña es demasiado débil. Usa al menos 8 caracteres.';
    case 'email_not_confirmed':
      return 'Confirma tu correo con el enlace que te enviamos antes de entrar.';
    case 'validation_failed':
      return 'Revisa el correo y la contraseña.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Demasiados intentos. Espera un momento y vuelve a probar.';
    case 'signup_disabled':
      return 'El registro de cuentas nuevas está desactivado.';
    case 'email_address_invalid':
      return 'Ese correo no parece válido.';
    default:
      // "Database error saving new user" is the signup trigger of schema.sql failing (or the schema not applied).
      if (/database error/i.test(error.message)) return 'No se pudo crear tu perfil en la base de datos. Avísanos para revisarlo.';
      if (/fetch|network/i.test(error.message)) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
      return `Algo salió mal: ${error.message}`;
  }
}
