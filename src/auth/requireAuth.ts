// src/auth/requireAuth.ts
import type { RequestHandler } from 'express';
import * as jose from 'jose';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const JWKS = jose.createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/keys`));

declare global {
  namespace Express {
    interface UserClaims {
      sub: string; // auth user id (uuid)
      email?: string;
      role?: string;
      [k: string]: unknown;
    }
    interface Request {
      user?: UserClaims;
      accessToken?: string;
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const hdr = req.get('authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : undefined;

  if (!token) { 
    res.status(401).json({ error: 'Missing Bearer token' }); 
    return;
  }

  try {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      // audience: 'authenticated', // opcional si quieres checar el 'aud'
    });
    req.user = payload as any;
    req.accessToken = token;
    next();
  } catch (e: any) {
    res.status(401).json({ error: 'Invalid/expired token', detail: e.message });
  }
};
