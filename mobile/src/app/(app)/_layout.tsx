import { Stack } from 'expo-router';
import { type ReactNode } from 'react';
import { View } from 'react-native';

import { Button, ErrorText, Loading } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { AccountProvider, useAccount } from '@/store/account';
import { useSession } from '@/store/session';

/** Holds the screens back until the account has loaded once. */
function Gate({ children }: { children: ReactNode }) {
  const { loading, error, profile, reload } = useAccount();
  if (loading) return <Loading />;
  if (!profile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', gap: Spacing.three, padding: Spacing.four, backgroundColor: Colors.background }}>
        <ErrorText>{error || 'Tu cuenta no tiene perfil. ¿Ya ejecutaste supabase/schema.sql en tu proyecto?'}</ErrorText>
        <Button label="Reintentar" onPress={reload} />
      </View>
    );
  }
  return children;
}

export default function AppLayout() {
  const { session } = useSession();
  if (!session) return null;

  return (
    // Keyed by user so nothing from a previous account survives a change of session.
    <AccountProvider key={session.user.id} userId={session.user.id}>
      <Gate>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.text,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: Colors.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="boleto" options={{ title: 'Boleto', presentation: 'modal' }} />
          <Stack.Screen name="juego/[game]" options={{ title: 'Casino' }} />
          <Stack.Screen name="cuenta" options={{ title: 'Mi cuenta' }} />
        </Stack>
      </Gate>
    </AccountProvider>
  );
}
