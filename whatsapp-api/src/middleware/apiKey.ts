import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

function equalsSeguro(a: string, b: string): boolean {
  // Se comparan hashes de largo fijo para poder usar timingSafeEqual con entradas de distinto largo.
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header('x-api-key');
  if (!provided || !equalsSeguro(provided, config.API_KEY)) {
    res.status(401).json({ error: 'API key inválida o ausente.' });
    return;
  }
  next();
}
