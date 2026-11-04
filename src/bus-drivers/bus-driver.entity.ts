import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// At most one active assignment per driver and per bus — enforced by the DB, not just the service
@Entity('bus_drivers')
@Index('UQ_bus_drivers_active_driver', ['driverId'], { unique: true, where: '"is_active" = true' })
@Index('UQ_bus_drivers_active_bus', ['busId'], { unique: true, where: '"is_active" = true' })
export class BusDriver {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'bus_id', type: 'uuid' })
  busId!: string;

  @Index()
  @Column({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;
}
