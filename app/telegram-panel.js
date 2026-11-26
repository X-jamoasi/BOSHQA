'use client';

import { Send } from 'lucide-react';
import { PanelState, StatusBadge } from './dashboard-ui';
import { useEffect, useState } from 'react';

export default function TelegramPanel({ company, accessToken, role }) {
  const [status,setStatus]=useState(null);
  const [url,setUrl]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);

  async function action(name) {
    setBusy(true);
    setNotice('');
    try {
      const response=await fetch('/api/telegram',{
        method:'POST', headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
        body:JSON.stringify({action:name,company,store:role==='store'}),
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || 'Telegram so‘rovi bajarilmadi.');
      if(name==='status') {
        setStatus(result);
        if(result.linked) setUrl('');
      } else if(name==='disconnect') {
        setStatus(current=>({...current,linked:false}));
        setUrl('');
        setNotice('Telegram ulanishi uzildi.');
      } else if(result.url) setUrl(result.url);
    } catch (error) {
      setNotice(error.message);
    } finally { setBusy(false); }
  }

  useEffect(()=>{ action('status'); },[company]);

  return <section className="integration-panel">
    <h2 className="icon-heading"><Send size={18} aria-hidden="true"/> BOSHQA Telegram boti</h2>
    <p>{role==='manager'?'Bot korxona buyurtmalari va ochiq qarzlarni ko‘rsatadi.'
      :role==='supplier'?'Bot sizga biriktirilgan buyurtmalarni, yetkazish manzili va xarita havolalarini ko‘rsatadi.'
      :role==='store'?'Bot do‘koningiz buyurtmalarini va firmalar bo‘yicha qarzlarini ko‘rsatadi.'
      :'Bot o‘zingiz bergan buyurtmalar va ochiq qarzlaringizni ko‘rsatadi.'}</p>
    {notice && <p role="status">{notice}</p>}
    {busy && !status && <PanelState kind="loading">Telegram ulanishi tekshirilmoqda…</PanelState>}
    {status && <p><StatusBadge status={status.linked ? 'success' : 'pending'}>{status.linked?'Telegram hisobingiz ulangan.':status.configured?'Telegram hisobingiz hali ulanmagan.':'BOSHQA boti hali sozlanmagan.'}</StatusBadge></p>}
    {url && <p><a className="action" href={url} target="_blank" rel="noreferrer">Telegram’da ochish</a> <span>Telegram’da Start tugmasini bosing. Havola bir marta ishlaydi va 15 daqiqada eskiradi.</span></p>}
    {status?.linked && <p>Botda <code>/orders</code>{role==='supplier'?'': ' yoki /debts'} buyrug‘idan foydalaning.</p>}
    <div className="staff-controls">
      {status?.configured && !status.linked && <button className="action" type="button" disabled={busy} onClick={()=>action('link')}>
        {url?'Yangi havola yaratish':'Telegram hisobini ulash'}
      </button>}
      <button className="secondary" type="button" disabled={busy} onClick={()=>action('status')}>{busy?'Tekshirilmoqda…':'Ulanishni tekshirish'}</button>
      {status?.linked && <button className="secondary" type="button" disabled={busy} onClick={()=>{
        if(window.confirm('Telegram hisobingizni BOSHQA’dan uzasizmi?')) action('disconnect');
      }}>Ulanishni uzish</button>}
    </div>
  </section>;
}
