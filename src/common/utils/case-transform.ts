export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function toCamelCaseKey(key: string): string {
  return key.replace(/[_-](\w)/g, (_, char: string) => char.toUpperCase());
}

export function transformKeysDeep<T>(value: T, keyTransformer: (key: string) => string): T {
  if (Array.isArray(value)) {
    return value.map((item) => transformKeysDeep(item, keyTransformer)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.entries(value).reduce((acc, [key, item]) => {
    acc[keyTransformer(key)] = transformKeysDeep(item, keyTransformer);
    return acc;
  }, {} as Record<string, unknown>) as T;
}

export function normalizeRequestBody<T>(value: T): T {
  return transformKeysDeep(value, toCamelCaseKey);
}
