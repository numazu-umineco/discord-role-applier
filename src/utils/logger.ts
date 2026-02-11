import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  const currentLevel = LOG_LEVELS[env.logLevel as LogLevel] ?? LOG_LEVELS.info;
  return LOG_LEVELS[level] >= currentLevel;
}

function formatMessage(level: LogLevel, message: string, meta?: any): string {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase();
  let output = `${timestamp} [${levelStr}]: ${message}`;

  if (meta !== undefined) {
    if (meta instanceof Error) {
      output += `\n${meta.stack || meta.message}`;
    } else if (typeof meta === 'object') {
      output += `\n${JSON.stringify(meta, null, 2)}`;
    } else {
      output += ` ${meta}`;
    }
  }

  return output;
}

export const logger = {
  debug(message: string, meta?: any): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, meta));
    }
  },

  info(message: string, meta?: any): void {
    if (shouldLog('info')) {
      console.log(formatMessage('info', message, meta));
    }
  },

  warn(message: string, meta?: any): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  error(message: string, meta?: any): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, meta));
    }
  },
};
