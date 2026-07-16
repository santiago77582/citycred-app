export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, statusCode = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}
