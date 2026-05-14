import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  async seed() {
    this.logger.log('Seed is disabled — creating data manually via the app');
    return {
      seeded: false,
      note: 'Seed is intentionally disabled. Create schools, admins, drivers, buses, and parents manually via the app to test the real flows.',
    };
  }
}
