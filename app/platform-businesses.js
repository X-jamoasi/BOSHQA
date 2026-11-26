'use client';

import { useEffect, useState } from 'react';
import { PanelState, StatusBadge } from './dashboard-ui';

const statusLabels = { active: 'Faol', frozen: 'Muzlatilgan', archived: 'Arxivlangan' };
const statusTone = { active: 'success', frozen: 'pending', archived: 'rejected' };
const actions = { active: 'Faollashtirish', frozen: 'Muzlatish', archived: 'Arxivlash' };

export default function PlatformBusinesses({ db, kind }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    db.rpc('platform_business_directory', {
      p_kind: kind, p_query: query.trim() || null, p_status: status || null, p_offset: page * 25,
    }).then(response => { if (active) setResult(response); });
    return () => { active = false; };
  }, [db, kind, query, status, page, revision]);

  async function update() {
    setSaving(true);
    try {
      const { error } = await db.rpc('set_platform_business_status', {
        p_kind: kind, p_id: pending.row.id, p_status: pending.next,
      });
      if (error) throw error;
      setNotice({ text: pending.row.name + ' · ' + statusLabels[pending.next] });
      setPending(null);
      setResult(null);
      setRevision(value => value + 1);
    } catch (error) {
      setNotice({ error: true, text: error.message });
    } finally { setSaving(false); }
  }

  return <section>
    <div className="staff-controls">
      <label>Nomi bo‘yicha qidirish<input type="search" value={query} onChange={event => {
        setQuery(event.target.value); setPage(0); setResult(null);
      }}/></label>
      <label>Holat<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); setResult(null); }}>
        <option value="">Barchasi</option>{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    {pending && <div className="insight" role="group" aria-label="Holatni tasdiqlash">
      <p><strong>{pending.row.name}</strong> · {actions[pending.next]}</p>
      {pending.next !== 'active' && <p>Hisob faoliyatiga kirish cheklanadi. Buyurtma va to‘lov tarixi saqlanadi.</p>}
      <div className="staff-controls">
        <button className="action" disabled={saving} onClick={update}>Tasdiqlash</button>
        <button className="secondary" disabled={saving} onClick={() => setPending(null)}>Bekor qilish</button>
      </div>
    </div>}
    {!result && <PanelState kind="loading">Ro‘yxat yuklanmoqda…</PanelState>}
    {result?.error && <PanelState kind="error">{result.error.code === 'PGRST202' ? 'Boshqaruv uchun Supabase migratsiyasi kerak.' : result.error.message}</PanelState>}
    {result?.data?.length === 0 && <PanelState>Ro‘yxat bo‘sh.</PanelState>}
    {result?.data?.length > 0 && <div className="table"><table>
      <thead><tr><th>Nomi</th><th>{kind === 'company' ? 'Yo‘nalish' : 'Hudud'}</th><th>Holat</th><th>Amallar</th></tr></thead>
      <tbody>{result.data.map(row => <tr key={row.id}>
        <td>{row.name}</td><td>{row.details || '—'}</td><td><StatusBadge status={statusTone[row.account_status]}>{statusLabels[row.account_status]}</StatusBadge></td>
        <td>{Object.keys(actions).filter(next => next !== row.account_status && (row.account_status !== 'archived' || next === 'active')).map(next =>
          <button key={next} className="secondary" disabled={saving} onClick={() => { setNotice(null); setPending({ row, next }); }}>{actions[next]}</button>)}</td>
      </tr>)}</tbody>
    </table></div>}
    <div className="staff-controls">
      <button className="secondary" disabled={!page} onClick={() => { setPage(page-1); setResult(null); }}>Oldingi</button>
      <button className="secondary" disabled={result?.data?.length !== 25} onClick={() => { setPage(page+1); setResult(null); }}>Keyingi</button>
    </div>
  </section>;
}
