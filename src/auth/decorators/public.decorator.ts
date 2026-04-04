import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Mark a route as publicly accessible — skips JWT auth guard */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
