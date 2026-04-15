import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { normalizeRequestBody } from '../utils/case-transform';

@Injectable()
export class NormalizeRequestBodyMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (req.body && typeof req.body === 'object') {
      req.body = normalizeRequestBody(req.body);
    }

    next();
  }
}
