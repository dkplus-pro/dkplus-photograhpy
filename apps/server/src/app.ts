import Koa from 'koa';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import type { ServerConfig } from './config.js';
import { loadConfig } from './config.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { PhotoStore } from './services/photo-store.js';
import { UploadService } from './services/upload-service.js';
import { createPhotosRouter } from './routes/photos.js';

function corsOrigin(config: ServerConfig) {
  return (ctx: Koa.Context): string => {
    if (config.corsOrigins.length === 0) {
      return '*';
    }
    const origin = ctx.get('origin');
    return origin && config.corsOrigins.includes(origin) ? origin : config.corsOrigins[0];
  };
}

export function createApp(config: ServerConfig = loadConfig()): Koa {
  const app = new Koa();
  const store = new PhotoStore(config.dataFile);
  const uploads = new UploadService(config);
  const router = createPhotosRouter(store, uploads);

  app.proxy = true;
  app.use(errorHandler);
  app.use(cors({ origin: corsOrigin(config), credentials: true }));
  app.use(bodyParser({ jsonLimit: '2mb' }));
  app.use(createAuthMiddleware(config));

  app.use(async (ctx, next) => {
    if (ctx.path === '/health' || ctx.path === '/api/health') {
      ctx.body = {
        ok: true,
        service: '@dkplus/server',
        uptime: process.uptime(),
        authConfigured: Boolean(config.adminToken),
        cosConfigured: config.cos.enabled
      };
      return;
    }
    await next();
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  app.on('error', (error) => {
    if (config.env !== 'test') {
      console.error(error);
    }
  });

  return app;
}
