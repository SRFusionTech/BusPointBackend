import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function transformKeys(value: any): any {
  if (Array.isArray(value)) {
    return value.map(transformKeys);
  }

  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.keys(value).reduce(
      (acc, key) => {
        acc[toSnakeCase(key)] = transformKeys(value[key]);
        return acc;
      },
      {} as Record<string, any>,
    );
  }

  return value;
}

@Injectable()
export class SnakeCaseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map(transformKeys));
  }
}
