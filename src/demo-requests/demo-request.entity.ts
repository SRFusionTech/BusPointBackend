import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum DemoRequestStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  DEMO_SCHEDULED = 'demo_scheduled',
  WON = 'won',
  LOST = 'lost',
}

export const SCHOOL_TYPES = ['ib', 'cambridge', 'american', 'national', 'other'] as const;
export type SchoolType = (typeof SCHOOL_TYPES)[number];

export const STUDENT_RANGES = ['under_500', '500_1000', '1000_2500', 'over_2500'] as const;
export const BUS_RANGES = ['1_5', '6_15', '16_40', 'over_40'] as const;
export const CONTACT_METHODS = ['email', 'phone', 'whatsapp'] as const;
export const TIME_WINDOWS = ['morning', 'afternoon', 'evening', 'any'] as const;

/** A "Request a demo" submission from the marketing site. Managed by super admins. */
@Entity('demo_requests')
@Index(['status', 'createdAt'])
export class DemoRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // ── School ──────────────────────────────────────────────────────────────────
  @Column({ name: 'school_name', type: 'varchar', length: 160 })
  schoolName!: string;

  @Column({ type: 'varchar', length: 120 })
  city!: string;

  @Column({ type: 'varchar', length: 120 })
  country!: string;

  @Column({ name: 'school_type', type: 'varchar', length: 32, nullable: true, default: null })
  schoolType!: SchoolType | null;

  @Column({ name: 'student_range', type: 'varchar', length: 32, nullable: true, default: null })
  studentRange!: string | null;

  @Column({ name: 'bus_range', type: 'varchar', length: 32, nullable: true, default: null })
  busRange!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  website!: string | null;

  // ── Contact ─────────────────────────────────────────────────────────────────
  @Column({ name: 'contact_name', type: 'varchar', length: 120 })
  contactName!: string;

  @Column({ name: 'contact_role', type: 'varchar', length: 120 })
  contactRole!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  /** E.164, e.g. +971501234567. */
  @Column({ type: 'varchar', length: 32 })
  phone!: string;

  @Column({ name: 'preferred_contact', type: 'varchar', length: 16, nullable: true, default: null })
  preferredContact!: string | null;

  @Column({ name: 'preferred_time', type: 'varchar', length: 16, nullable: true, default: null })
  preferredTime!: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  message!: string | null;

  // ── Pipeline (super admin) ──────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 24, default: DemoRequestStatus.NEW })
  status!: DemoRequestStatus;

  @Column({ type: 'text', nullable: true, default: null })
  notes!: string | null;

  @Column({ name: 'assigned_to', type: 'varchar', length: 120, nullable: true, default: null })
  assignedTo!: string | null;

  // ── Attribution / audit ─────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  source!: string | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  utm!: Record<string, string> | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 400, nullable: true, default: null })
  userAgent!: string | null;

  @Column({ name: 'consent_at', type: 'timestamptz' })
  consentAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
