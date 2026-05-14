import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum IconCategory {
  STANDARD = 'standard',
  FESTIVE = 'festive',
  SPORT = 'sport',
  CUSTOM = 'custom',
}

const _useVarcharEnum = process.env.FIRESTORE === 'true';

@Entity('bus_icons')
export class BusIcon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // Publicly accessible URL (S3, CDN, or local upload path)
  @Column()
  url: string;

  @Column({ type: _useVarcharEnum ? 'varchar' : 'enum', enum: IconCategory, default: IconCategory.STANDARD })
  category: IconCategory;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
