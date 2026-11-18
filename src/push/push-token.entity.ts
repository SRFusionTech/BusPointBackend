import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A device that receives pushes (FCM registration token). One token = one user. */
@Entity('push_tokens')
export class PushToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_push_tokens_user')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text', unique: true })
  token!: string;

  @Column({ type: 'varchar', length: 16, default: 'fcm' })
  provider!: string;

  @Column({ type: 'varchar', length: 16, nullable: true, default: null })
  platform!: string | null;

  @Column({ name: 'app_version', type: 'varchar', length: 32, nullable: true, default: null })
  appVersion!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt!: Date;
}
