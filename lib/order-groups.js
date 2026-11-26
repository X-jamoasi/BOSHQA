export function groupOrderLines(orders) {
  const groups = new Map();
  for (const order of orders) {
    const key = order.checkout_batch_id || order.order_number || order.id;
    const lines = groups.get(key) || [];
    lines.push(order);
    groups.set(key, lines);
  }
  return [...groups.values()];
}

export function groupOrderStatus(lines) {
  return ['pending', 'approved', 'shipped'].find(status => lines.some(line => line.status === status)) || lines[0].status;
}

export function groupOrderTotal(lines) {
  return lines.some(line => line.order_total == null) ? null :
    lines.reduce((sum, line) => sum + Math.round(Number(line.order_total) * 100), 0) / 100;
}
