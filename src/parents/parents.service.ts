import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';
import { RouteStop } from '../routes/route-stop.entity';
import { SchoolClass } from '../classes/school-class.entity';
import { ClassesService, type ResolvedChildClass } from '../classes/classes.service';
import { Role } from '../common/enums/role.enum';
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { successResponse } from '../common/response/api-response';
import { t } from '../i18n/translate';
import { I18nKey } from '../i18n/i18n.keys';

/** Phone is the login for these roles, so it must be unique across them (matches the users phone index). */
const PHONE_LOGIN_ROLES = [Role.DRIVER, Role.PARENT];

const PARENT_COLUMNS = {
  id: true, fullName: true, phone: true, isActive: true, createdAt: true, routeStopId: true,
  subscriptionExpiresAt: true, childName: true, childClassId: true, childSectionId: true,
} as const;

@Injectable()
export class ParentsService {
  private readonly logger = new Logger(ParentsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RouteStop)
    private readonly stopRepo: Repository<RouteStop>,
    private readonly classes: ClassesService,
  ) {}

  async create(schoolId: string, dto: CreateParentDto) {
    const existing = await this.userRepo.findOne({
      where: { phone: dto.phone, role: In(PHONE_LOGIN_ROLES) },
    });
    if (existing) {
      throw new ConflictException(
        t(existing.role === Role.DRIVER ? I18nKey.PARENT.PHONE_TAKEN_DRIVER : I18nKey.PARENT.PHONE_TAKEN_PARENT, { phone: dto.phone }),
      );
    }

    const stop = await this.resolveStop(schoolId, dto.routeStopId);
    const child = await this.classes.resolveChildClass(schoolId, dto.childClassId, dto.childSectionId);

    const tempPassword = this.generatePassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const parent = this.userRepo.create({
      fullName: dto.fullName,
      phone: dto.phone,
      childName: dto.childName.trim(),
      childClassId: child.schoolClass?.id ?? null,
      childSectionId: child.section?.id ?? null,
      email: null,
      passwordHash,
      role: Role.PARENT,
      schoolId,
      routeStopId: stop.id,
      subscriptionExpiresAt: dto.subscriptionExpiresAt ? new Date(dto.subscriptionExpiresAt) : null,
    });
    const saved = await this.userRepo.save(parent);

    this.logger.log(`Parent created: ${saved.fullName} (${saved.id}) for school ${schoolId}`);

    return successResponse(
      {
        id: saved.id,
        fullName: saved.fullName,
        phone: saved.phone,
        childName: saved.childName,
        ...this.toChildSummary(child),
        isActive: saved.isActive,
        createdAt: saved.createdAt,
        stop: this.toStopSummary(stop),
        subscriptionExpiresAt: saved.subscriptionExpiresAt,
        tempPassword,
      },
      t(I18nKey.PARENT.CREATED),
    );
  }

  async findAll(schoolId: string) {
    const parents = await this.userRepo.find({
      where: { schoolId, role: Role.PARENT },
      order: { createdAt: 'DESC' },
      select: PARENT_COLUMNS,
    });
    if (parents.length === 0) return successResponse([]);

    const [stops, classes] = await Promise.all([
      this.loadStops(parents.map((p) => p.routeStopId)),
      this.classes.loadMap(schoolId, parents.map((p) => p.childClassId)),
    ]);
    return successResponse(parents.map((p) => this.withStopAndClass(p, stops, classes)));
  }

  async findOne(schoolId: string, id: string) {
    const parent = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.PARENT },
      select: { ...PARENT_COLUMNS, updatedAt: true },
    });
    if (!parent) throw new NotFoundException(t(I18nKey.PARENT.NOT_FOUND));

    const [stops, classes] = await Promise.all([
      this.loadStops([parent.routeStopId]),
      this.classes.loadMap(schoolId, [parent.childClassId]),
    ]);
    return successResponse(this.withStopAndClass(parent, stops, classes));
  }

  async update(schoolId: string, id: string, dto: UpdateParentDto) {
    const parent = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.PARENT },
    });
    if (!parent) throw new NotFoundException(t(I18nKey.PARENT.NOT_FOUND));

    if (dto.phone && dto.phone !== parent.phone) {
      const conflict = await this.userRepo.findOne({
        where: { phone: dto.phone, role: In(PHONE_LOGIN_ROLES) },
      });
      if (conflict) {
        throw new ConflictException(
          t(conflict.role === Role.DRIVER ? I18nKey.PARENT.PHONE_TAKEN_DRIVER : I18nKey.PARENT.PHONE_TAKEN_PARENT, { phone: dto.phone }),
        );
      }
    }

    let stop: RouteStop | null = null;
    if (dto.routeStopId) {
      stop = await this.resolveStop(schoolId, dto.routeStopId);
    }

    // Class/section are validated as a pair whenever either changes. A new class needs a
    // section from that class, so the old section is never carried over to it. Partial
    // updates that don't touch them (e.g. reactivating) leave older parents without one as-is.
    let child: ResolvedChildClass | null = null;
    if (dto.childClassId !== undefined || dto.childSectionId !== undefined) {
      const classChanged = dto.childClassId !== undefined && dto.childClassId !== parent.childClassId;
      child = await this.classes.resolveChildClass(
        schoolId,
        dto.childClassId ?? parent.childClassId,
        dto.childSectionId ?? (classChanged ? null : parent.childSectionId),
      );
    }

    const { subscriptionExpiresAt, childName, childClassId: _c, childSectionId: _s, ...rest } = dto;
    Object.assign(parent, rest);
    if (childName !== undefined) parent.childName = childName.trim();
    if (child) {
      parent.childClassId = child.schoolClass!.id;
      parent.childSectionId = child.section!.id;
    } else {
      const classes = await this.classes.loadMap(schoolId, [parent.childClassId]);
      const schoolClass = parent.childClassId !== null ? classes.get(parent.childClassId) ?? null : null;
      child = { schoolClass, section: schoolClass?.sections.find((s) => s.id === parent.childSectionId) ?? null };
    }
    if (subscriptionExpiresAt !== undefined) {
      parent.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
    }
    await this.userRepo.save(parent);

    if (!stop && parent.routeStopId) {
      stop = (await this.loadStops([parent.routeStopId])).get(parent.routeStopId) ?? null;
    }

    return successResponse(
      {
        id: parent.id,
        fullName: parent.fullName,
        phone: parent.phone,
        childName: parent.childName,
        ...this.toChildSummary(child),
        isActive: parent.isActive,
        subscriptionExpiresAt: parent.subscriptionExpiresAt,
        stop: this.toStopSummary(stop),
      },
      t(I18nKey.PARENT.UPDATED),
    );
  }

  async resetPassword(schoolId: string, id: string) {
    const parent = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.PARENT },
    });
    if (!parent) throw new NotFoundException(t(I18nKey.PARENT.NOT_FOUND));

    const tempPassword = this.generatePassword();
    parent.passwordHash = await bcrypt.hash(tempPassword, 12);
    await this.userRepo.save(parent);

    this.logger.log(`Password reset for parent: ${parent.fullName} (${id})`);
    return successResponse(
      { tempPassword },
      t(I18nKey.PARENT.PASSWORD_RESET),
    );
  }

  async remove(schoolId: string, id: string) {
    const parent = await this.userRepo.findOne({
      where: { id, schoolId, role: Role.PARENT },
    });
    if (!parent) throw new NotFoundException(t(I18nKey.PARENT.NOT_FOUND));

    parent.isActive = false;
    await this.userRepo.save(parent);
    return successResponse(null, t(I18nKey.PARENT.DEACTIVATED));
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /** Looks up a stop and checks it belongs to a route in this school. */
  private async resolveStop(schoolId: string, routeStopId: string): Promise<RouteStop> {
    const stop = await this.stopRepo.findOne({
      where: { id: routeStopId, route: { schoolId } },
      relations: { route: true },
    });
    if (!stop) throw new NotFoundException(t(I18nKey.PARENT.STOP_NOT_FOUND));
    return stop;
  }

  private async loadStops(ids: Array<string | null>): Promise<Map<string, RouteStop>> {
    const uniqueIds = [...new Set(ids.filter((id): id is string => !!id))];
    if (uniqueIds.length === 0) return new Map();
    const stops = await this.stopRepo.find({ where: { id: In(uniqueIds) }, relations: { route: true } });
    return new Map(stops.map((s) => [s.id, s]));
  }

  private withStopAndClass(parent: User, stops: Map<string, RouteStop>, classes: Map<number, SchoolClass>) {
    const stop = parent.routeStopId ? stops.get(parent.routeStopId) ?? null : null;
    const schoolClass = parent.childClassId !== null ? classes.get(parent.childClassId) ?? null : null;
    const section = schoolClass?.sections.find((s) => s.id === parent.childSectionId) ?? null;
    const { childClassId: _c, childSectionId: _s, ...rest } = parent;
    return { ...rest, ...this.toChildSummary({ schoolClass, section }), stop: this.toStopSummary(stop) };
  }

  private toChildSummary({ schoolClass, section }: ResolvedChildClass) {
    return {
      childClass: schoolClass ? { id: schoolClass.id, name: schoolClass.name } : null,
      childSection: section ? { id: section.id, name: section.name } : null,
    };
  }

  private toStopSummary(stop: RouteStop | null) {
    if (!stop) return null;
    return { id: stop.id, name: stop.name, routeId: stop.routeId, routeName: stop.route?.name ?? '' };
  }
}
