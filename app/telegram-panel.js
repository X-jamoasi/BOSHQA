'use client';

import { useEffect, useState } from 'react';

export default function TelegramPanel({ company, accessToken, role }) {
  const [status,setStatus]=useState(null);
  const [url,setUrl]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);

  async function action(name, token) {
    setBusy(true);
    setNotice('');
    try {
      const response=await fetch('/api/telegram',{
        method:'POST', headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
        body:JSON.stringify({action:name,company,token}),
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || 'Telegram so‘rovi bajarilmadi.');
      if(name==='status') {
        setStatus(result);
        if(result.linked) setUrl('');
      } else if(name==='disconnect') {
        setStatus({configured:true});
        setUrl('');
        setNotice('Telegram ulanishi uzildi.');
      } else {
        setStatus(current=>({...current,configured:true,username:result.username || current?.username,linked:false}));
        if(result.url) setUrl(result.url);
      }
      return true;
    } catch (error) {
      setNotice(error.message);
      return false;
    } finally { setBusy(false); }
  }

  useEffect(()=>{ action('status'); },[company]);
  return <section>
    <h2>Shaxsiy Telegram bot</h2>
    <p>{role==='manager'?'Bot korxona buyurtmalari va ochiq qarzlarni ko‘rsatadi.'
      : role==='supplier'?'Bot sizga biriktirilgan buyurtmalarni, yetkazish manzili va xarita havolalarini ko‘rsatadi.'
      :'Bot o‘zingiz bergan buyurtmalar va ochiq qarzlaringizni ko‘rsatadi.'}</p>
    {notice && <p role="alert">{notice}</p>}
    {status && !status.configured && <p>Bot ulash uchun Vercel’da Telegram shifrlash kaliti sozlanishi kerak.</p>}
    {status?.configured && !status.username && <form onSubmit={async event=>{
      event.preventDefault();
      const form=event.currentTarget;
      if(await action('setup',new FormData(form).get('token'))) form.reset();
    }}>
      <label>BotFather tokeni<input type="password" name="token" autoComplete="off" maxLength="118" required /></label>
      <button className="action" disabled={busy}>Botni ulash</button>
    </form>}
    {status?.username && <div>
      <p>@{status.username} · {status.linked?'Ulangan':'Telegram’da tasdiqlash kutilmoqda'}</p>
      {url && <p><a className="action" href={url} target="_blank" rel="noreferrer">Telegram’da ochish</a> <span>Havola bir marta ishlaydi va 15 daqiqada eskiradi.</span></p>}
      {status.linked && <p>Botda <code>/orders</code>{role==='supplier'?'': ' yoki /debts'} buyrug‘idan foydalaning.</p>}
      <div className="staff-controls">
        {!status.linked && <button className="secondary" disabled={busy} onClick={()=>action('link')}>Yangi havola</button>}
        <button className="secondary" disabled={busy} onClick={()=>action('status')}>Ulanishni tekshirish</button>
        <button className="secondary" disabled={busy || !status.configured} onClick={()=>{
          if(window.confirm('Telegram bot ulanishini uzasizmi?')) action('disconnect');
        }}>Ulanishni uzish</button>
      </div>
    </div>}
    {!status && <button className="secondary" disabled={busy} onClick={()=>action('status')}>{busy?'Tekshirilmoqda…':'Qayta tekshirish'}</button>}
  </section>;
}
