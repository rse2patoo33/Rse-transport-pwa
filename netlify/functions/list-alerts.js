// Liste les anomalies de sécurité (doublons d'inscription, échecs de connexion)
// pour l'admin. Protégée par ADMIN_SECRET.

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { adminSecret } = JSON.parse(event.body || '{}');
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'non autorisé' }) };
    }

    const { data, error } = await supabase
      .from('security_alerts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ alerts: data || [] }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
