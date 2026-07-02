import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { Bus } from '../buses/entities/bus.entity';
import { Route } from '../routes/entities/route.entity';
import { RouteStop } from '../routes/entities/route-stop.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Bus)
    private readonly busRepository: Repository<Bus>,
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    @InjectRepository(RouteStop)
    private readonly stopRepository: Repository<RouteStop>,
  ) {}

  private async resolveBusRouteId(
    bus: Bus,
    kind: 'outbound' | 'return',
  ): Promise<string | null> {
    const direct = kind === 'outbound' ? bus.routeId : bus.returnRouteId;
    if (direct) return direct;

    const name = (kind === 'outbound' ? bus.routeName : bus.returnRouteName)?.trim();
    if (!name || !bus.schoolId) return null;

    if (
      kind === 'return' &&
      bus.routeName?.trim() &&
      name === bus.routeName.trim() &&
      bus.routeId
    ) {
      return bus.routeId;
    }

    const route = await this.routeRepository.findOne({
      where: { schoolId: bus.schoolId, name },
    });
    return route?.id ?? null;
  }

  private async validatePickupStop(
    busId: string | null | undefined,
    routeStopId: string | null | undefined,
    returnRouteStopId?: string | null | undefined,
  ): Promise<void> {
    if (routeStopId) {
      if (!busId) {
        throw new BadRequestException('Assign a bus before selecting a pickup stop.');
      }

      const bus = await this.busRepository.findOneBy({ id: busId });
      if (!bus) {
        throw new BadRequestException('Selected bus was not found.');
      }

      const outboundRouteId = await this.resolveBusRouteId(bus, 'outbound');
      if (!outboundRouteId) {
        throw new BadRequestException(
          'The selected bus has no mapped route. Edit the bus and link a configured route.',
        );
      }

      const stop = await this.stopRepository.findOneBy({ id: routeStopId });
      if (!stop || stop.routeId !== outboundRouteId) {
        throw new BadRequestException('Pickup stop does not belong to this bus route.');
      }
    }

    if (returnRouteStopId) {
      if (!busId) {
        throw new BadRequestException('Assign a bus before selecting a return stop.');
      }

      const bus = await this.busRepository.findOneBy({ id: busId });
      if (!bus) {
        throw new BadRequestException('Selected bus was not found.');
      }

      const returnRouteId = await this.resolveBusRouteId(bus, 'return');
      if (!returnRouteId) {
        throw new BadRequestException(
          'The selected bus has no return route. Configure a return route on the bus first.',
        );
      }

      const stop = await this.stopRepository.findOneBy({ id: returnRouteStopId });
      if (!stop || stop.routeId !== returnRouteId) {
        throw new BadRequestException('Return stop does not belong to this bus return route.');
      }
    }
  }

  private normalizePhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const digits = phone.replace(/^\+91/, '').replace(/\D/g, '');
    return digits.length > 0 ? digits : null;
  }

  /** Read pickup id from any legacy column name (production DB may differ). */
  private async resolveRouteStopId(userId: string): Promise<string | null> {
    const type = this.userRepository.manager.connection.options.type;
    if (type === 'postgres') {
      try {
        const rows = await this.userRepository.query(
          `SELECT COALESCE(route_stop_id, "routeStopId", routestopid) AS rid
           FROM users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        const rid = rows?.[0]?.rid;
        if (typeof rid === 'string' && rid.trim()) return rid.trim();
      } catch {
        // Fall through to entity field.
      }
    }
    const user = await this.userRepository.findOneBy({ id: userId });
    const fromEntity = user?.routeStopId?.trim();
    return fromEntity || null;
  }

  private async hydrateRouteStopId(user: User): Promise<User> {
    const resolved = await this.resolveRouteStopId(user.id);
    if (resolved !== user.routeStopId) {
      user.routeStopId = resolved;
    }
    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingEmail = await this.userRepository.findOneBy({
      email: createUserDto.email,
    });
    if (existingEmail) {
      throw new ConflictException('Email is already in use');
    }

    const existingPhone = await this.userRepository.findOneBy({
      phone: this.normalizePhone(createUserDto.phone) ?? createUserDto.phone,
    });
    if (existingPhone) {
      throw new ConflictException('Phone number is already in use');
    }

    if (!createUserDto.name) {
      createUserDto.name = `${createUserDto.firstName} ${createUserDto.lastName}`;
    }

    await this.validatePickupStop(
      createUserDto.busId,
      createUserDto.routeStopId,
      createUserDto.returnRouteStopId,
    );

    const user = this.userRepository.create({
      ...createUserDto,
      phone: this.normalizePhone(createUserDto.phone) ?? createUserDto.phone,
    });
    const saved = await this.userRepository.save(user);
    await this.syncLegacyRouteStopColumns(saved.id, saved.routeStopId ?? null);
    return saved;
  }

  /** Keep legacy camelCase column in sync for older deployed backends. */
  private async syncLegacyRouteStopColumns(
    userId: string,
    routeStopId: string | null,
  ): Promise<void> {
    if (this.userRepository.manager.connection.options.type !== 'postgres') return;
    try {
      await this.userRepository.query(
        `UPDATE users SET route_stop_id = $1, "routeStopId" = $1 WHERE id = $2`,
        [routeStopId, userId],
      );
    } catch {
      // Non-fatal — primary entity save already succeeded.
    }
  }

  findAll(schoolId?: string, role?: UserRole, busId?: string): Promise<User[]> {
    const where: Record<string, unknown> = {};
    if (schoolId) where.schoolId = schoolId;
    if (role) where.role = role;
    if (busId) where.busId = busId;
    return this.userRepository.findBy(where);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return this.hydrateRouteStopId(user);
  }

  /** Parent's admin-assigned pickup stop (routeStopId + stop coordinates). */
  async getPickupStopAssignment(userId: string): Promise<{
    routeStopId: string | null;
    stop: {
      id: string;
      name: string;
      lat: number;
      lng: number;
      address: string | null;
      stopOrder: number;
      routeId: string;
    } | null;
  }> {
    const user = await this.findOne(userId);
    const routeStopId = user.routeStopId?.trim() || null;
    if (!routeStopId) {
      return { routeStopId: null, stop: null };
    }

    const stop = await this.stopRepository.findOneBy({ id: routeStopId });
    if (!stop) {
      return { routeStopId, stop: null };
    }

    return {
      routeStopId,
      stop: {
        id: stop.id,
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        address: stop.address ?? null,
        stopOrder: stop.stopOrder,
        routeId: stop.routeId,
      },
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneBy({ email });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findOneBy({ phone });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const nextEmail =
      typeof updateUserDto.email === 'string' && updateUserDto.email.trim()
        ? updateUserDto.email.trim()
        : user.email;
    const nextPhone =
      typeof updateUserDto.phone === 'string' && updateUserDto.phone.trim()
        ? this.normalizePhone(updateUserDto.phone) ?? updateUserDto.phone.trim()
        : user.phone;

    if (nextEmail !== user.email) {
      const existingEmail = await this.userRepository.findOneBy({ email: nextEmail });
      if (existingEmail && existingEmail.id !== id) {
        throw new ConflictException('Email is already in use');
      }
    }

    if (nextPhone && nextPhone !== user.phone) {
      const existingPhone = await this.userRepository.findOneBy({ phone: nextPhone });
      if (existingPhone && existingPhone.id !== id) {
        throw new ConflictException('Phone number is already in use');
      }
    }

    const nextFirstName = updateUserDto.firstName?.trim() ?? user.firstName;
    const nextLastName = updateUserDto.lastName?.trim() ?? user.lastName;
    const nextBusId =
      updateUserDto.busId !== undefined ? updateUserDto.busId || undefined : user.busId;
    let nextRouteStopId: string | null | undefined =
      updateUserDto.routeStopId !== undefined
        ? (updateUserDto.routeStopId?.trim() || null)
        : user.routeStopId;

    if (updateUserDto.busId !== undefined && updateUserDto.busId !== user.busId) {
      if (updateUserDto.routeStopId === undefined) {
        nextRouteStopId = null;
      }
    }

    await this.validatePickupStop(
      nextBusId,
      nextRouteStopId ?? undefined,
      updateUserDto.returnRouteStopId !== undefined
        ? (updateUserDto.returnRouteStopId?.trim() || null)
        : user.returnRouteStopId,
    );

    Object.assign(user, updateUserDto, {
      routeStopId: nextRouteStopId ?? null,
      busId: nextBusId,
      email: nextEmail,
      phone: nextPhone,
      firstName: nextFirstName,
      lastName: nextLastName,
      name: updateUserDto.name?.trim() || `${nextFirstName} ${nextLastName}`.trim(),
    });

    try {
      const saved = await this.userRepository.save(user);
      await this.syncLegacyRouteStopColumns(id, saved.routeStopId ?? null);
      return saved;
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error as { code?: string }).code;
        if (code === '23505') {
          throw new ConflictException('Email or phone number is already in use');
        }
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }
}
