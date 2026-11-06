import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { StopKind } from './engine/direction';
import type { EngineStopStatus } from './engine/stop-engine';

/** Copy of a route stop taken when the trip starts, in TRIP order (seq 0 = where it started). */
@Entity('trip_stops')
@Index('IDX_trip_stops_trip_seq', ['tripId', 'seq'])
export class TripStop {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'trip_id', type: 'uuid' })
  tripId!: string;

  /** Original route stop (links parents → students). Null if the route stop was deleted later. */
  @Index()
  @Column({ name: 'route_stop_id', type: 'uuid', nullable: true, default: null })
  routeStopId!: string | null;

  @Column({ type: 'int' })
  seq!: number;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  address!: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind!: StopKind;

  @Column({ type: 'double precision' })
  lat!: number;

  @Column({ type: 'double precision' })
  lng!: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: EngineStopStatus;

  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true, default: null })
  arrivedAt!: Date | null;

  /** Live ETA while pending. */
  @Column({ name: 'eta_at', type: 'timestamptz', nullable: true, default: null })
  etaAt!: Date | null;

  /** Live road distance from the bus while pending (m). */
  @Column({ name: 'distance_m', type: 'double precision', nullable: true, default: null })
  distanceM!: number | null;
}
