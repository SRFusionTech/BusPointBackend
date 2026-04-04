import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Bus } from '../../buses/entities/bus.entity';
import { User } from '../../users/entities/user.entity';

@Entity('bus_drivers')
export class BusDriver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Bus, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'busId' })
  bus: Bus;

  @Column()
  busId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'driverId' })
  driver: User;

  @Column()
  driverId: string;

  // When the driver was assigned to this bus
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt: Date;

  // Null means currently active assignment
  @Column({ type: 'timestamptz', nullable: true })
  unassignedAt: Date;

  // Only one record should be active per bus at a time
  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
