import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
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
    const nextEmail =
      typeof updateUserDto.email === 'string' && updateUserDto.email.trim()
        ? updateUserDto.email.trim()
        : user.email;
    const nextPhone =
      typeof updateUserDto.phone === 'string' && updateUserDto.phone.trim()
        ? updateUserDto.phone.trim()
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

    Object.assign(user, updateUserDto, {
      email: nextEmail,
      phone: nextPhone,
      firstName: nextFirstName,
      lastName: nextLastName,
      name: updateUserDto.name?.trim() || `${nextFirstName} ${nextLastName}`.trim(),
    });

    try {
      return await this.userRepository.save(user);
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
