import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  StyleSheet,
  Platform,
} from 'react-native';
import { theme } from './theme';

interface CollapsibleSectionProps {
  title: string;
  badge?: string | number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const CollapsibleSection = ({
  title,
  badge,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) => {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const rotation = useRef<Animated.Value>(
    new Animated.Value(defaultOpen ? 1 : 0),
  ).current;

  const toggle = (): void => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(rotation, {
      toValue: open ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setOpen((v: boolean) => !v);
  };

  const rotate: Animated.AnimatedInterpolation<string | number> =
    rotation.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '90deg'],
    });

  return (
    <View style={collapseStyles.container}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        style={collapseStyles.header}
      >
        <View style={collapseStyles.headerLeft}>
          <Animated.Text
            style={[collapseStyles.chevron, { transform: [{ rotate }] }]}
          >
            ▶
          </Animated.Text>
          <Text style={collapseStyles.title}>{title}</Text>
          {badge !== undefined && (
            <View style={collapseStyles.badge}>
              <Text style={collapseStyles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={collapseStyles.toggleHint}>{open ? 'HIDE' : 'SHOW'}</Text>
      </TouchableOpacity>
      {open && <View style={collapseStyles.body}>{children}</View>}
    </View>
  );
};

const collapseStyles = StyleSheet.create({
  container: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    marginBottom: 14,
    overflow: 'hidden',
    marginHorizontal: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.surfaceAlt,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chevron: { fontSize: 10, color: theme.muted },
  title: {
    fontSize: 12,
    letterSpacing: 0.3,
    color: theme.foreground,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: theme.surface,
    borderColor: theme.border,
  },
  badgeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    fontWeight: '700',
    color: theme.muted,
  },
  toggleHint: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 9,
    letterSpacing: 0.5,
    color: theme.muted,
  },
  body: { borderTopWidth: 1, borderTopColor: theme.borderLight },
});
