import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { School } from '../../schools/entities/school.entity';
import { Role } from '../../roles/entities/role.entity';

@Entity('school_users')
@Unique(['userId', 'schoolId', 'roleId'])
export class SchoolUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column()
  schoolId: string;

  @ManyToOne(() => Role, { onDelete: 'SET NULL', nullable: true, eager: true })
  @JoinColumn({ name: 'roleId' })
  role: Role;

  @Column({ nullable: true })
  roleId: string;

  // For PARENT role: the bus their child is assigned to
  @Column({ nullable: true })
  busId: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
