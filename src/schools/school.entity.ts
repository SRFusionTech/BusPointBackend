import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { SchoolSettings } from './school-settings';
import type { Plan } from '../plans/plan.entity';

@Entity('schools')
export class School {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', nullable: true, default: null, name: 'logo_url' })
  logoUrl!: string | null;

  @Column({ type: 'varchar' })
  address!: string;

  /** School gate location — the fixed first stop of every route. */
  @Column({ type: 'double precision', nullable: true, default: null })
  lat!: number | null;

  @Column({ type: 'double precision', nullable: true, default: null })
  lng!: number | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  /** Which plan this school is on. null = unassigned (treated as the default plan). */
  @Column({ type: 'uuid', nullable: true, default: null, name: 'plan_id' })
  planId!: string | null;

  @ManyToOne('Plan', { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan | null;

  /**
   * Platform-level kill switch. null = no expiry (always active).
   * When set and in the past, all logins for this school's users are blocked.
   */
  @Column({ type: 'timestamptz', nullable: true, default: null, name: 'plan_expires_at' })
  planExpiresAt!: Date | null;

  /** Sparse overrides only — read through resolveSchoolSettings() for defaults. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings!: Partial<SchoolSettings>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
