// Valide le code à 6 chiffres reçu par email, et verrouille le compte sur
// l'appareil qui a fait l'inscription (pending_device_id).
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function notifyAdmin(subject, text) {
  if (!process.env.RESEND_API_KEY || !process.env.ADMIN_NOTIFY_EMAIL) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'RSE Transport <onboarding@resend.dev>',
        to: process.env.ADMIN_NOTIFY_EMAIL,
        subject,
        text,
      }),
    });
  } catch (e) {
    // silencieux
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ valid: false, error: 'Method Not Allowed' }) };
  }

  try {
    const { email, code, deviceId } = JSON.parse(event.body || '{}');
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanCode = (code || '').trim();

    if (!cleanEmail || !cleanCode || !deviceId) {
      return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'Code requis.' }) };
    }

    const { data: row, error } = await supabase
      .from('activation_accounts')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    if (error || !row) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Compte introuvable.' }) };
    }
    if (row.revoked) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Compte révoqué.' }) };
    }
    if (row.used) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Ce compte est déjà activé. Utilisez "Se connecter".' }) };
    }
    if (!row.approved || !row.activation_code) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Votre inscription est encore en attente de validation par Patoo. Réessayez une fois le code reçu par email.' }) };
    }
    if (row.access_expires_at && new Date(row.access_expires_at) < new Date()) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Votre accès (12€/365 jours) a expiré. Contactez Patoo pour le renouveler.' }) };
    }
    if (row.activation_code !== cleanCode) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code incorrect.' }) };
    }
    if (row.code_expires_at && new Date(row.code_expires_at) < new Date()) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Code expiré. Contactez Patoo pour un nouveau code.' }) };
    }

    await supabase
      .from('activation_accounts')
      .update({
        used: true,
        device_id: deviceId,
        activated_at: new Date().toISOString(),
        activation_code: null,
        code_expires_at: null,
        pending_device_id: null,
      })
      .eq('email', cleanEmail);

    await notifyAdmin(
      '✅ Compte activé — RSE Transport',
      `Compte activé : ${row.last_name || ''} ${row.first_name || ''} (${cleanEmail})\nTéléphone : ${row.phone || '—'}\nAppareil (id local) : ${deviceId}\nDate : ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`
    );

    return { statusCode: 200, body: JSON.stringify({ valid: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ valid: false, error: err.message }) };
  }
};
