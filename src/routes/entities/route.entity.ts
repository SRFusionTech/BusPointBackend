import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { School } from '../../schools/entities/school.entity';
import { RouteStop } from './route-stop.entity';

@Entity('routes')
export class Route {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column()
  schoolId: string;

  @Column()
  name: string;

  @Column({ type: 'float' })
  startLat: number;

  @Column({ type: 'float' })
  startLng: number;

  @Column({ nullable: true })
  startAddress: string;

  @Column({ nullable: true })
  notes: string;

  @OneToMany(() => RouteStop, (stop) => stop.route, { cascade: true })
  stops: RouteStop[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
