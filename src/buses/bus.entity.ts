import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('buses')
export class Bus {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @Column()
  name!: string;

  @Index({ unique: true })
  @Column({ name: 'plate_number', unique: true })
  plateNumber!: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  make!: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  model!: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  capacity!: number | null;

  @Column({ name: 'route_id', type: 'uuid', nullable: true, default: null })
  routeId!: string | null;

  @Column({ name: 'return_route_id', type: 'uuid', nullable: true, default: null })
  returnRouteId!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
