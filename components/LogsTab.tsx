import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LogEntry } from '../utils/logger';
import { theme } from './theme';

interface LogsTabProps {
  logs: LogEntry[];
  refreshLogs: () => void;
}

export const LogsTab = ({ logs, refreshLogs }: LogsTabProps) => {
  const levelColor = (level: string): string =>
    level === 'ERROR'
      ? theme.destructive
      : level === 'WARN'
      ? theme.warning
      : theme.success;

  return (
    <View style={logsStyles.logsWrap}>
      <View style={logsStyles.logsTopBar}>
        <View style={logsStyles.logsLegend}>
          {[
            { type: 'INFO', color: theme.success },
            { type: 'WARN', color: theme.warning },
            { type: 'ERROR', color: theme.destructive },
          ].map((level: { type: string; color: string }) => (
            <View key={level.type} style={logsStyles.legendItem}>
              <View
                style={[
                  logsStyles.legendDot,
                  { backgroundColor: level.color },
                ]}
              />
              <Text
                style={[logsStyles.legendText, { color: level.color }]}
              >
                {level.type}
              </Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={logsStyles.refreshBtn}
          onPress={refreshLogs}
        >
          <Text style={logsStyles.refreshBtnText}>↻ SYNC CONSOLE</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {logs.length === 0 ? (
          <View style={logsStyles.emptyState}>
            <View style={logsStyles.emptyIconWrap}>
              <Text style={logsStyles.emptyIconText}>⌨</Text>
            </View>
            <Text style={logsStyles.emptyTitle}>Console Stdout Empty</Text>
            <Text style={logsStyles.emptySub}>
              No log entries recorded in this session environment block.
            </Text>
          </View>
        ) : (
          logs.map((log: LogEntry, i: number) => (
            <View
              key={i}
              style={[
                logsStyles.logEntry,
                log.level === 'ERROR' && logsStyles.logEntryError,
                log.level === 'WARN' && logsStyles.logEntryWarn,
              ]}
            >
              <View style={logsStyles.logMeta}>
                <View
                  style={[
                    logsStyles.levelBadge,
                    {
                      borderColor: levelColor(log.level) + '30',
                      backgroundColor: levelColor(log.level) + '10',
                    },
                  ]}
                >
                  <Text
                    style={[
                      logsStyles.levelBadgeText,
                      { color: levelColor(log.level) },
                    ]}
                  >
                    {log.level}
                  </Text>
                </View>
                <View style={logsStyles.timeWrap}>
                  <Text style={logsStyles.logTs}>
                    🕒 {new Date(log.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
              </View>
              <Text style={logsStyles.logMsg}>{log.message}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const logsStyles = StyleSheet.create({
  logsWrap: { flex: 1, paddingHorizontal: 14, paddingTop: 14 },
  logsTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  logsLegend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, fontWeight: '700' },
  refreshBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: theme.surface,
  },
  refreshBtnText: { fontSize: 10, color: theme.secondary, fontWeight: '700' },
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
  logEntry: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderLight,
    borderRadius: 8,
    marginBottom: 8,
  },
  logEntryError: {
    backgroundColor: theme.destructiveDim,
    borderColor: theme.destructive + '15',
  },
  logEntryWarn: {
    backgroundColor: theme.warningDim,
    borderColor: theme.warning + '15',
  },
  logMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  levelBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  levelBadgeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 9,
    fontWeight: '700',
  },
  timeWrap: { flexDirection: 'row', alignItems: 'center' },
  logTs: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    color: theme.muted,
  },
  logMsg: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: theme.foreground,
    lineHeight: 16,
  },
});
