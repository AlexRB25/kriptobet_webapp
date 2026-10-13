import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Card, Chips, ErrorText, Field, Heading, Muted, Notice, Screen } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { errorCode } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { dateTime, parseAmount, usdt } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/store/account';
import { useSession } from '@/store/session';

const EXCLUSIONS = [
  { value: '1', label: '24 h' },
  { value: '7', label: '1 semana' },
  { value: '30', label: '1 mes' },
  { value: '180', label: '6 meses' },
  { value: '365', label: '1 año' },
];

export default function AccountScreen() {
  const { session } = useSession();
  const { profile, reload } = useAccount();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState('7');
  const [limit, setLimit] = useState(profile?.daily_deposit_limit ? String(profile.daily_deposit_limit) : '');

  const excludedUntil = profile?.excluded_until && new Date(profile.excluded_until) > new Date() ? profile.excluded_until : null;

  async function call(name: string, args: object, done: string) {
    setError('');
    setNotice('');
    setBusy(true);
    const { error } = await supabase.rpc(name, args);
    setBusy(false);
    if (error) return setError(errorMessage(errorCode(error)));
    setNotice(done);
    await reload();
  }

  function saveLimit() {
    const value = limit.trim() ? parseAmount(limit) : null;
    if (limit.trim() && !value) return setError(errorMessage('bad_limit'));
    void call('set_deposit_limit', { p_limit: value }, value ? `Límite guardado: ${usdt(value)} cada 24 horas.` : 'Límite eliminado.');
  }

  function exclude() {
    const option = EXCLUSIONS.find((item) => item.value === days)!;
    Alert.alert('¿Bloquear tu cuenta?', `Quedará bloqueada durante ${option.label}. No se puede deshacer ni acortar.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Bloquear', style: 'destructive', onPress: () => void call('self_exclude', { p_days: Number(days) }, 'Autoexclusión activada.') },
    ]);
  }

  return (
    <Screen>
      <Card>
        <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '700' }}>{profile?.name || 'Sin nombre'}</Text>
        <Muted>{session?.user.email}</Muted>
        <Button variant="danger" label="Cerrar sesión" icon="log-out-outline" onPress={() => supabase.auth.signOut()} />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Notice>{notice}</Notice>

      <Card>
        <Heading>Límite de depósito</Heading>
        <Muted>Pon un tope a lo que puedes depositar cada 24 horas. Déjalo vacío para no tener tope.</Muted>
        <Field label="Límite (USDT)" numeric placeholder="Sin límite" value={limit} onChangeText={setLimit} />
        <Button label="Guardar" onPress={saveLimit} loading={busy} />
      </Card>

      <Card>
        <Heading>Autoexclusión</Heading>
        {excludedUntil ? (
          <Notice tone="warn">
            Tu cuenta está bloqueada hasta el {dateTime(excludedUntil)}. Puedes retirar tu saldo, pero no apostar, jugar ni depositar.
          </Notice>
        ) : (
          <>
            <Muted>
              Si sientes que el juego dejó de ser un entretenimiento, bloquea tu cuenta por un tiempo. Mientras dure no podrás apostar, jugar ni
              depositar; sí podrás retirar tu saldo. No se puede cancelar antes de tiempo.
            </Muted>
            <Chips options={EXCLUSIONS} value={days} onChange={setDays} />
            <Button variant="danger" label="Bloquear mi cuenta" onPress={exclude} disabled={busy} />
          </>
        )}
      </Card>
      <Muted style={{ textAlign: 'center', fontSize: 12 }}>18+ · Jugar puede causar adicción. Nunca apuestes dinero que necesites.</Muted>
    </Screen>
  );
}
