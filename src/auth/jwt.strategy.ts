import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';

export interface JwtPayload {
  sub: string;   // user id
  phone: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SchoolUser)
    private readonly schoolUserRepository: Repository<SchoolUser>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: configService.get<string>('jwt.secret') as string,
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: payload.sub });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    // Attach all roles this user has across any school
    const memberships = await this.schoolUserRepository.find({
      where: { userId: user.id, isActive: true },
      relations: ['role'],
    });
    user.roles = memberships
      .map((m) => m.role?.name)
      .filter((r): r is NonNullable<typeof r> => r != null);

    return user;
  }
}
