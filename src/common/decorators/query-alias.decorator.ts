import { createParamDecorator, ExecutionContext } from '@nestjs/common';

function pickQueryValue(query: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = query[alias];
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0];
  }
  return undefined;
}

export const QueryAlias = (...aliases: string[]) =>
  createParamDecorator((_: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{ query: Record<string, unknown> }>();
    return pickQueryValue(request.query ?? {}, aliases);
  })();
