// Déclenchée en cliquant sur le lien "Approuver" ou "Refuser" reçu par email.
// GET /.netlify/functions/approve-account?email=...&token=...&action=approve|reject
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendEmail(to, subject, text) {
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

function page(title, message, color) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:sans-serif;background:#12181A;color:#F3F5F1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;}
    .box{max-width:400px;} h1{color:${color};font-size:22px;} p{color:#8FA098;font-size:14px;line-height:1.5;}</style>
    </head><body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`,
  };
}

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const email = (params.email || '').trim().toLowerCase();
    const token = params.token || '';
    const action = params.action || '';

    if (!email || !token || !['approve', 'reject'].includes(action)) {
      return page('Lien invalide', 'Ce lien est incomplet ou mal formé.', '#D9603F');
    }

    const { data: row, error } = await supabase
      .from('activation_accounts')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !row) {
      return page('Compte introuvable', `Aucun compte ne correspond à ${email}.`, '#D9603F');
    }

    if (!row.approval_token || row.approval_token !== token) {
      return page('Lien déjà utilisé', 'Ce lien a déjà été utilisé ou n\'est plus valable.', '#D9603F');
    }

    if (action === 'reject') {
      await supabase.from('activation_accounts').update({ revoked: true, approval_token: null }).eq('email', email);
      await sendEmail(email, 'Inscription refusée — RSE Transport Patoo', `Bonjour ${row.first_name || ''},\n\nVotre inscription n'a pas été validée. Contactez Patoo pour plus d'informations.`);
      return page('Compte refusé', `Le compte de ${row.first_name} ${row.last_name} (${email}) a été refusé.`, '#D9603F');
    }

    // action === 'approve'
    const code = generateCode();
    const codeExpiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
    const accessExpiresAt = new Date(Date.now() + 365 * 24 * 3600000).toISOString();

    await supabase
      .from('activation_accounts')
      .update({ approved: true, approval_token: null, activation_code: code, code_expires_at: codeExpiresAt, access_expires_at: accessExpiresAt })
      .eq('email', email);

    await sendEmail(
      email,
      "Votre code d'activation — RSE Transport Patoo",
      `Bonjour ${row.first_name || ''},\n\nVotre inscription a été approuvée ! Votre code d'activation est : ${code}\n\nSaisissez-le dans l'application pour finaliser votre accès. Ce code est valable 24h.\n\nVotre accès est valable jusqu'au ${new Date(accessExpiresAt).toLocaleDateString('fr-FR')}.\n\nRSE Transport — Patoo`
    );

    return page('Compte approuvé ✓', `${row.first_name} ${row.last_name} (${email}) a reçu son code d'activation par email. Accès valable jusqu'au ${new Date(accessExpiresAt).toLocaleDateString('fr-FR')}.`, '#4F9C6E');
  } catch (err) {
    return page('Erreur', err.message, '#D9603F');
  }
};
