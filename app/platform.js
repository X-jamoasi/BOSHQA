'use client';

import { useEffect, useState } from 'react';
import { Building2, ClipboardList, Sparkles, TrendingUp } from 'lucide-react';
import { DateWindow, Metrics, PanelState, StatusBadge, Trend, formatDashboardDate } from './dashboard-ui';

export const platformSections = [
  ['overview', 'Platforma umumiy ko‘rinishi', '▦'],
  ['companies', 'Korxonalar', '◈'],
  ['monitoring', 'AI monitoring', '✦'],
  ['revenue', 'Daromad', '↗'],
  ['activity', 'Faoliyat jurnali', '≡'],
];

const outcomes = { success: 'Muvaffaqiyatli', error: 'Xato', unconfigured: 'Sozlanmagan' };

export default function Platform({ db, view }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('');
  const [days, setDays] = useState(30);

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
  const title = view === 'overview' ? 'Super admin paneli' : platformSections.find(([id]) => id === view)?.[1];
  const recent = data?.companies.filter(item => item.registered_at)
    .sort((a, b) => b.registered_at.localeCompare(a.registered_at)).slice(0, 5);
  const latestAi = data?.ai_events[0];

  return <>
    <header className="page-header"><div><h1>{title}</h1>
      {view === 'overview' && <p>Korxonalar, platforma faoliyati va AI monitoringi</p>}</div>
      {view === 'overview' && <DateWindow days={days} setDays={setDays} />}
      {view !== 'revenue' && <button className="secondary" disabled={loading} onClick={load}>Yangilash</button>}
    </header>
    {view === 'revenue' && <section><h2>Obunalar va to‘lovlar</h2>
      <PanelState>BOSHQA’ga to‘lov tizimi hali ulanmagan.</PanelState>
    </section>}
    {view !== 'revenue' && error && <PanelState kind="error">{error}</PanelState>}
    {view !== 'revenue' && !data && !error && <PanelState kind="loading">Platforma ma’lumotlari yuklanmoqda…</PanelState>}
    {view === 'overview' && data && <>
      <Metrics values={[
        ['Jami korxonalar', data.companies.length, Building2], ['Yangi korxonalar', data.recent_companies, TrendingUp, 'So‘nggi 30 kun'],
        ['Jami buyurtmalar', data.orders, ClipboardList], ['AI xulosalari', ai.success, Sparkles, 'So‘nggi 30 kun'],
      ]} />
      <div className="dashboard-grid">
        <section><h2>Korxonalar ro‘yxatdan o‘tish dinamikasi</h2>
          <Trend records={data.companies} dateKey="registered_at" days={days} label="Kunlik ro‘yxatdan o‘tishlar" />
        </section>
        <section><h2>AI hisoboti · oxirgi 30 kun</h2>
          <div className="bars">{Object.entries(outcomes).map(([key, label]) => <div key={key}>
            <span>{label}</span><progress value={ai[key]} max={Math.max(1, ai.success + ai.error + ai.unconfigured)} aria-label={label} /><strong>{ai[key]}</strong>
          </div>)}</div>
          {latestAi && <p>Oxirgi tahlil {formatDashboardDate(latestAi.happened_at)} · <StatusBadge status={latestAi.outcome}>{outcomes[latestAi.outcome]}</StatusBadge></p>}
        </section>
        <section><h2>So‘nggi ro‘yxatdan o‘tgan korxonalar</h2>
          {recent.length ? <div className="table"><table><thead><tr><th>Korxona</th><th>Yo‘nalish</th><th>Sana</th></tr></thead>
            <tbody>{recent.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.sector || 'Kiritilmagan'}</td><td>{formatDashboardDate(item.registered_at)}</td></tr>)}</tbody>
          </table></div> : <p>Ro‘yxatdan o‘tgan sanasi qayd etilgan korxona yo‘q.</p>}
        </section>
        <section><h2>So‘nggi faoliyat</h2>
          {data.activity.length ? <ul className="activity-list">{data.activity.slice(0, 5).map(item => <li key={item.id}>
            <span>{item.description}</span><small>{formatDashboardDate(item.happened_at)}</small></li>)}</ul> : <p>Yangi voqealar yo‘q.</p>}
        </section>
      </div>
    </>}
    {view === 'companies' && data && <section>
      <div className="panel-heading"><h2>Korxonalar ro‘yxati <small className="result-count">{companies.length}</small></h2></div>
      <div className="platform-filters">
        <label>Korxona qidirish<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>Yo‘nalish<select value={sector} onChange={event => setSector(event.target.value)}>
          <option value="">Barcha yo‘nalishlar</option>{sectors.map(item => <option key={item}>{item}</option>)}
        </select></label>
      </div>
      {companies.length ? <div className="table"><table>
        <thead><tr><th>Korxona</th><th>Faoliyat yo‘nalishi</th><th>Ro‘yxatdan o‘tgan sana</th></tr></thead>
        <tbody>{companies.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.sector || 'Kiritilmagan'}</td><td>{formatDashboardDate(item.registered_at)}</td></tr>)}</tbody>
      </table></div> : <PanelState>Korxona topilmadi.</PanelState>}
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
            <td>{formatDashboardDate(item.happened_at)}</td><td>{item.model?.replace(/^gemini-/i, '') || '—'}</td><td><StatusBadge status={item.outcome}>{outcomes[item.outcome]}</StatusBadge></td><td>{item.reason?.replace(/(?:Google )?Gemini/gi, 'AI xizmati') || '—'}</td>
          </tr>)}</tbody>
        </table></div> : <PanelState>AI natijalari hali qayd etilmagan.</PanelState>}
      </section>
    </>}
    {view === 'activity' && data && <section><h2>So‘nggi 25 voqea</h2>
      {data.activity.length ? <div className="table"><table>
        <thead><tr><th>Vaqt</th><th>Voqea</th></tr></thead>
        <tbody>{data.activity.map(item => <tr key={item.id}><td>{formatDashboardDate(item.happened_at)}</td><td>{item.description}</td></tr>)}</tbody>
      </table></div> : <PanelState>Hozircha yangi voqealar yo‘q.</PanelState>}
    </section>}
  </>;
}
