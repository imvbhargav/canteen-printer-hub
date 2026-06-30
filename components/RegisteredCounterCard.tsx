import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { CounterConfig } from '../types';
import { Pill } from './Pill';
import { Divider } from './Divider';
import { theme } from './theme';

interface RegisteredCounterCardProps {
  counter: CounterConfig;
  onTest: () => void;
}

export const RegisteredCounterCard = ({
  counter,
  onTest,
}: RegisteredCounterCardProps) => {
  const isActive: boolean = counter.status === 'ACTIVE';
  return (
    <View style={regCardStyles.card}>
      <View style={regCardStyles.topRow}>
        <View style={regCardStyles.iconFrame}>
          <Text
            style={[
              regCardStyles.iconText,
              { color: isActive ? theme.accent : theme.muted },
            ]}
          >
            🖨
          </Text>
        </View>
        <View style={regCardStyles.nameCol}>
          <Text style={regCardStyles.name}>{counter.displayName}</Text>
          <Text style={regCardStyles.sub}>
            {counter.printerType} • {counter.printerAddress || 'UNASSIGNED'}
          </Text>
        </View>
        <Pill
          label={counter.status}
          color={isActive ? theme.success : theme.destructive}
          bg={isActive ? theme.successDim : theme.destructiveDim}
        />
      </View>
      <Divider />
      <View style={regCardStyles.footer}>
        <TouchableOpacity style={regCardStyles.testBtn} onPress={onTest}>
          <Text style={regCardStyles.testBtnText}>↻ TEST PRINT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const regCardStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  iconFrame: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: { fontSize: 16 },
  nameCol: { flex: 1, marginRight: 12 },
  name: {
    color: theme.foreground,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  sub: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    color: theme.muted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.surfaceAlt,
  },
  testBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: theme.surface,
  },
  testBtnText: { fontSize: 11, color: theme.secondary, fontWeight: '600' },
});
