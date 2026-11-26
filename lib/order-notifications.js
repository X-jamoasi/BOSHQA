export function notifyOrderUpdate(token) {
  if (token) void fetch('/api/telegram/notifications', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token },
  }).catch(() => {});
}
