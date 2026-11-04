import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Role } from '../common/enums/role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true, where: '"email" IS NOT NULL' })
  @Column({ type: 'varchar', nullable: true, default: null, unique: false })
  email!: string | null;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'enum', enum: Role })
  role!: Role;

  @Index()
  @Column({ name: 'school_id', type: 'uuid', nullable: true, default: null })
  schoolId!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'full_name', type: 'varchar', nullable: true, default: null })
  fullName!: string | null;

  // Phone is the mobile-app login, so it's unique among drivers/parents only; admins' phones are contact info
  @Index({ unique: true, where: `"phone" IS NOT NULL AND "role" IN ('driver', 'parent')` })
  @Column({ type: 'varchar', nullable: true, default: null })
  phone!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
