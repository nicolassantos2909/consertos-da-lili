/* =========================================================
   Consertos da Lili — sw.js (service worker)
   Deixa o app abrir mesmo com internet fraca.
   Estratégia: tenta a internet primeiro (para sempre pegar a
   versão nova) e, se falhar, usa a cópia guardada.
   Ao publicar uma mudança grande, aumente a VERSAO.
   ========================================================= */
const VERSAO = 'lili-v2';
const ARQUIVOS = [
  './', './index.html', './style.css', './app.js', './db.js',
  './firebase-config.js', './manifest.json', './icons/icon-192.png', './icons/icone.svg',
];
// Arquivos de fora que nunca mudam (fontes e SDK do Firebase com versão fixa)
const EXTERNOS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fontes e SDK: usa a cópia guardada se tiver
  if (EXTERNOS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      const copia = res.clone();
      caches.open(VERSAO).then((c) => c.put(req, copia));
      return res;
    })));
    return;
  }

  // Arquivos do próprio app: internet primeiro
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
    );
  }
});
