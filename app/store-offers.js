'use client';

import { useEffect, useState } from 'react';
import { formatDashboardDate } from './dashboard-ui';

function useAreas(db) {
  const [areas, setAreas] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    db.from('store_areas').select('id,region,locality').order('region').order('locality').then(({ data, error }) => {
      if (!active) return;
      if (error) setError('Hududlar ro‘yxatini yuklab bo‘lmadi. Supabase migratsiyasini tekshiring.');
      else setAreas(data);
    });
    return () => { active = false; };
  }, [db]);
  return { areas, error };
}

export function AreaFields({ areas, region, setRegion, area, setArea, optional }) {
  const regions = [...new Set(areas.map(item => item.region))];
  return <>
    <label>Viloyat yoki respublika/shahar
      <select value={region} onChange={event => { setRegion(event.target.value); setArea(''); }} required>
        <option value="">Hududni tanlang</option>
        {regions.map(name => <option key={name}>{name}</option>)}
      </select>
    </label>
    <label>Tuman yoki shahar
      <select name="area" value={area} onChange={event => setArea(event.target.value)} disabled={!region} required={!optional}>
        <option value="">{optional ? 'Barchasi' : 'Tuman yoki shaharni tanlang'}</option>
        {areas.filter(item => item.region === region).map(item => <option key={item.id} value={item.id}>{item.locality}</option>)}
      </select>
    </label>
  </>;
}

export function StoreAreaFields({ db, initialArea }) {
  const { areas, error } = useAreas(db);
  const [region, setRegion] = useState(null);
  const [area, setArea] = useState(null);
  return <>
    {error && <p role="status">{error}</p>}
    {areas.length > 0 && <AreaFields areas={areas} region={region ?? areas.find(item => item.id === initialArea)?.region ?? ''}
      setRegion={setRegion} area={area ?? initialArea ?? ''} setArea={setArea}/>}
  </>;
}

export default function StoreOffers({ db, company = null }) {
  const { areas, error: areaError } = useAreas(db);
  const [region, setRegion] = useState('');
  const [area, setArea] = useState('');
  const [directory, setDirectory] = useState({ key: '', rows: [], error: '' });
  const [recipient, setRecipient] = useState('');
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const key = region + ':' + area;
  const stores = directory.key === key ? directory.rows : [];

  useEffect(() => {
    if (!company || !region) return;
    let active = true;
    db.rpc('offer_store_directory', { p_company: company, p_region: region, p_area: area ? Number(area) : null }).then(({ data, error }) => {
      if (active) setDirectory({ key, rows: data || [], error: error?.message || '' });
    });
    return () => { active = false; };
  }, [db, company, region, area, key]);

  useEffect(() => {
    let active = true;
    db.rpc('list_store_offers', { p_company: company }).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.code === 'PGRST202' ? 'Takliflar uchun Supabase migratsiyasi kerak.' : error.message);
      else setOffers(data);
    });
    return () => { active = false; };
  }, [db, company]);

  async function submit(event, rpc, args, message) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const text = new FormData(form).get('message').trim();
    if (!text) { setNotice('Matn kiriting.'); return; }
    setBusy(true);
    setNotice('');
    try {
      const { error } = await db.rpc(rpc, args(text));
      if (error) throw error;
      form.reset();
      setNotice(message);
      const result = await db.rpc('list_store_offers', { p_company: company });
      if (result.error) setError('Ro‘yxatni yangilash uchun bo‘limni qayta oching.');
      else { setOffers(result.data); setError(''); }
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  return <>
    {company && <section>
      <h2>Do‘konga taklif yuborish</h2>
      {areaError && <p role="alert">{areaError}</p>}
      {areas.length > 0 && <>
        <div className="profile-fields"><AreaFields areas={areas} region={region} setRegion={value => { setRegion(value); setRecipient(''); }}
          area={area} setArea={value => { setArea(value); setRecipient(''); }} optional/></div>
        {region && (directory.key !== key ? <p role="status">Do‘konlar yuklanmoqda…</p> :
          directory.error ? <p role="alert">{directory.error}</p> : stores.length ? <form className="offer-form" onSubmit={event =>
            submit(event, 'send_store_offer', text => ({ p_company: company, p_store: recipient, p_message: text }), 'Taklif yuborildi.')}>
            <label>Do‘kon<select value={recipient} onChange={event => setRecipient(event.target.value)} required>
              <option value="">Do‘konni tanlang</option>
              {stores.map(store => <option key={store.id} value={store.id}>{store.name} · {store.locality}</option>)}
            </select></label>
            <label>Taklif matni<textarea name="message" rows={4} maxLength={2000} required /></label>
            <button className="action" disabled={busy}>Taklifni yuborish</button>
          </form> : <p>Bu hududda ro‘yxatdan o‘tgan do‘kon topilmadi.</p>)}
      </>}
    </section>}
    {notice && <p role="status">{notice}</p>}
    <section>
      <h2>{company ? 'Yuborilgan takliflar' : 'Kelgan takliflar'}</h2>
      {error && <p role="alert">{error}</p>}
      {!offers && !error && <p role="status">Takliflar yuklanmoqda…</p>}
      {offers?.length === 0 && <p>Takliflar hali yo‘q.</p>}
      {offers?.map(offer => <article className="offer-item" key={offer.id}>
        <h3>{company ? offer.store_name : offer.company_name}</h3>
        <small>{formatDashboardDate(offer.created_at, true)}</small>
        <p>{offer.message}</p>
        {offer.reply ? <div className="offer-reply"><strong>Do‘kon javobi</strong><p>{offer.reply}</p></div> :
          company ? <small>Javob kutilmoqda</small> :
            <form className="offer-form" onSubmit={event => submit(event, 'reply_store_offer',
              text => ({ p_offer: offer.id, p_reply: text }), 'Javob yuborildi.')}>
              <label>Javobingiz<textarea name="message" rows={2} maxLength={2000} required /></label>
              <button className="secondary" disabled={busy}>Javobni yuborish</button>
            </form>}
      </article>)}
    </section>
  </>;
}
