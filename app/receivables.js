'use client';

import { PanelState } from './dashboard-ui';
import { useEffect, useRef, useState } from 'react';
import { StatusBadge } from './dashboard-ui';
import { formatOrderNumber } from './order-documents';
import { formatMoney } from './sales';

const states = {
  overdue:['error','Muddati o‘tgan'], due:['pending','Qarz bor'],
  paid:['success','To‘langan'], unrecorded:['unknown','Hisob qayd etilmagan'],
};

export default function Receivables({ db, company, role, onUpdated, initialOrder }) {
  const [rows,setRows]=useState(null);
  const [grouped,setGrouped]=useState(false);
  const [notice,setNotice]=useState('');
  const [selected,setSelected]=useState(initialOrder || null);
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('');
  const manages=['owner','manager'].includes(role);
  const canReport=role!=='customer';

  async function load() {
    const {data,error}=await db.rpc('company_receivables',{p_company:company});
    if(error) throw new Error(error.code==='PGRST202'?'Qarzlar uchun yangi Supabase migratsiyasi kerak.':error.message);
    const metadata = await db.rpc('group_receipt_metadata', { p_company: company });
    if (metadata.error?.code === 'PGRST202') {
      setGrouped(false);
      setRows(data);
      return;
    }
    if (metadata.error) throw metadata.error;
    setGrouped(true);
    const byId = new Map(metadata.data.map(row => [row.order_id, row]));
    const groups = new Map();
    for (const item of data) {
      const row = { ...item, ...byId.get(item.order_id) };
      const key = row.order_number ?? row.order_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const sum = (items, key) => items.reduce((total, row) => total + Math.round(Number(row[key] ?? 0) * 100), 0) / 100;
    setRows([...groups.values()].map(lines => {
      const row = lines[0];
      const pending = new Map();
      for (const line of lines) {
        if (!line.pending_id) continue;
        const key = line.payment_group || line.pending_id;
        const entry = pending.get(key) || { id: line.pending_id, amount: 0, due: line.pending_due };
        entry.amount += Math.round(Number(line.pending_amount) * 100);
        pending.set(key, entry);
      }
      const total = lines.some(line => line.total == null) ? null : sum(lines, 'total');
      const recorded = lines.some(line => line.received != null);
      const received = recorded ? sum(lines, 'received') : null;
      const balance = recorded && total != null ? Math.round((total - received) * 100) / 100 : null;
      const due = lines.map(line => line.due_on).filter(Boolean).sort()[0] || null;
      return { ...row, line_ids: lines.map(line => line.order_id), total, received, balance, due_on: due,
        pending_id: pending.values().next().value?.id, pending_groups: [...pending.values()],
        state: !recorded ? 'unrecorded' : balance === 0 ? 'paid' : lines.some(line => line.state === 'overdue') ? 'overdue' : 'due' };
    }));
  }

  useEffect(()=>{load().catch(error=>setNotice(error.message));},[company]);

  async function save(name,args) {
    setBusy(true);
    setNotice('');
    try {
      const {error}=await db.rpc(name,{p_company:company,...args});
      if(error) throw error;
    } catch(error) {
      setNotice(error.message);
      setBusy(false);
      return false;
    }
    setNotice(name.startsWith('submit_')&&role==='supplier'?'Yozuv menejerga yuborildi.':'Saqlanib bo‘ldi.');
    setSelected(null);
    try {
      await load();
      onUpdated?.();
    } catch {
      setNotice('Yozuv saqlandi. Ro‘yxatni yangilang.');
    } finally { setBusy(false); }
    return true;
  }

  const visible=rows?.filter(row=>
    (!filter || (filter==='pending'?row.pending_id:row.state===filter)) &&
    [row.shop_name,row.legal_name,row.order_id,formatOrderNumber(row.order_number)].some(value=>value?.toLowerCase().includes(query.trim().toLowerCase())));
  const current=rows?.find(row=>row.order_id===selected || row.line_ids?.includes(selected));
  return <>
    <section>
      <div className="panel-heading"><h2>Yetkazilgan buyurtmalar bo‘yicha to‘lovlar</h2>
        <button type="button" className="secondary" disabled={busy} onClick={()=>load().catch(error=>setNotice(error.message))}>Yangilash</button>
      </div>
      <div className="staff-controls">
        <input type="search" value={query} onChange={event=>setQuery(event.target.value)} aria-label="Do‘kon yoki firma qidirish" placeholder="Do‘kon yoki firma qidirish" />
        <select value={filter} onChange={event=>setFilter(event.target.value)} aria-label="To‘lov holati">
          <option value="">Barcha holatlar</option>{Object.entries(states).map(([key,[,label]])=><option key={key} value={key}>{label}</option>)}
          {canReport && <option value="pending">Tasdiq kutilmoqda</option>}
        </select>
      </div>
      {notice && <p role="status">{notice}</p>}
      {!rows && !notice && <PanelState kind="loading">To‘lovlar yuklanmoqda…</PanelState>}
      {visible?.length ? <div className="table"><table>
        <thead><tr><th>Do‘kon</th><th>Jami summa</th><th>Tasdiqlangan to‘lov</th><th>Qolgan qarz</th><th>Oxirgi sana</th><th>Holat</th>{canReport&&<th>Amal</th>}</tr></thead>
        <tbody>{visible.map(row=>{
          const [tone,label]=states[row.state];
          return <tr key={row.order_id}>
            <td><strong>{row.shop_name||'Do‘kon ko‘rsatilmagan'}</strong>
              {row.legal_name&&<><br/><small>{row.legal_type==='yatt'?'YaTT':'MChJ'} · {row.legal_name}</small></>}
              <br/><small>{row.order_number == null ? '#' + row.order_id.slice(0,8) : formatOrderNumber(row.order_number)}</small></td>
            <td>{formatMoney(row.total)}</td><td>{formatMoney(row.received)}</td><td>{formatMoney(row.balance)}</td><td>{row.due_on||'—'}</td>
            <td><StatusBadge status={tone}>{label}</StatusBadge>
              {row.pending_id && pendingEntries(row).map(entry => <p key={entry.id}>Tasdiq kutilmoqda · {formatMoney(entry.amount / 100)}{entry.due ? ' · ' + entry.due : ''}</p>)}
              {!row.pending_id&&row.last_submission==='rejected'&&<p>Oxirgi yozuv rad etilgan.</p>}</td>
            {canReport&&<td>{row.pending_id&&manages?pendingEntries(row).map(entry => <div className="staff-controls" key={entry.id}>
              <button className="action" disabled={busy} onClick={()=>save(grouped ? 'review_group_receipt' : 'review_order_receipt',{p_submission:entry.id,p_accept:true})}>Qabul qilish</button>
              <button className="secondary" disabled={busy} onClick={()=>save(grouped ? 'review_group_receipt' : 'review_order_receipt',{p_submission:entry.id,p_accept:false})}>Rad etish</button>
            </div>):!row.pending_id&&row.state!=='paid'&&<button className="secondary" disabled={busy}
              onClick={()=>setSelected(row.order_id)}>{row.state==='unrecorded'?'Hisobni kiritish':'To‘lov kiritish'}</button>}</td>}
          </tr>;
        })}</tbody>
      </table></div>:visible&&<p>Bu ro‘yxatda to‘lov yoki qarz topilmadi.</p>}
    </section>
    {current&&canReport&&!current.pending_id&&current.state!=='paid'&&<ReceiptForm key={current.order_id} row={current} busy={busy} manages={manages}
      close={()=>setSelected(null)} save={args=>save(grouped ? 'submit_group_receipt' : 'submit_order_receipt',args)} />}
  </>;
}

function pendingEntries(row) {
  return row.pending_groups || [{ id: row.pending_id, amount: Math.round(Number(row.pending_amount)*100), due: row.pending_due }];
}

function ReceiptForm({ row, busy, manages, close, save }) {
  const request=useRef(null);
  return <section>
    <div className="panel-heading"><h2>{row.shop_name||'Buyurtma'} · To‘lovni qayd etish</h2>
      <button className="secondary" type="button" disabled={busy} onClick={close}>Yopish</button></div>
    <p>Hozir olingan summani kiriting. Pul olinmagan bo‘lsa, 0 yozing. Qarz qolsa, oxirgi sanani kiriting.</p>
    <form onSubmit={event=>{
      event.preventDefault();
      const fields=new FormData(event.currentTarget);
      const args={p_order:row.order_id,p_amount:fields.get('amount'),p_total:fields.get('total')||null,p_due:fields.get('due')||null};
      const fingerprint=JSON.stringify(args);
      if(request.current?.fingerprint!==fingerprint) request.current={fingerprint,id:crypto.randomUUID()};
      save({...args,p_request:request.current.id});
    }}>
      {row.total==null&&<label>Buyurtmaning jami summasi, so‘m<input name="total" type="number" min="0" step=".01" required /></label>}
      <label>Hozir olingan summa, so‘m<input name="amount" type="number" min="0" max={row.balance??row.total??undefined} step=".01" defaultValue="0" required /></label>
      <label>Qarzning oxirgi sanasi<input name="due" type="date" defaultValue={row.due_on||''} /></label>
      <button className="action" disabled={busy}>{busy?'Saqlanmoqda…':manages?'To‘lovni saqlash':'Menejerga yuborish'}</button>
    </form>
  </section>;
}
