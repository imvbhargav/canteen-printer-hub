import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { theme } from './theme';

interface SectionLabelProps {
  text: string;
}

export const SectionLabel = ({ text }: SectionLabelProps) => (
  <View style={sectionLabelStyles.wrap}>
    <Text style={sectionLabelStyles.text}>{text}</Text>
    <View style={sectionLabelStyles.line} />
  </View>
);

const sectionLabelStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    marginTop: 6,
    paddingHorizontal: 14,
  },
  text: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.muted,
    fontWeight: '700',
  },
  line: { flex: 1, height: 1, backgroundColor: theme.border },
});
