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

const _useVarcharEnum = process.env.FIRESTORE === 'true';

const _useSqlite = process.env.FIRESTORE === 'true';

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

  @Column({ nullable: true })
  routeName: string;

  // Link to the structured Route entity (with stops). Nullable so legacy buses
  // keep working until an admin attaches a route through the wizard.
  @Column({ nullable: true })
  routeId: string;

  @Column({ nullable: true })
  returnRouteName: string;

  @Column({ nullable: true })
  returnRouteId: string;

  // Track the current active route for the trip
  @Column({ nullable: true })
  activeRouteId: string;

  // Track if the current/next trip is outbound or return
  @Column({ nullable: true, default: 'outbound' })
  activeDirection: string;

  // Currently assigned driver (denormalized for fast lookup)
  @Column({ nullable: true })
  driverId: string;

  @Column({ type: _useVarcharEnum ? 'varchar' : 'enum', enum: BusStatus, default: BusStatus.IDLE })
  status: BusStatus;

  // Live GPS location
  @Column({ type: 'float', nullable: true })
  lastLat: number;

  @Column({ type: 'float', nullable: true })
  lastLng: number;

  @Column({ type: _useSqlite ? 'datetime' : 'timestamptz', nullable: true })
  lastUpdated: Date;

  /** Stop ids reached on the current trip leg (persisted across app/server restarts). */
  @Column({ type: 'simple-json', nullable: true })
  reachedStopIds: string[] | null;

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
