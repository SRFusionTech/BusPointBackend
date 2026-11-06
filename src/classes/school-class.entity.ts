import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { ClassSection } from './class-section.entity';

/**
 * A class/grade in a school (e.g. "LKG", "5"). Master data for the parent form's
 * child-class dropdown. Integer ids: a school has a handful of these and every
 * query is scoped by school_id, so UUIDs buy nothing here.
 */
@Entity('school_classes')
@Index(['schoolId', 'name'], { unique: true })
export class SchoolClass {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @Column({ type: 'varchar', length: 30 })
  name!: string;

  /** Display order in lists and dropdowns (0-based). */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @OneToMany(() => ClassSection, (section) => section.schoolClass, { cascade: true })
  sections!: ClassSection[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
