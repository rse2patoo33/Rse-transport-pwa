// Active un compte (email + mot de passe) pour un appareil donné.
// - Compte inconnu, mot de passe faux, ou révoqué -> refusé
// - Jamais activé -> verrouillé sur cet appareil (premier arrivé)
// - Déjà activé sur CE MÊME appareil -> accepté (réouverture normale de l'app)
// - Déjà activé sur un AUTRE appareil -> refusé
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

// Envoie un email à l'admin via Resend (resend.com). N'interrompt jamais
// l'activation si l'envoi échoue : c'est une notification, pas un blocage.
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
    // silencieux : une notification ratée ne doit jamais bloquer un chauffeur
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ valid: false, error: 'Method Not Allowed' }) };
  }

  try {
    const { email, password, deviceId } = JSON.parse(event.body || '{}');
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !password || !deviceId) {
      return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'email, mot de passe et appareil requis' }) };
    }

    const { data: row, error } = await supabase
      .from('activation_accounts')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    if (error || !row) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'identifiants incorrects' }) };
    }

    if (row.revoked) {
  return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Compte révoqué. Contactez rse2patoo@gmail.com pour plus d\'informations.' }) };
}
    if (!verifyPassword(password, row.password_hash)) {
  try {
    await supabase.from('security_alerts').insert({
      type: 'echec_connexion',
      email: cleanEmail,
      device_id: deviceId,
      detail: 'Mot de passe incorrect'
    });
  } catch (e) {}
  return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Identifiants incorrects' }) };
}

    if (row.access_expires_at && new Date(row.access_expires_at) < new Date()) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Votre accès (25€/365 jours) a expiré. Contactez Patoo pour le renouveler.' }) };
    }

    if (!row.used) {
      await supabase
        .from('activation_accounts')
        .update({ used: true, device_id: deviceId, activated_at: new Date().toISOString() })
        .eq('email', cleanEmail);
      await notifyAdmin(
        '✅ Nouvelle activation — RSE Transport',
        `Compte activé : ${row.last_name || ''} ${row.first_name || ''} (${cleanEmail})\nTéléphone : ${row.phone || '—'}\nAppareil (id local) : ${deviceId}\nDate : ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`
      );
      return { statusCode: 200, body: JSON.stringify({ valid: true, firstActivation: true, access_expires_at: row.access_expires_at, is_trial: row.is_trial }) };

    if (row.device_id === deviceId) {
      return { statusCode: 200, body: JSON.stringify({ valid: true, firstActivation: false, access_expires_at: row.access_expires_at, is_trial: row.is_trial }) };

    await notifyAdmin(
      '⚠️ Tentative sur un autre appareil — RSE Transport',
      `Compte : ${row.last_name || ''} ${row.first_name || ''} (${cleanEmail})\nTéléphone : ${row.phone || '—'}\nAppareil déjà enregistré : ${row.device_id}\nNouvel appareil refusé : ${deviceId}\nDate : ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`
    );
      try {
  await supabase.from('security_alerts').insert({
    type: 'echec_connexion',
    email: cleanEmail,
    device_id: deviceId,
    detail: 'Tentative de connexion depuis un appareil différent de celui enregistré'
  });
} catch (e) {}
    return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'compte déjà activé sur un autre appareil' }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ valid: false, error: err.message }) };
  }
};
