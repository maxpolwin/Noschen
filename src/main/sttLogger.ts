import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const LOGS_DIR = path.join(app.getPath('userData'), 'logs');
const RETENTION_DAYS = 2;

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function getLogFileName(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  return `stt-${date}.log`;
}

function getLogFilePath(): string {
  return path.join(LOGS_DIR, getLogFileName());
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

// Write a log entry to today's log file
export function sttLog(level: 'INFO' | 'ERROR' | 'DEBUG', message: string, data?: any) {
  ensureLogsDir();

  let line = `[${formatTimestamp()}] [${level}] ${message}`;
  if (data !== undefined) {
    try {
      const serialized = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      // Truncate very large data (e.g. base64 audio) to keep logs readable
      if (serialized.length > 2000) {
        line += `\n  Data: ${serialized.substring(0, 2000)}... (truncated, ${serialized.length} chars total)`;
      } else {
        line += `\n  Data: ${serialized}`;
      }
    } catch {
      line += `\n  Data: [unserializable]`;
    }
  }
  line += '\n';

  // Also log to console
  if (level === 'ERROR') {
    console.error(`[STT] ${message}`);
  } else {
    console.log(`[STT] ${message}`);
  }

  try {
    fs.appendFileSync(getLogFilePath(), line);
  } catch (e) {
    console.error('[STT Logger] Failed to write log:', e);
  }
}

// Delete log files older than RETENTION_DAYS
export function cleanOldLogs() {
  ensureLogsDir();

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(LOGS_DIR);
    for (const file of files) {
      if (!file.startsWith('stt-') || !file.endsWith('.log')) continue;
      const filePath = path.join(LOGS_DIR, file);
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        console.log(`[STT Logger] Deleted old log: ${file}`);
      }
    }
  } catch (e) {
    console.error('[STT Logger] Failed to clean old logs:', e);
  }
}

// List all log files with metadata
export function listLogFiles(): { name: string; size: number; modified: string }[] {
  ensureLogsDir();

  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('stt-') && f.endsWith('.log'))
      .sort()
      .reverse();

    return files.map(name => {
      const stats = fs.statSync(path.join(LOGS_DIR, name));
      return {
        name,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    });
  } catch {
    return [];
  }
}

// Read a specific log file
export function readLogFile(fileName: string): string {
  // Prevent path traversal
  const safeName = path.basename(fileName);
  if (!safeName.startsWith('stt-') || !safeName.endsWith('.log')) {
    return 'Invalid log file name';
  }
  const filePath = path.join(LOGS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    return 'Log file not found';
  }
  return fs.readFileSync(filePath, 'utf-8');
}

// Get the logs directory path
export function getLogsDir(): string {
  ensureLogsDir();
  return LOGS_DIR;
}
