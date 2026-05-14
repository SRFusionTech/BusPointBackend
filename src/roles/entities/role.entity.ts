import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RoleName {
  SCHOOL_ADMIN = 'SCHOOL_ADMIN',
  DRIVER = 'DRIVER',
  PARENT = 'PARENT',
}

const _useVarcharEnum = process.env.FIRESTORE === 'true';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: _useVarcharEnum ? 'varchar' : 'enum', enum: RoleName, unique: true })
  name: RoleName;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
