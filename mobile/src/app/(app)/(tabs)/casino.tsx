import { router } from 'expo-router';
import { Text } from 'react-native';

import { ListItem, Screen } from '@/components/ui';
import { GAMES, GAME_IDS } from '@/lib/games';

export default function CasinoScreen() {
  return (
    <Screen>
      {GAME_IDS.map((id) => (
        <ListItem
          key={id}
          left={<Text style={{ fontSize: 36 }}>{GAMES[id].emoji}</Text>}
          title={GAMES[id].title}
          subtitle={GAMES[id].tagline}
          onPress={() => router.push({ pathname: '/juego/[game]', params: { game: id } })}
        />
      ))}
    </Screen>
  );
}
