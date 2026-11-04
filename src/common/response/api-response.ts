export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data: T;
  meta?: ResponseMeta;
}

export interface ResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export function successResponse<T>(
  data: T,
  message = 'Success',
  meta?: ResponseMeta,
): ApiResponse<T> {
  return { success: true, message, data, ...(meta && { meta }) };
}

export function errorResponse(
  message: string,
  data: null = null,
): ApiResponse<null> {
  return { success: false, message, data };
}
