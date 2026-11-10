import { Pressable, StyleSheet, Text, View } from 'react-native';

import { space, useTheme } from '@/lib/theme';

interface ChoiceProps<T extends string> {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | null;
  onChange: (value: T) => void;
  /** When set, pressing the selected option clears it. */
  onClear?: () => void;
  disabled?: boolean;
}

/** Pick one of a few options, shown as a row of chips. */
export function Choice<T extends string>(props: ChoiceProps<T>) {
  const { label, options, labels, value, onChange, onClear, disabled } = props;
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.options}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={labels[option]}
              disabled={disabled}
              onPress={() => (selected && onClear ? onClear() : onChange(option))}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.primary : theme.surface,
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}>
              <Text style={[styles.chipLabel, { color: selected ? theme.onPrimary : theme.text }]}>
                {labels[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { fontSize: 14, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 15, fontWeight: '500' },
});
