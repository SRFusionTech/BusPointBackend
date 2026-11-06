import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** GPS trail — append-only, one row per accepted point. */
@Entity('trip_locations')
@Index('IDX_trip_locations_trip_time', ['tripId', 'recordedAt'])
export class TripLocation {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'trip_id', type: 'uuid' })
  tripId!: string;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  /** m/s */
  @Column({ type: 'double precision', nullable: true, default: null })
  speed!: number | null;

  @Column({ type: 'double precision', nullable: true, default: null })
  heading!: number | null;

  @Column({ type: 'double precision', nullable: true, default: null })
  accuracy!: number | null;
}
