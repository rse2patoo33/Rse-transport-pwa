// Sauvegarde (upsert) le résumé d'une journée d'un chauffeur sur le serveur,
// pour ne pas dépendre uniquement du téléphone (changement d'appareil, app
// désinstallée...). Appelée par l'app à chaque changement d'état important.
// Conserve 366 jours par chauffeur côté serveur (consultation admin sur 1 an).
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const email = (body.email || '').trim().toLowerCase();
    const date = (body.date || '').trim();

    if (!email || !date) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'email et date requis' }) };
    }

    const { error } = await supabase.from('driver_days').upsert(
      {
        email: email,
        date: date,
        embauche: body.embauche || null,
        conduite_min: Math.round(body.conduiteMin || 0),
        travail_min: Math.round(body.travailMin || 0),
        pause_min: Math.round(body.pauseMin || 0),
        amplitude_min: Math.round(body.amplitudeMin || 0),
        service_used_min: Math.round(body.serviceUsedMin || 0),
        rep_type: body.repType || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email,date' }
    );
    if (error) throw error;

    // Nettoyage : ne garde que les 366 derniers jours pour ce chauffeur (côté serveur, pour l'admin).
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 366);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    await supabase.from('driver_days').delete().eq('email', email).lt('date', cutoffStr);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
