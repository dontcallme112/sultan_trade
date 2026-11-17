export function tenderAuth(client) {
  return async (req, res, next) => {
    try {
      if (!client) return res.status(503).json({ error: 'Supabase не настроен' });
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return res.status(401).json({ error: 'Войдите в аккаунт' });
      const { data: { user }, error } = await client.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Сессия недействительна' });
      const { data: member, error: membershipError } = await client.from('ti_members').select('role').eq('user_id', user.id).maybeSingle();
      if (membershipError) throw membershipError;
      if (!member) return res.status(403).json({ error: 'Доступ к тендерам не предоставлен' });
      req.user = { id: user.id, role: member.role }; next();
    } catch { res.status(503).json({ error: 'Ошибка проверки доступа' }); }
  };
}
