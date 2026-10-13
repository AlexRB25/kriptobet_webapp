import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { EventCard, SlipBar, useEvents } from '@/components/events';
import { Button, Card, Heading, Muted, Row, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { money } from '@/lib/format';
import { GAMES, GAME_IDS } from '@/lib/games';
import { useAccount } from '@/store/account';

export default function HomeScreen() {
  const { profile, balance } = useAccount();
  const { sports, events, loading, reload } = useEvents();

  return (
    <View style={{ flex: 1 }}>
      <Screen onRefresh={reload}>
        <Card>
          <Muted>Hola{profile?.name ? `, ${profile.name}` : ''}. Tu saldo:</Muted>
          <Text style={{ color: Colors.text, fontSize: 34, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
            {money(balance)} <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>USDT</Text>
          </Text>
          <Row>
            <Button label="Depositar" icon="add-circle" onPress={() => router.push('/cartera')} style={{ flex: 1 }} />
            <Button label="Mis apuestas" variant="secondary" onPress={() => router.push('/apuestas')} style={{ flex: 1 }} />
          </Row>
        </Card>

        <Heading>Casino</Heading>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {GAME_IDS.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/juego/[game]', params: { game: id } })}
              style={({ pressed }) => ({
                width: '31.5%',
                alignItems: 'center',
                gap: Spacing.one,
                paddingVertical: Spacing.three,
                borderRadius: Radius.medium,
                borderWidth: 1,
                borderColor: Colors.border,
                backgroundColor: Colors.surface,
                opacity: pressed ? 0.6 : 1,
              })}>
              <Text style={{ fontSize: 34 }}>{GAMES[id].emoji}</Text>
              <Text style={{ color: Colors.text, fontWeight: '600' }}>{GAMES[id].title}</Text>
            </Pressable>
          ))}
        </View>

        <Row style={{ justifyContent: 'space-between' }}>
          <Heading>Próximos partidos</Heading>
          <Text style={{ color: Colors.accent, fontWeight: '600' }} onPress={() => router.push('/deportes')}>
            Ver todos
          </Text>
        </Row>
        {events.slice(0, 5).map((event) => (
          <EventCard key={event.id} event={event} sport={sports.find((sport) => sport.key === event.sport_key)} />
        ))}
        {!loading && events.length === 0 && <Muted>Todavía no hay partidos cargados. Vuelve en un rato.</Muted>}
      </Screen>
      <SlipBar />
    </View>
  );
}
