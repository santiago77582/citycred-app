import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(error as Error);
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Datos inválidos.',
      detalles: error.issues.map((issue) => ({
        campo: issue.path.join('.') || '(raíz)',
        mensaje: issue.message
      }))
    });
    return;
  }

  if (error instanceof SyntaxError && 'status' in error) {
    res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.' });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.details ? { detalles: error.details } : {})
    });
    return;
  }

  logger.error({ err: error }, 'Error no controlado');
  res.status(500).json({ error: 'Error interno del servidor.' });
}
