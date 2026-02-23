/**
 * Structured logger for Foreman Bridge.
 * Outputs JSON-lines to stdout/stderr for easy parsing + journalctl filtering.
 * Falls back to pretty-print when LOG_FORMAT=pretty or TTY detected.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',   // gray
  info:  '\x1b[36m',   // cyan
  warn:  '\x1b[33m',   // yellow
  error: '\x1b[31m',   // red
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug';
const PRETTY = process.env.LOG_FORMAT === 'pretty' || (process.stdout.isTTY && process.env.LOG_FORMAT !== 'json');

interface LogContext {
  [key: string]: any;
}

function formatPretty(level: LogLevel, scope: string, msg: string, ctx?: LogContext): string {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const color = LEVEL_COLORS[level];
  const lvl = level.toUpperCase().padEnd(5);
  const scopeStr = scope ? `${BOLD}[${scope}]${RESET} ` : '';
  let line = `${color}${ts} ${lvl}${RESET} ${scopeStr}${msg}`;
  if (ctx && Object.keys(ctx).length > 0) {
    const parts = Object.entries(ctx).map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}=${val}`;
    });
    line += ` ${color}(${parts.join(', ')})${RESET}`;
  }
  return line;
}

function formatJson(level: LogLevel, scope: string, msg: string, ctx?: LogContext): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...ctx,
  });
}

function log(level: LogLevel, scope: string, msg: string, ctx?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const line = PRETTY ? formatPretty(level, scope, msg, ctx) : formatJson(level, scope, msg, ctx);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export interface Logger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  child(childScope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, ctx) => log('debug', scope, msg, ctx),
    info:  (msg, ctx) => log('info',  scope, msg, ctx),
    warn:  (msg, ctx) => log('warn',  scope, msg, ctx),
    error: (msg, ctx) => log('error', scope, msg, ctx),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}

// Root logger
export const logger = createLogger('bridge');
