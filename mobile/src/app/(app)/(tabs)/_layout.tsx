import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, Text, View } from 'react-native';

import { type IconName } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { money } from '@/lib/format';
import { useAccount } from '@/store/account';

const SCREENS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Inicio', icon: 'home' },
  { name: 'deportes', title: 'Deportes', icon: 'football' },
  { name: 'casino', title: 'Casino', icon: 'dice' },
  { name: 'apuestas', title: 'Apuestas', icon: 'receipt' },
  { name: 'cartera', title: 'Cartera', icon: 'wallet' },
];

/** Balance and account button shown at the right of every tab header. */
function HeaderRight() {
  const { balance } = useAccount();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginRight: Spacing.three }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cartera"
        onPress={() => router.push('/cartera')}
        style={{
          borderColor: Colors.border,
          borderWidth: 1,
          borderRadius: Radius.small,
          backgroundColor: Colors.surface,
          paddingHorizontal: Spacing.two,
          paddingVertical: Spacing.one,
        }}>
        <Text style={{ color: Colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {money(balance)} <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>USDT</Text>
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Mi cuenta" hitSlop={10} onPress={() => router.push('/cuenta')}>
        <Ionicons name="person-circle" size={28} color={Colors.text} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerTintColor: Colors.text,
        headerStyle: { backgroundColor: Colors.background },
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        headerRight: () => <HeaderRight />,
        tabBarStyle: { backgroundColor: Colors.background, borderTopColor: Colors.border },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
      }}>
      {SCREENS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            headerTitle: name === 'index' ? 'KriptoBet' : title,
            tabBarIcon: ({ color, size }) => <Ionicons name={icon} size={size} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
