import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum UserRole {
  ADMIN = 'admin',
  DRIVER = 'driver',
  PARENT = 'parent',
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

  // Populated on first Firebase sign-in; null for users created by admin
  // before they authenticate via Firebase.
  @Column({ name: 'firebase_uid', type: 'varchar', nullable: true, unique: true })
  firebaseUid: string | null;

  // DB column stays as mobile_number; property exposed as `phone` so the
  // snake_case interceptor outputs `phone` (matches mobile app expectations).
  // Nullable because Firebase email/Google sign-in users have no phone number.
  @Column({ name: 'mobile_number', type: 'varchar', unique: true, nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.PARENT })
  role: UserRole;

  @Column({ nullable: true })
  schoolId: string;

  @Column({ nullable: true })
  busId: string;

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
}
