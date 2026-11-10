import { addDays } from '@plantodotdo/domain';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDate } from '@/lib/format';
import { radius, space, useTheme } from '@/lib/theme';

interface DateFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  /** Month shown first when there is no value yet, as any date in that month. */
  openAt?: string | null;
  disabled?: boolean;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const today = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`;

function shiftMonth(first: string, by: number): string {
  const date = new Date(`${first}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 10);
}

/** The weeks of a month, Monday first, padded with nulls outside the month. */
function weeksOf(first: string): (string | null)[][] {
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let day = first; day.slice(0, 7) === first.slice(0, 7); day = addDays(day, 1)) {
    cells.push(day);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** A date input that opens a month calendar. Works the same on every platform. */
export function DateField({ label, value, onChange, openAt, disabled }: DateFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => firstOfMonth(value ?? openAt ?? today()));

  const toggle = () => {
    if (!open) setMonth(firstOfMonth(value ?? openAt ?? today()));
    setOpen(!open);
  };

  const monthName = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}T00:00:00Z`));

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View style={styles.inputRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? formatDate(value) : 'no date'}`}
          accessibilityState={{ expanded: open, disabled }}
          disabled={disabled}
          onPress={toggle}
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.inputText, { color: value ? theme.text : theme.muted }]}>
            {value ? formatDate(value) : 'No date'}
          </Text>
        </Pressable>
        {value && !disabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}
            style={[styles.clear, { borderColor: theme.border }]}>
            <Text style={[styles.inputText, { color: theme.text }]}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View style={[styles.calendar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() => setMonth(shiftMonth(month, -1))}
              style={styles.cell}>
              <Text style={[styles.nav, { color: theme.text }]}>‹</Text>
            </Pressable>
            <Text style={[styles.monthName, { color: theme.text }]}>{monthName}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={() => setMonth(shiftMonth(month, 1))}
              style={styles.cell}>
              <Text style={[styles.nav, { color: theme.text }]}>›</Text>
            </Pressable>
          </View>
          <View style={styles.week}>
            {WEEKDAYS.map((day) => (
              <View key={day} style={styles.cell}>
                <Text style={[styles.weekday, { color: theme.muted }]}>{day}</Text>
              </View>
            ))}
          </View>
          {weeksOf(month).map((week, i) => (
            <View key={i} style={styles.week}>
              {week.map((day, j) =>
                day ? (
                  <Pressable
                    key={day}
                    accessibilityRole="button"
                    accessibilityLabel={formatDate(day)}
                    accessibilityState={{ selected: day === value }}
                    onPress={() => {
                      onChange(day);
                      setOpen(false);
                    }}
                    style={[styles.cell, day === value && { backgroundColor: theme.primary }]}>
                    <Text
                      style={[
                        styles.day,
                        { color: day === value ? theme.onPrimary : theme.text },
                      ]}>
                      {Number(day.slice(8))}
                    </Text>
                  </Pressable>
                ) : (
                  <View key={j} style={styles.cell} />
                ),
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { fontSize: 14, fontWeight: '600' },
  inputRow: { flexDirection: 'row', gap: space.sm },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  inputText: { fontSize: 16 },
  clear: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  calendar: { borderWidth: 1, borderRadius: radius, padding: space.sm, alignSelf: 'flex-start' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthName: { fontSize: 16, fontWeight: '600' },
  nav: { fontSize: 24 },
  week: { flexDirection: 'row' },
  cell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 13 },
  day: { fontSize: 16 },
});
