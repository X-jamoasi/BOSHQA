'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Building2, Package, ShoppingBasket } from 'lucide-react';
import { formatMoney } from './sales';

export async function withImages(db, rows, field) {
  const paths = [...new Set(rows.map(row => row[field]).filter(Boolean))];
  const result = paths.length ? await db.storage.from('product-images').createSignedUrls(paths, 3600) : null;
  const urls = new Map(result?.data?.map(item => [item.path, item.signedUrl]));
  return rows.map(row => ({ ...row, imageUrl: urls.get(row[field]) }));
}

export function useBasket() {
  const [items, setItems] = useState([]);
  const request = useRef({});
  function change(company, product, quantity) {
    request.current[company.id] = undefined;
    setItems(previous => {
      const rest = previous.filter(line => line.product.id !== product.id || line.company.id !== company.id);
      return quantity ? [...rest, { company, product, quantity }] : rest;
    });
  }
  function add(company, product) {
    change(company, product, (items.find(line => line.company.id === company.id && line.product.id === product.id)?.quantity || 0) + 1);
  }
  async function checkout(company, shop, db) {
    const contents = items.filter(line => line.company.id === company);
    const key = company + ':' + (shop || '');
    request.current[company] ??= {};
    const id = request.current[company][key] ??= crypto.randomUUID();
    const { error } = await db.rpc('checkout_market_cart', {
      p_company: company, p_shop: shop, p_request: id,
      p_items: contents.map(({ product, quantity }) => ({ product: product.id, quantity })),
    });
    if (error?.code === 'PGRST202') throw new Error('Savatni ishga tushirish uchun Supabase migratsiyasi kerak.');
    if (error) throw error;
    setItems(previous => previous.filter(line => line.company.id !== company));
    delete request.current[company];
  }
  return { items, add, change, checkout };
}

const price = (item, quantity = 1) => Math.round(Number(item.price) * (100 - (item.discount || 0)) * quantity) / 100;

export function ProductCards({ products, onAdd }) {
  const [query, setQuery] = useState('');
  const shown = products.filter(item => item.price != null && item.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="market-section">
    <div className="panel-heading"><h2>Mahsulotlar</h2>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Mahsulot qidirish" aria-label="Mahsulot qidirish" />
    </div>
    {shown.length ? <div className="market-products">{shown.map(product => <article key={product.id} className="market-card">
      <div className="market-product-image">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <Package size={38} aria-hidden="true" />}</div>
      <div className="market-body">
        <strong>{formatMoney(price(product))} / {product.unit || 'dona'}</strong>
        <h3>{product.name}</h3>
        <button type="button" className="action" onClick={() => onAdd(product)}><ShoppingBasket size={17} aria-hidden="true" /> Savatga qo‘shish</button>
      </div>
    </article>)}</div> : <p>Mahsulot topilmadi.</p>}
  </section>;
}

export function StoreMarket({ db, onAdd }) {
  const [firms, setFirms] = useState(null);
  const [sector, setSector] = useState('');
  const [selected, setSelected] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await db.rpc('market_company_profile');
      if (error?.code === 'PGRST202') throw new Error('Firmalar katalogini ishga tushirish uchun Supabase migratsiyasi kerak.');
      if (error) throw error;
      const rows = await withImages(db, data, 'cover_path');
      if (active) setFirms(rows);
    })().catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [db]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    (async () => {
      const { data, error } = await db.rpc('store_sales_catalog', { p_company: selected.id });
      if (error) throw error;
      const rows = await withImages(db, data, 'image_path');
      if (active) setCatalog(rows);
    })().catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [db, selected]);

  if (!firms) return <p role="status">{error || 'Firmalar yuklanmoqda…'}</p>;
  if (selected) return <>
    <section className="market-section">
      <button type="button" className="text-button" onClick={() => { setSelected(null); setError(''); }}>← Firmalar</button>
      <h2>{selected.name}</h2>
      <p>{[selected.legal_type, selected.legal_name, selected.sector, selected.legal_address, selected.contact].filter(Boolean).join(' · ')}</p>
    </section>
    {catalog ? <ProductCards products={catalog} onAdd={product => onAdd(selected, product)} /> : <p role="status">{error || 'Mahsulotlar yuklanmoqda…'}</p>}
  </>;
  const sectors = [...new Set(firms.map(firm => firm.sector).filter(Boolean))];
  return <section className="market-section">
    <div className="market-filters">{['', ...sectors].map(value => <button key={value} type="button"
      className={sector === value ? 'action' : 'secondary'} aria-pressed={sector === value} onClick={() => setSector(value)}>{value || 'Barchasi'}</button>)}</div>
    {firms.length ? <div className="market-firms">{firms.filter(firm => !sector || firm.sector === sector).map(firm =>
      <article key={firm.id} className="market-card">
        <div className="market-firm-image">{firm.imageUrl ? <img src={firm.imageUrl} alt="" /> : <Building2 size={52} aria-hidden="true" />}
          {firm.sector && <span>{firm.sector}</span>}
        </div>
        <div className="market-body">
          <h2>{firm.name}</h2>
          {(firm.legal_type || firm.legal_name) && <p>{[firm.legal_type, firm.legal_name].filter(Boolean).join(' · ')}</p>}
          {firm.legal_address && <p>{firm.legal_address}</p>}
          <button type="button" className="secondary" onClick={() => { setCatalog(null); setError(''); setSelected(firm); }}>
            Mahsulotlarni ko‘rish <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </div>
      </article>)}</div> : <p>Firma hali bog‘lanmagan. Agentga do‘kon ID’sini bering.</p>}
  </section>;
}

export function Basket({ basket, db, shops, profile, onSent, initialShop }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const companies = [...new Map(basket.items.map(line => [line.company.id, line.company])).values()];
  return <section className="market-section">
    {message && <p role="status">{message}</p>}
    {!companies.length && <p>Savat bo‘sh.</p>}
    {companies.map(company => {
      const items = basket.items.filter(line => line.company.id === company.id);
      return <form key={company.id} className="market-basket" onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        const shop = new FormData(event.currentTarget).get('shop');
        setBusy(true);
        setMessage('');
        try {
          await basket.checkout(company.id, shop || null, db);
          setMessage('Buyurtma menejerga yuborildi.');
          await onSent();
        } catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
      }}>
        <h2>{company.name}</h2>
        {items.map(({ product, quantity }) => <div className="market-basket-line" key={product.id}>
          <span>{product.name} · {formatMoney(price(product))}</span>
          <input aria-label={product.name + ' miqdori'} type="number" min="1" max="1000000" required value={quantity} disabled={busy}
            onChange={event => { const n = event.target.valueAsNumber; if (Number.isInteger(n) && n >= 1 && n <= 1000000) basket.change(company, product, n); }} />
          <button type="button" className="secondary" disabled={busy} onClick={() => basket.change(company, product, 0)}>Olib tashlash</button>
        </div>)}
        <p><strong>Jami {formatMoney(items.reduce((total, line) => total + price(line.product, line.quantity), 0))}</strong></p>
        {profile ? <p>Yetkazish manzili · {profile.name} · {profile.address || 'Manzil kiritilmagan'}</p> :
          <label>Yetkaziladigan do‘kon<select name="shop" defaultValue={initialShop || ''} required>
            <option value="" disabled>Do‘konni tanlang</option>
            {shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name} · {shop.address}</option>)}
          </select></label>}
        <button className="action" disabled={busy || (profile ? !profile.address : !shops.length)}>Buyurtmani yuborish</button>
      </form>;
    })}
  </section>;
}
