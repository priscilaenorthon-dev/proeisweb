import fs from 'fs';

export type LogLevel = 'info' | 'success' | 'error' | 'warn';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

const LOG_PATH = '/tmp/proeis-logs.json';
const MAX_ENTRIES = 200;

export function log(level: LogLevel, message: string): void {
  console.log(`[${level.toUpperCase()}] ${message}`);

  let entries: LogEntry[] = [];
  try {
    if (fs.existsSync(LOG_PATH)) {
      entries = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')) as LogEntry[];
    }
  } catch {
    entries = [];
  }

  entries.push({ timestamp: new Date().toISOString(), level, message });
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);

  try {
    fs.writeFileSync(LOG_PATH, JSON.stringify(entries), 'utf-8');
  } catch {
    /* ignora se não conseguir escrever */
  }
}

export function clearLogs(): void {
  try {
    fs.writeFileSync(LOG_PATH, JSON.stringify([]), 'utf-8');
  } catch { /* ignora */ }
}

export function getLogs(): LogEntry[] {
  try {
    if (fs.existsSync(LOG_PATH)) {
      return JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')) as LogEntry[];
    }
  } catch { /* ignora */ }
  return [];
}
