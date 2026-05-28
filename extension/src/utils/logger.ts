/**
 * Tiny, context-aware logger. Production builds drop debug/info to keep the
 * service-worker console quiet; warn/error always pass through.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

declare const __DEV__: boolean | undefined;

const isDev =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  // Fallback for environments where Vite's define isn't applied (e.g. tests)
  (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production');

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold: number = isDev ? order.debug : order.warn;

function emit(level: Level, scope: string, args: unknown[]): void {
  if (order[level] < threshold) return;
  const prefix = `[resume-maker:${scope}]`;
  // eslint-disable-next-line no-console
  console[level](prefix, ...args);
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (scope: string) => Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (...a) => emit('debug', scope, a),
    info: (...a) => emit('info', scope, a),
    warn: (...a) => emit('warn', scope, a),
    error: (...a) => emit('error', scope, a),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}
