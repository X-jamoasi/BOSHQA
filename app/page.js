'use client';

import { useEffect, useState } from 'react';
import Platform, { platformSections } from './platform';
import AiChat from './ai-chat';
import Profile from './profile';
import StaffDirectory from './staff-directory';
import ProductList from './product-list';
import SubscriptionPlans from './subscription-plans';
import { AddProduct, Discounts, Shops, formatMoney, mapUrl } from './sales';
import { Boxes, ClipboardList, CircleCheck, Truck, TriangleAlert, Clock3 } from 'lucide-react';
import { DashboardShell, DateWindow, Metrics, StatusBadge, Trend, formatCount, formatDashboardDate } from './dashboard-ui';
import { makeSupabase } from '../lib/supabase';
import { accountLogin, loginEmail, sectors } from '../lib/accounts';

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
  ['products', 'Ombor', '◈', ['owner', 'manager']],
  ['add-product', 'Mahsulot qo‘shish', '', ['owner', 'manager']],
  ['shops', 'Do‘konlar', '', ['owner', 'manager', 'customer']],
  ['discounts', 'Chegirmalar', '', ['owner', 'manager']],
  ['subscriptions', 'Obunalar', '', ['owner']],
  ['catalog', 'Mahsulotlar katalogi', '◈', ['supplier', 'customer']],
  ['staff', 'Xodimlar', '◎', ['owner']],
  ['orders', 'Buyurtmalar', '≡'],
  ['ai', 'AI tahlili', '✦', ['owner', 'manager']],
];

const profileTitles = {
  owner: 'Korxona ma’lumotlari',
  manager: 'Menejer profili',
  supplier: 'Yetkazib beruvchi profili',
  customer: 'Buyurtmachi profili',
  admin: 'Super admin profili',
};

function Workspace({ session }) {
  const [memberships, setMemberships] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState('overview');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [aiSignal, setAiSignal] = useState(0);

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
  const roleLinks = admin ? platformSections : member ? sections.filter(([id, , , allowed]) => id !== 'add-product' && (!allowed || allowed.includes(member.role))) : [];
  const profileTitle = profileTitles[admin ? 'admin' : member?.role] || 'Hisob ma’lumotlari';
  const links = loaded ? [...roleLinks, ...(roleLinks.length ? [['assistant', 'AI yordamchi']] : []), ['profile', profileTitle]] : roleLinks;
  const hasPanel = Boolean(member || (loaded && admin));
  return <DashboardShell links={links} view={view === 'add-product' ? 'products' : view} selectView={setView}
    name={session.user.user_metadata?.full_name || accountLogin(session.user) || session.user.email || 'Hisob'}
    role={admin ? 'Platforma egasi' : roles[member?.role]} company={member?.companies} companies={memberships}
    selected={selected} selectCompany={id => { setSelected(id); setView('overview'); setAiSignal(0); }}
    signOut={() => db.auth.signOut().then(({ error }) => { if (error) setNotice(error.message); })}
    openAI={hasPanel ? () => setAiSignal(value => value + 1) : undefined}
    assistant={hasPanel && <AiChat key={member?.company_id || 'platform'} openSignal={aiSignal} standalone={view === 'assistant'}
      company={member?.company_id || null} token={session.access_token} role={member?.role} />}>
      {notice && <p role="status">{notice}</p>}
      {!loaded && !notice && <p>Korxonalar yuklanmoqda…</p>}
      {loaded && view === 'profile' && <Profile key={member?.company_id || 'account'} db={db} session={session}
        member={member} title={profileTitle} accountAction={accountAction}
        onCompanySaved={(id, company) => setMemberships(items => items.map(item =>
          item.company_id === id ? { ...item, companies: { ...item.companies, ...company } } : item))} />}
      {loaded && admin && view !== 'assistant' && view !== 'profile' && <Platform db={db} view={view} />}
      {member && view !== 'assistant' && view !== 'profile' && <Company key={member.company_id} member={member} token={session.access_token} view={view} selectView={setView} />}
      {loaded && !selected && view !== 'profile' && <p role="status">Hisobingizga korxona biriktirilmagan. Sahifani yangilab ko‘ring. Holat o‘zgarmasa, platforma egasiga loginni yuboring.</p>}
  </DashboardShell>;
}

function SupplierSelect({ suppliers }) {
  return <label>Ta’minotchi yoki yetkazuvchi
    <select name="supplier" defaultValue="" required>
      <option value="" disabled>Tanlang</option>
      {suppliers.map(item => <option key={item.user_id} value={item.user_id}>{item.email}</option>)}
    </select>
  </label>;
}

function Company({ member, token, view, selectView }) {
  const id = member.company_id;
  const role = member.role;
  const manages = role === 'owner' || role === 'manager';
  const [snapshot, setSnapshot] = useState(null);
  const [days, setDays] = useState(7);
  const [orderFilter, setOrderFilter] = useState('');
  const [notice, setNotice] = useState('');
  const [insight, setInsight] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [newStaff, setNewStaff] = useState(null);
  const [staffRevision, setStaffRevision] = useState(0);
  const [orderShop, setOrderShop] = useState('');

  async function load() {
    const [inventory, orderRows, suppliers, catalog, shops, discounts, totals] = await Promise.all([
      manages ? read(db.rpc('inventory', { p_company: id })) : [],
      read(db.from('orders').select('id,product_id,quantity,status,direction,delivery_address,created_at,shop_name,order_unit,delivery_latitude,delivery_longitude').eq('company_id', id).order('created_at', { ascending: false })),
      manages ? read(db.rpc('company_suppliers', { p_company: id })) : [],
      read(db.rpc('sales_catalog', { p_company: id })),
      manages || role === 'customer' ? read(db.rpc('shop_directory', { p_company: id })) : [],
      manages ? read(db.rpc('company_discounts', { p_company: id })) : [],
      manages || role === 'customer' ? read(db.rpc('order_sale_totals', { p_company: id })) : [],
    ]);
    const paths = catalog.map(item => item.image_path).filter(Boolean);
    const signed = paths.length ? await db.storage.from('product-images').createSignedUrls(paths, 3600) : null;
    const images = new Map((signed?.data || []).map(item => [item.path, item.signedUrl]));
    const stockByProduct = new Map(inventory.map(item => [item.id, item]));
    const products = catalog.map(item => ({ ...stockByProduct.get(item.id), ...item, imageUrl: images.get(item.image_path) }));
    const totalsByOrder = new Map(totals.map(item => [item.id, item]));
    const orders = orderRows.map(item => ({ ...item, ...totalsByOrder.get(item.id) }));
    setSnapshot({ products, orders, suppliers, shops, discounts });
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
      setInsight({ text: result.text ?? result.error, source: result.source });
    } catch {
      setInsight({ text: 'Tahlil xizmatiga ulanib bo‘lmadi.' });
    } finally {
      setAnalyzing(false);
    }
  }

  if (!snapshot) return <p role="status">{notice || 'Korxona ma’lumotlari yuklanmoqda…'}</p>;
  const { products, orders, suppliers, shops, discounts } = snapshot;
  const visibleOrders = orders.filter(order => !orderFilter || order.status === orderFilter);
  const addingProduct = view === 'add-product' && manages;
  const editingProduct = view === 'products' && manages ? products.find(item => item.id === editingProductId) : null;
  const productDrawerOpen = addingProduct || Boolean(editingProduct);
  function closeProduct() {
    setEditingProductId(null);
    selectView('products');
  }
  const heading = { owner: 'Korxona egasi paneli', manager: 'Menejer paneli', supplier: 'Yetkazib beruvchi paneli', customer: 'Buyurtmachi paneli' };
  return <>
    <header className="page-header">
      <div><h1>{view === 'overview' ? heading[role] : addingProduct ? 'Ombor' : sections.find(item => item[0] === view)[1]}</h1>
        {view === 'overview' && <p>Buyurtmalar va korxona faoliyatining joriy holati</p>}</div>
      {view === 'overview' && <DateWindow days={days} setDays={setDays} />}
      <button className="secondary" disabled={changing} onClick={() => load().then(() => setNotice('')).catch(error => setNotice(error.message))}>Yangilash</button>
    </header>
    {notice && !productDrawerOpen && <p role="status">{notice}</p>}
    {view === 'overview' && <Overview products={products} orders={orders} manages={manages} role={role} days={days} selectView={selectView} />}
    {view === 'staff' && role === 'owner' && <>
    <section>
      <h2>Xodim qo‘shish</h2>
      <Form label="Hisob yaratish" onSubmit={async fields => {
        setNotice('');
        setNewStaff(null);
        try {
          const result = await accountAction({
            action: 'staff', company: id, login: fields.get('login'), role: fields.get('role'),
            name: fields.get('name'), phone: fields.get('phone'),
          }, token);
          setNewStaff(result);
          setStaffRevision(value => value + 1);
          load().catch(error => setNotice(error.message));
          return true;
        } catch (error) {
          setNotice(error.message);
          return false;
        }
      }}>
        <LoginField />
        <label>Ism va familiya<input name="name" maxLength="100" /></label>
        <label>Telefon<input name="phone" type="tel" maxLength="16" placeholder="+998901234567" /></label>
        <label>Rol<select name="role">{Object.entries(roles).filter(([key]) => key !== 'owner').map(([key, label]) =>
          <option key={key} value={key}>{label}</option>)}</select></label>
      </Form>
      {newStaff && <div className="insight" role="status">
        <p>{newStaff.recovered ? 'Xodim hisobi tiklandi.' : 'Xodim hisobi yaratildi.'}</p>
        <p>Login <code>{newStaff.login}</code></p>
        <p>Vaqtinchalik parol <code>{newStaff.password}</code></p>
        <p>Ma’lumotlarni xodimga xavfsiz kanalda bering. Birinchi kirishda parol almashtiriladi.</p>
        <button type="button" onClick={() => setNewStaff(null)}>Yopish</button>
      </div>}
    </section>
    <StaffDirectory db={db} company={id} roles={roles} statuses={statuses} revision={staffRevision}
      onChanged={() => load().catch(error => setNotice(error.message))} />
    </>}
    {view === 'shops' && <Shops shops={shops} canAdd={role === 'customer'} Form={Form} change={change} company={id}
      openOrder={shop => { setOrderShop(shop); selectView('orders'); }} />}
    {productDrawerOpen && <AddProduct key={editingProduct?.id || 'new'} product={editingProduct}
      db={db} company={id} Form={Form} change={change} onError={setNotice} notice={notice}
      onClose={() => { setNotice(''); closeProduct(); }} onSaved={closeProduct} />}
    {view === 'subscriptions' && role === 'owner' && <SubscriptionPlans company={id} />}
    {view === 'discounts' && manages && <Discounts products={products} discounts={discounts} company={id} Form={Form} change={change} />}
    {view === 'catalog' && !manages && <ProductList products={products} showPrice={role === 'customer'} />}
    {(view === 'products' || addingProduct) && manages && <ProductList products={products} manages showPrice addProduct={() => selectView('add-product')} editProduct={setEditingProductId} />}
    {view === 'ai' && manages && <section>
      <h2>Ombor bo‘yicha AI tavsiyasi</h2>
      <p>{products.length ? 'Qaysi mahsulotlar minimal qoldiqqa yetganini va qaysilarini to‘ldirish kerakligini tekshiring.' : 'Tahlilni boshlash uchun Mahsulotlar bo‘limida mahsulot qo‘shing.'}</p>
      <button className="action" disabled={analyzing || !products.length} onClick={analyze}>{analyzing ? 'Tahlil qilinmoqda…' : 'AI xulosasini olish'}</button>
      {insight && <div className="insight" role="status">
        {insight.source && <strong>{insight.source === 'ai' ? 'AI xulosasi' : 'Qoidaga asoslangan tekshiruv'}</strong>}
        <p>{insight.text}</p>
      </div>}
    </section>}
    {view === 'orders' && (manages || role === 'customer') && <section>
      <h2>{manages ? 'Xomashyo buyurtmasi' : 'Yangi buyurtma'}</h2>
      {!products.length || (manages ? !suppliers.length : !shops.length) ? <p>{manages
        ? 'Avval mahsulot va ta’minotchi qo‘shing.'
        : products.length ? 'Buyurtma berish uchun avval Do‘konlar bo‘limida do‘kon qo‘shing.' : 'Katalogda mahsulot yo‘q.'}</p> :
        <Form key={orderShop} label="Buyurtma berish" onSubmit={fields => {
          const product = fields.get('product');
          const quantity = Number(fields.get('quantity'));
          return manages ? change('create_order', {
            p_company: id, p_product: product, p_quantity: quantity,
            p_direction: 'inbound', p_address: fields.get('address'), p_supplier: fields.get('supplier'),
          }) : change('create_shop_order', {
            p_company: id, p_product: product, p_quantity: quantity, p_shop: fields.get('shop'),
          });
        }}>
          <label>Mahsulot<select name="product">{products.map(item => <option key={item.id} value={item.id}>
            {item.name} · {item.unit}{!manages && item.price != null ? ' · ' + formatMoney(item.price * (100 - item.discount) / 100) : ''}
          </option>)}</select></label>
          <label>Miqdor<input name="quantity" type="number" min="1" max="1000000" required /></label>
          {manages ? <>
            <label>Yetkazish manzili<input name="address" minLength="5" maxLength="250" required /></label>
            <SupplierSelect suppliers={suppliers} />
          </> : <label>Yetkaziladigan do‘kon<select name="shop" defaultValue={orderShop} required>
            <option value="" disabled>Do‘konni tanlang</option>
            {shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name} · {shop.address}</option>)}
          </select></label>}
        </Form>}
    </section>}
    {view === 'orders' && <section>
      <div className="panel-heading"><h2>Buyurtmalar ro‘yxati</h2>
        <select aria-label="Holat bo‘yicha filtrlash" value={orderFilter} onChange={event => setOrderFilter(event.target.value)}>
          <option value="">Barcha holatlar</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {visibleOrders.length ? <div className="table"><table>
        <thead><tr><th>Mahsulot</th><th>Miqdor</th><th>Yo‘nalish</th><th>Do‘kon va manzil</th>{role !== 'supplier' && <th>Yakuniy narx</th>}<th>Holat</th>{role !== 'customer' && <th>Amal</th>}</tr></thead>
        <tbody>{visibleOrders.map(order => <tr key={order.id}>
          <td>{products.find(item => item.id === order.product_id)?.name}</td><td>{order.quantity} {order.order_unit || ''}</td>
          <td>{order.direction === 'inbound' ? 'Xomashyo kirimi' : 'Mijozga yetkazish'}</td><td>{order.shop_name && <><strong>{order.shop_name}</strong><br /></>}{order.delivery_address}
            {order.delivery_latitude != null && order.delivery_longitude != null && <><br /><a href={mapUrl(order.delivery_latitude, order.delivery_longitude)} target="_blank" rel="noreferrer">Xaritada</a></>}
          </td>
          {role !== 'supplier' && <td>{formatMoney(order.order_total)}{order.discount_percent > 0 && <small> · −{order.discount_percent}%</small>}</td>}
          <td><StatusBadge status={order.status}>{statuses[order.status]}</StatusBadge></td>
          {role !== 'customer' && <td>
            <OrderActions order={order} manages={manages} suppliers={suppliers} disabled={changing} change={change} />
          </td>}
        </tr>)}</tbody>
      </table></div> : <p>{orderFilter ? 'Bu holatdagi buyurtma topilmadi.' : 'Buyurtmalar hali yo‘q.'}</p>}
    </section>}
  </>;
}

function Overview({ products, orders, manages, role, days, selectView }) {
  const low = manages ? products.filter(item => item.stock <= item.minimum) : [];
  const delivered = orders.filter(order => order.status === 'delivered').length;
  const active = orders.filter(order => ['pending', 'approved', 'shipped'].includes(order.status)).length;
  const pending = orders.filter(order => order.status === 'pending').length;
  const inTransit = orders.filter(order => order.status === 'shipped').length;
  const recent = orders.slice(0, 5);
  const catalog = new Map(products.map(product => [product.id, product.name]));
  return <>
    <Metrics values={[
      ['Faol buyurtmalar', active, ClipboardList],
      ['Topshirilgan', delivered, CircleCheck],
      ['Mahsulot turlari', products.length, Boxes],
      manages ? ['Minimal qoldiqda', low.length, TriangleAlert] :
        role === 'supplier' ? ['Yo‘lda', inTransit, Truck] : ['Kutilmoqda', pending, Clock3],
    ]} />
    <div className={'dashboard-grid overview-' + role}>
      <section><h2>Buyurtmalar dinamikasi</h2>
        <Trend records={orders} dateKey="created_at" days={days} label="Kunlik buyurtmalar soni" />
      </section>
      {manages ? <section>
        <div className="panel-heading"><h2>Kam qolgan mahsulotlar</h2><button className="text-button" onClick={() => selectView('products')}>Omborni ochish →</button></div>
        {low.length ? <div className="table"><table><thead><tr><th>Mahsulot</th><th>Qoldiq</th><th>Minimum</th></tr></thead>
          <tbody>{low.slice(0, 5).map(item => <tr key={item.id}><td>{item.name}</td><td className="low">{formatCount(item.stock)}</td><td>{formatCount(item.minimum)}</td></tr>)}</tbody></table></div> :
          <p>{products.length ? 'Minimal qoldiqdan past mahsulot yo‘q.' : 'Omborda hali mahsulot yo‘q.'}</p>}
      </section> : <section>
        <h2>Buyurtma holatlari</h2>
        <div className="bars">{Object.entries(statuses).filter(([status]) => role !== 'supplier' || status !== 'pending').map(([status, label]) => {
          const count = orders.filter(order => order.status === status).length;
          return <div key={status}><span>{label}</span><progress value={count} max={orders.length || 1} aria-label={label} /><strong>{count}</strong></div>;
        })}</div>
      </section>}
      <section className="recent-orders dashboard-wide"><div className="panel-heading"><h2>So‘nggi buyurtmalar</h2>
        <button className="text-button" onClick={() => selectView('orders')}>Barchasini ko‘rish →</button></div>
        {recent.length ? <div className="table"><table><thead><tr><th>Mahsulot</th><th>Miqdor</th><th>Yo‘nalish</th><th>Holat</th><th>Sana</th></tr></thead>
          <tbody>{recent.map(order => <tr key={order.id}><td>{catalog.get(order.product_id) || 'Mahsulot'}</td>
            <td>{formatCount(order.quantity)}</td><td>{order.direction === 'inbound' ? 'Kirim' : 'Chiqim'}</td>
            <td><StatusBadge status={order.status}>{statuses[order.status]}</StatusBadge></td><td>{formatDashboardDate(order.created_at, true)}</td></tr>)}</tbody>
        </table></div> : <p>Buyurtmalar hali yo‘q.</p>}
      </section>
      {role === 'supplier' && <section className="dashboard-wide">
        <div className="panel-heading"><h2>Yetkazib berish jarayoni</h2><button className="text-button" onClick={() => selectView('orders')}>Buyurtmalarni ochish →</button></div>
        {orders.length ? <div className="delivery-steps">
          {['approved', 'shipped', 'delivered'].map(status => <div key={status}>
            <StatusBadge status={status}>{statuses[status]}</StatusBadge>
            <strong>{formatCount(orders.filter(order => order.status === status).length)}</strong>
          </div>)}
        </div> : <p>Biriktirilgan buyurtma hali yo‘q.</p>}
      </section>}
      {role === 'owner' && <section className="insight-callout">
        <div className="panel-heading"><h2>AI biznes tahlili</h2><button className="text-button" onClick={() => selectView('ai')}>AI xulosasini olish →</button></div>
        <p>Ombordagi mahsulotlarning qoldig‘i bo‘yicha tavsiya oling.</p>
      </section>}
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
