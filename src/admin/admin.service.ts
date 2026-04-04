import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
}
