import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.isDev ? 'debug' : 'info',
  ...(config.isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
