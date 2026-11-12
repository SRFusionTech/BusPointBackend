import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { hasWebBuild, webStaticDir, webStaticMiddleware } from './web-static/web-static.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3010')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  });

  // Web app (BusPointweb static export) on the same origin as the API.
  const webDir = webStaticDir();
  if (hasWebBuild(webDir)) {
    app.use(webStaticMiddleware(webDir));
    logger.log(`Serving web app from ${webDir}`);
  } else {
    logger.warn(`No web build in ${webDir} — run "npm run build:backend" in BusPointweb to serve the web app`);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`BusPoint API (SRFusion) running on http://localhost:${port}/api`);
  logger.log(`Health: http://localhost:${port}/api/health`);
}

bootstrap();
