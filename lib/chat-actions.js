const numberPattern = /^BQ-([0-9]{1,12})$/i;
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function parseChatAction(text) {
  const command = text.trim().match(/^\/amal\s+([a-z]+)\s+(.+)$/i);
  if (!command) return null;
  const [, action, value] = command;
  const [target, field, extra] = value.trim().split(/\s+/);
  const number = target.match(numberPattern)?.[1];
  return { action: action.toLowerCase(), value: value.trim(), target, field, extra, number: number ? Number(number) : null };
}

export async function resolveChatAction(db, role, company, command) {
  const { action, value, target, field, extra, number } = command;
  const manages = ['owner','manager'].includes(role);
  if (action === 'bogla' && role === 'customer' && /^[a-f0-9]{32}$/i.test(value)) {
    return { label: 'Do‘konni faol firmaga ID orqali bog‘lash · ' + value,
      rpc: 'link_store_by_code', args: { p_company: company, p_code: value } };
  }
  if (action === 'inventar' && manages && idPattern.test(target) && field === 'tasdiq' && !extra) {
    const { data } = await db.from('inventory_operations').select('reference,status,kind').eq('company_id', company).eq('id', target).maybeSingle();
    if (data?.status === 'draft' && (data.kind !== 'count' || role === 'owner')) return { label: 'Ombor hujjatini tasdiqlash · ' + data.reference,
      rpc: 'review_inventory_operation', args: { p_company: company, p_id: target, p_accept: true } };
  }
  if (action === 'holat' && role === 'admin' && ['company','store'].includes(target) && idPattern.test(field || '') && ['active','frozen'].includes(extra)) {
    const { data } = await db.rpc('platform_business_directory', { p_kind: target, p_query: field, p_status: null, p_offset: 0 });
    const row = data?.find(item => item.id === field);
    if (!row || row.account_status === extra) return null;
    return { label: row.name + ' · ' + field + ' · ' + (extra === 'active' ? 'Faollashtirish' : 'Muzlatish'),
      rpc: 'set_platform_business_status', args: { p_kind: target, p_id: field, p_status: extra } };
  }
  if (action === 'yetkaz' && role === 'supplier' && number && ['shipped','delivered'].includes(field) && !extra) {
    const { data } = await db.from('orders').select('id,status,checkout_batch_id').eq('company_id', company).eq('order_number', number).limit(1);
    if (data?.length && data[0].status === (field === 'shipped' ? 'approved' : 'shipped')) {
      const order = data[0];
      return { label: target + ' · ' + (field === 'shipped' ? 'Jo‘natish' : 'Yetkazilgan deb belgilash'),
        rpc: order.checkout_batch_id ? 'advance_checkout_delivery' : 'advance_order',
        args: order.checkout_batch_id ? { p_company: company, p_batch: order.checkout_batch_id, p_next: field } :
          { p_order: order.id, p_next: field } };
    }
  }
  if (action === 'qabul' && role === 'store' && number && ['ha','yoq'].includes(field) && !extra) {
    const { data } = await db.rpc('store_workspace');
    const lines = data?.orders?.filter(order => Number(order.order_number) === number);
    if (lines?.length && lines.every(order => order.status === 'delivered') && lines.some(order => !order.decision)) {
      return { label: target + ' · ' + (field === 'ha' ? 'Qabul qilish' : 'Qabulni rad etish'),
        rpc: 'decide_order_group', args: { p_number: number, p_accept: field === 'ha', p_note: null } };
    }
  }
  return null;
}
