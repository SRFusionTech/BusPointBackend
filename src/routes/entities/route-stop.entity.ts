import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Route } from './route.entity';

@Entity('route_stops')
export class RouteStop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Route, (route) => route.stops, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routeId' })
  route: Route;

  @Column()
  routeId: string;

  @Column()
  name: string;

  @Column({ type: 'float' })
  lat: number;

  @Column({ type: 'float' })
  lng: number;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'int' })
  stopOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
