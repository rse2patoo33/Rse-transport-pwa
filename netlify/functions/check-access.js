self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne jamais mettre en cache les appels serveur (vérification d'accès,
  // sync, activation...) : toujours réseau, jamais de réponse mise en cache.
  if (url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ... ta stratégie de cache existante pour le reste (assets statiques) en dessous
});
