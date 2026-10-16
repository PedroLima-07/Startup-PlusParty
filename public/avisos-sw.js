// +party — service worker dos avisos.
//
// Só existe porque o Chrome do Android não deixa o site mostrar um aviso do
// sistema sozinho: precisa passar por um service worker. Ele não guarda nada
// em cache nem intercepta o carregamento das páginas; só cuida do toque no
// aviso, levando a pessoa para a tela certa do app.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const link = evento.notification.data?.link ?? '/cliente/notificacoes';

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
      const aba = abas.find((a) => new URL(a.url).pathname.startsWith('/cliente')) ?? abas[0];
      if (aba) {
        aba.postMessage({ tipo: 'abrir-link', link });
        return aba.focus();
      }
      return self.clients.openWindow(link);
    }),
  );
});
