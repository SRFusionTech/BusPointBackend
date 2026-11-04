import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult & { app: object }> {
    const result = await this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
    ]);

    return {
      ...result,
      app: {
        name: 'BusPoint API',
        version: process.env.npm_package_version ?? '2.0.0',
        environment: process.env.NODE_ENV ?? 'development',
        uptime: `${Math.floor(process.uptime())}s`,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
