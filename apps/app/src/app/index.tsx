import { CARD_KINDS } from '@plantodotdo/domain';
import { StyleSheet, Text, View } from 'react-native';

// Placeholder screen. It reads from the shared domain package so a broken
// workspace link shows up here first.
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Plantodotdo</Text>
      <Text style={styles.body}>Card kinds: {CARD_KINDS.join(', ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  title: { fontSize: 28, fontWeight: '600' },
  body: { fontSize: 16 },
});
