export function createRequireSupabaseUser(supabaseAdmin) {
  return async function requireSupabaseUser(req, res, next) {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase server belum dikonfigurasi.' });
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.status(401).json({ error: 'Sesi login diperlukan.' });
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) return res.status(401).json({ error: 'Sesi login tidak valid atau kedaluwarsa.' });
      req.authUser = data.user;
      return next();
    } catch {
      return res.status(503).json({ error: 'Autentikasi belum tersedia.' });
    }
  };
}
