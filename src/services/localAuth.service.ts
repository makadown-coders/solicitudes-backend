import * as argon2 from 'argon2';
import { randomUUID, randomBytes } from 'crypto';
import { PoolClient } from 'pg';
import { signAccessToken } from '../auth/jwt';
import { pool } from '../db/pool';

export interface AuthPoolClient {
  query: PoolClient['query'];
  release: (err?: boolean | Error) => void;
}

export interface AuthDbPool {
  query: typeof pool.query;
  connect: () => Promise<AuthPoolClient>;
}

export interface LocalAuthDeps {
  db?: AuthDbPool;
  signToken?: typeof signAccessToken;
}

export default class LocalAuthService {
  private readonly db: AuthDbPool;
  private readonly signToken: typeof signAccessToken;

  constructor(deps?: LocalAuthDeps) {
    this.db = deps?.db ?? pool;
    this.signToken = deps?.signToken ?? signAccessToken;
  }

  /**
   * Loguea un usuario con email y password.
   * @param {string} email - Email del usuario.
   * @param {string} password - Contraseña del usuario.
   * @returns {Promise<{access_token: string, refresh_token: string, user: {id: string, email: string, name: string, roles: {code: string, scope: string, id: string | null}[]}>}
   * @throws {Error} - Si el usuario no existe o las credenciales son inválidas.
   */
  async login(email: string, password: string) {
    const u = await this.db.query('SELECT id, email, password_hash, name FROM public.app_users WHERE email=$1', [email]);
    const user = u.rows[0];
    if (!user) throw new Error('Invalid credentials');
    const ok = await argon2.verify(user.password_hash, password);
    if (!ok) throw new Error('Invalid credentials');

    const { roles } = await this.getUserWithRoles(user.id);

    const access_token = await this.signToken({ sub: user.id, email: user.email, name: user.name, roles });

    // refresh opaco guardado con hash
    const jti = randomUUID();
    const raw = randomBytes(32).toString('base64url');
    const hashed = await argon2.hash(raw);
    const days = Number(process.env.REFRESH_TTL_DAYS || 14);
    await this.db.query(
      `INSERT INTO public.app_refresh_tokens(jti, user_id, hashed_token, user_agent, ip, expires_at)
       VALUES($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval)`,
      [jti, user.id, hashed, null, null, String(days)]
    );
    const refresh_token = `${jti}.${raw}`;
    return { access_token, refresh_token, user: { id: user.id, email: user.email, name: user.name, roles } };
  }

  /**
   * Refresca un token de acceso con un nuevo refresh token.
   * @param {string} refresh_token - JWT refresh token to invalidate
   * @returns {Promise<{access_token: string, refresh_token: string}>} - { access_token, refresh_token } if successful
   * @throws {Error} - if refresh_token is invalid, expired or already used
   */
  async refresh(refresh_token: string) {
    if (!refresh_token) throw new Error('refresh_token required');
    const [jti, raw] = refresh_token.split('.');
    if (!jti || !raw) throw new Error('invalid refresh');

    const client = await this.db.connect();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;

      // 1) Lee y bloquea el refresh viejo
      const recRes = await client.query(
        'SELECT * FROM public.app_refresh_tokens WHERE jti=$1 FOR UPDATE',
        [jti]
      );
      const rec = recRes.rows[0];
      if (!rec) throw new Error('invalid refresh');
      if (rec.revoked_at || (rec.expires_at && new Date(rec.expires_at) < new Date())) {
        throw new Error('expired refresh');
      }
      const ok = await argon2.verify(rec.hashed_token, raw);
      if (!ok) throw new Error('invalid refresh');

      // 2) Inserta PRIMERO el nuevo refresh
      const newJti = randomUUID();
      const newRaw = randomBytes(32).toString('base64url');
      const newHash = await argon2.hash(newRaw);
      const days = Number(process.env.REFRESH_TTL_DAYS || 14);

      await client.query(
        `INSERT INTO public.app_refresh_tokens
        (jti, user_id, hashed_token, user_agent, ip, expires_at)
       VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval)`,
        [newJti, rec.user_id, newHash, rec.user_agent, rec.ip, String(days)]
      );

      // 3) Ahora sí, marca el viejo como revocado y enlázalo al nuevo
      const upd = await client.query(
        'UPDATE public.app_refresh_tokens SET revoked_at=now(), replaced_by=$1 WHERE jti=$2 AND revoked_at IS NULL',
        [newJti, jti]
      );
      if (upd.rowCount !== 1) throw new Error('refresh already used');

      // 4) Obtiene usuario y roles con el mismo cliente dentro de la transacción
      const { user, roles } = await this.getUserWithRoles(rec.user_id, client);

      await client.query('COMMIT');
      inTransaction = false;

      // 5) Emite nuevo access **con roles**
      const access_token = await this.signToken({
        sub: user.id,
        email: user.email,
        name: user.name,
        roles, // 👈 vuelve a viajar en el JWT
      });

      return {
        access_token, refresh_token: `${newJti}.${newRaw}`,
        user: { id: user.id, email: user.email, name: user.name, roles }
      };
    } catch (e) {
      if (inTransaction) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Si falla el ROLLBACK, el cliente se libera de forma segura en finally
        }
        inTransaction = false;
      }
      throw e;
    } finally {
      client.release();
    }
  }


  /**
   * Devuelve el perfil de un usuario.
   * @param {string} user_id - Id del usuario.
   * @returns {Promise<{profile: {id: string, email: string, name: string, status: string}>}
   * @throws {Error} - Si el usuario no existe.
   */
  async me(user_id: string) {
    const { user, roles } = await this.getUserWithRoles(user_id);
    if (!user) throw new Error('not found');
    // TODO: puedes enriquecer con roles y scopes
    return {
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status, // si la columna existe en app_users
        roles,                // 👈 útil para el front
      }
    };
  }

  /**
   * Log out a user.
   * @param {string} refresh_token - JWT refresh token to invalidate
   * @returns {Promise<{ok: boolean}>} - { ok: true } if successful
   */
  async logout(refresh_token: string) {
    if (!refresh_token) return { ok: true };

    const [jti, raw] = refresh_token.split('.');
    if (!jti || !raw) return { ok: true };

    const client = await this.db.connect();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;

      // Find the refresh token and lock it
      const recRes = await client.query(
        'SELECT * FROM public.app_refresh_tokens WHERE jti=$1 FOR UPDATE',
        [jti]
      );
      if (!recRes.rowCount) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return { ok: true };
      }
      const rec = recRes.rows[0];

      // Verify the refresh token
      const ok = await argon2.verify(rec.hashed_token, raw);
      if (!ok) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return { ok: true };
      }

      // Invalidate the refresh token (idempotent if already revoked)
      await client.query(
        'UPDATE public.app_refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE jti=$1',
        [jti]
      );

      // Commit changes
      await client.query('COMMIT');
      inTransaction = false;

      return { ok: true };
    } catch (e) {
      // Rollback changes in case of an error
      if (inTransaction) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore rollback secondary error before releasing client
        }
        inTransaction = false;
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async logoutAll(user_id: string) {
    await this.db.query('UPDATE public.app_refresh_tokens SET revoked_at=now() WHERE user_id=$1', [user_id]);
    return { ok: true };
  }

  async getUserWithRoles(userId: string, queryable: Pick<AuthPoolClient, 'query'> = this.db) {
    const u = await queryable.query('SELECT id, email, name FROM public.app_users WHERE id=$1', [userId]);
    const user = u.rows[0];
    if (!user) throw new Error('user not found');

    const rolesRes = await queryable.query(
      `SELECT r.code, ur.scope_type, ur.scope_id
       FROM public.app_user_roles ur
       JOIN public.app_roles r ON r.id = ur.role_id
      WHERE ur.user_id=$1`,
      [user.id]
    );
    const roles = rolesRes.rows.map((r: any) => ({
      code: r.code,
      scope: r.scope_type,
      id: r.scope_id === '*' ? null : r.scope_id,
    }));

    return { user, roles };
  }
}
