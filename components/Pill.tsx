import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface PillProps {
  label: string;
  color: string;
  bg: string;
}

export const Pill = ({ label, color, bg }: PillProps) => (
  <View
    style={[
      pillStyles.wrap,
      { backgroundColor: bg, borderColor: color + '20' },
    ]}
  >
    <View style={[pillStyles.dot, { backgroundColor: color }]} />
    <Text style={[pillStyles.text, { color }]}>{label}</Text>
  </View>
);

const pillStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
