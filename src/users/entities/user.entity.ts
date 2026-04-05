import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RoleName } from '../../roles/entities/role.entity';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'firebase_uid', type: 'varchar', nullable: true, unique: true })
  firebaseUid: string | null;

  @Column({ name: 'mobile_number', type: 'varchar', unique: true, nullable: true })
  phone: string | null;

  // Parent's child name (personal info, stays on user)
  @Column({ nullable: true })
  childName: string;

  @Column({ nullable: true })
  subStatus: string;

  @Column({ type: 'timestamptz', nullable: true })
  subExpiry: Date;

  @Column({ nullable: true })
  fcmToken: string;

  @Column({ nullable: true })
  dateOfBirth: Date;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  profilePicture: string;

  // Parent's home location for proximity-based arrival notifications
  @Column({ type: 'float', nullable: true })
  homeLat: number;

  @Column({ type: 'float', nullable: true })
  homeLng: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ─── Runtime-only (not persisted) ────────────────────────────────────────────
  // Populated by JwtStrategy.validate() from the school_users + roles tables.
  // Do NOT add @Column() here.
  roles?: RoleName[];
}
