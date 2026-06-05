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
  // Trust the first hop in `X-Forwarded-For` — required behind Railway /
  // Fly / Render proxies so `req.ip` and the rate-limiter see real
  // client IPs instead of the proxy's. Without this, express-rate-limit
  // logs a startup ValidationError and bypasses its keyGenerator.
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.corsOrigins === '*' ? true : config.corsOrigins,
      credentials: false,
    }),
  );
  // 25mb headroom for the PDF-import route (base64-encoded resumes are
  // typically 1-5mb after base64 expansion). All other routes are tiny JSON.
  app.use(express.json({ limit: '25mb' }));
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
