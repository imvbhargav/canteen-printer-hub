import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from './theme';

export const Divider = () => <View style={dividerStyles.container} />;

const dividerStyles = StyleSheet.create({
  container: {
    height: 1,
    backgroundColor: theme.borderLight,
    marginVertical: 4,
  },
});
