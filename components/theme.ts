
export type ScanPhase = 'idle' | 'bonded' | 'scanning' | 'done';
export type HardwareTab = 'REGISTERED' | 'DISCOVERED';

export interface EngineStatus {
  connected: boolean;
  channels: string[];
  updatedAt: string;
}

export const theme = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  foreground: '#0F172A',
  secondary: '#475569',
  muted: '#64748B',
  accent: '#FF6B35',
  accentDim: '#FFF3ED',
  destructive: '#EF4444',
  destructiveDim: '#FEF2F2',
  success: '#10B981',
  successDim: '#ECFDF5',
  warning: '#F59E0B',
  warningDim: '#FEF3C7',
  info: '#3B82F6',
  infoDim: '#EFF6FF',
};

export const scanPhaseConfig: Record<ScanPhase, { label: string; color: string }> = {
  idle: { label: 'IDLE', color: theme.muted },
  bonded: { label: 'READING PAIRED…', color: theme.info },
  scanning: { label: 'SCANNING HARDWARE…', color: theme.warning },
  done: { label: 'READY', color: theme.success },
};
