import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { Ticket } from '../types';
import { EngineStatus, theme } from './theme';
import { SectionLabel } from './SectionLabel';
import { TicketCard } from './TicketCard';

interface QueueTabProps {
  isServerRunning: boolean;
  engineStatus: EngineStatus;
  tickets: Ticket[];
  executePrint: (ticket: Ticket) => void;
}

export const QueueTab = ({
  isServerRunning,
  engineStatus,
  tickets,
  executePrint,
}: QueueTabProps) => {
  const pendingCount: number = tickets.filter(
    (t: Ticket) => t.status === 'PENDING',
  ).length;
  const failedCount: number = tickets.filter(
    (t: Ticket) => t.status === 'CANCELLED',
  ).length;
  const completedCount: number = tickets.filter(
    (t: Ticket) => t.status === 'COMPLETED',
  ).length;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={queueStyles.scrollContent}
    >
      <View style={queueStyles.pusherStatusCard}>
        <View style={queueStyles.pusherStatusHeader}>
          <View style={queueStyles.pusherStatusDotLabel}>
            <View
              style={[
                queueStyles.statusIndicatorDot,
                {
                  backgroundColor:
                    isServerRunning && engineStatus.connected
                      ? theme.success
                      : isServerRunning
                      ? theme.warning
                      : theme.destructive,
                },
              ]}
            />
            <Text style={queueStyles.pusherStatusTitle}>
              Pusher WebSocket Pipeline
            </Text>
          </View>
          <Text style={queueStyles.pusherStatusMetaText}>
            {isServerRunning && engineStatus.connected
              ? 'CONNECTED'
              : isServerRunning
              ? 'INITIALIZING...'
              : 'DISCONNECTED'}
          </Text>
        </View>
        {isServerRunning && engineStatus.channels.length > 0 ? (
          <View style={queueStyles.pusherChannelsList}>
            <Text style={queueStyles.pusherChannelsLabel}>
              Listening Subscriptions ({engineStatus.channels.length}):
            </Text>
            <View style={queueStyles.pusherChannelsRow}>
              {engineStatus.channels.map((chan: string) => (
                <View key={chan} style={queueStyles.pusherChannelBadge}>
                  <Text style={queueStyles.pusherChannelBadgeText}>
                    {chan}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text style={queueStyles.pusherNoChannelsText}>
            {isServerRunning
              ? 'Synchronizing network data matrix configurations...'
              : 'Turn on the core system engine to attach runtime node subscriptions.'}
          </Text>
        )}
      </View>

      <View style={queueStyles.statsRow}>
        {[
          {
            label: 'TOTAL JOBS',
            value: tickets.length,
            color: theme.foreground,
            bg: theme.surface,
          },
          {
            label: 'PENDING',
            value: pendingCount,
            color: theme.warning,
            bg: theme.warningDim,
          },
          {
            label: 'FAILED',
            value: failedCount,
            color: theme.destructive,
            bg: theme.destructiveDim,
          },
          {
            label: 'COMPLETED',
            value: completedCount,
            color: theme.success,
            bg: theme.successDim,
          },
        ].map(
          (s: {
            label: string;
            value: number;
            color: string;
            bg: string;
          }) => (
            <View
              key={s.label}
              style={[queueStyles.statBox, { backgroundColor: s.bg }]}
            >
              <Text style={[queueStyles.statNum, { color: s.color }]}>
                {s.value}
              </Text>
              <Text style={queueStyles.statLabel}>{s.label}</Text>
            </View>
          ),
        )}
      </View>

      {tickets.length === 0 ? (
        <View style={queueStyles.emptyState}>
          <View style={queueStyles.emptyIconWrap}>
            <Text style={queueStyles.emptyIconText}>🗒</Text>
          </View>
          <Text style={queueStyles.emptyTitle}>Queue is Empty</Text>
          <Text style={queueStyles.emptySub}>
            Waiting for incoming system transaction payloads to route.
          </Text>
        </View>
      ) : (
        <>
          <SectionLabel text="Transactional Journal Queue" />
          {tickets.map((item: Ticket) => (
            <TicketCard
              key={item.orderId}
              item={item}
              onRetry={() => {
                executePrint(item);
              }}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
};

const queueStyles = StyleSheet.create({
  scrollContent: { paddingVertical: 16, paddingBottom: 20 },
  pusherStatusCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 14,
    marginBottom: 16,
  },
  pusherStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pusherStatusDotLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusIndicatorDot: { width: 6, height: 6, borderRadius: 3 },
  pusherStatusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.foreground,
  },
  pusherStatusMetaText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    fontWeight: '800',
    color: theme.secondary,
  },
  pusherChannelsList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.borderLight,
    paddingTop: 12,
    gap: 8,
  },
  pusherChannelsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.muted,
  },
  pusherChannelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pusherChannelBadge: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pusherChannelBadgeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    color: theme.foreground,
    fontWeight: '600',
  },
  pusherNoChannelsText: {
    fontSize: 11,
    color: theme.muted,
    lineHeight: 16,
    marginTop: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statNum: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.muted,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIconText: { fontSize: 24 },
  emptyTitle: {
    color: theme.foreground,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySub: {
    color: theme.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
