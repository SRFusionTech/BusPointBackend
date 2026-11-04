import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { SchoolSettings } from './school-settings';

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

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  /** Sparse overrides only — read through resolveSchoolSettings() for defaults. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings!: Partial<SchoolSettings>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
