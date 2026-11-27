import type { Request } from 'express';

export function actorAsignacion(user: Request['user']): string | null {
  for (const value of [user?.email, user?.name, user?.nombre, user?.sub]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
