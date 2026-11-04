import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { successResponse } from '../common/response/api-response';
import { t } from '../i18n/translate';
import { I18nKey } from '../i18n/i18n.keys';

const SEED_PLAN = { name: 'Pro', description: 'Full platform access — the default plan for all schools.' };

@Injectable()
export class PlansService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  /** Ensure the seed plan exists on every startup. Safe to run repeatedly. */
  async onApplicationBootstrap() {
    const existing = await this.planRepo.findOne({ where: { name: SEED_PLAN.name } });
    if (!existing) {
      await this.planRepo.save(this.planRepo.create(SEED_PLAN));
      this.logger.log(`Seeded default plan: ${SEED_PLAN.name}`);
    }
  }

  async create(dto: CreatePlanDto) {
    const existing = await this.planRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException(t(I18nKey.PLAN.NAME_EXISTS, { name: dto.name }));

    const plan = await this.planRepo.save(this.planRepo.create({
      name: dto.name,
      description: dto.description ?? null,
    }));

    this.logger.log(`Plan created: ${plan.name} (${plan.id})`);
    return successResponse(plan, t(I18nKey.PLAN.CREATED));
  }

  async findAll() {
    const plans = await this.planRepo.find({ order: { createdAt: 'ASC' } });
    return successResponse(plans);
  }

  async findAllActive() {
    const plans = await this.planRepo.find({ where: { isActive: true }, order: { createdAt: 'ASC' } });
    return successResponse(plans);
  }

  async findOne(id: string) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(t(I18nKey.PLAN.NOT_FOUND));
    return successResponse(plan);
  }

  async update(id: string, dto: UpdatePlanDto) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(t(I18nKey.PLAN.NOT_FOUND));

    if (dto.name && dto.name !== plan.name) {
      const conflict = await this.planRepo.findOne({ where: { name: dto.name } });
      if (conflict) throw new ConflictException(t(I18nKey.PLAN.NAME_EXISTS, { name: dto.name }));
    }

    Object.assign(plan, dto);
    await this.planRepo.save(plan);

    this.logger.log(`Plan updated: ${plan.name} (${id})`);
    return successResponse(plan, t(I18nKey.PLAN.UPDATED));
  }

  async remove(id: string) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(t(I18nKey.PLAN.NOT_FOUND));

    // Guard: don't delete if schools are assigned
    const schoolCount: { count: string }[] = await this.planRepo.query(
      `SELECT COUNT(*)::text AS count FROM schools WHERE plan_id = $1`,
      [id],
    );
    const count = parseInt(schoolCount[0]?.count ?? '0', 10);
    if (count > 0) {
      throw new BadRequestException(
        t(I18nKey.PLAN.IN_USE, { count }),
      );
    }

    await this.planRepo.remove(plan);
    this.logger.log(`Plan deleted: ${id}`);
    return successResponse(null, t(I18nKey.PLAN.DELETED));
  }
}
