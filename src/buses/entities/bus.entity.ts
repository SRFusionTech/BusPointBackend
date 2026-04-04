import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { School } from '../../schools/entities/school.entity';

export enum BusStatus {
  IDLE = 'idle',
  STARTED = 'started',
  AT_SCHOOL = 'at_school',
  RETURNING = 'returning',
  ENDED = 'ended',
  GPS_LOST = 'gps_lost',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
}

@Entity('buses')
export class Bus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column()
  schoolId: string;

  @Column({ unique: true })
  plateNumber: string;

  @Column()
  routeName: string;

  // Currently assigned driver (denormalized for fast lookup)
  @Column({ nullable: true })
  driverId: string;

  @Column({ type: 'enum', enum: BusStatus, default: BusStatus.IDLE })
  status: BusStatus;

  // Live GPS location
  @Column({ type: 'float', nullable: true })
  lastLat: number;

  @Column({ type: 'float', nullable: true })
  lastLng: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastUpdated: Date;

  @Column({ type: 'int', nullable: true })
  capacity: number;

  @Column({ nullable: true })
  make: string;

  @Column({ nullable: true })
  model: string;

  @Column({ type: 'int', nullable: true })
  year: number;

  @Column({ nullable: true })
  color: string;

  @Column({ nullable: true })
  notes: string;

  // Bus icon / logo assigned by admin
  @Column({ nullable: true })
  iconId: string;

  @Column({ nullable: true })
  iconUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
