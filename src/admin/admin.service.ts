import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { Bus } from '../buses/entities/bus.entity';
import { BusDriver } from '../bus-drivers/entities/bus-driver.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
    @InjectRepository(BusDriver)
    private readonly busDriverRepository: Repository<BusDriver>,
  ) {}

  async addDriver(
    phone: string,
    name: string,
    schoolId: string,
    busId?: string,
  ): Promise<User> {
    const existing = await this.userRepository.findOneBy({ phone: phone });
    if (existing) {
      throw new ConflictException(`User with phone ${phone} already exists`);
    }

    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '-';

    const driver = this.userRepository.create({
      firstName,
      lastName,
      name,
      phone: phone,
      email: `${phone}@buspoint.app`,
      role: UserRole.DRIVER,
      schoolId,
      busId: busId || undefined,
    });

    return this.userRepository.save(driver);
  }

  async addParent(
    phone: string,
    name: string,
    schoolId: string,
    busId: string,
    childName: string,
  ): Promise<User> {
    const existing = await this.userRepository.findOneBy({ phone: phone });
    if (existing) {
      throw new ConflictException(`User with phone ${phone} already exists`);
    }

    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '-';

    const parent = this.userRepository.create({
      firstName,
      lastName,
      name,
      phone: phone,
      email: `${phone}@buspoint.app`,
      role: UserRole.PARENT,
      schoolId,
      busId,
      childName,
    });

    return this.userRepository.save(parent);
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
