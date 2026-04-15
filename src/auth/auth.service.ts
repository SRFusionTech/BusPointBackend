import * as bcrypt from 'bcrypt';
import * as https from 'https';
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from '../users/entities/user.entity';
import { School } from '../schools/entities/school.entity';
import { FirebaseService } from '../firebase/firebase.service';
import { FirebaseAuthDto } from './dto/firebase-auth.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardingSchoolDto } from './dto/onboarding.dto';

interface OtpRecord { otp: string; expiresAt: number; }

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** In-memory OTP store: phone → { otp, expiresAt } */
  private readonly otpStore = new Map<string, OtpRecord>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    private readonly firebaseService: FirebaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private issueToken(user: User): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        role: user.role,
        phone: user.phone,
      },
      {
        expiresIn: this.configService.get<string>('jwt.expiresIn') ?? '7d',
      },
    );
  }

  /** Never expose password hash in API responses. */
  private userWithoutSecrets(user: User): User {
    const { passwordHash: _h, ...rest } = user as User & {
      passwordHash?: string | null;
    };
    return rest as User;
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
      user: this.userWithoutSecrets(user),
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
        // Phone-auth tokens have phone_number but no email → new parent/driver.
        // Email/Google tokens → likely a new school admin.
        const isPhoneAuth = !!decodedToken.phone_number && !decodedToken.email;
        user = this.userRepository.create({
          firebaseUid: uid,
          email,
          firstName,
          lastName,
          name: displayName || `${firstName} ${lastName}`,
          role: isPhoneAuth ? UserRole.PARENT : UserRole.ADMIN,
          phone: firebasePhone ?? null,
          profilePicture: picture ?? undefined,
          fcmToken: dto.fcmToken,
        });
        user = await this.userRepository.save(user);
        this.logger.log(`New user created from Firebase (uid=${uid}, role=${user.role})`);
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

  /** Send a random HTTP GET/POST via Node https and return the body as a string. */
  private httpsPost(url: string, payload: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
      };
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /** Send OTP SMS via Fast2SMS (falls back to console log when no API key). */
  private async sendSmsFast2Sms(phone: string, otp: string): Promise<void> {
    const apiKey = this.configService.get<string>('FAST2SMS_API_KEY') || process.env.FAST2SMS_API_KEY;
    if (!apiKey) {
      this.logger.warn(`[OTP] No FAST2SMS_API_KEY set — OTP for ${phone}: ${otp}`);
      return;
    }
    const payload = JSON.stringify({
      route: 'otp',
      variables_values: otp,
      numbers: phone,
    });
    try {
      const body = await this.httpsPost(
        'https://www.fast2sms.com/dev/bulkV2',
        payload,
        { authorization: apiKey },
      );
      this.logger.log(`Fast2SMS response for ${phone}: ${body}`);

      // Fast2SMS may return HTTP 200 with a failure payload (e.g. status_code 996)
      // when account verification is incomplete.
      try {
        const parsed = JSON.parse(body) as { status_code?: number; message?: string };
        if (typeof parsed.status_code === 'number' && parsed.status_code !== 200) {
          throw new BadRequestException(
            parsed.message || 'Could not send OTP. Try again later.',
          );
        }
      } catch (parseOrValidationError) {
        if (parseOrValidationError instanceof BadRequestException) {
          throw parseOrValidationError;
        }
        // Ignore non-JSON bodies and treat as provider-accepted response.
      }
    } catch (err) {
      this.logger.error(`Fast2SMS send failed for ${phone}`, err);
      throw new BadRequestException('Could not send OTP. Try again later.');
    }
  }

  /**
   * POST /auth/send-otp?phone=
   * Generates a 6-digit OTP, stores it for 10 minutes, and sends via SMS.
   */
  async sendOtp(phone: string) {
    const normalizedPhone = phone.replace(/^\+91/, '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(normalizedPhone)) {
      throw new BadRequestException('Invalid phone number. Must be 10 digits.');
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    this.otpStore.set(normalizedPhone, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

    const hasSmsKey = !!(this.configService.get<string>('FAST2SMS_API_KEY') || process.env.FAST2SMS_API_KEY);
    let smsFailed = false;
    try {
      await this.sendSmsFast2Sms(normalizedPhone, otp);
    } catch (err) {
      smsFailed = true;
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      this.logger.warn(`[OTP] SMS delivery failed for ${normalizedPhone}; using dev_otp fallback in non-production.`);
    }

    const user = await this.userRepository.findOneBy({ phone: normalizedPhone });
    return {
      success: true,
      user_exists: !!user,
      // Expose OTP in non-production when SMS provider is unavailable or failed.
      ...(process.env.NODE_ENV !== 'production' && (!hasSmsKey || smsFailed) ? { dev_otp: otp } : {}),
    };
  }

  /**
   * POST /auth/verify-otp?phone=&otp=
   * Verifies the OTP, then looks up / creates the user and issues a JWT.
   */
  async verifyOtp(phone: string, otp: string) {
    const normalizedPhone = phone.replace(/^\+91/, '').replace(/\D/g, '');
    const record = this.otpStore.get(normalizedPhone);

    if (!record) {
      throw new UnauthorizedException('No OTP was sent to this number. Request a new one.');
    }
    if (Date.now() > record.expiresAt) {
      this.otpStore.delete(normalizedPhone);
      throw new UnauthorizedException('OTP has expired. Request a new one.');
    }
    if (record.otp !== otp) {
      throw new UnauthorizedException('Incorrect OTP.');
    }

    // OTP is valid — consume it
    this.otpStore.delete(normalizedPhone);

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
      const email = dto.email.toLowerCase();
      user = await this.userRepository
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('LOWER(user.email) = :email', { email })
        .getOne();
    } else if (dto.phone) {
      const normalizedPhone = dto.phone.replace(/\D/g, '');
      user = await this.userRepository.findOneBy({ phone: normalizedPhone });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.passwordHash) {
      const ok = await bcrypt.compare(dto.password, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedException('Invalid credentials');
      }
    } else if (dto.password !== user.phone) {
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
