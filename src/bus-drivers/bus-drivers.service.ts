import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusDriver } from './bus-driver.entity';
import { Bus } from '../buses/bus.entity';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { successResponse } from '../common/response/api-response';
import { t } from '../i18n/translate';
import { I18nKey } from '../i18n/i18n.keys';

@Injectable()
export class BusDriversService {
  private readonly logger = new Logger(BusDriversService.name);

  constructor(
    @InjectRepository(BusDriver)
    private readonly busDriverRepo: Repository<BusDriver>,
    @InjectRepository(Bus)
    private readonly busRepo: Repository<Bus>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async assign(schoolId: string, busId: string, dto: AssignDriverDto) {
    const bus = await this.busRepo.findOne({ where: { id: busId, schoolId } });
    if (!bus) throw new NotFoundException(t(I18nKey.BUS.NOT_FOUND));

    const driver = await this.userRepo.findOne({
      where: { id: dto.driverId, schoolId, role: Role.DRIVER, isActive: true },
    });
    if (!driver) throw new NotFoundException(t(I18nKey.DRIVER.NOT_FOUND));

    const existingForDriver = await this.busDriverRepo.findOne({
      where: { driverId: dto.driverId, isActive: true },
    });
    if (existingForDriver && existingForDriver.busId !== busId) {
      const otherBus = await this.busRepo.findOne({ where: { id: existingForDriver.busId } });
      throw new ConflictException(
        t(I18nKey.BUS.DRIVER_ON_OTHER_BUS, { driver: driver.fullName ?? driver.phone ?? '', bus: otherBus?.name ?? '' }),
      );
    }
    if (existingForDriver?.busId === busId) {
      return successResponse(
        { id: existingForDriver.id, busId, driverId: dto.driverId, assignedAt: existingForDriver.assignedAt },
        t(I18nKey.BUS.DRIVER_ALREADY_HERE),
      );
    }

    // Swap out the bus's current driver and add the new one atomically
    const saved = await this.dataSource.transaction(async (em) => {
      await em.update(BusDriver, { busId, isActive: true }, { isActive: false });
      return em.save(em.create(BusDriver, { busId, driverId: dto.driverId }));
    });

    this.logger.log(`Driver ${dto.driverId} assigned to bus ${busId}`);
    return successResponse(
      { id: saved.id, busId, driverId: dto.driverId, assignedAt: saved.assignedAt },
      t(I18nKey.BUS.DRIVER_ASSIGNED),
    );
  }

  async unassign(schoolId: string, busId: string) {
    const bus = await this.busRepo.findOne({ where: { id: busId, schoolId } });
    if (!bus) throw new NotFoundException(t(I18nKey.BUS.NOT_FOUND));

    await this.busDriverRepo.update({ busId, isActive: true }, { isActive: false });
    return successResponse(null, t(I18nKey.BUS.DRIVER_UNASSIGNED));
  }

  async getCurrentDriver(schoolId: string, busId: string) {
    const bus = await this.busRepo.findOne({ where: { id: busId, schoolId } });
    if (!bus) throw new NotFoundException(t(I18nKey.BUS.NOT_FOUND));

    const assignment = await this.busDriverRepo.findOne({
      where: { busId, isActive: true },
    });
    if (!assignment) {
      return successResponse(null, t(I18nKey.BUS.NO_DRIVER));
    }

    const driver = await this.userRepo.findOne({
      where: { id: assignment.driverId },
      select: { id: true, fullName: true, phone: true, isActive: true },
    });
    return successResponse({ ...assignment, driver });
  }
}
