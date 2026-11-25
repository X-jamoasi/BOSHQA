'use client';

import { useEffect, useState } from 'react';

export const platformSections = [
  ['overview', 'Bosh sahifa', '▦'],
  ['companies', 'Korxonalar', '◈'],
  ['monitoring', 'AI monitoring', '✦'],
  ['revenue', 'Daromad', '↗'],
  ['activity', 'Faoliyat jurnali', '≡'],
];

const dateFormat = new Intl.DateTimeFormat('uz-UZ', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tashkent',
});
const formatDate = value => value ? dateFormat.format(new Date(value)) : 'Sana saqlanmagan';
const outcomes = { success: 'Muvaffaqiyatli', error: 'Xato', unconfigured: 'Sozlanmagan' };

function Metrics({ values }) {
  return <div className="metrics">{values.map(([label, value]) =>
    <div key={label}><span>{label}</span><strong>{value}</strong></div>
  )}</div>;
}

export default function Platform({ db, view }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await db.rpc('platform_dashboard');
      if (error) throw error;
      setData(data);
    } catch (error) {
      setError(error.code === 'PGRST202' ? 'Platforma paneli uchun yangi Supabase migratsiyasi kerak.' : error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [db]);

  const sectors = [...new Set(data?.companies.map(item => item.sector).filter(Boolean))].sort();
  const companies = data?.companies.filter(item =>
    (!sector || item.sector === sector) && item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const ai = data?.ai_counts;
  const title = platformSections.find(([id]) => id === view)?.[1];

  return <>
    <header className="page-header"><h1>{title}</h1>
      {view !== 'revenue' && <button className="secondary" disabled={loading} onClick={load}>Yangilash</button>}
    </header>
    {view === 'revenue' && <section><h2>Obunalar va to‘lovlar</h2>
      <p>BOSHQA’ga to‘lov tizimi hali ulanmagan. Ulangach, shu yerda platforma daromadi va faol obunalar ko‘rinadi.</p>
    </section>}
    {view !== 'revenue' && error && <p role="alert">{error}</p>}
    {view !== 'revenue' && !data && !error && <p role="status">Platforma ma’lumotlari yuklanmoqda…</p>}
    {view === 'overview' && data && <>
      <Metrics values={[
        ['Korxonalar', data.companies.length], ['Yangi korxonalar · 30 kun', data.recent_companies],
        ['Buyurtmalar', data.orders], ['AI xulosalari · 30 kun', ai.success],
      ]} />
      <section><h2>AI hisoboti · oxirgi 30 kun</h2>
        <div className="bars">{Object.entries(outcomes).map(([key, label]) => <div key={key}>
          <span>{label}</span><progress value={ai[key]} max={Math.max(1, ai.success + ai.error + ai.unconfigured)} aria-label={label} /><strong>{ai[key]}</strong>
        </div>)}</div>
      </section>
    </>}
    {view === 'companies' && data && <section>
      <div className="platform-filters">
        <label>Korxona qidirish<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>Yo‘nalish<select value={sector} onChange={event => setSector(event.target.value)}>
          <option value="">Barcha yo‘nalishlar</option>{sectors.map(item => <option key={item}>{item}</option>)}
        </select></label>
      </div>
      {companies.length ? <div className="table"><table>
        <thead><tr><th>Korxona</th><th>Faoliyat yo‘nalishi</th><th>Ro‘yxatdan o‘tgan sana</th></tr></thead>
        <tbody>{companies.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.sector || 'Kiritilmagan'}</td><td>{formatDate(item.registered_at)}</td></tr>)}</tbody>
      </table></div> : <p>Korxona topilmadi.</p>}
    </section>}
    {view === 'monitoring' && data && <>
      <Metrics values={[
        ['Tahlil urinishlari · 30 kun', ai.success + ai.error + ai.unconfigured],
        ['Muvaffaqiyatli', ai.success], ['Xatolar', ai.error], ['API kaliti sozlanmagan', ai.unconfigured],
      ]} />
      <section><h2>So‘nggi 25 natija</h2>
        {data.ai_events.length ? <div className="table"><table>
          <thead><tr><th>Vaqt</th><th>Model</th><th>Natija</th><th>Sabab</th></tr></thead>
          <tbody>{data.ai_events.map(item => <tr key={item.id}>
            <td>{formatDate(item.happened_at)}</td><td>{item.model?.replace(/^gemini-/i, '') || '—'}</td><td>{outcomes[item.outcome]}</td><td>{item.reason?.replace(/(?:Google )?Gemini/gi, 'AI xizmati') || '—'}</td>
          </tr>)}</tbody>
        </table></div> : <p>AI natijalari hali qayd etilmagan.</p>}
      </section>
    </>}
    {view === 'activity' && data && <section><h2>So‘nggi 25 voqea</h2>
      {data.activity.length ? <div className="table"><table>
        <thead><tr><th>Vaqt</th><th>Voqea</th></tr></thead>
        <tbody>{data.activity.map(item => <tr key={item.id}><td>{formatDate(item.happened_at)}</td><td>{item.description}</td></tr>)}</tbody>
      </table></div> : <p>Hozircha yangi voqealar yo‘q.</p>}
    </section>}
  </>;
}
