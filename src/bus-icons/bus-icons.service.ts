import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusIcon } from './entities/bus-icon.entity';
import { CreateBusIconDto } from './dto/create-bus-icon.dto';

@Injectable()
export class BusIconsService {
  constructor(
    @InjectRepository(BusIcon)
    private readonly iconRepository: Repository<BusIcon>,
  ) {}

  create(dto: CreateBusIconDto): Promise<BusIcon> {
    return this.iconRepository.save(this.iconRepository.create(dto));
  }

  findAll(): Promise<BusIcon[]> {
    return this.iconRepository.findBy({ isActive: true });
  }

  async findOne(id: string): Promise<BusIcon> {
    const icon = await this.iconRepository.findOneBy({ id });
    if (!icon) throw new NotFoundException(`Bus icon ${id} not found`);
    return icon;
  }

  async remove(id: string): Promise<void> {
    const icon = await this.findOne(id);
    await this.iconRepository.remove(icon);
  }
}
