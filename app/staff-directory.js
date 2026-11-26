'use client';

import { PanelState } from './dashboard-ui';
import { useEffect, useState } from 'react';
import { formatDashboardDate, StatusBadge } from './dashboard-ui';

const pageSize = 20;
const involvement = { customer: 'Buyurtmachi', supplier: 'Yetkazib beruvchi', creator: 'Buyurtma yaratgan' };
const displayName = person => person.name || person.login || person.email || 'Ism kiritilmagan';

export default function StaffDirectory({ db, company, roles, statuses, revision, onChanged }) {
  const [people, setPeople] = useState(null);
  const [problem, setProblem] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setProblem('');
    try {
      const { data, error } = await db.rpc('company_staff_directory', { p_company: company });
      if (error) throw error;
      setPeople(data);
      setSelected(id => data.some(item => item.user_id === id) ? id : null);
    } catch (error) {
      setProblem(error.code === 'PGRST202' ? 'Xodimlar ro‘yxati uchun Supabase migratsiyasini ishga tushiring.' : error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [company, revision]);

  const filtered = people?.filter(person => [person.name, person.login, person.phone, person.email, roles[person.role]]
    .some(value => value?.toLowerCase().includes(query.trim().toLowerCase())));
  const person = people?.find(item => item.user_id === selected);
  return <>
    <section>
      <div className="panel-heading">
        <h2>Mavjud xodimlar va hamkorlar</h2>
        <div className="staff-controls">
          <input type="search" aria-label="Xodim qidirish" placeholder="Ism, login yoki telefon" value={query} onChange={event => setQuery(event.target.value)} />
          <button className="secondary" type="button" disabled={loading} onClick={load}>Ro‘yxatni yangilash</button>
        </div>
      </div>
      {problem && <PanelState kind="error">{problem}</PanelState>}
      {loading && !people && <PanelState kind="loading">Xodimlar yuklanmoqda…</PanelState>}
      {filtered?.length ? <div className="table"><table>
        <thead><tr><th>Ism yoki login</th><th>Rol</th><th>Telefon</th><th>Hisob holati</th><th>Profil</th></tr></thead>
        <tbody>{filtered.map(item => <tr key={item.user_id}>
          <td>{displayName(item)}</td><td>{roles[item.role]}</td><td>{item.phone || 'Kiritilmagan'}</td>
          <td><StatusBadge status={item.pending_password ? 'pending' : 'success'}>{item.pending_password ? 'Birinchi kirish kutilmoqda' : 'Kirishga ruxsat bor'}</StatusBadge></td>
          <td><button className="text-button" type="button" aria-label={displayName(item) + ' profilini ko‘rish'} onClick={() => setSelected(item.user_id)}>Ko‘rish</button></td>
        </tr>)}</tbody>
      </table></div> : filtered && <p>{query ? 'Mos xodim topilmadi.' : 'Xodim yoki hamkor hali qo‘shilmagan.'}</p>}
    </section>
    {person && <StaffProfile key={person.user_id} db={db} company={company} person={person} roles={roles} statuses={statuses}
      close={() => setSelected(null)} refresh={async () => { await load(); await onChanged(); }} />}
  </>;
}

function StaffProfile({ db, company, person, roles, statuses, close, refresh }) {
  const [orders, setOrders] = useState(null);
  const [orderError, setOrderError] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setOrders(null);
    setOrderError('');
    db.rpc('company_staff_orders', { p_company: company, p_user: person.user_id, p_offset: page * pageSize })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setOrderError(error.message);
        else setOrders(data);
      });
    return () => { active = false; };
  }, [company, person.user_id, db, page]);

  async function changeRole(role) {
    setBusy(true);
    setNotice('');
    try {
      const { error } = await db.rpc('manage_company_staff', { p_company: company, p_user: person.user_id, p_role: role });
      if (error) throw error;
      await refresh();
      setNotice('O‘zgarish saqlandi.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <section>
    <div className="panel-heading"><h2>{displayName(person)} profili</h2>
      <button className="secondary" type="button" onClick={close}>Profilni yopish</button>
    </div>
    <dl className="company-details">
      <div><dt>Login</dt><dd>{person.login || 'Kiritilmagan'}</dd></div>
      <div><dt>Telefon</dt><dd>{person.phone || 'Kiritilmagan'}</dd></div>
      <div><dt>E-pochta</dt><dd>{person.email || 'Kiritilmagan'}</dd></div>
      <div><dt>Rol</dt><dd>{roles[person.role]}</dd></div>
    </dl>
    <h3>Korxonadagi buyurtmalar</h3>
    {orderError && <p role="alert">{orderError}</p>}
    {!orders && !orderError && <PanelState kind="loading">Buyurtmalar yuklanmoqda…</PanelState>}
    {orders?.length ? <div className="table"><table>
      <thead><tr><th>Mahsulot</th><th>Miqdor</th><th>Ishtiroki</th><th>Holat</th><th>Sana</th></tr></thead>
      <tbody>{orders.slice(0, pageSize).map(order => <tr key={order.id}>
        <td>{order.product_name}</td><td>{order.quantity}</td><td>{involvement[order.involvement]}</td>
        <td><StatusBadge status={order.status}>{statuses[order.status]}</StatusBadge></td><td>{formatDashboardDate(order.created_at)}</td>
      </tr>)}</tbody>
    </table></div> : orders && <p>Bu sahifada buyurtma yo‘q.</p>}
    {(page > 0 || orders?.length > pageSize) && <div className="staff-controls">
      <button className="secondary" type="button" disabled={!page || !orders} onClick={() => setPage(value => value - 1)}>Oldingi</button>
      <span>{page + 1}-sahifa</span>
      <button className="secondary" type="button" disabled={!orders || orders.length <= pageSize} onClick={() => setPage(value => value + 1)}>Keyingi</button>
    </div>}
    <h3>Xodimni boshqarish</h3>
    <form key={person.role} onSubmit={event => { event.preventDefault(); changeRole(new FormData(event.currentTarget).get('role')); }}>
      <label>Yangi rol<select name="role" defaultValue={person.role} disabled={busy}>
        {Object.entries(roles).filter(([key]) => key !== 'owner').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <button className="action" disabled={busy}>Rolni saqlash</button>
      <button className="secondary staff-remove" type="button" disabled={busy} onClick={() => {
        if (window.confirm('Bu hisobning korxonaga kirish huquqini olib tashlaysizmi?')) changeRole(null);
      }}>Korxonadan chiqarish</button>
    </form>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
