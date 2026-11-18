import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * One refresh token. Tokens rotate on every refresh; all tokens descended from one login share a
 * `familyId` — that family IS the device session (the phone / browser stays signed in while it lives).
 *
 * Rotation keeps the previous token (`replacedAt` / `replacedBy`) so a client that never received the
 * new token (lost response, timeout, two app contexts racing) can safely retry with the old one instead
 * of being logged out. See AuthService.refresh.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  // Join on user_id. Without @JoinColumn TypeORM used its own hidden "userId" column, which was never
  // filled — so every refresh found no user, answered "Account no longer exists" and logged users out
  // as soon as their 15-min access token expired.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  // SHA-256 of the raw token value — never store plaintext
  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /** Session (device) this token belongs to. Null only for tokens issued before sessions existed. */
  @Index('idx_refresh_tokens_family')
  @Column({ name: 'family_id', type: 'uuid', nullable: true })
  familyId!: string | null;

  /** The token issued when this one was last used to refresh. */
  @Index('idx_refresh_tokens_replaced_by')
  @Column({ name: 'replaced_by', type: 'uuid', nullable: true })
  replacedBy!: string | null;

  /** When this token was used to refresh (null = it is still the session's current token). */
  @Column({ name: 'replaced_at', type: 'timestamptz', nullable: true })
  replacedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
