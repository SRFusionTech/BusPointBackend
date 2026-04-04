import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingEmail = await this.userRepository.findOneBy({
      email: createUserDto.email,
    });
    if (existingEmail) {
      throw new ConflictException('Email is already in use');
    }

    const existingPhone = await this.userRepository.findOneBy({
      phone: createUserDto.phone,
    });
    if (existingPhone) {
      throw new ConflictException('Phone number is already in use');
    }

    if (!createUserDto.name) {
      createUserDto.name = `${createUserDto.firstName} ${createUserDto.lastName}`;
    }

    const user = this.userRepository.create(createUserDto);
    return this.userRepository.save(user);
  }

  findAll(schoolId?: string, role?: UserRole): Promise<User[]> {
    const where: Record<string, unknown> = {};
    if (schoolId) where.schoolId = schoolId;
    if (role) where.role = role;
    return this.userRepository.findBy(where);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
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
