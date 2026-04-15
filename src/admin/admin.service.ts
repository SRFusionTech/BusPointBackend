import {
  Injectable,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
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

  async getSchoolRoutes(requester: User, schoolId?: string) {
    if (requester.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only school admins can access school routes');
    }

    const effectiveSchoolId = requester.schoolId;
    if (!effectiveSchoolId) {
      throw new ForbiddenException('School admin is not linked to a school');
    }
    if (schoolId && schoolId !== effectiveSchoolId) {
      throw new ForbiddenException('Cannot access another school');
    }

    const buses = await this.busRepository.findBy({ schoolId: effectiveSchoolId });
    if (buses.length === 0) return [];

    const assignments = await this.busDriverRepository.find({
      where: { isActive: true },
      relations: ['driver'],
    });

    const activeByBus = new Map<string, BusDriver>();
    for (const a of assignments) {
      if (buses.some((b) => b.id === a.busId)) activeByBus.set(a.busId, a);
    }

    return buses.map((bus) => {
      const assignment = activeByBus.get(bus.id);
      const driver = assignment?.driver ?? null;

      return {
        bus: {
          id: bus.id,
          plateNumber: bus.plateNumber,
          routeName: bus.routeName,
          lastLat: bus.lastLat,
          lastLng: bus.lastLng,
          lastUpdated: bus.lastUpdated,
          status: bus.status,
          iconUrl: bus.iconUrl,
        },
        driver: driver
          ? {
              id: driver.id,
              name: driver.name,
              phone: driver.phone,
              profilePicture: driver.profilePicture,
            }
          : null,
      };
    });
  }

  async addDriver(
    phone: string,
    name: string,
    schoolId: string,
    busId?: string,
  ): Promise<User> {
    if (busId) {
      const bus = await this.busRepository.findOneBy({ id: busId });
      if (!bus || bus.schoolId !== schoolId) {
        throw new ForbiddenException('Bus does not belong to this school');
      }
    }

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
    const bus = await this.busRepository.findOneBy({ id: busId });
    if (!bus || bus.schoolId !== schoolId) {
      throw new ForbiddenException('Bus does not belong to this school');
    }

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
}
