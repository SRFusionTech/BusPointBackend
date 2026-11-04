import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  app.useGlobalFilters(new GlobalExceptionFilter());

  // Parse cookies — required for HttpOnly JWT
  app.use(cookieParser());

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
    credentials: true, // Required to send/receive cookies cross-origin
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`BusPoint API (SRFusion) running on http://localhost:${port}/api`);
  logger.log(`Health: http://localhost:${port}/api/health`);
}

bootstrap();
