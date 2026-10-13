import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Blackjack } from "@/components/games/blackjack";
import { Crash } from "@/components/games/crash";
import { Dados } from "@/components/games/dados";
import { Minas } from "@/components/games/minas";
import { Ruleta } from "@/components/games/ruleta";
import { Slots } from "@/components/games/slots";
import { GAMES, GAME_IDS, type GameId } from "@/lib/games/types";

type Props = { params: Promise<{ game: string }> };

const SCREENS: Record<GameId, () => React.ReactNode> = {
  dados: Dados,
  crash: Crash,
  ruleta: Ruleta,
  slots: Slots,
  minas: Minas,
  blackjack: Blackjack,
};

const isGame = (game: string): game is GameId => (GAME_IDS as readonly string[]).includes(game);

export const generateStaticParams = () => GAME_IDS.map((game) => ({ game }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game } = await params;
  return { title: isGame(game) ? GAMES[game].title : "Casino" };
}

export default async function GamePage({ params }: Props) {
  const { game } = await params;
  if (!isGame(game)) notFound();
  const Screen = SCREENS[game];
  return <Screen />;
}
