self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data?.type !== "MUSE_NOTIFY") return;
  const { title, body, tag } = event.data;
  event.waitUntil(self.registration.showNotification(title || "Muse Closet", {
    body: body || "你的穿搭提醒已准备好。",
    tag: tag || "muse-reminder",
    icon: "/og.png",
    badge: "/og.png",
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => "focus" in client);
    return existing ? existing.focus() : self.clients.openWindow("/");
  }));
});
