import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchoolUser } from './entities/school-user.entity';
import { CreateSchoolUserDto } from './dto/create-school-user.dto';
import { UpdateSchoolUserDto } from './dto/update-school-user.dto';

@Injectable()
export class SchoolUsersService {
  constructor(
    @InjectRepository(SchoolUser)
    private readonly schoolUserRepository: Repository<SchoolUser>,
  ) {}

  async create(createSchoolUserDto: CreateSchoolUserDto): Promise<SchoolUser> {
    const existing = await this.schoolUserRepository.findOneBy({
      userId: createSchoolUserDto.userId,
      schoolId: createSchoolUserDto.schoolId,
      roleId: createSchoolUserDto.roleId,
    });
    if (existing) {
      throw new ConflictException('User already has this role in this school');
    }

    const schoolUser = this.schoolUserRepository.create(createSchoolUserDto);
    return this.schoolUserRepository.save(schoolUser);
  }

  findAll(): Promise<SchoolUser[]> {
    return this.schoolUserRepository.find();
  }

  async findOne(id: string): Promise<SchoolUser> {
    const schoolUser = await this.schoolUserRepository.findOneBy({ id });
    if (!schoolUser) {
      throw new NotFoundException(`SchoolUser with id ${id} not found`);
    }
    return schoolUser;
  }

  // Get all users belonging to a school
  findBySchool(schoolId: string): Promise<SchoolUser[]> {
    return this.schoolUserRepository.findBy({ schoolId });
  }

  // Get all schools a user belongs to
  findByUser(userId: string): Promise<SchoolUser[]> {
    return this.schoolUserRepository.findBy({ userId });
  }

  async update(id: string, updateSchoolUserDto: UpdateSchoolUserDto): Promise<SchoolUser> {
    const schoolUser = await this.findOne(id);
    Object.assign(schoolUser, updateSchoolUserDto);
    return this.schoolUserRepository.save(schoolUser);
  }

  async remove(id: string): Promise<void> {
    const schoolUser = await this.findOne(id);
    await this.schoolUserRepository.remove(schoolUser);
  }
}
