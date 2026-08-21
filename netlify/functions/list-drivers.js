// Liste tous les chauffeurs et leur statut. Protégée par ADMIN_SECRET.
// Utilisée par admin.html pour afficher le tableau de gestion.
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
      .from('activation_accounts')
      .select('email, first_name, last_name, phone, used, approved, revoked, device_id, activated_at, access_expires_at, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ drivers: data || [] }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
