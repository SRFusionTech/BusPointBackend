import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { TripDirection } from './engine/direction';
import type { EngineState } from './engine/stop-engine';

export type TripStatus = 'in_progress' | 'completed';
export type TripEndReason = 'last_stop' | 'manual' | 'auto_timeout';
export type CheckInResponse = 'traffic' | 'waiting_student' | 'breakdown' | 'emergency';
export const CHECK_IN_RESPONSES: CheckInResponse[] = ['traffic', 'waiting_student', 'breakdown', 'emergency'];

/** One run of a bus along its route — the live trip AND, once ended, its history record. */
@Entity('trips')
// A bus can have only one running trip.
@Index('UQ_trips_active_bus', ['busId'], { unique: true, where: `"status" = 'in_progress'` })
@Index('IDX_trips_school_started', ['schoolId', 'startedAt'])
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'school_id', type: 'uuid' })
  schoolId!: string;

  @Index()
  @Column({ name: 'bus_id', type: 'uuid' })
  busId!: string;

  @Index()
  @Column({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  @Column({ name: 'route_id', type: 'uuid' })
  routeId!: string;

  /** Route name at the time of the trip (history stays readable if the route is renamed). */
  @Column({ name: 'route_name', type: 'varchar' })
  routeName!: string;

  @Column({ type: 'varchar', length: 8 })
  direction!: TripDirection;

  @Column({ type: 'varchar', length: 16, default: 'in_progress' })
  status!: TripStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true, default: null })
  endedAt!: Date | null;

  @Column({ name: 'end_reason', type: 'varchar', length: 16, nullable: true, default: null })
  endReason!: TripEndReason | null;

  /** Distance driven so far (m). */
  @Column({ name: 'distance_m', type: 'double precision', default: 0 })
  distanceM!: number;

  // ── Live position (last accepted GPS point) ────────────────────────────────
  @Column({ name: 'last_lat', type: 'double precision', nullable: true, default: null })
  lastLat!: number | null;

  @Column({ name: 'last_lng', type: 'double precision', nullable: true, default: null })
  lastLng!: number | null;

  @Column({ name: 'last_speed_kmh', type: 'double precision', nullable: true, default: null })
  lastSpeedKmh!: number | null;

  @Column({ name: 'last_heading', type: 'double precision', nullable: true, default: null })
  lastHeading!: number | null;

  @Column({ name: 'last_accuracy', type: 'double precision', nullable: true, default: null })
  lastAccuracy!: number | null;

  /** Time of the newest GPS point received — drives live / away / offline. */
  @Column({ name: 'last_ping_at', type: 'timestamptz', nullable: true, default: null })
  lastPingAt!: Date | null;

  // ── Alerts ─────────────────────────────────────────────────────────────────
  /** Set while no GPS has arrived for `offlineAfterSec`; cleared when points resume. */
  @Column({ name: 'gps_lost_at', type: 'timestamptz', nullable: true, default: null })
  gpsLostAt!: Date | null;

  /** Start of the current not-moving window (copied from engine state). */
  @Column({ name: 'stationary_since', type: 'timestamptz', nullable: true, default: null })
  stationarySince!: Date | null;

  /** Set when the not-moving alert fired for the current window. */
  @Column({ name: 'stationary_alert_at', type: 'timestamptz', nullable: true, default: null })
  stationaryAlertAt!: Date | null;

  /** Driver was asked "Bus stopped — everything OK?" for the current not-moving window. */
  @Column({ name: 'check_in_requested_at', type: 'timestamptz', nullable: true, default: null })
  checkInRequestedAt!: Date | null;

  @Column({ name: 'check_in_response', type: 'varchar', length: 24, nullable: true, default: null })
  checkInResponse!: CheckInResponse | null;

  @Column({ name: 'check_in_responded_at', type: 'timestamptz', nullable: true, default: null })
  checkInRespondedAt!: Date | null;

  /** Driver pressed SOS. */
  @Column({ name: 'sos_at', type: 'timestamptz', nullable: true, default: null })
  sosAt!: Date | null;

  @Column({ name: 'sos_note', type: 'varchar', nullable: true, default: null })
  sosNote!: string | null;

  /** School admin acknowledged the SOS. */
  @Column({ name: 'sos_ack_at', type: 'timestamptz', nullable: true, default: null })
  sosAckAt!: Date | null;

  /** School admin acknowledged the current not-moving / GPS-lost alerts. */
  @Column({ name: 'alerts_ack_at', type: 'timestamptz', nullable: true, default: null })
  alertsAckAt!: Date | null;

  /** Stop-engine state (consecutive-inside counters, distance ref, speed…), survives restarts. */
  @Column({ name: 'engine_state', type: 'jsonb', default: () => "'{}'::jsonb" })
  engineState!: EngineState;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
