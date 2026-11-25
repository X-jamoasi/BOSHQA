'use client';

import { useEffect, useState } from 'react';
import Platform, { platformSections } from './platform';
import { makeSupabase } from '../lib/supabase';
import { loginEmail, sectors } from '../lib/accounts';

const db = typeof window === 'undefined' ? null : makeSupabase();

const roles = {
  owner: 'Korxona egasi', manager: 'Korxona menejeri',
  supplier: 'Ta’minotchi va yetkazuvchi', customer: 'Buyurtmachi',
};

const statuses = {
  pending: 'Kutilmoqda', approved: 'Tasdiqlangan', shipped: 'Jo‘natilgan',
  delivered: 'Topshirilgan', rejected: 'Rad etilgan',
};

async function read(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

function Form({ onSubmit, label, children }) {
  const [busy, setBusy] = useState(false);
  return <form onSubmit={async event => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      if (await onSubmit(new FormData(form))) form.reset();
    } finally {
      setBusy(false);
    }
  }}>
    {children}<button className="action" disabled={busy}>{label}</button>
  </form>;
}

async function accountAction(values, token) {
  const response = await fetch('/api/accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(values),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Hisob amalini bajarib bo‘lmadi.');
  return result;
}

function LoginField() {
  return <label>Login<input name="login" autoComplete="username" minLength="3" maxLength="32"
    placeholder="Masalan, jizzax_zavod" required /></label>;
}

function Auth() {
  const [signup, setSignup] = useState(false);
  const [notice, setNotice] = useState('');
  return <main>
    <h1>BOSHQA</h1>
    <section>
      <h2>{signup ? 'Korxonani ro‘yxatdan o‘tkazish' : 'Hisobga kirish'}</h2>
      <Form key={signup} label={signup ? 'Ro‘yxatdan o‘tish' : 'Kirish'} onSubmit={async fields => {
        setNotice('');
        const login = fields.get('login').trim().toLowerCase();
        const password = fields.get('password');
        try {
          if (signup) {
            await accountAction({ ...Object.fromEntries(fields), action: 'register' });
          }
          const email = login.includes('@') ? login : loginEmail(login);
          await read(db.auth.signInWithPassword({ email, password }));
          return true;
        } catch (error) {
          setNotice(error.message);
          return false;
        }
      }}>
        {signup && <label>Korxona nomi<input name="name" minLength="2" maxLength="100" required /></label>}
        {signup ? <LoginField /> : <label>Login yoki e-pochta<input name="login" autoComplete="username" required /></label>}
        <label>Parol<input type="password" name="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined} required /></label>
        {signup && <>
          <label>E-pochta yoki telefon<input name="contact" maxLength="254" placeholder="nom@misol.uz yoki +998901234567" required /></label>
          <label>Faoliyat yo‘nalishi<select name="sector" defaultValue="" required>
            <option value="" disabled>Tanlang</option>
            {sectors.map(sector => <option key={sector}>{sector}</option>)}
          </select></label>
        </>}
      </Form>
      <p role="status">{notice}</p>
      <button type="button" onClick={() => { setSignup(!signup); setNotice(''); }}>
        {signup ? 'Hisobim bor' : 'Korxonani ro‘yxatdan o‘tkazish'}
      </button>
    </section>
  </main>;
}

function ChangePassword({ session }) {
  const [notice, setNotice] = useState('');
  return <main><section>
    <h1>Yangi parol o‘rnating</h1>
    <p>Korxona panelini ochish uchun vaqtinchalik parolni almashtiring.</p>
    <Form label="Parolni almashtirish" onSubmit={async fields => {
      const password = fields.get('password');
      try {
        await accountAction({ action: 'password', currentPassword: fields.get('currentPassword'), password }, session.access_token);
        await read(db.auth.signInWithPassword({ email: session.user.email, password }));
        return true;
      } catch (error) {
        setNotice(error.message);
        return false;
      }
    }}>
      <label>Vaqtinchalik parol<input type="password" name="currentPassword" autoComplete="current-password" required /></label>
      <label>Yangi parol<input type="password" name="password" minLength="8" autoComplete="new-password" required /></label>
    </Form>
    <p role="status">{notice}</p>
    <button type="button" onClick={() => db.auth.signOut()}>Chiqish</button>
  </section></main>;
}

export default function Page() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    if (!db) return;
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, current) => setSession(current));
    return () => subscription.unsubscribe();
  }, []);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return <main><h1>BOSHQA</h1><p>Ilovani ishga tushirish uchun Supabase loyiha manzili va ochiq kalitini sozlang.</p></main>;
  }
  if (session === undefined) return <main><p>Hisob yuklanmoqda…</p></main>;
  if (!session) return <Auth />;
  if (session.user.app_metadata.must_change_password === true) return <ChangePassword session={session} />;
  return <Workspace key={session.user.id} session={session} />;
}

const sections = [
  ['overview', 'Umumiy ko‘rinish', '▦'],
  ['products', 'Mahsulotlar', '◈', ['owner', 'manager']],
  ['staff', 'Xodimlar', '◎', ['owner']],
  ['orders', 'Buyurtmalar', '≡'],
  ['ai', 'AI tahlili', '✦', ['owner', 'manager']],
  ['details', 'Korxona ma’lumotlari', 'ⓘ', ['owner', 'manager']],
];

function Workspace({ session }) {
  const [memberships, setMemberships] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState('overview');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const adminStatus = await read(db.rpc('is_platform_admin'));
    if (typeof adminStatus !== 'boolean') throw new Error('Hisob roli tekshirilmadi. Sahifani yangilang.');
    const members = adminStatus ? [] : await read(
      db.from('company_members').select('company_id, role, companies(name, sector, contact)').eq('user_id', session.user.id)
    );
    setMemberships(members);
    setAdmin(adminStatus);
    setSelected(adminStatus ? 'platform' : members[0]?.company_id || '');
    setLoaded(true);
  }

  useEffect(() => {
    load().catch(error => setNotice(error.message));
  }, []);

  const member = loaded && !admin ? memberships.find(item => item.company_id === selected) : null;
  return <div className="shell">
    <aside>
      <div className="brand"><span aria-hidden="true">B</span> BOSHQA</div>
      {memberships.length > 1 && <label>Korxona
        <select value={selected} onChange={event => { setSelected(event.target.value); setView('overview'); }}>
          {memberships.map(item => <option key={item.company_id} value={item.company_id}>{item.companies.name}</option>)}
        </select>
      </label>}
      <nav aria-label="Boshqaruv bo‘limlari">
        {member && sections.filter(([, , , allowed]) => !allowed || allowed.includes(member.role)).map(([id, name, icon]) =>
          <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
            <span aria-hidden="true">{icon}</span>{name}
          </button>
        )}
        {admin && platformSections.map(([id, name, icon]) =>
          <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
            <span aria-hidden="true">{icon}</span>{name}
          </button>
        )}
      </nav>
      <button className="signout" onClick={() => db.auth.signOut().then(({ error }) => { if (error) setNotice(error.message); })}>Hisobdan chiqish</button>
    </aside>
    <main>
      <div className="topbar">
        <div><strong>{member?.companies.name || 'BOSHQA'}</strong>{member?.companies.sector && <small>{member.companies.sector}</small>}</div>
        <div className="topbar-actions">
          {member && ['owner','manager'].includes(member.role) && <button className="action" onClick={() => setView('ai')}>✦ Gemini</button>}
          <div className="account"><strong>{session.user.app_metadata.login || session.user.email}</strong><small>{admin ? 'Super admin' : roles[member?.role]}</small></div>
        </div>
      </div>
      {notice && <p role="status">{notice}</p>}
      {!loaded && !notice && <p>Korxonalar yuklanmoqda…</p>}
      {loaded && admin && <Platform db={db} view={view} />}
      {member && <Company key={member.company_id} member={member} token={session.access_token} view={view} />}
      {loaded && !selected && <p role="status">Hisobingizga korxona biriktirilmagan. Sahifani yangilab ko‘ring. Holat o‘zgarmasa, platforma egasiga loginni yuboring.</p>}
    </main>
  </div>;
}

function SupplierSelect({ suppliers }) {
  return <label>Ta’minotchi yoki yetkazuvchi
    <select name="supplier" defaultValue="" required>
      <option value="" disabled>Tanlang</option>
      {suppliers.map(item => <option key={item.user_id} value={item.user_id}>{item.email}</option>)}
    </select>
  </label>;
}

function Company({ member, token, view }) {
  const id = member.company_id;
  const role = member.role;
  const manages = role === 'owner' || role === 'manager';
  const [snapshot, setSnapshot] = useState(null);
  const [notice, setNotice] = useState('');
  const [insight, setInsight] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [newStaff, setNewStaff] = useState(null);

  async function load() {
    const [products, orders, suppliers] = await Promise.all([
      read(manages
        ? db.rpc('inventory', { p_company: id })
        : db.from('products').select('id,name').eq('company_id', id).order('name')),
      read(db.from('orders').select('id,product_id,quantity,status,direction,delivery_address').eq('company_id', id).order('created_at', { ascending: false })),
      manages ? read(db.rpc('company_suppliers', { p_company: id })) : [],
    ]);
    setSnapshot({ products, orders, suppliers });
  }

  useEffect(() => {
    load().catch(error => setNotice(error.message));
  }, []);

  async function change(name, args) {
    setChanging(true);
    setNotice('');
    try {
      await read(db.rpc(name, args));
    } catch (error) {
      setNotice(error.message);
      setChanging(false);
      return false;
    }
    setInsight(null);
    try {
      await load();
      setNotice('Saqlandi.');
    } catch {
      setNotice('O‘zgarish saqlandi. Yangi ma’lumotlarni ko‘rish uchun sahifani yangilang.');
    } finally {
      setChanging(false);
    }
    return true;
  }

  async function analyze() {
    setAnalyzing(true);
    setInsight(null);
    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ company: id }),
      });
      const result = await response.json();
      setInsight({ text: result.text ?? result.error, source: result.source, model: result.model });
    } catch {
      setInsight({ text: 'Tahlil xizmatiga ulanib bo‘lmadi.' });
    } finally {
      setAnalyzing(false);
    }
  }

  if (!snapshot) return <p role="status">{notice || 'Korxona ma’lumotlari yuklanmoqda…'}</p>;
  const { products, orders, suppliers } = snapshot;
  return <>
    <header className="page-header">
      <h1>{sections.find(item => item[0] === view)[1]}</h1>
      <button className="secondary" disabled={changing} onClick={() => load().then(() => setNotice('')).catch(error => setNotice(error.message))}>Yangilash</button>
    </header>
    {notice && <p role="status">{notice}</p>}
    {view === 'details' && manages && <section>
      <h2>Korxona profili</h2>
      <dl className="company-details">
        <div><dt>Korxona nomi</dt><dd>{member.companies.name}</dd></div>
        <div><dt>Faoliyat yo‘nalishi</dt><dd>{member.companies.sector || 'Kiritilmagan'}</dd></div>
        <div><dt>E-pochta yoki telefon</dt><dd>{member.companies.contact || 'Kiritilmagan'}</dd></div>
      </dl>
    </section>}
    {view === 'overview' && <Overview products={products} orders={orders} manages={manages} />}
    {view === 'staff' && role === 'owner' && <section>
      <h2>Xodim yoki hamkor hisobi</h2>
      <Form label="Hisob yaratish" onSubmit={async fields => {
        setNotice('');
        setNewStaff(null);
        try {
          const result = await accountAction({
            action: 'staff', company: id, login: fields.get('login'), role: fields.get('role'),
          }, token);
          setNewStaff(result);
          return true;
        } catch (error) {
          setNotice(error.message);
          return false;
        }
      }}>
        <LoginField />
        <label>Rol<select name="role">{Object.entries(roles).filter(([key]) => key !== 'owner').map(([key, label]) =>
          <option key={key} value={key}>{label}</option>)}</select></label>
      </Form>
      {newStaff && <div className="insight" role="status">
        <p>Login <code>{newStaff.login}</code></p>
        <p>Vaqtinchalik parol <code>{newStaff.password}</code></p>
        <p>Ma’lumotlarni xodimga xavfsiz kanalda bering. Birinchi kirishda parol almashtiriladi.</p>
        <button type="button" onClick={() => setNewStaff(null)}>Yopish</button>
      </div>}
    </section>}
    {view === 'products' && manages && <section>
      <h2>Ombor qoldig‘i</h2>
      <div className="table"><table>
        <thead><tr><th>Mahsulot</th><th>Qoldiq</th><th>Minimal miqdor</th></tr></thead>
        <tbody>{products.map(item => <tr key={item.id}><td>{item.name}</td><td className={item.stock <= item.minimum ? 'low' : ''}>{item.stock}</td><td>{item.minimum}</td></tr>)}</tbody>
      </table></div>
      <h3>Mahsulot qo‘shish</h3>
      <Form label="Saqlash" onSubmit={fields => change('add_product', {
        p_company: id, p_name: fields.get('name'), p_stock: Number(fields.get('stock')), p_minimum: Number(fields.get('minimum')),
      })}>
        <label>Nomi<input name="name" minLength="2" maxLength="80" required /></label>
        <label>Boshlang‘ich qoldiq<input name="stock" type="number" min="0" max="2147483647" defaultValue="0" required /></label>
        <label>Minimal qoldiq<input name="minimum" type="number" min="0" max="2147483647" defaultValue="0" required /></label>
      </Form>
    </section>}
    {view === 'ai' && manages && <section>
      <h2>Ombor bo‘yicha Gemini tahlili</h2>
      <p>{products.length ? 'Qaysi mahsulotlar minimal qoldiqqa yetganini va qaysilarini to‘ldirish kerakligini tekshiring.' : 'Tahlilni boshlash uchun Mahsulotlar bo‘limida mahsulot qo‘shing.'}</p>
      <button className="action" disabled={analyzing || !products.length} onClick={analyze}>{analyzing ? 'Tahlil qilinmoqda…' : 'Gemini bilan tahlil'}</button>
      {insight && <div className="insight" role="status">
        {insight.source && <strong>{insight.source === 'gemini' ? 'Gemini tahlili' : 'Qoidaga asoslangan tekshiruv'}</strong>}
        {insight.model && <p>Model {insight.model}</p>}
        <p>{insight.text}</p>
      </div>}
    </section>}
    {view === 'orders' && (manages || role === 'customer') && <section>
      <h2>{manages ? 'Xomashyo buyurtmasi' : 'Yangi buyurtma'}</h2>
      {!products.length || (manages && !suppliers.length) ? <p>{manages ? 'Avval mahsulot va ta’minotchi qo‘shing.' : 'Katalogda mahsulot yo‘q.'}</p> :
        <Form label="Buyurtma berish" onSubmit={fields => change('create_order', {
          p_company: id, p_product: fields.get('product'), p_quantity: Number(fields.get('quantity')),
          p_direction: manages ? 'inbound' : 'outbound', p_address: fields.get('address'), p_supplier: fields.get('supplier'),
        })}>
          <label>Mahsulot<select name="product">{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Miqdor<input name="quantity" type="number" min="1" max="1000000" required /></label>
          <label>Yetkazish manzili<input name="address" minLength="5" maxLength="250" required /></label>
          {manages && <SupplierSelect suppliers={suppliers} />}
        </Form>}
    </section>}
    {view === 'orders' && <section>
      <h2>Buyurtmalar ro‘yxati</h2>
      {orders.length ? <div className="table"><table>
        <thead><tr><th>Mahsulot</th><th>Miqdor</th><th>Yo‘nalish</th><th>Manzil</th><th>Holat</th>{role !== 'customer' && <th>Amal</th>}</tr></thead>
        <tbody>{orders.map(order => <tr key={order.id}>
          <td>{products.find(item => item.id === order.product_id)?.name}</td><td>{order.quantity}</td>
          <td>{order.direction === 'inbound' ? 'Xomashyo kirimi' : 'Mijozga yetkazish'}</td><td>{order.delivery_address}</td><td>{statuses[order.status]}</td>
          {role !== 'customer' && <td>
            <OrderActions order={order} manages={manages} suppliers={suppliers} disabled={changing} change={change} />
          </td>}
        </tr>)}</tbody>
      </table></div> : <p>Buyurtmalar hali yo‘q.</p>}
    </section>}
  </>;
}

function Overview({ products, orders, manages }) {
  const low = manages ? products.filter(item => item.stock <= item.minimum).length : 0;
  const counts = Object.keys(statuses).map(status => [status, orders.filter(order => order.status === status).length]);
  const delivered = counts.find(([status]) => status === 'delivered')[1];
  const available = products.length - low;
  const proportion = products.length ? available / products.length * 100 : 0;
  return <>
    <div className="metrics">
      <div><span>Mahsulot turlari</span><strong>{products.length}</strong></div>
      <div><span>Buyurtmalar</span><strong>{orders.length}</strong></div>
      <div><span>Topshirilgan</span><strong>{delivered}</strong></div>
      {manages && <div><span>Minimal qoldiqda</span><strong>{low}</strong></div>}
    </div>
    <div className={manages ? 'charts' : undefined}>
      {manages && <section>
        <h2>Ombor holati</h2>
        <div className="stock-chart">
          <div className="ring" style={{ '--proportion': proportion + '%' }} aria-hidden="true"><strong>{products.length}</strong></div>
          <div><p><i className="marker" /> Yetarli qoldiq · {available}</p><p><i className="marker warning" /> Minimal yoki undan past · {low}</p></div>
        </div>
      </section>}
      <section>
        <h2>Buyurtmalar holati</h2>
        <div className="bars">{counts.map(([status, count]) => <div key={status}>
          <span>{statuses[status]}</span><progress value={count} max={orders.length || 1} aria-label={statuses[status]} /><strong>{count}</strong>
        </div>)}</div>
      </section>
    </div>
  </>;
}

function OrderActions({ order, manages, suppliers, disabled, change }) {
  const move = (next, supplier = null) => change('advance_order', {
    p_order: order.id, p_next: next, p_supplier: supplier,
  });
  if (manages && order.status === 'pending') return <>
    {order.direction === 'outbound'
      ? suppliers.length > 0 && <Form label="Tasdiqlash" onSubmit={fields => move('approved', fields.get('supplier'))}>
        <SupplierSelect suppliers={suppliers} />
      </Form>
      : <button className="action" disabled={disabled} onClick={() => move('approved')}>Tasdiqlash</button>}
    <button className="action" disabled={disabled} onClick={() => move('rejected')}>Rad etish</button>
  </>;
  if (!manages && order.status === 'approved') {
    return <button className="action" disabled={disabled} onClick={() => move('shipped')}>Jo‘natish</button>;
  }
  if (order.status === 'shipped' && manages === (order.direction === 'inbound')) {
    return <button className="action" disabled={disabled} onClick={() => move('delivered')}>{manages ? 'Omborga qabul qilish' : 'Mijozga topshirildi'}</button>;
  }
  return null;
}
