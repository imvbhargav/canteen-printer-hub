import RNFS from 'react-native-fs';

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

const MAX_FILE_LINES = 100;

const getLogFilePath = (): string => {
  const date: string = new Date().toISOString().split('T')[0];
  return `${RNFS.DocumentDirectoryPath}/canteen_logs_${date}.txt`;
};

export const writeLog = async (
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
): Promise<void> => {
  const timestamp: string = new Date().toISOString();
  const logLine: string = `[${timestamp}] [${level}] ${message}\n`;
  const path: string = getLogFilePath();

  try {
    const exists: boolean = await RNFS.exists(path);
    if (exists) {
      await RNFS.appendFile(path, logLine, 'utf8');
      const content: string = await RNFS.readFile(path, 'utf8');
      const lines: string[] = content
        .split('\n')
        .filter((l: string) => l.trim().length > 0);

      if (lines.length > MAX_FILE_LINES) {
        const truncated: string =
          lines.slice(-MAX_FILE_LINES).join('\n') + '\n';
        await RNFS.writeFile(path, truncated, 'utf8');
      }
    } else {
      await RNFS.writeFile(path, logLine, 'utf8');
    }
  } catch (err: unknown) {
    console.error(err);
  }
};

export const readTodayLogs = async (): Promise<LogEntry[]> => {
  const path: string = getLogFilePath();
  try {
    const exists: boolean = await RNFS.exists(path);
    if (!exists) return [];

    const content: string = await RNFS.readFile(path, 'utf8');
    const lines: string[] = content
      .split('\n')
      .filter((l: string) => l.trim().length > 0);

    return lines
      .slice(-50)
      .map((line: string) => {
        const match: RegExpMatchArray | null = line.match(
          /^\[(.*?)\] \[(.*?)\] (.*)$/,
        );
        if (match) {
          return {
            timestamp: match[1],
            level: match[2] as 'INFO' | 'WARN' | 'ERROR',
            message: match[3],
          };
        }
        return { timestamp: '', level: 'INFO' as const, message: line };
      })
      .reverse();
  } catch (err: unknown) {
    return [
      {
        timestamp: new Date().toISOString(),
        level: 'ERROR' as const,
        message: `Failed to read logs: ${String(err)}`,
      },
    ];
  }
};
