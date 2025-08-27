import { supabase, supabaseAdmin } from '../auth/supabase';

class AuthService {
  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      user: data.user,
    };
  }

  async refresh(refresh_token: string) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error) throw new Error(error.message);
    return {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      user: data.user,
    };
  }

  /**
   * Devuelve profile (y persona si está enlazada).
   * Si tienes SUPABASE_SERVICE_ROLE_KEY, usa supabaseAdmin para leer directo.
   * Si prefieres respetar RLS del usuario, podrías usar PostgREST con el accessToken de req.
   */
  async me(authUserId: string) {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured on server');
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, avatar_url, oficina, persona_id, provider, mfa_enabled, last_login')
      .eq('id', authUserId)
      .single();

    if (error) throw new Error(error.message);

    let persona: any = null;
    if (profile?.persona_id) {
      const { data: p, error: e2 } = await supabaseAdmin
        .from('persona')
        .select('id, nombre_completo, nombres, apellidos, correo_principal, rfc, curp, username')
        .eq('id', profile.persona_id)
        .single();
      if (!e2) persona = p;
    }

    return { profile, persona };
  }
}

export default AuthService;