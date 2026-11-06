import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * In-process "a trip changed" signal. Writers (service, monitor) emit; the realtime publisher
 * listens and pushes fresh snapshots. Keeps the service free of socket code (and avoids DI cycles).
 */
@Injectable()
export class TripChanges extends EventEmitter {
  changed(tripId: string) {
    this.emit('changed', tripId);
  }
}
