'use client';

import { useEffect, useRef, useState } from 'react';
import { Banknote, ClipboardList, Percent, TriangleAlert, WalletCards } from 'lucide-react';
import { accountLogin } from '../lib/accounts';
import AiChat from './ai-chat';
import { DashboardShell, Metrics, StatusBadge, formatDashboardDate } from './dashboard-ui';
import { MapChoices, formatMoney } from './sales';
import TelegramPanel from './telegram-panel';

const links = [
  ['overview','Bosh sahifa'],['receivables','Qarzlar'],['companies','Firmalar'],['telegram','Telegram bot'],
  ['orders','Buyurtmalar'],['store','Do‘kon'],['assistant','AI nazorati'],
];
const orderStatus={pending:'Kutilmoqda',approved:'Tasdiqlangan',shipped:'Jo‘natilgan',delivered:'Yetkazilgan',rejected:'Firma rad etgan'};
const decisionText={accepted:'Do‘kon qabul qilgan',rejected:'Do‘kon rad etgan'};
const activeStatus=['pending','approved','shipped'];

export default function StoreWorkspace({ db, session }) {
  const [view,setView]=useState('overview');
  const [data,setData]=useState(null);
  const [notice,setNotice]=useState('');
  const [aiSignal,setAiSignal]=useState(0);
  const [busy,setBusy]=useState(false);
  const [filter,setFilter]=useState('active');
  const [selected,setSelected]=useState(null);

  async function load() {
    const {data,error}=await db.rpc('store_workspace');
    if(error) throw error;
    if(!data) throw new Error('Do‘kon ma’lumotlari topilmadi.');
    setData(data);
  }

  async function initialize() {
    setNotice('');
    try {
      const {data,error}=await db.rpc('ensure_store_workspace');
      if(error) throw error;
      if(!data) throw new Error('Do‘kon hisobini ochib bo‘lmadi.');
      await load();
    } catch(error) {
      setNotice(error.code==='PGRST202'?'Do‘kon paneli uchun Supabase migratsiyasi kerak.':error.message);
    }
  }

  useEffect(()=>{ initialize(); },[db]);

  async function change(name,args) {
    setBusy(true);
    setNotice('');
    try {
      const {error}=await db.rpc(name,args);
      if(error) throw error;
    } catch(error) {
      setNotice(error.message);
      setBusy(false);
      return false;
    }
    setSelected(null);
    try {
      await load();
      setNotice('Saqlandi.');
    } catch {
      setNotice('Saqlandi. Yangilangan ma’lumotni ko‘rish uchun sahifani yangilang.');
    } finally { setBusy(false); }
    return true;
  }

  const profile=data?.profile;
  const stats=data?.stats;
  const shownOrders=data?.orders.filter(order=>filter==='active'?activeStatus.includes(order.status):!activeStatus.includes(order.status));
  const current=data?.orders.find(order=>order.id===selected);
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const nextWeek = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+7*86400000));
  const dueSoon=data?.debts.filter(item=>item.due_on&&item.due_on<=nextWeek) || [];
  const late=data?.orders.filter(order=>activeStatus.includes(order.status)&&order.expected_delivery_date&&order.expected_delivery_date<today) || [];

  return <DashboardShell links={data?links:[]} view={view} selectView={setView}
    name={session.user.user_metadata?.full_name||accountLogin(session.user)||'Do‘kon egasi'} role="Do‘kon egasi"
    company={profile} companies={[]} signOut={()=>db.auth.signOut()} openAI={data?()=>setAiSignal(value=>value+1):undefined}
    assistant={data&&<AiChat company={null} role="store" token={session.access_token} standalone={view==='assistant'} openSignal={aiSignal} />}>
    {notice&&<p role="status">{notice}</p>}
    {!data&&(notice?<button className="secondary" onClick={initialize}>Qayta tekshirish</button>:<p role="status">Do‘kon yuklanmoqda…</p>)}
    {data&&view!=='assistant'&&<header className="page-header"><h1>{links.find(([id])=>id===view)[1]}</h1></header>}
    {data&&view==='overview'&&<>
      <Metrics values={[
        ['Shu oy tasdiqlangan xarajat',formatMoney(stats.monthly_expenses),Banknote],
        ['O‘tgan oyga nisbatan',stats.change_percent==null?'—':stats.change_percent+'%',Percent,'Tasdiqlangan to‘lovlar'],
        ['Faol buyurtmalar',stats.active_orders,ClipboardList],
        ['Jami qolgan qarz',formatMoney(stats.debt_total),WalletCards],
      ]}/>
      <div className="dashboard-grid">
        <section><h2>Oylik xarajatlar</h2>
          <div className="store-spending">{[['O‘tgan oy',stats.previous_expenses],['Shu oy',stats.monthly_expenses]].map(([label,amount])=><div key={label}>
            <span>{label}</span><progress aria-label={label} value={amount} max={Math.max(1,stats.previous_expenses,stats.monthly_expenses)}/><strong>{formatMoney(amount)}</strong>
          </div>)}</div>
        </section>
        <section><h2>Buyurtma va muddat nazorati</h2>
          <p>Yakunlangan buyurtmalar: {stats.completed_orders}</p><p>Siz qabul qilgan buyurtmalar: {stats.accepted_orders}</p>
          <p>Muddati o‘tgan faol buyurtmalar: {stats.late_orders}</p>
          <button type="button" className="text-button" onClick={()=>setView('assistant')}>AI nazoratini ochish →</button>
        </section>
      </div>
    </>}
    {data&&view==='receivables'&&<section><h2>Firmalar bo‘yicha qarzlar</h2><DebtTable debts={data.debts}/></section>}
    {data&&view==='companies'&&<section><h2>Biriktirilgan firmalar</h2>
      {data.companies.length?<div className="table"><table><thead><tr><th>Firma</th><th>Yo‘nalish</th></tr></thead>
        <tbody>{data.companies.map(item=><tr key={item.id}><td>{item.name}</td><td>{item.sector||'—'}</td></tr>)}</tbody>
      </table></div>:<p>Firma hali bog‘lanmagan. Agentga do‘kon ID’sini bering.</p>}
    </section>}
    {data&&view==='orders'&&<section>
      <div className="panel-heading"><h2>Buyurtmalar ro‘yxati</h2><div className="staff-controls">
        {['active','completed'].map(item=><button type="button" key={item} className={filter===item?'action':'secondary'} aria-pressed={filter===item}
          onClick={()=>{setFilter(item);setSelected(null);}}>{item==='active'?'Faol':'Yakunlangan'}</button>)}
      </div></div>
      {shownOrders.length?<div className="table"><table><thead><tr><th>Firma</th><th>Mahsulot va miqdor</th><th>Summa</th><th>Holat</th><th>Yetkazish muddati</th><th>Amal</th></tr></thead>
        <tbody>{shownOrders.map(order=><tr key={order.id}>
          <td>{order.company_name}<br/><small>{formatDashboardDate(order.created_at,true)}</small></td>
          <td>{order.product} · {order.quantity} {order.order_unit}</td><td>{formatMoney(order.order_total)}</td>
          <td><StatusBadge status={order.status}>{orderStatus[order.status]}</StatusBadge>
            {order.decision&&<p>{decisionText[order.decision]}{order.note?' · '+order.note:''}</p>}</td>
          <td>{order.expected_delivery_date||'—'}</td>
          <td>{order.status==='delivered'&&!order.decision&&<button className="secondary" onClick={()=>setSelected(order.id)}>Qabulni tekshirish</button>}</td>
        </tr>)}</tbody></table></div>:<p>Bu holatda buyurtmalar yo‘q.</p>}
      {current&&<form key={current.id} className="store-decision" onSubmit={event=>{
        event.preventDefault();
        const fields=new FormData(event.currentTarget);
        const value=event.nativeEvent.submitter?.value;
        if(!value)return;
        change('decide_store_delivery',{p_order:current.id,p_accept:value==='accept',p_note:fields.get('note')||''});
      }}>
        <h3>{current.product} · Qabulni tekshirish</h3>
        <label>Izoh (ixtiyoriy)<textarea name="note" rows="3" maxLength="500" placeholder="Masalan, 10 dona o‘rniga 9 dona keldi" /></label>
        <div className="staff-controls"><button className="action" value="accept" disabled={busy}>Qabulni tasdiqlash</button>
          <button className="secondary" value="reject" disabled={busy}>Rad etish</button></div>
      </form>}
    </section>}
    {data&&view==='store'&&<StoreProfile profile={profile} busy={busy} change={change}/>}
    {data&&view==='telegram'&&<TelegramPanel company={null} accessToken={session.access_token} role="store"/>}
    {data&&view==='assistant'&&<div className="dashboard-grid">
      <section><h2><TriangleAlert size={16}/> Yaqin va o‘tgan qarz muddatlari</h2><DebtTable debts={dueSoon}/></section>
      <section><h2>Kechikkan buyurtmalar</h2>
        {late.length?<ul>{late.map(order=><li key={order.id}>{order.company_name} · {order.product} · {order.expected_delivery_date}</li>)}</ul>
          :<p>Yetkazish muddati belgilangan faol buyurtmalarda kechikish topilmadi.</p>}
      </section>
    </div>}
  </DashboardShell>;
}

function DebtTable({ debts }) {
  return debts.length?<div className="table"><table>
    <thead><tr><th>Firma</th><th>Qolgan qarz</th><th>Eng yaqin muddat</th><th>O‘tgan muddatlar</th></tr></thead>
    <tbody>{debts.map(item=><tr key={item.company_id}><td>{item.company_name}</td><td>{formatMoney(item.amount)}</td>
      <td>{item.due_on}</td><td>{item.overdue||'—'}</td></tr>)}</tbody>
  </table></div>:<p>Bu ro‘yxatda ochiq qarz yo‘q.</p>;
}

function StoreProfile({ profile,busy,change }) {
  const [message,setMessage]=useState('');
  const lat=useRef(null), lng=useRef(null);
  return <section>
    <div className="panel-heading"><h2>Do‘kon ID’si</h2>
      <button type="button" className="secondary" onClick={async()=>{
        try { await navigator.clipboard.writeText(profile.code);setMessage('ID nusxalandi.'); }
        catch { setMessage('ID matnini belgilab nusxalashingiz mumkin.'); }
      }}>ID’ni nusxalash</button>
    </div>
    <p><code className="store-code">{profile.code}</code></p>
    <p>Profilni to‘ldiring, keyin shu ID’ni do‘konni bog‘laydigan agentga bering.</p>
    {message&&<p role="status">{message}</p>}
    <h2>Do‘kon ma’lumotlari</h2>
    <form key={JSON.stringify(profile)} className="profile-fields" onSubmit={event=>{
      event.preventDefault();
      const fields=new FormData(event.currentTarget);
      change('update_store_workspace',{
        p_name:fields.get('name'),p_legal_type:fields.get('legal_type'),p_legal_name:fields.get('legal_name'),
        p_phone:fields.get('phone'),p_address:fields.get('address'),p_latitude:Number(fields.get('latitude')),p_longitude:Number(fields.get('longitude')),
      });
    }}>
      <label>Do‘kon nomi<input name="name" defaultValue={profile.name} minLength="2" maxLength="100" required /></label>
      <label>Yuridik shakl<select name="legal_type" defaultValue={profile.legal_type||'yatt'}><option value="yatt">YaTT</option><option value="mchj">MChJ</option></select></label>
      <label>Firma yoki tadbirkor nomi<input name="legal_name" defaultValue={profile.legal_name||''} minLength="2" maxLength="150" required /></label>
      <label>Do‘kon telefoni<input name="phone" type="tel" defaultValue={profile.phone||''} maxLength="16" placeholder="+998901234567" required /></label>
      <label>Do‘kon manzili<input name="address" defaultValue={profile.address||''} minLength="5" maxLength="250" required /></label>
      <label>Kenglik<input ref={lat} name="latitude" defaultValue={profile.latitude??''} type="number" step="any" min="-90" max="90" required /></label>
      <label>Uzunlik<input ref={lng} name="longitude" defaultValue={profile.longitude??''} type="number" step="any" min="-180" max="180" required /></label>
      <div><button type="button" className="secondary" onClick={()=>{
        if(!navigator.geolocation){setMessage('GPS mavjud emas. Koordinatalarni qo‘lda kiriting.');return;}
        navigator.geolocation.getCurrentPosition(({coords})=>{
          if(lat.current&&lng.current){lat.current.value=coords.latitude.toFixed(6);lng.current.value=coords.longitude.toFixed(6);}
          setMessage('Joylashuv olindi.');
        },()=>setMessage('GPS olinmadi. Ruxsatni tekshiring yoki koordinatalarni qo‘lda kiriting.'),{enableHighAccuracy:true,timeout:12000});
      }}>Do‘kon yonida GPS orqali olish</button></div>
      <button className="action" disabled={busy}>Do‘kon ma’lumotlarini saqlash</button>
    </form>
    <MapChoices latitude={profile.latitude} longitude={profile.longitude}/>
  </section>;
}
