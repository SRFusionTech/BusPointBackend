import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Bus } from '../buses/entities/bus.entity';
import { BusDriver } from '../bus-drivers/entities/bus-driver.entity';
import { Role, RoleName } from '../roles/entities/role.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';

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
  ) {}

  private async getRole(name: RoleName): Promise<Role> {
    const role = await this.roleRepository.findOneBy({ name });
    if (!role) throw new NotFoundException(`Role "${name}" not found — run /api/seed first`);
    return role;
  }

  private async linkToSchool(userId: string, schoolId: string, roleName: RoleName) {
    const role = await this.getRole(roleName);
    const existing = await this.schoolUserRepository.findOneBy({
      userId,
      schoolId,
      roleId: role.id,
    });
    if (!existing) {
      await this.schoolUserRepository.save(
        this.schoolUserRepository.create({ userId, schoolId, roleId: role.id }),
      );
    }
  }

  async addDriver(
    phone: string,
    name: string,
    schoolId: string,
    busId?: string,
  ): Promise<User> {
    const existing = await this.userRepository.findOneBy({ phone });
    if (existing) {
      throw new ConflictException(`User with phone ${phone} already exists`);
    }

    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '-';

    const driver = await this.userRepository.save(
      this.userRepository.create({
        firstName,
        lastName,
        name,
        phone,
        email: `${phone}@buspoint.app`,
        busId: busId || undefined,
      }),
    );

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

    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '-';

    const parent = await this.userRepository.save(
      this.userRepository.create({
        firstName,
        lastName,
        name,
        phone,
        email: `${phone}@buspoint.app`,
        busId,
        childName,
      }),
    );

    await this.linkToSchool(parent.id, schoolId, RoleName.PARENT);

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
