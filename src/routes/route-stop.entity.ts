import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Route } from './route.entity';

export type StopKind = 'school' | 'stop' | 'end';
export const LAST_STOP_NAME = 'Last Stop';

@Entity('route_stops')
export class RouteStop {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'route_id', type: 'uuid' })
  routeId!: string;

  @ManyToOne(() => Route, (route) => route.stops, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'route_id' })
  route!: Route;

  @Column()
  name!: string;

  /** 'school' = fixed start (order 0), 'end' = fixed "Last Stop", 'stop' = everything between. */
  @Column({ type: 'varchar', length: 16, default: 'stop' })
  kind!: StopKind;

  @Column({ type: 'varchar', nullable: true, default: null })
  address!: string | null;

  @Column({ type: 'float' })
  lat!: number;

  @Column({ type: 'float' })
  lng!: number;

  @Column({ name: 'stop_order' })
  stopOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
