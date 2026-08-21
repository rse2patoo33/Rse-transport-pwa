// Crée un compte (email + mot de passe). Protégée par ADMIN_SECRET — à appeler
// uniquement par vous (ex. avec un outil comme Postman, ou curl), jamais depuis l'app.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function randomPassword() {
  return crypto.randomBytes(6).toString('hex'); // 12 caractères
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { adminSecret, email, password, note } = JSON.parse(event.body || '{}');
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'non autorisé' }) };
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return { statusCode: 400, body: JSON.stringify({ error: 'email requis' }) };
    }

    const plainPassword = password || randomPassword();

    const { error } = await supabase.from('activation_accounts').insert({
      email: cleanEmail,
      password_hash: hashPassword(plainPassword),
      used: false,
      revoked: false,
      note: note || null,
    });
    if (error) throw error;

    // Le mot de passe en clair n'est renvoyé qu'une seule fois ici, à noter
    // immédiatement — il n'est jamais stocké en clair côté serveur.
    return { statusCode: 200, body: JSON.stringify({ email: cleanEmail, password: plainPassword }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
