// Renvoie l'historique récent d'un chauffeur (par défaut 30 jours, max 366).
// Utilisée pour restaurer les données sur un nouvel appareil après un
// changement de téléphone, et par le panneau admin pour consulter un chauffeur
// sur une période plus longue (jusqu'à 1 an).
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const email = (params.email || '').trim().toLowerCase();
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'email requis' }) };
    }
    const days = Math.min(Number(params.days) || 30, 366);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('driver_days')
      .select('*')
      .eq('email', email)
      .gte('date', cutoffStr)
      .order('date', { ascending: true });
    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ ok: true, days: data || [] }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
