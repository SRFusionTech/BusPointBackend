import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { SchoolClass } from './school-class.entity';
import { ClassSection } from './class-section.entity';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { CreateClassDto, SectionInputDto, UpdateClassDto } from './dto/class.dto';
import { successResponse } from '../common/response/api-response';
import { t } from '../i18n/translate';
import { I18nKey } from '../i18n/i18n.keys';

/** Comparison key for names: trimmed, inner spaces collapsed, case-insensitive. */
const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** Postgres unique_violation — a concurrent request inserted the same name first. */
const isUniqueViolation = (err: unknown) =>
  err instanceof QueryFailedError && (err as QueryFailedError & { code?: string }).code === '23505';

export interface ResolvedChildClass {
  schoolClass: SchoolClass | null;
  section: ClassSection | null;
}

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(SchoolClass)
    private readonly classRepo: Repository<SchoolClass>,
    @InjectRepository(ClassSection)
    private readonly sectionRepo: Repository<ClassSection>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(schoolId: string) {
    const classes = await this.classRepo.find({
      where: { schoolId },
      relations: { sections: true },
      order: { sortOrder: 'ASC', id: 'ASC', sections: { sortOrder: 'ASC', id: 'ASC' } },
    });

    const counts: Array<{ classId: number; count: string }> = classes.length
      ? await this.userRepo
          .createQueryBuilder('u')
          .select('u.child_class_id', 'classId')
          .addSelect('COUNT(*)', 'count')
          .where('u.school_id = :schoolId', { schoolId })
          .andWhere('u.role = :role', { role: Role.PARENT })
          .andWhere('u.child_class_id IS NOT NULL')
          .groupBy('u.child_class_id')
          .getRawMany()
      : [];
    const countByClass = new Map(counts.map((r) => [Number(r.classId), Number(r.count)]));

    return successResponse(
      classes.map((c) => ({ ...this.toSummary(c), parentsCount: countByClass.get(c.id) ?? 0 })),
    );
  }

  async create(schoolId: string, dto: CreateClassDto) {
    const name = cleanName(dto.name);
    await this.assertClassNameFree(schoolId, name);
    const sections = this.normalizeSections(dto.sections);

    const last = await this.classRepo.findOne({ where: { schoolId }, order: { sortOrder: 'DESC' } });
    const entity = this.classRepo.create({
      schoolId,
      name,
      sortOrder: last ? last.sortOrder + 1 : 0,
      sections: sections.map((s, i) => this.sectionRepo.create({ name: s.name, sortOrder: i })),
    });

    const saved = await this.saveOrConflict(() => this.classRepo.save(entity), name);
    return successResponse(this.toSummary(saved), t(I18nKey.CLASS.CREATED));
  }

  async update(schoolId: string, id: number, dto: UpdateClassDto) {
    const existing = await this.getOwned(schoolId, id);

    if (dto.name !== undefined) {
      const name = cleanName(dto.name);
      if (nameKey(name) !== nameKey(existing.name)) await this.assertClassNameFree(schoolId, name, id);
      existing.name = name;
    }

    await this.saveOrConflict(async () => {
      await this.dataSource.transaction(async (em) => {
        await em.update(SchoolClass, { id }, { name: existing.name });
        if (dto.sections === undefined) return;

        const incoming = this.normalizeSections(dto.sections);
        const currentIds = new Set(existing.sections.map((s) => s.id));
        for (const s of incoming) {
          if (s.id !== undefined && !currentIds.has(s.id)) {
            throw new BadRequestException(t(I18nKey.CLASS.SECTION_NOT_FOUND));
          }
        }

        const keptIds = new Set(incoming.filter((s) => s.id !== undefined).map((s) => s.id!));
        const removed = existing.sections.filter((s) => !keptIds.has(s.id));
        if (removed.length) {
          const inUse = await em.count(User, {
            where: { role: Role.PARENT, childSectionId: In(removed.map((s) => s.id)) },
          });
          if (inUse) {
            throw new ConflictException(t(I18nKey.CLASS.SECTION_IN_USE, { count: inUse }));
          }
          await em.delete(ClassSection, { id: In(removed.map((s) => s.id)) });
        }

        // Two passes so swapping names (A↔B) never trips the unique (class_id, name) index mid-update
        for (const s of incoming) {
          if (s.id !== undefined) await em.update(ClassSection, { id: s.id }, { name: `~${s.id}` });
        }
        for (const [i, s] of incoming.entries()) {
          if (s.id !== undefined) {
            await em.update(ClassSection, { id: s.id }, { name: s.name, sortOrder: i });
          } else {
            await em.insert(ClassSection, { classId: id, name: s.name, sortOrder: i });
          }
        }
      });
    }, existing.name);

    const updated = await this.getOwned(schoolId, id);
    return successResponse(this.toSummary(updated), t(I18nKey.CLASS.UPDATED));
  }

  async remove(schoolId: string, id: number) {
    await this.getOwned(schoolId, id);
    const inUse = await this.userRepo.count({ where: { schoolId, role: Role.PARENT, childClassId: id } });
    if (inUse) throw new ConflictException(t(I18nKey.CLASS.IN_USE, { count: inUse }));
    await this.classRepo.delete({ id, schoolId });
    return successResponse(null, t(I18nKey.CLASS.DELETED));
  }

  async reorder(schoolId: string, ids: number[]) {
    const classes = await this.classRepo.find({ where: { schoolId }, select: { id: true } });
    const all = new Set(classes.map((c) => c.id));
    if (ids.length !== all.size || ids.some((id) => !all.has(id))) {
      throw new BadRequestException(t(I18nKey.CLASS.INVALID_ORDER));
    }
    await this.dataSource.transaction(async (em) => {
      for (const [i, id] of ids.entries()) {
        await em.update(SchoolClass, { id, schoolId }, { sortOrder: i });
      }
    });
    return this.findAll(schoolId);
  }

  /**
   * Validates a parent's child class + section against this school's master data.
   * Both are mandatory and the section must belong to the class.
   */
  async resolveChildClass(
    schoolId: string,
    classId: number | null,
    sectionId: number | null,
  ): Promise<ResolvedChildClass> {
    if (classId === null) throw new BadRequestException(t(I18nKey.CLASS.CLASS_REQUIRED));
    const schoolClass = await this.classRepo.findOne({
      where: { id: classId, schoolId },
      relations: { sections: true },
    });
    if (!schoolClass) throw new NotFoundException(t(I18nKey.CLASS.NOT_FOUND));

    if (sectionId === null) throw new BadRequestException(t(I18nKey.CLASS.SECTION_REQUIRED));
    const section = schoolClass.sections.find((s) => s.id === sectionId);
    if (!section) throw new BadRequestException(t(I18nKey.CLASS.SECTION_NOT_FOUND));
    return { schoolClass, section };
  }

  /** id → class (with sections) for rendering parent lists. */
  async loadMap(schoolId: string, ids: Array<number | null>): Promise<Map<number, SchoolClass>> {
    const unique = [...new Set(ids.filter((id): id is number => id !== null))];
    if (!unique.length) return new Map();
    const classes = await this.classRepo.find({
      where: { schoolId, id: In(unique) },
      relations: { sections: true },
    });
    return new Map(classes.map((c) => [c.id, c]));
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async getOwned(schoolId: string, id: number): Promise<SchoolClass> {
    const found = await this.classRepo.findOne({
      where: { id, schoolId },
      relations: { sections: true },
      order: { sections: { sortOrder: 'ASC', id: 'ASC' } },
    });
    if (!found) throw new NotFoundException(t(I18nKey.CLASS.NOT_FOUND));
    return found;
  }

  /** Same school can't have the same class twice ("5" vs " 5 " vs "lkg"/"LKG" all clash). */
  private async assertClassNameFree(schoolId: string, name: string, exceptId?: number) {
    const classes = await this.classRepo.find({ where: { schoolId }, select: { id: true, name: true } });
    if (classes.some((c) => c.id !== exceptId && nameKey(c.name) === nameKey(name))) {
      throw new ConflictException(t(I18nKey.CLASS.NAME_EXISTS, { name }));
    }
  }

  /** Cleans names, requires at least one section, and rejects the same section twice within one class. */
  private normalizeSections(sections: SectionInputDto[]): SectionInputDto[] {
    if (!sections.length) throw new BadRequestException(t(I18nKey.CLASS.SECTIONS_REQUIRED));
    const seen = new Set<string>();
    return sections.map((s) => {
      const name = cleanName(s.name);
      if (!name) throw new BadRequestException(t(I18nKey.CLASS.SECTION_NAME_REQUIRED));
      if (seen.has(nameKey(name))) {
        throw new ConflictException(t(I18nKey.CLASS.SECTION_DUPLICATE, { name }));
      }
      seen.add(nameKey(name));
      return { id: s.id, name };
    });
  }

  private async saveOrConflict<T>(fn: () => Promise<T>, name: string): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(t(I18nKey.CLASS.NAME_EXISTS, { name }));
      throw err;
    }
  }

  private toSummary(c: SchoolClass) {
    const sections = [...(c.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    return {
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      sections: sections.map((s) => ({ id: s.id, name: s.name })),
    };
  }
}
