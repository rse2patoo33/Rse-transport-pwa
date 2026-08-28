// Approuve ou refuse une inscription en attente via un lien cliqué depuis l'email admin.
// GET /.netlify/functions/approve-account?email=...&token=...&action=approve|reject
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function page(title, message, color) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
    <body style="font-family:sans-serif;background:#111;color:#fff;text-align:center;padding:60px 20px;">
      <h1 style="color:${color};">${title}</h1>
      <p style="font-size:18px;">${message}</p>
    </body></html>`,
  };
}

async function sendEmail(to, subject, text, html) {
  if (!process.env.RESEND_API_KEY || !to) return;
  try {
    const body = { from: process.env.RESEND_FROM || 'RSE Transport <onboarding@resend.dev>', to, subject, text };
    if (html) body.html = html;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // silencieux
  }
}

exports.handler = async (event) => {
  try {
    const { email, token, action } = event.queryStringParameters || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !token || !action) {
      return page('❌ Lien invalide', 'Paramètres manquants.', '#D9603F');
    }

    const { data: row, error } = await supabase
      .from('activation_accounts')
      .select('*')
      .eq('email', cleanEmail)
      .eq('approval_token', token)
      .maybeSingle();

    if (error || !row) {
      return page('❌ Lien invalide ou expiré', 'Ce lien a déjà été utilisé ou ne correspond à aucun compte.', '#D9603F');
    }

    if (row.approved) {
      return page('ℹ️ Déjà traité', 'Ce compte a déjà été approuvé précédemment.', '#4F9C6E');
    }

    if (action === 'reject') {
      await supabase.from('activation_accounts').delete().eq('email', cleanEmail);
      return page('❌ Inscription refusée', `L'inscription de ${row.first_name} ${row.last_name} a été refusée et supprimée.`, '#D9603F');
    }

    if (action === 'approve') {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h pour saisir le code
      const accessExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // essai gratuit 7 jours

      await supabase
        .from('activation_accounts')
        .update({
          approved: true,
          activation_code: code,
          code_expires_at: codeExpires,
          approval_token: null,
          access_expires_at: accessExpires,
          is_trial: true,
        })
        .eq('email', cleanEmail);

      await sendEmail(
        cleanEmail,
        '✅ Votre compte a été activé — RSE Transport Patoo',
        `Bonjour ${row.first_name},\n\nVotre inscription a été approuvée. Voici votre code d'activation à saisir dans l'application :\n\n${code}\n\nRSE Transport — Patoo`,
        `<p>Bonjour ${row.first_name},</p><p>Votre inscription a été approuvée. Voici votre code d'activation à saisir dans l'application :</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p><p>RSE Transport — Patoo</p>`
      );

      return page('✅ Compte approuvé', `Le compte de ${row.first_name} ${row.last_name} a été activé. Le code d'activation lui a été envoyé par email.`, '#4F9C6E');
    }

    return page('❌ Action inconnue', 'Action non reconnue.', '#D9603F');
  } catch (err) {
    return page('❌ Erreur serveur', err.message, '#D9603F');
  }
};
