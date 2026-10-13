import { Stack, useLocalSearchParams } from 'expo-router';

import { Crash, Dados, Slots } from '@/components/games/simple';
import { Blackjack, Minas, Ruleta } from '@/components/games/tables';
import { Empty, Screen } from '@/components/ui';
import { GAMES, GAME_IDS, type GameId } from '@/lib/games';

const SCREENS: Record<GameId, () => React.ReactNode> = {
  dados: Dados,
  crash: Crash,
  ruleta: Ruleta,
  slots: Slots,
  minas: Minas,
  blackjack: Blackjack,
};

export default function GameRoute() {
  const { game } = useLocalSearchParams<{ game: string }>();
  const id = (GAME_IDS as readonly string[]).includes(game) ? (game as GameId) : null;
  if (!id) {
    return (
      <Screen>
        <Empty icon="help-circle" text="Ese juego no existe." />
      </Screen>
    );
  }
  const Game = SCREENS[id];
  return (
    <>
      <Stack.Screen options={{ title: `${GAMES[id].emoji} ${GAMES[id].title}` }} />
      <Game />
    </>
  );
}
