import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { buildApiRouter } from './routes/index.js';
import { logger } from './utils/logger.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.corsOrigins === '*' ? true : config.corsOrigins,
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    morgan(config.isDev ? 'dev' : 'combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }),
  );

  app.use('/api', buildApiRouter());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
