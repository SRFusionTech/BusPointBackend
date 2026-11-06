import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SchoolClass } from './school-class.entity';

/** A section within a class (e.g. "A"). Deleted with its class. */
@Entity('class_sections')
@Index(['classId', 'name'], { unique: true })
export class ClassSection {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'class_id', type: 'int' })
  classId!: number;

  @ManyToOne(() => SchoolClass, (c) => c.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  schoolClass!: SchoolClass;

  @Column({ type: 'varchar', length: 10 })
  name!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
