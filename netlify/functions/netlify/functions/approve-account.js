// Approuve un compte en attente : suite au clic "Approuver" dans l'email admin.
// Génère un code d'activation à 6 chiffres, l'envoie au chauffeur, et fixe l'essai gratuit de 7 jours.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function sendEmail(to, subject, text, html) {
  if (!process.env.RESEND_API_KEY || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'RSE Transport <onboarding@resend.dev>',
        to,
        subject,
        text,
        html,
      }),
    });
  } catch (e) {
    // Envoi silencieux : une notification ratée ne doit jamais bloquer l'approbation
  }
}

exports.handler = async (event) => {
  try {
    const email = event.queryStringParameters && event.queryStringParameters.email;
    const token = event.queryStringParameters && event.queryStringParameters.token;
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !token) {
      return { statusCode: 400, body: 'Lien invalide.' };
    }

    const { data: row, error } = await supabase
      .from('activation_accounts')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    if (error || !row) {
      return { statusCode: 404, body: 'Compte introuvable.' };
    }
    if (row.approved) {
      return { statusCode: 200, body: 'Ce compte a déjà été approuvé.' };
    }
    if (row.approval_token !== token) {
      return { statusCode: 403, body: 'Lien invalide ou expiré.' };
    }

    const activationCode = crypto.randomInt(100000, 999999).toString();
    const codeExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h pour saisir le code
    const accessExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // essai gratuit 7 jours

    const { error: updateError } = await supabase
      .from('activation_accounts')
      .update({
        approved: true,
        activation_code: activationCode,
        code_expires_at: codeExpiresAt.toISOString(),
        access_expires_at: accessExpiresAt.toISOString(),
        is_trial: true,
      })
      .eq('email', cleanEmail);

    if (updateError) {
      return { statusCode: 500, body: 'Erreur lors de l\'approbation : ' + updateError.message };
    }

    await sendEmail(
      cleanEmail,
      'Votre compte RSE de Patoo est activé',
      `Bonjour ${row.first_name || ''},\n\nVotre compte a été approuvé. Voici votre code d'activation à saisir dans l'application : ${activationCode}\n\nCe code expire dans 48h.\n\nVous bénéficiez de 7 jours d'essai gratuit.`,
      `<p>Bonjour ${row.first_name || ''},</p><p>Votre compte a été approuvé. Voici votre code d'activation à saisir dans l'application :</p><p style="font-size:24px;font-weight:bold;">${activationCode}</p><p>Ce code expire dans 48h.</p><p>Vous bénéficiez de <b>7 jours d'essai gratuit</b>.</p>`
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<p>Compte de ${row.first_name || cleanEmail} approuvé. Le code d'activation vient de lui être envoyé par email (essai gratuit de 7 jours).</p>`,
    };
  } catch (err) {
    return { statusCode: 500, body: 'Erreur serveur : ' + err.message };
  }
};
