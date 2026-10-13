# KriptoBet

Casa de apuestas deportivas y casino en línea que opera con criptomonedas: sitio web, app móvil y base de datos
en Supabase. «KriptoBet» es un nombre provisional.

| Carpeta | Qué es |
|---|---|
| `supabase/schema.sql` | Base de datos completa: saldos, libro de movimientos, depósitos, retiros, eventos, cuotas, apuestas, rondas de casino, seguridad (RLS) y todas las funciones que mueven dinero. |
| `web/` | Sitio Next.js y **servidor de todo el proyecto**: deportes, casino, cartera, panel `/admin` y la API (`/api/*`). |
| `mobile/` | App Expo (Android/iOS). Lee y apuesta directo contra Supabase; para el casino y los depósitos llama a la API de `web/`. |

La misma cuenta y el mismo saldo funcionan en la web y en la app.

## Cómo funciona el dinero

- El saldo de cada usuario se lleva en **USDT** (1 USDT = 1 USD) en `profiles.balance`. Solo cambia dentro de la
  función `wallet_move`, que siempre deja una fila en `ledger`; nunca puede quedar en negativo.
- **Depósitos:** el usuario elige importe y moneda (USDT en TRC20/BEP20/ERC20, BTC, ETH, LTC, TRX, SOL). El
  servidor pide a [NOWPayments](https://nowpayments.io) una dirección y un importe exacto; cuando el pago se
  confirma, se acredita el equivalente en USD. Antes de acreditar, el servidor **siempre vuelve a consultar el pago
  a NOWPayments** (el aviso que llega al webhook no se toma como prueba), y cada depósito se acredita una sola vez.
  Si el usuario paga de menos se acredita la parte proporcional; si paga de más, no se acredita el excedente.
- **Retiros:** el usuario pide importe, red y dirección; el importe sale de su saldo en ese momento. Tú envías la
  cripto desde tu wallet y lo marcas como pagado en `/admin` (con el hash) o lo rechazas (el saldo vuelve). No hay
  envíos automáticos.
- Con la clave publicable (la de la app y el navegador) nadie puede escribir tablas: solo leer lo propio y llamar a
  `place_bet`, `request_withdrawal`, `self_exclude` y `set_deposit_limit`. Lo demás lo ejecuta `web/` con la clave
  secreta.

## Deportes

- Eventos, cuotas y marcadores vienen de [The Odds API](https://the-odds-api.com). Mercados: **ganador** (con empate
  donde aplica) y **total** (más/menos). La cuota de cada resultado es la mediana de las casas de la región
  configurada, con un margen extra opcional (`ODDS_MARGIN`).
- Apuestas simples y combinadas (no se combinan dos selecciones del mismo partido). Cierran al inicio del partido;
  no hay apuestas en vivo ni cobro anticipado. Si la cuota cambió desde que el usuario la vio, la apuesta se rechaza
  y el boleto se actualiza.
- Liquidación: `/api/cron/settle` lee los marcadores y llama a `settle_event`. Total exacto a la línea, empate en un
  mercado sin empate o evento anulado → la selección se anula (cuota 1 en combinadas, reembolso en simples).
- Tareas programadas en `web/vercel.json`: cuotas una vez al día y liquidación una vez al día (lo que permite el
  plan gratuito de Vercel). Con un plan de pago, o con cualquier cron externo que llame a esas rutas con
  `Authorization: Bearer $CRON_SECRET`, se pueden correr más seguido. También hay botones en `/admin`.
- **Cuota de la API:** cada liga cuesta 2 créditos por actualización y 2 por lectura de marcadores. El plan
  gratuito (500 créditos al mes) alcanza para unas pocas ligas una vez al día; para cuotas frescas hace falta un
  plan de pago.
- Los eventos que el proveedor no da por terminados aparecen en `/admin` → *Eventos sin resultado* para ponerles el
  marcador a mano o anularlos.

## Casino

Seis juegos; el resultado se decide en el servidor con el generador aleatorio criptográfico de Node y la apuesta y
el premio se registran en una sola operación de base de datos.

| Juego | Reglas | Retorno al jugador |
|---|---|---|
| Dados | Eliges tu probabilidad (1–95 %); paga 99 ÷ probabilidad | 99 % |
| Crash | Eliges en cuánto cobrar (1.01×–1000×); ganas si el multiplicador llega | 99 % |
| Ruleta | Europea, un cero; plenos, docenas, columnas y apuestas simples | 97.3 % |
| Slots | 3 rodillos, paga la línea central; premio mayor 150× | 96.7 % |
| Minas | 25 casillas, 1–24 minas; cobra cuando quieras | 99 % |
| Blackjack | Baraja infinita, el crupier se planta en 17, blackjack paga 3:2, se puede doblar; sin dividir ni seguro | ≈ 99 % con buena estrategia |

Las reglas están en `web/src/lib/games/engine.ts` y sus pruebas (`npm test` en `web/`) comprueban esos retornos.
Los límites (apuesta mínima y máxima, premio máximo, depósito y retiro mínimos) están en la tabla `settings`.

## Juego responsable

Registro con confirmación de mayoría de edad, límite de depósito en 24 horas que el usuario se pone a sí mismo y
autoexclusión (24 horas a 1 año) que bloquea apostar, jugar y depositar, pero no retirar.

## Puesta en marcha

1. **Supabase.** Crea un proyecto, abre *SQL Editor*, pega `supabase/schema.sql` entero y ejecútalo (se puede
   volver a ejecutar). Para entrar sin confirmar correo, desactívalo en *Authentication → Sign In / Providers →
   Email*.
2. **Web.** En `web/`: copia `.env.example` como `.env.local` y rellena al menos las tres claves de Supabase.
   `npm install` y `npm run dev` → http://localhost:3000.
   - Para probar sin cripto pon `PB_DEMO_MODE=1`: la cartera muestra «Recargar saldo de prueba» (1000 USDT
     ficticios cuando el saldo está en cero). **Quítalo en producción.**
   - Para tener partidos pon `ODDS_API_KEY` y pulsa *Actualizar cuotas* en `/admin`.
   - Para depósitos reales pon `NOWPAYMENTS_API_KEY` y, en NOWPayments, tu wallet de cobro. El aviso de pago
     (IPN) llega a `SITE_URL/api/nowpayments/webhook`; en local no llega, pero la cartera consulta el estado sola
     cada 15 segundos mientras está abierta.
3. **Administrador.** Crea tu cuenta en la web y ejecuta en SQL Editor:
   `update public.profiles set is_admin = true where id = (select id from auth.users where email = 'tu@correo.com');`
   Aparece el enlace *Admin* en la cabecera.
4. **App.** En `mobile/`: copia `.env.example` como `.env.local` con la URL y la clave **publicable** de Supabase
   y la dirección de la web en `EXPO_PUBLIC_API_URL` (con un teléfono real, la IP de tu PC: `http://192.168.x.x:3000`).
   `npm install` y `npx expo start`.

En Vercel el proyecto es `web/` (Root Directory) con las mismas variables; las visibles en el navegador se llaman
`PB_*` y están declaradas en `next.config.ts`.

## Antes de operar con dinero real

- **Licencia y leyes.** Operar apuestas y casino en línea exige licencia en casi todos los países (en México,
  permiso de la SEGOB; en otros, la autoridad local o una licencia tipo Curaçao/Malta), además de verificación de
  identidad y edad (KYC) y controles contra lavado de dinero. Este proyecto no incluye KYC: la mayoría de edad solo
  se declara. Consulta a un abogado del sector antes de aceptar depósitos.
- **Tiendas de apps.** Google Play y App Store solo admiten apps de apuestas con dinero real de operadores con
  licencia y en países concretos; sin eso la app se distribuye como APK o se usa la web.
- **Riesgo de la casa.** No hay límites de exposición por evento ni ajuste de cuotas según lo apostado; solo los
  topes de `settings`. Con cuotas que se actualizan una vez al día, alguien puede apostar a cuotas viejas: para
  operar en serio hay que actualizar mucho más seguido.
- **Sin probar contra servicios reales.** El SQL se probó completo en un Postgres local (PGlite) y las reglas de
  los juegos tienen pruebas, pero nada se ha ejecutado contra un proyecto real de Supabase, NOWPayments ni The Odds
  API; los nombres de campos de esas dos API vienen de su documentación.
- **Pendiente:** recuperación de contraseña, textos legales (términos, privacidad), borrado de cuenta, retiros
  automáticos, límites de velocidad por usuario en la API.
