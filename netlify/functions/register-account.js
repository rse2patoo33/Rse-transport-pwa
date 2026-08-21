// Le chauffeur crée son compte (nom, prénom, téléphone, email, mot de passe).
// Le compte reste EN ATTENTE : un email est envoyé à l'admin avec un lien pour
// approuver ou refuser. Ce n'est qu'après approbation qu'un code à 6 chiffres
// est généré et envoyé au chauffeur (voir approve-account.js).
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ valid: false, error: 'Method Not Allowed' }) };
  }

  try {
    const { firstName, lastName, phone, email, password, deviceId } = JSON.parse(event.body || '{}');

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanFirst = (firstName || '').trim();
    const cleanLast = (lastName || '').trim();
    const cleanPhone = (phone || '').trim();

    if (!cleanEmail || !password || !deviceId || !cleanFirst || !cleanLast || !cleanPhone) {
      return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'Tous les champs sont obligatoires (nom, prénom, téléphone, email, mot de passe).' }) };
    }
    if (password.length < 6) {
      return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'Le mot de passe doit faire au moins 6 caractères.' }) };
    }
    if ((cleanPhone.match(/\d/g) || []).length < 8) {
      return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'Numéro de téléphone invalide.' }) };
    }

    const { data: existing } = await supabase
      .from('activation_accounts')
      .select('email')
      .eq('email', cleanEmail)
      .single();

    if (existing) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Cet email a déjà un compte. Utilisez plutôt "Se connecter".' }) };
    }

    const approvalToken = crypto.randomBytes(24).toString('hex');

    const { error } = await supabase.from('activation_accounts').insert({
      email: cleanEmail,
      password_hash: hashPassword(password),
      first_name: cleanFirst,
      last_name: cleanLast,
      phone: cleanPhone,
      used: false,
      approved: false,
      revoked: false,
      device_id: null,
      pending_device_id: deviceId,
      approval_token: approvalToken,
    });
    if (error) throw error;

    const base = process.env.URL || '';
    const approveUrl = `${base}/.netlify/functions/approve-account?email=${encodeURIComponent(cleanEmail)}&token=${approvalToken}&action=approve`;
    const rejectUrl = `${base}/.netlify/functions/approve-account?email=${encodeURIComponent(cleanEmail)}&token=${approvalToken}&action=reject`;

    await sendEmail(
      process.env.ADMIN_NOTIFY_EMAIL,
      '🆕 Nouvelle inscription à valider — RSE Transport',
      `Nouveau chauffeur en attente de validation :\n\nNom : ${cleanLast}\nPrénom : ${cleanFirst}\nTéléphone : ${cleanPhone}\nEmail : ${cleanEmail}\nDate : ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}\n\n⚠️ Vérifiez la réception du virement de 12€ (référence attendue : ${cleanLast} ${cleanFirst}) avant d'approuver.\n\nApprouver : ${approveUrl}\nRefuser : ${rejectUrl}`,
      `<p>Nouveau chauffeur en attente de validation :</p>
       <p><b>⚠️ Vérifiez la réception du virement de 12€ (référence attendue : ${cleanLast} ${cleanFirst}) avant d'approuver.</b></p>
       <p><b>Nom :</b> ${cleanLast}<br><b>Prénom :</b> ${cleanFirst}<br><b>Téléphone :</b> ${cleanPhone}<br><b>Email :</b> ${cleanEmail}</p>
       <p>
         <a href="${approveUrl}" style="background:#4F9C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;">✅ Approuver</a>
         &nbsp;&nbsp;
         <a href="${rejectUrl}" style="background:#D9603F;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;">❌ Refuser</a>
       </p>`
    );

    await sendEmail(
      cleanEmail,
      'Inscription reçue — RSE Transport Patoo',
      `Bonjour ${cleanFirst},\n\nVotre inscription a bien été reçue et est en cours de validation par Patoo. Vous recevrez un code d'activation par email dès qu'elle sera approuvée.\n\nRSE Transport — Patoo`
    );

    return { statusCode: 200, body: JSON.stringify({ valid: true, pendingApproval: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ valid: false, error: err.message }) };
  }
};
