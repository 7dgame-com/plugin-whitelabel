export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, 'VALIDATION_ERROR', message, details);
}

export function unprocessable(message: string, details?: unknown): AppError {
  return new AppError(422, 'VALIDATION_ERROR', message, details);
}

export function unauthorized(message = 'Authentication is required'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'This account cannot manage white-label configurations'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'White-label configuration not found');
}

export function revisionConflict(currentRevision: number): AppError {
  return new AppError(
    409,
    'REVISION_CONFLICT',
    'The configuration was changed by another request',
    { currentRevision },
  );
}

export function conflict(code: string, message: string): AppError {
  return new AppError(409, code, message);
}

export function upstreamFailure(): AppError {
  return new AppError(502, 'AUTH_UPSTREAM_ERROR', 'Unable to verify the main-platform session');
}

export function domainCatalogUnavailable(): AppError {
  return new AppError(
    503,
    'DOMAIN_CATALOG_UNAVAILABLE',
    'The main-frontend domain import catalog is unavailable',
  );
}
