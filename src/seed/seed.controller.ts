import { Controller, Post } from '@nestjs/common';
import { SeedService } from './seed.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  // POST /api/seed — idempotent, safe to call multiple times
  @Public()
  @Post()
  seed() {
    return this.seedService.seed();
  }
}
