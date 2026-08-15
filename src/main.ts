import './load-env';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SnakeCaseInterceptor } from './common/interceptors/snake-case.interceptor';
import { SeedService } from './seed/seed.service';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && process.env.FIRESTORE === 'true') {
    throw new Error(
      'FIRESTORE=true is in-memory only and will erase data on restart. Disable it and point DATABASE_URL or SUPABASE_DATABASE_URL at a persistent Postgres database.',
    );
  }

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalInterceptors(new SnakeCaseInterceptor());

  const rawCorsOrigins = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN;
  const corsOrigin = rawCorsOrigins
    ? rawCorsOrigins.split(',').map((origin) => origin.trim()).filter(Boolean)
    : true;

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application running on: http://localhost:${port}/api (LAN: http://0.0.0.0:${port}/api)`);

  // In-memory SQLite (FIRESTORE=true) wipes on every restart — auto-seed so dev
  // logins keep working without manual `curl /api/seed` after every reload.
  if (process.env.FIRESTORE === 'true') {
    try {
      await app.get(SeedService).seed();
      Logger.log('Auto-seeded in-memory database', 'Bootstrap');
    } catch (err) {
      Logger.error('Auto-seed failed', err as Error, 'Bootstrap');
    }
  }
}
bootstrap();
