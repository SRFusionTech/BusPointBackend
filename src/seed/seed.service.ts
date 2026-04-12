import * as bcrypt from 'bcrypt';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { School } from '../schools/entities/school.entity';
import { Bus } from '../buses/entities/bus.entity';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
  ) {}

  async seed() {
    // 1. Create school
    let school = await this.schoolRepository.findOneBy({ name: 'BusPoint Demo School' });
    if (!school) {
      school = await this.schoolRepository.save(
        this.schoolRepository.create({
          name: 'BusPoint Demo School',
          location: 'Mumbai, Maharashtra',
          information: 'Demo school for testing BusPoint application',
          lat: 19.076,
          lng: 72.8777,
        }),
      );
      this.logger.log(`School created: ${school.id}`);
    }

    // Helper to upsert a user
    const upsertUser = async (data: Partial<User>): Promise<User> => {
      const existing = await this.userRepository.findOneBy({ phone: data.phone ?? undefined });
      if (existing) return existing;
      return this.userRepository.save(this.userRepository.create(data));
    };

    // 2. Admin
    const admin = await upsertUser({
      phone: '9999999999',
      firstName: 'Admin',
      lastName: 'Demo',
      name: 'Admin Demo',
      email: '9999999999@buspoint.app',
      role: UserRole.ADMIN,
      schoolId: school.id,
    });

    // 3. Drivers
    const driver1 = await upsertUser({
      phone: '9111111111',
      firstName: 'Ramesh',
      lastName: 'Kumar',
      name: 'Ramesh Kumar',
      email: '9111111111@buspoint.app',
      role: UserRole.DRIVER,
      schoolId: school.id,
    });

    const driver2 = await upsertUser({
      phone: '9222222222',
      firstName: 'Suresh',
      lastName: 'Patel',
      name: 'Suresh Patel',
      email: '9222222222@buspoint.app',
      role: UserRole.DRIVER,
      schoolId: school.id,
    });

    // 4. Buses
    const upsertBus = async (data: Partial<Bus>): Promise<Bus> => {
      const existing = await this.busRepository.findOneBy({ plateNumber: data.plateNumber });
      if (existing) return existing;
      return this.busRepository.save(this.busRepository.create(data));
    };

    const bus1 = await upsertBus({
      schoolId: school.id,
      plateNumber: 'MH01AB1234',
      routeName: 'Route A - North',
      driverId: driver1.id,
      capacity: 40,
      make: 'Tata',
      model: 'Starbus',
      year: 2022,
      color: 'Yellow',
    });

    const bus2 = await upsertBus({
      schoolId: school.id,
      plateNumber: 'MH01CD5678',
      routeName: 'Route B - South',
      driverId: driver2.id,
      capacity: 35,
      make: 'Ashok Leyland',
      model: 'Sunshine',
      year: 2021,
      color: 'Yellow',
    });

    // Link drivers to their buses
    if (!driver1.busId) {
      await this.userRepository.update(driver1.id, { busId: bus1.id });
    }
    if (!driver2.busId) {
      await this.userRepository.update(driver2.id, { busId: bus2.id });
    }

    // 5. Parents
    await upsertUser({
      phone: '9444444444',
      firstName: 'Priya',
      lastName: 'Sharma',
      name: 'Priya Sharma',
      email: '9444444444@buspoint.app',
      role: UserRole.PARENT,
      schoolId: school.id,
      busId: bus1.id,
      childName: 'Arjun Sharma',
    });

    await upsertUser({
      phone: '9555555555',
      firstName: 'Anjali',
      lastName: 'Singh',
      name: 'Anjali Singh',
      email: '9555555555@buspoint.app',
      role: UserRole.PARENT,
      schoolId: school.id,
      busId: bus1.id,
      childName: 'Rohan Singh',
    });

    await upsertUser({
      phone: '9666666666',
      firstName: 'Meena',
      lastName: 'Gupta',
      name: 'Meena Gupta',
      email: '9666666666@buspoint.app',
      role: UserRole.PARENT,
      schoolId: school.id,
      busId: bus2.id,
      childName: 'Kavya Gupta',
    });

    // Email/password test account (password is not the phone)
    const testEmail = 'testing@gmail.com';
    const testPasswordHash = await bcrypt.hash('Testing@12', 10);
    const existingTest = await this.userRepository.findOneBy({ email: testEmail });
    if (!existingTest) {
      await this.userRepository.save(
        this.userRepository.create({
          email: testEmail,
          firstName: 'Test',
          lastName: 'User',
          name: 'Test User',
          phone: null,
          role: UserRole.PARENT,
          schoolId: school.id,
          busId: bus1.id,
          childName: 'Demo Child',
          passwordHash: testPasswordHash,
        }),
      );
      this.logger.log(`Test user created: ${testEmail}`);
    } else {
      await this.userRepository.update(existingTest.id, {
        passwordHash: testPasswordHash,
      });
      this.logger.log(`Test user password refreshed: ${testEmail}`);
    }

    // Role-based test accounts: <role>@gmail.com / <role>@12
    const roleTestAccounts: Array<{
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: UserRole;
      busId?: string;
      childName?: string;
    }> = [
      {
        email: 'parent@gmail.com',
        password: 'parent@12',
        firstName: 'Parent',
        lastName: 'Test',
        role: UserRole.PARENT,
        busId: bus1.id,
        childName: 'Test Child',
      },
      {
        email: 'admin@gmail.com',
        password: 'admin@12',
        firstName: 'Admin',
        lastName: 'Test',
        role: UserRole.ADMIN,
      },
      {
        email: 'driver@gmail.com',
        password: 'driver@12',
        firstName: 'Driver',
        lastName: 'Test',
        role: UserRole.DRIVER,
        busId: bus1.id,
      },
    ];

    for (const acc of roleTestAccounts) {
      const hash = await bcrypt.hash(acc.password, 10);
      const existing = await this.userRepository.findOneBy({ email: acc.email });
      if (!existing) {
        await this.userRepository.save(
          this.userRepository.create({
            email: acc.email,
            firstName: acc.firstName,
            lastName: acc.lastName,
            name: `${acc.firstName} ${acc.lastName}`,
            phone: null,
            role: acc.role,
            schoolId: school.id,
            busId: acc.busId,
            childName: acc.childName,
            passwordHash: hash,
          }),
        );
        this.logger.log(`Role test account created: ${acc.email} (${acc.role})`);
      } else {
        await this.userRepository.update(existing.id, { passwordHash: hash });
        this.logger.log(`Role test account password refreshed: ${acc.email}`);
      }
    }

    this.logger.log('Seed completed successfully');

    return {
      school,
      admin: { phone: admin.phone, role: admin.role },
      drivers: [
        { phone: driver1.phone, name: driver1.name, bus: bus1.plateNumber },
        { phone: driver2.phone, name: driver2.name, bus: bus2.plateNumber },
      ],
      buses: [
        { plateNumber: bus1.plateNumber, route: bus1.routeName },
        { plateNumber: bus2.plateNumber, route: bus2.routeName },
      ],
      parents: ['9444444444', '9555555555', '9666666666'],
      test_email_login: {
        email: testEmail,
        password: 'Testing@12',
        role: 'parent',
      },
      role_test_accounts: [
        { email: 'parent@gmail.com', password: 'parent@12', role: 'parent' },
        { email: 'admin@gmail.com',  password: 'admin@12',  role: 'admin' },
        { email: 'driver@gmail.com', password: 'driver@12', role: 'driver' },
      ],
      note: 'Default password for phone-only users is their phone number; test accounts use email + password above',
    };
  }
}
