import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native';

import { radius, space, useTheme } from '@/lib/theme';

/** Page container: scrolls, and keeps content to a readable width on wide screens. */
export function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled">
      <View style={styles.column}>{children}</View>
    </ScrollView>
  );
}

export function Card({ style, ...props }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}
      {...props}
    />
  );
}

type Tone = 'body' | 'muted' | 'danger';

export function Title(props: TextProps) {
  const theme = useTheme();
  return <Text accessibilityRole="header" {...props} style={[styles.title, { color: theme.text }, props.style]} />;
}

export function Heading(props: TextProps) {
  const theme = useTheme();
  return <Text accessibilityRole="header" {...props} style={[styles.heading, { color: theme.text }, props.style]} />;
}

export function Body({ tone = 'body', ...props }: TextProps & { tone?: Tone }) {
  const theme = useTheme();
  const color = tone === 'muted' ? theme.muted : tone === 'danger' ? theme.danger : theme.text;
  return <Text {...props} style={[styles.body, { color }, props.style]} />;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  /** Spoken name, when the visible label alone is ambiguous. */
  accessibilityLabel?: string;
}

export function Button(props: ButtonProps) {
  const { label, onPress, variant = 'primary', disabled, busy, compact, accessibilityLabel } = props;
  const theme = useTheme();
  const filled = variant === 'primary';
  const color = filled ? theme.onPrimary : variant === 'danger' ? theme.danger : theme.text;
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        filled
          ? { backgroundColor: theme.primary, borderColor: theme.primary }
          : { backgroundColor: 'transparent', borderColor: theme.border },
        (pressed || inactive) && { opacity: 0.6 },
      ]}>
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.muted}
        {...props}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
          props.style,
        ]}
      />
      {hint ? <Body tone="muted" style={styles.small}>{hint}</Body> : null}
    </View>
  );
}

export function Checkbox(props: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  const { checked, onChange, label } = props;
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.checkboxTarget}>
      <View
        style={[
          styles.checkbox,
          {
            borderColor: checked ? theme.primary : theme.muted,
            backgroundColor: checked ? theme.primary : 'transparent',
          },
        ]}>
        {checked ? <Text style={[styles.checkmark, { color: theme.onPrimary }]}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

export function Row({ style, ...props }: ViewProps) {
  return <View style={[styles.row, style]} {...props} />;
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={[styles.centered, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, alignItems: 'center', flexGrow: 1 },
  column: { width: '100%', maxWidth: 560, gap: space.lg },
  card: { borderWidth: 1, borderRadius: radius, padding: space.lg, gap: space.sm },
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  button: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { minHeight: 44, paddingHorizontal: space.md },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  field: { gap: space.xs },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  checkboxTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { fontSize: 16, fontWeight: '700', lineHeight: 18 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
