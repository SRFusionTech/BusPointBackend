import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TripEventType =
  | 'started'
  | 'stop_reached'
  | 'stop_skipped'
  | 'gps_lost'
  | 'gps_restored'
  | 'stationary'
  | 'check_in_requested'
  | 'check_in'
  | 'sos'
  | 'alert_ack'
  | 'ended';

/** Timeline + audit: everything that happened on a trip. */
@Entity('trip_events')
@Index('IDX_trip_events_trip_at', ['tripId', 'at'])
export class TripEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'trip_id', type: 'uuid' })
  tripId!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: TripEventType;

  @Column({ type: 'timestamptz' })
  at!: Date;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;
}
