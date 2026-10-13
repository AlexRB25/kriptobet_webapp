import { Ionicons } from '@expo/vector-icons';
import { useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAccount } from '@/store/account';

export type IconName = keyof typeof Ionicons.glyphMap;

/** Scrolling page body. Pull down to re-read the balance, plus whatever `onRefresh` reloads. */
export function Screen({ children, onRefresh }: PropsWithChildren<{ onRefresh?: () => Promise<unknown> }>) {
  const { reload } = useAccount();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([reload(), onRefresh?.()]);
    setRefreshing(false);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Heading({ children }: PropsWithChildren) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Muted({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function ErrorText({ children }: PropsWithChildren) {
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

/** Good news (green) or something to keep in mind (gold). */
export function Notice({ children, tone = 'good' }: PropsWithChildren<{ tone?: 'good' | 'warn' }>) {
  if (!children) return null;
  return <Text style={[styles.error, tone === 'good' ? styles.noticeGood : styles.noticeWarn]}>{children}</Text>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'gold' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', icon, loading = false, disabled = false, style }: ButtonProps) {
  const inactive = disabled || loading;
  const color = variant === 'secondary' ? Colors.text : variant === 'danger' ? Colors.danger : Colors.background;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], (inactive || pressed) && styles.dimmed, style]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={color} />}
          <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  numeric?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Field({ label, numeric, hint, style, ...input }: FieldProps) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={Colors.textSecondary}
        keyboardType={numeric ? 'decimal-pad' : undefined}
        accessibilityLabel={label}
        {...input}
        style={styles.input}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

type Option<T extends string> = { value: T; label: string };

type ChipsProps<T extends string> = {
  label?: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Chips share the row equally instead of wrapping. */
  fill?: boolean;
};

export function Chips<T extends string>({ label, options, value, onChange, disabled, fill }: ChipsProps<T>) {
  return (
    <View style={styles.field}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.chips, fill && { flexWrap: 'nowrap' }]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={[styles.chip, fill && styles.chipFill, selected && styles.chipSelected, disabled && styles.dimmed]}>
              <Text style={[styles.chipText, selected && { color: Colors.accent }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type SelectProps = {
  label: string;
  options: Option<string>[];
  value: string;
  onChange: (value: string) => void;
};

/** Picker that opens a sheet with the options. */
export function Select({ label, options, value, onChange }: SelectProps) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={styles.select}>
        <Text style={styles.selectText} numberOfLines={1}>
          {current?.label ?? 'Elegir…'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.heading}>{label}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={12} onPress={() => setOpen(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </Row>
            <ScrollView>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: option.value === value }}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={styles.selectRow}>
                  <Text style={[styles.selectText, { flex: 1 }]}>{option.label}</Text>
                  {option.value === value && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

type ListItemProps = {
  title: string;
  subtitle?: string;
  /** Value shown at the right edge, with an optional line under it. */
  value?: string;
  valueHint?: string;
  tone?: 'good' | 'bad' | 'warn' | 'muted';
  left?: ReactNode;
  onPress?: () => void;
};

export function ListItem({ title, subtitle, value, valueHint, tone, left, onPress }: ListItemProps) {
  const toneColor =
    tone === 'good' ? Colors.accent : tone === 'bad' ? Colors.danger : tone === 'warn' ? Colors.gold : tone === 'muted' ? Colors.textSecondary : Colors.text;
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.listItem, pressed && styles.dimmed]}>
      {left}
      <View style={{ flex: 1, gap: Spacing.half }}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.hint} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <View style={{ alignItems: 'flex-end', gap: Spacing.half }}>
          <Text style={[styles.listValue, { color: toneColor }]}>{value}</Text>
          {valueHint ? <Text style={styles.hint}>{valueHint}</Text> : null}
        </View>
      ) : null}
      {onPress && <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />}
    </Pressable>
  );
}

/** Label on the left, amount on the right. */
export function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'good' }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={strong ? styles.listTitle : styles.muted}>{label}</Text>
      <Text style={[strong ? styles.listValue : styles.selectText, tone === 'good' && { color: Colors.accent }]}>{value}</Text>
    </Row>
  );
}

export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={36} color={Colors.textSecondary} />
      <Muted style={{ textAlign: 'center' }}>{text}</Muted>
    </View>
  );
}

export function Loading() {
  return (
    <View style={[styles.screen, styles.empty]}>
      <ActivityIndicator color={Colors.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  heading: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  hint: { color: Colors.textSecondary, fontSize: 12, lineHeight: 16 },
  error: {
    color: Colors.danger,
    backgroundColor: Colors.dangerSoft,
    borderRadius: Radius.small,
    padding: Spacing.three,
    fontSize: 14,
    overflow: 'hidden',
  },
  noticeGood: { color: Colors.accent, backgroundColor: Colors.accentSoft },
  noticeWarn: { color: Colors.gold, backgroundColor: Colors.goldSoft },
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  primary: { backgroundColor: Colors.accent },
  secondary: { backgroundColor: Colors.surfaceRaised },
  gold: { backgroundColor: Colors.gold },
  danger: { backgroundColor: Colors.dangerSoft },
  dimmed: { opacity: 0.5 },
  buttonLabel: { fontSize: 15, fontWeight: '700' },
  field: { gap: Spacing.one },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  input: {
    minHeight: 46,
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: Colors.text,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: Colors.surface,
  },
  chipFill: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.one },
  chipSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  chipText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  select: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
  },
  selectText: { color: Colors.text, fontSize: 15, flexShrink: 1, fontVariant: ['tabular-nums'] },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  sheet: {
    maxHeight: '80%',
    gap: Spacing.three,
    padding: Spacing.three,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
  listTitle: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  listValue: { color: Colors.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.five },
});
