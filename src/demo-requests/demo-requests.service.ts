import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { DemoRequest, DemoRequestStatus } from './demo-request.entity';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { UpdateDemoRequestDto } from './dto/update-demo-request.dto';
import { ListDemoRequestsDto } from './dto/list-demo-requests.dto';
import { successResponse } from '../common/response/api-response';
import { t } from '../i18n/translate';
import { I18nKey } from '../i18n/i18n.keys';

/** Humans need a few seconds to fill a two-step form; faster submissions are bots. */
const MIN_FILL_MS = 3_000;
/** Per-IP submissions allowed per window (in-memory; one API instance). */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

export type RequestMeta = { ip: string | null; userAgent: string | null };

@Injectable()
export class DemoRequestsService {
  private readonly logger = new Logger(DemoRequestsService.name);
  private readonly hits = new Map<string, number[]>();

  constructor(
    @InjectRepository(DemoRequest)
    private readonly repo: Repository<DemoRequest>,
  ) {}

  private rateLimited(ip: string | null): boolean {
    if (!ip) return false;
    const now = Date.now();
    const recent = (this.hits.get(ip) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      this.hits.set(ip, recent);
      return true;
    }
    recent.push(now);
    this.hits.set(ip, recent);
    // Keep the map from growing forever.
    if (this.hits.size > 5_000) {
      for (const [k, v] of this.hits) if (!v.some((ts) => now - ts < RATE_WINDOW_MS)) this.hits.delete(k);
    }
    return false;
  }

  async create(dto: CreateDemoRequestDto, meta: RequestMeta) {
    // Silent drop for bots: respond like success so they learn nothing.
    if (dto.companyFax || (dto.elapsedMs != null && dto.elapsedMs < MIN_FILL_MS)) {
      this.logger.warn(`Demo request dropped as spam (ip=${meta.ip ?? '?'})`);
      return successResponse({ id: null }, t(I18nKey.DEMO.RECEIVED));
    }
    if (this.rateLimited(meta.ip)) {
      throw new HttpException(t(I18nKey.DEMO.TOO_MANY), HttpStatus.TOO_MANY_REQUESTS);
    }

    const row = await this.repo.save(
      this.repo.create({
        schoolName: dto.schoolName,
        city: dto.city,
        country: dto.country,
        schoolType: (dto.schoolType as DemoRequest['schoolType']) ?? null,
        studentRange: dto.studentRange ?? null,
        busRange: dto.busRange ?? null,
        website: dto.website ?? null,
        contactName: dto.contactName,
        contactRole: dto.contactRole,
        email: dto.email,
        phone: dto.phone,
        preferredContact: dto.preferredContact ?? null,
        preferredTime: dto.preferredTime ?? null,
        message: dto.message ?? null,
        source: dto.source ?? null,
        utm: dto.utm ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 400) ?? null,
        consentAt: new Date(),
        status: DemoRequestStatus.NEW,
      }),
    );
    this.logger.log(`Demo request ${row.id} from ${row.schoolName} (${row.country})`);
    return successResponse({ id: row.id }, t(I18nKey.DEMO.RECEIVED));
  }

  async list(q: ListDemoRequestsDto) {
    const qb = this.repo.createQueryBuilder('d').orderBy('d.created_at', 'DESC');
    if (q.status) qb.andWhere('d.status = :status', { status: q.status });
    if (q.q?.trim()) {
      const term = `%${q.q.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('LOWER(d.school_name) LIKE :term', { term })
            .orWhere('LOWER(d.contact_name) LIKE :term', { term })
            .orWhere('LOWER(d.email) LIKE :term', { term })
            .orWhere('LOWER(d.city) LIKE :term', { term })
            .orWhere('LOWER(d.country) LIKE :term', { term }),
        ),
      );
    }
    const [items, total] = await qb
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return successResponse(items, 'Success', { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) });
  }

  /** Counts per status (pipeline header + sidebar badge). */
  async stats() {
    const rows = await this.repo
      .createQueryBuilder('d')
      .select('d.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('d.status')
      .getRawMany<{ status: DemoRequestStatus; count: number }>();
    const byStatus = Object.fromEntries(Object.values(DemoRequestStatus).map((s) => [s, 0])) as Record<DemoRequestStatus, number>;
    for (const r of rows) byStatus[r.status] = Number(r.count);
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return successResponse({ total, byStatus });
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(t(I18nKey.DEMO.NOT_FOUND));
    return successResponse(row);
  }

  async update(id: string, dto: UpdateDemoRequestDto) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(t(I18nKey.DEMO.NOT_FOUND));
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.notes !== undefined) row.notes = dto.notes || null;
    if (dto.assignedTo !== undefined) row.assignedTo = dto.assignedTo || null;
    const saved = await this.repo.save(row);
    return successResponse(saved, t(I18nKey.DEMO.UPDATED));
  }
}
