import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '../users/entities/user.entity';
import { School } from '../schools/entities/school.entity';
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
    private readonly firebaseService: FirebaseService,
    private readonly jwtService: JwtService,
  ) {}

  private issueToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      role: user.role,
      phone: user.phone,
    });
  }

  private async buildAuthResponse(user: User, extra: Record<string, any> = {}) {
    // Attach school data so the app never needs a second round-trip
    let school: School | null = null;
    if (user.schoolId) {
      school = await this.schoolRepository.findOneBy({ id: user.schoolId });
    }

    // School admin with no school assigned → must complete onboarding
    const needs_onboarding =
      user.role === UserRole.ADMIN && !user.schoolId;

    return {
      access_token: this.issueToken(user),
      user,
      school,
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

    // Split "First Last" → firstName / lastName
    const nameParts = displayName.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : uid;

    let user = await this.userRepository.findOneBy({ firebaseUid: uid });
    let is_new_user = false;

    if (!user) {
      // Check if an existing user matches by email or phone (e.g. admin-created accounts)
      const firebasePhone = decodedToken.phone_number
        ? decodedToken.phone_number.replace(/^\+91/, '').replace(/\D/g, '')
        : null;

      user = await this.userRepository.findOneBy({ email })
        ?? (firebasePhone
          ? await this.userRepository.findOneBy({ phone: firebasePhone })
          : null);

      if (user) {
        // Link the Firebase UID to the existing account
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
          role: UserRole.ADMIN,
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

  /**
   * POST /auth/send-otp?phone=
   * Firebase handles the actual OTP delivery; this is a passthrough stub.
   */
  async sendOtp(phone: string) {
    const normalizedPhone = phone.replace(/^\+91/, '').replace(/\D/g, '');
    const user = await this.userRepository.findOneBy({ phone: normalizedPhone });
    return {
      success: true,
      user_exists: !!user,
    };
  }

  /**
   * POST /auth/verify-otp?phone=&otp=
   * Firebase already verified the OTP client-side; here we just look up/create
   * the user and issue a JWT — same flow as loginWithFirebase but phone-only.
   */
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
        role: UserRole.PARENT,
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

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Default password is the user's phone number
    if (dto.password !== user.phone) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  /**
   * Called by a school admin who has no school yet.
   * Creates the school and links the admin to it in one transaction.
   */
  async completeOnboarding(adminId: string, dto: OnboardingSchoolDto) {
    const admin = await this.userRepository.findOneBy({ id: adminId });

    if (!admin) {
      throw new UnauthorizedException('User not found');
    }
    if (admin.role !== UserRole.ADMIN) {
      throw new BadRequestException('Only school admins can complete school onboarding');
    }
    if (admin.schoolId) {
      throw new BadRequestException('This admin is already linked to a school');
    }

    // Create the school
    const school = await this.schoolRepository.save(
      this.schoolRepository.create(dto),
    );

    // Link admin to the new school
    admin.schoolId = school.id;
    await this.userRepository.save(admin);

    this.logger.log(`School onboarding completed: ${school.name} by admin ${admin.id}`);

    return { school, user: admin };
  }
}
