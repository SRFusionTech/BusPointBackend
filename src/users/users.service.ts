import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { SchoolUser } from '../school-users/entities/school-user.entity';
import { Role, RoleName } from '../roles/entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SchoolUser)
    private readonly schoolUserRepository: Repository<SchoolUser>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingEmail = await this.userRepository.findOneBy({
      email: createUserDto.email,
    });
    if (existingEmail) throw new ConflictException('Email is already in use');

    const existingPhone = await this.userRepository.findOneBy({
      phone: createUserDto.phone,
    });
    if (existingPhone) throw new ConflictException('Phone number is already in use');

    if (!createUserDto.name) {
      createUserDto.name = `${createUserDto.firstName} ${createUserDto.lastName}`;
    }

    const user = this.userRepository.create(createUserDto);
    return this.userRepository.save(user);
  }

  // Filter by school and/or role via school_users join
  async findAll(schoolId?: string, roleName?: RoleName): Promise<User[]> {
    if (!schoolId && !roleName) {
      return this.userRepository.find();
    }

    const qb = this.userRepository
      .createQueryBuilder('u')
      .innerJoin(
        SchoolUser,
        'su',
        'su.userId = u.id AND su.isActive = true',
      );

    if (schoolId) {
      qb.andWhere('su.schoolId = :schoolId', { schoolId });
    }

    if (roleName) {
      qb.innerJoin(Role, 'r', 'r.id = su.roleId AND r.name = :roleName', { roleName });
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneBy({ email });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findOneBy({ phone });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    if (updateUserDto.firstName || updateUserDto.lastName) {
      const firstName = updateUserDto.firstName ?? user.firstName;
      const lastName = updateUserDto.lastName ?? user.lastName;
      if (!updateUserDto.name) {
        updateUserDto.name = `${firstName} ${lastName}`;
      }
    }
    Object.assign(user, updateUserDto);
    return this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }
}
