import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/entities/user.entity';
import { School } from '../schools/entities/school.entity';
import { Role, RoleName } from '../roles/entities/role.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';
import { FirebaseService } from '../firebase/firebase.service';
import { FirebaseAuthDto } from './dto/firebase-auth.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardingSchoolDto } from './dto/onboarding.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(SchoolUser)
    private readonly schoolUserRepository: Repository<SchoolUser>,
    private readonly firebaseService: FirebaseService,
    private readonly jwtService: JwtService,
  ) {}

  private issueToken(user: User): string {
    return this.jwtService.sign({ sub: user.id, phone: user.phone });
  }

  // Find a role by name — throws if missing (roles must be seeded)
  private async getRole(name: RoleName): Promise<Role> {
    const role = await this.roleRepository.findOneBy({ name });
    if (!role) throw new BadRequestException(`Role "${name}" not found — run /api/seed first`);
    return role;
  }

  private async buildAuthResponse(user: User, extra: Record<string, any> = {}) {
    // Load all school memberships with school + role data
    const memberships = await this.schoolUserRepository.find({
      where: { userId: user.id, isActive: true },
      relations: ['school', 'role'],
    });

    // Provide a convenience `school` field (first active membership's school)
    const school = memberships[0]?.school ?? null;

    // Needs onboarding if user has no school memberships at all
    const needs_onboarding = memberships.length === 0;

    return {
      access_token: this.issueToken(user),
      user,
      school,
      school_memberships: memberships,
      needs_onboarding,
      ...extra,
    };
  }

  async loginWithFirebase(dto: FirebaseAuthDto) {
    let decodedToken: any;

    try {
      decodedToken = await this.firebaseService.verifyToken(dto.firebaseToken);
    } catch (err) {
      this.logger.error('Firebase token verification failed', err);
      throw new UnauthorizedException('Invalid or expired Firebase token');
    }

    const uid: string = decodedToken.uid;
    const email: string = (
      decodedToken.email ?? `${uid}@firebase.buspoint.app`
    ).toLowerCase();
    const displayName: string =
      decodedToken.name ?? decodedToken.displayName ?? '';
    const picture: string | null = decodedToken.picture ?? null;

    const nameParts = displayName.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : uid;

    let user = await this.userRepository.findOneBy({ firebaseUid: uid });
    let is_new_user = false;

    if (!user) {
      const firebasePhone = decodedToken.phone_number
        ? decodedToken.phone_number.replace(/^\+91/, '').replace(/\D/g, '')
        : null;

      user = await this.userRepository.findOneBy({ email })
        ?? (firebasePhone
          ? await this.userRepository.findOneBy({ phone: firebasePhone })
          : null);

      if (user) {
        user.firebaseUid = uid;
        user = await this.userRepository.save(user);
        this.logger.log(`Linked firebase_uid to existing user (id=${user.id})`);
      } else {
        is_new_user = true;
        user = this.userRepository.create({
          firebaseUid: uid,
          email,
          firstName,
          lastName,
          name: displayName || `${firstName} ${lastName}`,
          phone: null,
          profilePicture: picture ?? undefined,
          fcmToken: dto.fcmToken,
        });
        user = await this.userRepository.save(user);
        this.logger.log(`New user created from Firebase (uid=${uid})`);
      }
    } else {
      let changed = false;
      if (dto.fcmToken && dto.fcmToken !== user.fcmToken) {
        user.fcmToken = dto.fcmToken;
        changed = true;
      }
      if (picture && picture !== user.profilePicture) {
        user.profilePicture = picture;
        changed = true;
      }
      if (changed) {
        user = await this.userRepository.save(user);
      }
    }

    return this.buildAuthResponse(user, { is_new_user });
  }

  async sendOtp(phone: string) {
    const normalizedPhone = phone.replace(/^\+91/, '').replace(/\D/g, '');
    const user = await this.userRepository.findOneBy({ phone: normalizedPhone });
    return { success: true, user_exists: !!user };
  }

  async verifyOtp(phone: string) {
    const normalizedPhone = phone.replace(/^\+91/, '').replace(/\D/g, '');
    let user = await this.userRepository.findOneBy({ phone: normalizedPhone });
    let is_new_user = false;

    if (!user) {
      is_new_user = true;
      user = this.userRepository.create({
        phone: normalizedPhone,
        firstName: 'User',
        lastName: normalizedPhone,
        name: `User ${normalizedPhone}`,
        email: `${normalizedPhone}@buspoint.app`,
      });
      user = await this.userRepository.save(user);
    }

    return this.buildAuthResponse(user, { is_new_user });
  }

  async loginWithPassword(dto: LoginDto) {
    let user: User | null = null;

    if (dto.email) {
      user = await this.userRepository.findOneBy({ email: dto.email.toLowerCase() });
    } else if (dto.phone) {
      const normalizedPhone = dto.phone.replace(/\D/g, '');
      user = await this.userRepository.findOneBy({ phone: normalizedPhone });
    }

    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Default passwords: Driver@<phone> or Parent@<phone>
    const validPasswords = [`Driver@${user.phone}`, `Parent@${user.phone}`];
    if (!validPasswords.includes(dto.password)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  /**
   * POST /auth/onboarding/school
   * Called by a user who has no school yet (needs_onboarding = true).
   * Creates the school and links the calling user as SCHOOL_ADMIN.
   */
  async completeOnboarding(userId: string, dto: OnboardingSchoolDto) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new UnauthorizedException('User not found');

    // Already linked to a school as admin → can't onboard twice
    const adminRole = await this.getRole(RoleName.SCHOOL_ADMIN);
    const existingMembership = await this.schoolUserRepository.findOneBy({
      userId,
      roleId: adminRole.id,
      isActive: true,
    });
    if (existingMembership) {
      throw new BadRequestException('This user is already linked to a school as admin');
    }

    const school = await this.schoolRepository.save(
      this.schoolRepository.create(dto),
    );

    const schoolUser = await this.schoolUserRepository.save(
      this.schoolUserRepository.create({
        userId,
        schoolId: school.id,
        roleId: adminRole.id,
      }),
    );

    this.logger.log(`School onboarding completed: ${school.name} by user ${userId}`);

    return { school, user, school_user: schoolUser };
  }

  /**
   * PATCH /auth/link-school
   * Link an existing user to an existing school with a given role.
   * Useful for admins who were created before onboarding (e.g. pre-created by super-admin).
   */
  async linkToSchool(userId: string, schoolId: string, roleName: RoleName) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new UnauthorizedException('User not found');

    const school = await this.schoolRepository.findOneBy({ id: schoolId });
    if (!school) throw new BadRequestException('School not found');

    const role = await this.getRole(roleName);

    const existing = await this.schoolUserRepository.findOneBy({
      userId,
      schoolId,
      roleId: role.id,
    });
    if (existing) {
      throw new BadRequestException('User already has this role in this school');
    }

    const schoolUser = await this.schoolUserRepository.save(
      this.schoolUserRepository.create({ userId, schoolId, roleId: role.id }),
    );

    return { school, user, school_user: schoolUser };
  }
}
