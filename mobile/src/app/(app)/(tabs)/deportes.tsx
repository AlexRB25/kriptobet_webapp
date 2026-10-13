import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { EventCard, SlipBar, useEvents } from '@/components/events';
import { ErrorText, Muted, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';

export default function SportsScreen() {
  const { sports, events, loading, error, reload } = useEvents();
  const [selected, setSelected] = useState<string | null>(null);

  // Only leagues that have something to bet on get a tab.
  const tabs = [{ key: null as string | null, title: 'Todos' }, ...sports.filter((sport) => events.some((event) => event.sport_key === sport.key))];
  const visible = selected ? events.filter((event) => event.sport_key === selected) : events;

  return (
    <View style={{ flex: 1 }}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two, padding: Spacing.three, paddingBottom: 0 }}>
          {tabs.map((tab) => {
            const active = tab.key === selected;
            return (
              <Pressable
                key={tab.key ?? 'todos'}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setSelected(tab.key)}
                style={{
                  paddingHorizontal: Spacing.three,
                  paddingVertical: Spacing.two,
                  borderRadius: Radius.pill,
                  borderWidth: 1,
                  borderColor: active ? Colors.accent : Colors.border,
                  backgroundColor: active ? Colors.accentSoft : Colors.surface,
                }}>
                <Text style={{ color: active ? Colors.accent : Colors.text, fontWeight: '600' }}>{tab.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <Screen onRefresh={reload}>
        {visible.map((event) => (
          <EventCard key={event.id} event={event} sport={selected ? undefined : sports.find((sport) => sport.key === event.sport_key)} />
        ))}
        {error && <ErrorText>No se pudieron cargar los partidos. Revisa tu conexión y desliza hacia abajo.</ErrorText>}
        {!loading && !error && visible.length === 0 && <Muted>No hay partidos abiertos por ahora. Vuelve en un rato.</Muted>}
        <Muted style={{ fontSize: 12 }}>
          Las apuestas cierran al inicio del partido. Un total exacto a la línea, un empate en un mercado sin empate o un evento cancelado anulan la
          selección: en una combinada cuenta como cuota 1.00.
        </Muted>
      </Screen>
      <SlipBar />
    </View>
  );
}
