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

  /** Parent's assigned pickup point (route_stops.id). Required for a parent to log in. */
  @Index()
  @Column({ name: 'route_stop_id', type: 'uuid', nullable: true, default: null })
  routeStopId!: string | null;

  /** Parent's own subscription expiry, set by a school/both-managed school. Past date blocks login. */
  @Column({ name: 'subscription_expires_at', type: 'timestamptz', nullable: true, default: null })
  subscriptionExpiresAt!: Date | null;

  @Column({ name: 'full_name', type: 'varchar', nullable: true, default: null })
  fullName!: string | null;

  /** Parent only: the child who rides the bus. */
  @Column({ name: 'child_name', type: 'varchar', nullable: true, default: null })
  childName!: string | null;

  /** Parent only: child's class (school_classes.id). */
  @Index()
  @Column({ name: 'child_class_id', type: 'int', nullable: true, default: null })
  childClassId!: number | null;

  /** Parent only: child's section (class_sections.id); must belong to childClassId. */
  @Column({ name: 'child_section_id', type: 'int', nullable: true, default: null })
  childSectionId!: number | null;

  // Phone is the mobile-app login, so it's unique among drivers/parents only; admins' phones are contact info
  @Index({ unique: true, where: `"phone" IS NOT NULL AND "role" IN ('driver', 'parent')` })
  @Column({ type: 'varchar', nullable: true, default: null })
  phone!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
