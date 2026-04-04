import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bus, BusStatus } from './entities/bus.entity';
import { BusDriver } from '../bus-drivers/entities/bus-driver.entity';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';

@Injectable()
export class BusesService {
  constructor(
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
    @InjectRepository(BusDriver)
    private readonly busDriverRepository: Repository<BusDriver>,
  ) {}

  async create(createBusDto: CreateBusDto): Promise<Bus> {
    const existing = await this.busRepository.findOneBy({
      plateNumber: createBusDto.plateNumber,
    });
    if (existing) {
      throw new ConflictException(
        `Bus with plate number "${createBusDto.plateNumber}" already exists`,
      );
    }
    const bus = this.busRepository.create(createBusDto);
    return this.busRepository.save(bus);
  }

  findAll(schoolId?: string): Promise<Bus[]> {
    if (schoolId) {
      return this.busRepository.findBy({ schoolId });
    }
    return this.busRepository.find();
  }

  findBySchool(schoolId: string): Promise<Bus[]> {
    return this.busRepository.findBy({ schoolId });
  }

  async findOne(id: string): Promise<Bus> {
    const bus = await this.busRepository.findOneBy({ id });
    if (!bus) {
      throw new NotFoundException(`Bus with id ${id} not found`);
    }
    return bus;
  }

  async update(id: string, updateBusDto: UpdateBusDto): Promise<Bus> {
    const bus = await this.findOne(id);
    Object.assign(bus, updateBusDto);
    return this.busRepository.save(bus);
  }

  async updateLocation(id: string, lat: number, lng: number): Promise<Bus> {
    const bus = await this.findOne(id);
    bus.lastLat = lat;
    bus.lastLng = lng;
    bus.lastUpdated = new Date();
    return this.busRepository.save(bus);
  }

  async updateStatus(id: string, status: BusStatus): Promise<Bus> {
    const bus = await this.findOne(id);
    bus.status = status;
    return this.busRepository.save(bus);
  }

  // Returns bus + current active driver info (name, phone, profilePicture)
  async findWithDriver(id: string): Promise<{
    bus: Bus;
    driver: { id: string; name: string; phone: string | null; profilePicture: string | null } | null;
  }> {
    const bus = await this.findOne(id);
    const assignment = await this.busDriverRepository.findOne({
      where: { busId: id, isActive: true },
      relations: ['driver'],
    });
    const driver = assignment
      ? {
          id: assignment.driver.id,
          name: assignment.driver.name ?? `${assignment.driver.firstName} ${assignment.driver.lastName}`,
          phone: assignment.driver.phone,
          profilePicture: assignment.driver.profilePicture,
        }
      : null;
    return { bus, driver };
  }

  // Returns all buses for a school, each with their active driver info
  async findAllWithDriversBySchool(schoolId: string): Promise<
    { bus: Bus; driver: { id: string; name: string; phone: string | null } | null }[]
  > {
    const buses = await this.findBySchool(schoolId);
    return Promise.all(
      buses.map(async (bus) => {
        const assignment = await this.busDriverRepository.findOne({
          where: { busId: bus.id, isActive: true },
          relations: ['driver'],
        });
        const driver = assignment
          ? {
              id: assignment.driver.id,
              name: assignment.driver.name ?? `${assignment.driver.firstName} ${assignment.driver.lastName}`,
              phone: assignment.driver.phone,
            }
          : null;
        return { bus, driver };
      }),
    );
  }

  async assignIcon(id: string, iconId: string, iconUrl: string): Promise<Bus> {
    const bus = await this.findOne(id);
    bus.iconId = iconId;
    bus.iconUrl = iconUrl;
    return this.busRepository.save(bus);
  }

  async remove(id: string): Promise<void> {
    const bus = await this.findOne(id);
    await this.busRepository.remove(bus);
  }
}
