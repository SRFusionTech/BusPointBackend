import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Runs once on startup.
 * If SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD are set in .env,
 * creates the super admin user if it doesn't exist.
 *
 * Safe to run on every restart — it's idempotent.
 */
@Injectable()
export class SeedSuperAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedSuperAdminService.name);

  constructor(private readonly config: ConfigService) {}

  async onApplicationBootstrap() {
    const email = this.config.get<string>('SUPER_ADMIN_EMAIL');
    const password = this.config.get<string>('SUPER_ADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.debug('SUPER_ADMIN_EMAIL/PASSWORD not set — skipping seed');
      return;
    }

    // TODO: once User entity is wired in, replace with:
    // const existing = await this.userRepo.findOne({ where: { email } });
    // if (existing) {
    //   this.logger.debug(`Super admin already exists: ${email}`);
    //   return;
    // }
    // const hash = await bcrypt.hash(password, 12);
    // await this.userRepo.save({ email, passwordHash: hash, role: 'super_admin', schoolId: null });
    // this.logger.log(`Super admin seeded: ${email}`);

    this.logger.log(`Super admin seed ready for: ${email} (pending User entity)`);
  }
}
