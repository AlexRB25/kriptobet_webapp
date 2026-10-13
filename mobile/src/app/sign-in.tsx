import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Muted, Notice } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { authErrorMessage, supabase, supabaseConfigured } from '@/lib/supabase';

export default function SignInScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  async function submit() {
    setError('');
    setNotice('');
    if (!supabaseConfigured) return setError('Falta configurar Supabase: copia .env.example como .env.local y rellénalo.');
    if (isRegister && name.trim().length < 2) return setError('Escribe tu nombre.');
    if (!email.trim() || password.length < (isRegister ? 8 : 1)) {
      return setError(isRegister ? 'Escribe tu correo y una contraseña de al menos 8 caracteres.' : 'Escribe tu correo y contraseña.');
    }
    if (isRegister && !adult) return setError('Para crear una cuenta debes confirmar que eres mayor de edad.');

    setBusy(true);
    const { data, error } = isRegister
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);

    // On success with a session, the root layout swaps to the app screens by itself.
    if (error) setError(authErrorMessage(error));
    else if (!data.session && data.user?.identities?.length === 0) setError('Ya existe una cuenta con ese correo.');
    else if (!data.session) {
      setNotice('Te enviamos un correo. Confirma tu cuenta y luego entra aquí.');
      setMode('login');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <Text style={styles.logo}>
          KRIPTO<Text style={{ color: Colors.accent }}>BET</Text>
        </Text>
        <Muted style={{ textAlign: 'center' }}>Apuestas deportivas y casino con criptomonedas.</Muted>

        <View style={styles.form}>
          <Text style={styles.title}>{isRegister ? 'Crea tu cuenta' : 'Entrar'}</Text>
          {isRegister && (
            <TextInput
              style={styles.input}
              placeholder="Nombre"
              placeholderTextColor={Colors.textSecondary}
              value={name}
              onChangeText={setName}
              autoComplete="name"
              maxLength={40}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="Correo"
            placeholderTextColor={Colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor={Colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            maxLength={72}
            onSubmitEditing={submit}
          />
          {isRegister && (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: adult }} onPress={() => setAdult(!adult)} style={styles.check}>
              <Ionicons name={adult ? 'checkbox' : 'square-outline'} size={22} color={adult ? Colors.accent : Colors.textSecondary} />
              <Muted style={{ flex: 1 }}>Confirmo que soy mayor de 18 años y que apostar en línea es legal donde vivo.</Muted>
            </Pressable>
          )}
          <ErrorText>{error}</ErrorText>
          <Notice tone="warn">{notice}</Notice>
          <Button label={isRegister ? 'Crear cuenta' : 'Entrar'} onPress={submit} loading={busy} />
          <Button
            variant="secondary"
            label={isRegister ? 'Ya tengo cuenta' : 'Crear una cuenta'}
            onPress={() => {
              setMode(isRegister ? 'login' : 'register');
              setError('');
            }}
          />
        </View>
        <Muted style={{ textAlign: 'center', fontSize: 12 }}>18+ · Juega con moderación.</Muted>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  logo: { color: Colors.text, fontSize: 40, fontWeight: '900', textAlign: 'center', letterSpacing: -1 },
  form: {
    marginVertical: Spacing.four,
    gap: Spacing.three,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.large,
    padding: Spacing.three,
  },
  title: { color: Colors.text, fontSize: 22, fontWeight: '700' },
  input: {
    minHeight: 48,
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    color: Colors.text,
    fontSize: 16,
  },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
});
