import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class SeedSuperAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedSuperAdminService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async onApplicationBootstrap() {
    const email = this.config.get<string>('SUPER_ADMIN_EMAIL');
    const password = this.config.get<string>('SUPER_ADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.debug('SUPER_ADMIN_EMAIL/PASSWORD not set — skipping seed');
      return;
    }

    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      this.logger.debug(`Super admin already exists: ${email}`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.userRepo.save({
      email,
      passwordHash,
      role: Role.SUPER_ADMIN,
      schoolId: null,
      isActive: true,
    });

    this.logger.log(`✓ Super admin seeded: ${email}`);
  }
}
