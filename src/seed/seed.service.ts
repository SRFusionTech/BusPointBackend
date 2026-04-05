import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { School } from '../schools/entities/school.entity';
import { Bus } from '../buses/entities/bus.entity';
import { Role, RoleName } from '../roles/entities/role.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';

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
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(SchoolUser)
    private readonly schoolUserRepository: Repository<SchoolUser>,
  ) {}

  async seed() {
    // 1. Ensure all roles exist
    const roles = await this.seedRoles();

    // 2. Create school
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

    // Helper: upsert user
    const upsertUser = async (data: Partial<User>): Promise<User> => {
      const existing = await this.userRepository.findOneBy({ phone: data.phone ?? undefined });
      if (existing) return existing;
      return this.userRepository.save(this.userRepository.create(data));
    };

    // Helper: link user to school with role (idempotent)
    const link = async (userId: string, schoolId: string, roleName: RoleName, busId?: string) => {
      const role = roles[roleName];
      const exists = await this.schoolUserRepository.findOneBy({ userId, schoolId, roleId: role.id });
      if (!exists) {
        await this.schoolUserRepository.save(
          this.schoolUserRepository.create({ userId, schoolId, roleId: role.id, busId }),
        );
      }
    };

    // 3. Admin
    const admin = await upsertUser({
      phone: '9999999999',
      firstName: 'Admin',
      lastName: 'Demo',
      name: 'Admin Demo',
      email: '9999999999@buspoint.app',
    });
    await link(admin.id, school.id, RoleName.SCHOOL_ADMIN);

    // 4. Drivers
    const driver1 = await upsertUser({
      phone: '9111111111',
      firstName: 'Ramesh',
      lastName: 'Kumar',
      name: 'Ramesh Kumar',
      email: '9111111111@buspoint.app',
    });
    await link(driver1.id, school.id, RoleName.DRIVER);

    const driver2 = await upsertUser({
      phone: '9222222222',
      firstName: 'Suresh',
      lastName: 'Patel',
      name: 'Suresh Patel',
      email: '9222222222@buspoint.app',
    });
    await link(driver2.id, school.id, RoleName.DRIVER);

    // 5. Buses
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

    // 6. Parents — busId goes on school_users, not on the user record
    const parent1 = await upsertUser({
      phone: '9444444444',
      firstName: 'Priya',
      lastName: 'Sharma',
      name: 'Priya Sharma',
      email: '9444444444@buspoint.app',
      childName: 'Arjun Sharma',
    });
    await link(parent1.id, school.id, RoleName.PARENT, bus1.id);

    const parent2 = await upsertUser({
      phone: '9555555555',
      firstName: 'Anjali',
      lastName: 'Singh',
      name: 'Anjali Singh',
      email: '9555555555@buspoint.app',
      childName: 'Rohan Singh',
    });
    await link(parent2.id, school.id, RoleName.PARENT, bus1.id);

    const parent3 = await upsertUser({
      phone: '9666666666',
      firstName: 'Meena',
      lastName: 'Gupta',
      name: 'Meena Gupta',
      email: '9666666666@buspoint.app',
      childName: 'Kavya Gupta',
    });
    await link(parent3.id, school.id, RoleName.PARENT, bus2.id);

    this.logger.log('Seed completed successfully');

    return {
      school,
      roles: Object.keys(roles),
      admin: { phone: admin.phone },
      drivers: [
        { phone: driver1.phone, name: driver1.name, bus: bus1.plateNumber },
        { phone: driver2.phone, name: driver2.name, bus: bus2.plateNumber },
      ],
      buses: [
        { plateNumber: bus1.plateNumber, route: bus1.routeName },
        { plateNumber: bus2.plateNumber, route: bus2.routeName },
      ],
      parents: [parent1.phone, parent2.phone, parent3.phone],
      note: 'Default passwords — Driver: Driver@<phone>  Parent: Parent@<phone>',
    };
  }

  // Seeds the three base roles if they don't exist yet
  async seedRoles(): Promise<Record<RoleName, Role>> {
    const result = {} as Record<RoleName, Role>;
    for (const name of Object.values(RoleName)) {
      let role = await this.roleRepository.findOneBy({ name });
      if (!role) {
        role = await this.roleRepository.save(this.roleRepository.create({ name }));
        this.logger.log(`Role seeded: ${name}`);
      }
      result[name] = role;
    }
    return result;
  }
}
