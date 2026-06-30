import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ticket } from '../types';
import { Pill } from './Pill';
import { theme } from './theme';

interface TicketCardProps {
  item: Ticket;
  onRetry: () => void;
}

export const TicketCard = ({ item, onRetry }: TicketCardProps) => {
  const statusMeta: Record<string, { color: string; bg: string }> = {
    COMPLETED: { color: theme.success, bg: theme.successDim },
    CANCELLED: { color: theme.destructive, bg: theme.destructiveDim },
    PENDING: { color: theme.warning, bg: theme.warningDim },
  };
  const meta: { color: string; bg: string } = statusMeta[
    item.status ?? 'PENDING'
  ] || {
    color: theme.muted,
    bg: theme.surfaceAlt,
  };

  const orderTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  const isRetryAllowed = Date.now() - orderTime < 10 * 60 * 1000;

  return (
    <View style={ticketStyles.card}>
      <View style={ticketStyles.header}>
        <Pill
          label={item.status ?? 'PENDING'}
          color={meta.color}
          bg={meta.bg}
        />
        <Text style={ticketStyles.ref}>{item.ticketReference}</Text>
      </View>
      <View style={ticketStyles.body}>
        {item.items?.map((i: any, idx: number) => (
          <View key={idx} style={ticketStyles.itemRow}>
            <View style={ticketStyles.qtyNameRow}>
              <View style={ticketStyles.qtyBadge}>
                <Text style={ticketStyles.qty}>{i.quantity}x</Text>
              </View>
              <Text style={ticketStyles.itemName}>{i.name}</Text>
            </View>
            <Text style={ticketStyles.price}>₹{i.itemTotal}</Text>
          </View>
        ))}
      </View>
      {item.status !== 'COMPLETED' && isRetryAllowed && (
        <TouchableOpacity style={ticketStyles.retryBtn} onPress={onRetry}>
          <Text style={ticketStyles.retryText}>↺ RETRY SYSTEM PRINT</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const ticketStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderLight,
    backgroundColor: theme.surfaceAlt,
  },
  ref: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 12,
    color: theme.foreground,
    fontWeight: '700',
  },
  body: { padding: 16, gap: 10 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qtyNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  qty: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 11,
    color: theme.secondary,
    fontWeight: '700',
  },
  itemName: { color: theme.foreground, fontSize: 13, fontWeight: '500' },
  price: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 13,
    color: theme.foreground,
    fontWeight: '600',
  },
  retryBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.accent + '30',
    backgroundColor: theme.accentDim,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { fontSize: 11, color: theme.accent, fontWeight: '700' },
});
