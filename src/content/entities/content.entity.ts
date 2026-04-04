import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum EntityType {
  USER = 'USER',
  SCHOOL = 'SCHOOL',
  BUS = 'BUS',
  DRIVER = 'DRIVER',
  ROUTE = 'ROUTE',
}

export enum ContentType {
  PROFILE_PICTURE = 'PROFILE_PICTURE',
  COVER_PHOTO = 'COVER_PHOTO',
  PHOTO = 'PHOTO',
  DOCUMENT = 'DOCUMENT',
  VIDEO = 'VIDEO',
}

@Entity('content')
@Index(['entityType', 'entityId'])
@Index(['entityType', 'entityId', 'contentType'])
export class Content {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // What kind of entity owns this file
  @Column({ type: 'enum', enum: EntityType })
  entityType: EntityType;

  // The UUID of the owning entity (user id, school id, bus id, etc.)
  @Column()
  entityId: string;

  // What kind of content this is
  @Column({ type: 'enum', enum: ContentType })
  contentType: ContentType;

  // Publicly accessible URL (e.g. S3, Firebase Storage, Cloudinary)
  @Column()
  url: string;

  @Column({ nullable: true })
  fileName: string;

  @Column({ nullable: true })
  mimeType: string;

  // Size in bytes
  @Column({ type: 'bigint', nullable: true })
  fileSize: number;

  // Any extra info: dimensions, duration, storage key, CDN path, etc.
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
