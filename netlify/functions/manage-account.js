// Révoque un compte (bloque tout accès), le "déverrouille" pour permettre une
// nouvelle activation sur un autre appareil (ex. chauffeur qui change de
// téléphone), ou renouvelle son accès de 365 jours (ex. nouveau virement reçu).
// Protégée par ADMIN_SECRET.
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function notifyEmail(to, subject, text) {
  if (!process.env.RESEND_API_KEY || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.RESEND_FROM || 'RSE Transport <onboarding@resend.dev>', to, subject, text }),
    });
  } catch (e) {
    // silencieux
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { adminSecret, email, action } = JSON.parse(event.body || '{}');
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'non autorisé' }) };
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const validActions = ['revoke', 'unrevoke', 'reset-device', 'renew', 'delete'];
    if (!cleanEmail || !validActions.includes(action)) {
      return { statusCode: 400, body: JSON.stringify({ error: `email et action (${validActions.join(' | ')}) requis` }) };
    }

    if (action === 'delete') {
      // Droit à l'effacement (RGPD) : suppression définitive du compte et de son historique.
      await supabase.from('driver_days').delete().eq('email', cleanEmail);
      const { error: delError } = await supabase.from('activation_accounts').delete().eq('email', cleanEmail);
      if (delError) throw delError;
      return { statusCode: 200, body: JSON.stringify({ ok: true, email: cleanEmail, action }) };
    }

    let update = {};
    let newExpiry = null;
    if (action === 'revoke') update = { revoked: true };
    if (action === 'unrevoke') update = { revoked: false };
    if (action === 'reset-device') update = { used: false, device_id: null, activated_at: null };
    if (action === 'renew') {
      newExpiry = new Date(Date.now() + 365 * 24 * 3600000).toISOString();
      update = { access_expires_at: newExpiry, revoked: false };
    }

    const { error } = await supabase.from('activation_accounts').update(update).eq('email', cleanEmail);
    if (error) throw error;

    if (action === 'renew') {
      await notifyEmail(
        cleanEmail,
        'Accès renouvelé — RSE Transport Patoo',
        `Bonjour,\n\nVotre accès a été renouvelé pour 365 jours, jusqu'au ${new Date(newExpiry).toLocaleDateString('fr-FR')}.\n\nRSE Transport — Patoo`
      );
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, email: cleanEmail, action, accessExpiresAt: newExpiry }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
