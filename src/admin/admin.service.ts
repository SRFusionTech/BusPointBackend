import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Bus } from '../buses/entities/bus.entity';
import { BusDriver } from '../bus-drivers/entities/bus-driver.entity';
import { Role, RoleName } from '../roles/entities/role.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
    @InjectRepository(BusDriver)
    private readonly busDriverRepository: Repository<BusDriver>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(SchoolUser)
    private readonly schoolUserRepository: Repository<SchoolUser>,
    private readonly firebaseService: FirebaseService,
  ) {}

  private async getRole(name: RoleName): Promise<Role> {
    const role = await this.roleRepository.findOneBy({ name });
    if (!role) throw new NotFoundException(`Role "${name}" not found — run /api/seed first`);
    return role;
  }

  private async linkToSchool(
    userId: string,
    schoolId: string,
    roleName: RoleName,
    busId?: string,
  ) {
    const role = await this.getRole(roleName);
    const existing = await this.schoolUserRepository.findOneBy({
      userId,
      schoolId,
      roleId: role.id,
    });
    if (!existing) {
      await this.schoolUserRepository.save(
        this.schoolUserRepository.create({ userId, schoolId, roleId: role.id, busId }),
      );
    } else if (busId && existing.busId !== busId) {
      existing.busId = busId;
      await this.schoolUserRepository.save(existing);
    }
  }

  async addDriver(
    phone: string,
    name: string,
    schoolId: string,
  ): Promise<User> {
    const existing = await this.userRepository.findOneBy({ phone });
    if (existing) {
      throw new ConflictException(`User with phone ${phone} already exists`);
    }

    const email = `${phone}@buspoint.app`;
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '-';

    // Create Firebase user first so the driver can sign in via OTP immediately
    // Default password: Driver@<phone>  e.g. Driver@9876543210
    const firebaseUid = await this.firebaseService.createUser(phone, name, 'Driver', email);

    let driver: User;
    try {
      driver = await this.userRepository.save(
        this.userRepository.create({ firstName, lastName, name, phone, email, firebaseUid }),
      );
    } catch (dbErr) {
      if (firebaseUid) await this.firebaseService.deleteUser(firebaseUid);
      throw dbErr;
    }

    await this.linkToSchool(driver.id, schoolId, RoleName.DRIVER);

    return driver;
  }

  async addParent(
    phone: string,
    name: string,
    schoolId: string,
    busId: string,
    childName: string,
  ): Promise<User> {
    const existing = await this.userRepository.findOneBy({ phone });
    if (existing) {
      throw new ConflictException(`User with phone ${phone} already exists`);
    }

    const email = `${phone}@buspoint.app`;
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '-';

    // Create Firebase user first so the parent can sign in via OTP immediately
    // Default password: Parent@<phone>  e.g. Parent@9876543210
    const firebaseUid = await this.firebaseService.createUser(phone, name, 'Parent', email);

    let parent: User;
    try {
      parent = await this.userRepository.save(
        this.userRepository.create({ firstName, lastName, name, phone, email, childName, firebaseUid }),
      );
    } catch (dbErr) {
      if (firebaseUid) await this.firebaseService.deleteUser(firebaseUid);
      throw dbErr;
    }

    // busId (which bus the child is on) is stored on the school_users entry
    await this.linkToSchool(parent.id, schoolId, RoleName.PARENT, busId);

    return parent;
  }

  // Returns all buses for a school with live location + active driver info
  async getSchoolBusRoutes(schoolId: string): Promise<
    {
      bus: Bus;
      driver: { id: string; name: string; phone: string | null; profilePicture: string | null } | null;
    }[]
  > {
    const buses = await this.busRepository.findBy({ schoolId });
    return Promise.all(
      buses.map(async (bus) => {
        const assignment = await this.busDriverRepository.findOne({
          where: { busId: bus.id, isActive: true },
          relations: ['driver'],
        });
        const driver = assignment
          ? {
              id: assignment.driver.id,
              name:
                assignment.driver.name ??
                `${assignment.driver.firstName} ${assignment.driver.lastName}`,
              phone: assignment.driver.phone,
              profilePicture: assignment.driver.profilePicture,
            }
          : null;
        return { bus, driver };
      }),
    );
  }
}
