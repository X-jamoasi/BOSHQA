'use client';

import { useEffect, useState } from 'react';
import { makeSupabase } from '../lib/supabase';

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

function Auth() {
  const [signup, setSignup] = useState(false);
  const [notice, setNotice] = useState('');
  return <main>
    <h1>BOSHQA</h1>
    <section>
      <h2>{signup ? 'Hisob ochish' : 'Hisobga kirish'}</h2>
      <Form label={signup ? 'Ro‘yxatdan o‘tish' : 'Kirish'} onSubmit={async fields => {
        setNotice('');
        try {
          const credentials = { email: fields.get('email').trim(), password: fields.get('password') };
          const data = signup
            ? await read(db.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin } }))
            : await read(db.auth.signInWithPassword(credentials));
          if (signup && !data.session) setNotice('E-pochtangizga kelgan tasdiqlash havolasini oching.');
          return true;
        } catch (error) {
          setNotice(error.message);
          return false;
        }
      }}>
        <label>E-pochta<input type="email" name="email" autoComplete="email" required /></label>
        <label>Parol<input type="password" name="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined} required /></label>
      </Form>
      <p role="status">{notice}</p>
      <button type="button" onClick={() => { setSignup(!signup); setNotice(''); }}>
        {signup ? 'Hisobim bor' : 'Yangi hisob ochish'}
      </button>
    </section>
  </main>;
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
  return <Workspace key={session.user.id} session={session} />;
}

function Workspace({ session }) {
  const [memberships, setMemberships] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [members, adminStatus] = await Promise.all([
      read(db.from('company_members').select('company_id, role, companies(name)').eq('user_id', session.user.id)),
      read(db.rpc('is_platform_admin')),
    ]);
    setMemberships(members);
    setAdmin(adminStatus);
    setSelected(current => current || members[0]?.company_id || (adminStatus ? 'platform' : ''));
    setLoaded(true);
  }

  useEffect(() => {
    load().catch(error => setNotice(error.message));
  }, []);

  const member = memberships.find(item => item.company_id === selected);
  return <div className="shell">
    <aside>
      <div className="brand">BOSHQA<span>.</span></div>
      <p className="demo">{session.user.email}</p>
      <nav aria-label="Korxonalar">
        {memberships.map(item => <button key={item.company_id} aria-pressed={selected === item.company_id}
          onClick={() => setSelected(item.company_id)}>{item.companies.name}</button>)}
        {admin && <button aria-pressed={selected === 'platform'} onClick={() => setSelected('platform')}>Platforma</button>}
        <button aria-pressed={selected === 'new'} onClick={() => setSelected('new')}>Yangi korxona</button>
        <button onClick={() => db.auth.signOut().then(({ error }) => { if (error) setNotice(error.message); })}>Chiqish</button>
      </nav>
    </aside>
    <main>
      {notice && <p role="status">{notice}</p>}
      {!loaded && !notice && <p>Korxonalar yuklanmoqda…</p>}
      {selected === 'platform' && admin && <Platform />}
      {member && <Company key={member.company_id} member={member} token={session.access_token} />}
      {(selected === 'new' || (loaded && !selected)) && <section>
        <h1>Yangi korxona</h1>
        <p>Mavjud korxonaga qo‘shilish uchun uning egasiga hisobingizdagi e-pochta manzilini bering.</p>
        <Form label="Korxona ochish" onSubmit={async fields => {
          try {
            const id = await read(db.rpc('create_company', { p_name: fields.get('name') }));
            await load();
            setSelected(id);
            setNotice('');
            return true;
          } catch (error) {
            setNotice(error.message);
            return false;
          }
        }}>
          <label>Korxona nomi<input name="name" minLength="2" maxLength="100" required /></label>
        </Form>
      </section>}
    </main>
  </div>;
}

function Platform() {
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    read(db.rpc('platform_summary')).then(setCompanies).catch(error => setError(error.message));
  }, []);
  return <section>
    <h1>Platforma egasi</h1>
    {error && <p role="status">{error}</p>}
    {companies && <div className="table"><table>
      <thead><tr><th>Korxona</th><th>A’zolar</th><th>Buyurtmalar</th></tr></thead>
      <tbody>{companies.map(item => <tr key={item.company_id}><td>{item.name}</td><td>{item.member_count}</td><td>{item.order_count}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}

function SupplierSelect({ suppliers }) {
  return <label>Ta’minotchi yoki yetkazuvchi
    <select name="supplier" defaultValue="" required>
      <option value="" disabled>Tanlang</option>
      {suppliers.map(item => <option key={item.user_id} value={item.user_id}>{item.email}</option>)}
    </select>
  </label>;
}

function Company({ member, token }) {
  const id = member.company_id;
  const role = member.role;
  const manages = role === 'owner' || role === 'manager';
  const [snapshot, setSnapshot] = useState(null);
  const [notice, setNotice] = useState('');
  const [insight, setInsight] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [changing, setChanging] = useState(false);

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
    setInsight('');
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
    setInsight('');
    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ company: id }),
      });
      const result = await response.json();
      setInsight(result.text ?? result.error);
    } catch {
      setInsight('Tahlil xizmatiga ulanib bo‘lmadi.');
    } finally {
      setAnalyzing(false);
    }
  }

  if (!snapshot) return <p role="status">{notice || 'Korxona ma’lumotlari yuklanmoqda…'}</p>;
  const { products, orders, suppliers } = snapshot;
  return <>
    <header><p className="company">{member.companies.name}</p><h1>{roles[role]}</h1><button className="action" disabled={changing} onClick={() => load().then(() => setNotice('')).catch(error => setNotice(error.message))}>Yangilash</button></header>
    {notice && <p role="status">{notice}</p>}
    {role === 'owner' && <section>
      <h2>Xodim yoki hamkor qo‘shish</h2>
      <Form label="Qo‘shish" onSubmit={fields => change('add_company_member', {
        p_company: id, p_email: fields.get('email'), p_role: fields.get('role'),
      })}>
        <label>Tasdiqlangan hisob e-pochtasi<input name="email" type="email" required /></label>
        <label>Rol<select name="role">{Object.entries(roles).filter(([key]) => key !== 'owner').map(([key, label]) =>
          <option key={key} value={key}>{label}</option>)}</select></label>
      </Form>
    </section>}
    {manages && <section>
      <div className="section-title"><h2>Ombor</h2><button className="action" disabled={analyzing || !products.length} onClick={analyze}>Qoldiqni tahlil qilish</button></div>
      <div className="table"><table>
        <thead><tr><th>Mahsulot</th><th>Qoldiq</th><th>Minimal miqdor</th></tr></thead>
        <tbody>{products.map(item => <tr key={item.id}><td>{item.name}</td><td className={item.stock <= item.minimum ? 'low' : ''}>{item.stock}</td><td>{item.minimum}</td></tr>)}</tbody>
      </table></div>
      {insight && <p className="insight" role="status">{insight}</p>}
      <h3>Mahsulot qo‘shish</h3>
      <Form label="Saqlash" onSubmit={fields => change('add_product', {
        p_company: id, p_name: fields.get('name'), p_stock: Number(fields.get('stock')), p_minimum: Number(fields.get('minimum')),
      })}>
        <label>Nomi<input name="name" minLength="2" maxLength="80" required /></label>
        <label>Boshlang‘ich qoldiq<input name="stock" type="number" min="0" max="2147483647" defaultValue="0" required /></label>
        <label>Minimal qoldiq<input name="minimum" type="number" min="0" max="2147483647" defaultValue="0" required /></label>
      </Form>
    </section>}
    {(manages || role === 'customer') && <section>
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
    <section>
      <h2>Buyurtmalar</h2>
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
    </section>
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
