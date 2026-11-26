'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { mapLinks } from '../lib/maps';

export const units = ['dona','blok','kg','qop','tonna','litr','metr','quti','paket','juft'];
const money = new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 2 });
export function MapChoices({ latitude, longitude }) {
  const links=mapLinks(latitude,longitude);
  if(!links.length) return null;
  return <details className="map-choices"><summary>Xaritada ochish</summary>
    <div>{links.map(([name,url])=><a key={name} href={url} target="_blank" rel="noreferrer">{name}</a>)}</div>
  </details>;
}
export const formatMoney = value => value == null ? '—' : money.format(value) + ' so‘m';

export function Shops({ shops, orders, products, statuses, canAdd, canManage, Form, change, company, openOrder }) {
  const [selected, setSelected] = useState(null);
  const current = shops.find(shop => shop.id === selected);
  const relatedIds = new Set(shops.filter(shop => current && (shop.id === current.id || (current.store_id && shop.store_id === current.store_id))).map(shop => shop.id));
  const shopOrders = orders.filter(order => relatedIds.has(order.shop_id));
  const listed = canAdd ? shops : [...new Map(shops.map(shop => [shop.store_id || shop.id, shop])).values()];
  return <>
    {canAdd && <section>
      <h2>Do‘konni ID orqali bog‘lash</h2>
      <Form label="Do‘konni bog‘lash" onSubmit={fields => change('link_store_by_code', {
        p_company: company, p_code: fields.get('code'),
      })}>
        <label>Do‘kon ID’si<input name="code" autoComplete="off" spellCheck={false} maxLength="40" required /></label>
      </Form>
    </section>}
    <section>
      <h2>Do‘konlar ro‘yxati</h2>
      {listed.length ? <div className="table"><table>
        <thead><tr><th>Do‘kon</th><th>Firma</th><th>Telefon</th><th>Manzil</th><th>Joylashuv</th><th>{canAdd ? 'Amal' : 'Kiritgan agent'}</th></tr></thead>
        <tbody>{listed.map(shop => <tr key={shop.id}>
          <td><button type="button" className="text-button" onClick={() => setSelected(shop.id)}>{shop.name}</button>{shop.active === false && <small> · Aloqa uzilgan</small>}</td><td>{shop.legal_type === 'yatt' ? 'YaTT' : 'MChJ'} · {shop.legal_name}</td>
          <td>{shop.phone}</td><td>{shop.address}</td>
          <td><MapChoices latitude={shop.latitude} longitude={shop.longitude} /></td>
          <td>{canAdd ? <button className="text-button" type="button" onClick={() => openOrder(shop.id)}>Buyurtma berish →</button> : shop.agent}</td>
        </tr>)}</tbody>
      </table></div> : <p>Do‘kon hali qo‘shilmagan.</p>}
    </section>
    {current && <section>
      <div className="panel-heading"><h2>{current.name}</h2><button type="button" className="secondary" onClick={() => setSelected(null)}>Yopish</button></div>
      <p>{current.legal_name} · {current.phone} · {current.address}</p>
      <MapChoices latitude={current.latitude} longitude={current.longitude}/>
      {canManage && current.store_id && <button type="button" className="secondary" onClick={() => {
        if (current.active && !window.confirm('Do‘kon bilan aloqani uzasizmi?')) return;
        change('set_company_store_connection', { p_company: company, p_store: current.store_id, p_active: !current.active });
      }}>{current.active ? 'Aloqani uzish' : 'Qayta ulash'}</button>}
      <h3>Do‘kon buyurtmalari</h3>
      {shopOrders.length ? <div className="table"><table><thead><tr><th>Mahsulot</th><th>Miqdor</th><th>Holat</th><th>Summa</th></tr></thead>
        <tbody>{shopOrders.map(order => <tr key={order.id}><td>{products.find(product => product.id === order.product_id)?.name || 'Mahsulot'}</td>
          <td>{order.quantity} {order.order_unit}</td><td>{statuses[order.status]}</td><td>{formatMoney(order.order_total)}</td></tr>)}</tbody></table></div> : <p>Buyurtmalar hali yo‘q.</p>}
    </section>}
  </>;
}

export function AddProduct({ db, company, Form, change, onError, notice, onClose, onSaved, product }) {
  const dialog = useRef(null);
  const nameInput = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [originalStock] = useState(product?.stock);
  const shownImage = preview || product?.imageUrl;

  useEffect(() => {
    const element = dialog.current;
    if (!element.open) element.showModal();
    nameInput.current?.focus();
    return () => { if (element.open) element.close(); };
  }, []);

  useEffect(() => {
    if (!imageFile?.size || !['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type) || imageFile.size > 2097152) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function save(fields) {
    setBusy(true);
    setAttempted(true);
    onError('');
    let path = null;
    try {
      const image = fields.get('image');
      if (image?.size) {
        const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        if (!Object.hasOwn(extensions, image.type) || image.size > 2097152) {
          onError('Rasm JPG, PNG yoki WebP formatida va ko‘pi bilan 2 MB bo‘lishi kerak.');
          return false;
        }
        path = company + '/' + crypto.randomUUID() + '.' + extensions[image.type];
        const { error } = await db.storage.from('product-images').upload(path, image);
        if (error) {
          onError('Rasmni yuklab bo‘lmadi: ' + error.message);
          return false;
        }
      }
      const values = {
        p_company: company, p_name: fields.get('name'), p_stock: Number(fields.get('stock')),
        p_minimum: Number(fields.get('minimum')), p_unit: fields.get('unit'),
        p_barcode: fields.get('barcode'), p_price: Number(fields.get('price')), p_image: path || product?.image_path || null,
      };
      const saved = product
        ? await change('update_catalog_product', { ...values, p_product: product.id, p_expected_stock: originalStock })
        : await change('add_catalog_product', values);
      if (saved) {
        if (path && product?.image_path) await db.storage.from('product-images').remove([product.image_path]);
        onSaved();
      }
      else if (path) await db.storage.from('product-images').remove([path]);
      return saved;
    } catch {
      onError('Mahsulotni saqlab bo‘lmadi. Qayta urinib ko‘ring.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (!busy) onClose();
  }

  return <dialog ref={dialog} className="product-drawer" aria-labelledby="new-product-title" aria-busy={busy}
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <div className="product-drawer-panel">
      <header className="product-drawer-header">
        <div><p>Ombor / Mahsulotlar</p><h2 id="new-product-title">{product ? 'Mahsulotni tahrirlash' : 'Mahsulot qo‘shish'}</h2></div>
        <button className="icon-button" type="button" aria-label="Shaklni yopish" disabled={busy} onClick={dismiss}><X size={20} /></button>
      </header>
      <div className="product-drawer-content">
        <Form label="Mahsulotni saqlash" onSubmit={save}>
          <fieldset className="product-form-group" disabled={busy}>
            <legend>Mahsulot ma’lumotlari</legend>
            <label>Mahsulot nomi<input ref={nameInput} name="name" minLength="2" maxLength="80" defaultValue={product?.name || ''} required /></label>
            <label>O‘lchov birligi<select name="unit" defaultValue={product?.unit || 'dona'}>{units.map(unit => <option key={unit}>{unit}</option>)}</select></label>
            <label>Shtrix kod (ixtiyoriy)<input name="barcode" inputMode="numeric" pattern="[0-9]{4,32}" maxLength="32" defaultValue={product?.barcode || ''} /></label>
          </fieldset>
          <fieldset className="product-form-group" disabled={busy}>
            <legend>Mahsulot rasmi</legend>
            <label className="product-image-input">
              {shownImage ? <img src={shownImage} width="52" height="52" alt="Tanlangan mahsulot rasmi" />
                : <ImagePlus size={24} aria-hidden="true" />}
              <span><strong>{imageFile?.name || (product?.image_path ? 'Rasmni almashtirish' : 'Rasm faylini tanlang')}</strong><small>JPG, PNG yoki WebP · 2 MB gacha</small></span>
              <input aria-label="Mahsulot rasmi" name="image" type="file" accept="image/jpeg,image/png,image/webp"
                onChange={event => setImageFile(event.target.files?.[0] || null)} />
            </label>
          </fieldset>
          <fieldset className="product-form-group" disabled={busy}>
            <legend>Narx va ombor qoldig‘i</legend>
            <label>Birlik narxi, so‘m<input name="price" type="number" min="0" max="999999999999.99" step="0.01" defaultValue={product?.price ?? ''} required /></label>
            <div className="product-form-pair">
              <label>{product ? 'Joriy qoldiq' : 'Boshlang‘ich miqdor'}<input name="stock" type="number" min="0" max="2147483647" defaultValue={originalStock ?? 0} required /></label>
              <label>Minimal qoldiq<input name="minimum" type="number" min="0" max="2147483647" defaultValue={product?.minimum ?? 0} required /></label>
            </div>
          </fieldset>
          {attempted && notice && <p role={busy ? 'status' : 'alert'} className="product-form-error">{notice}</p>}
        </Form>
      </div>
    </div>
  </dialog>;
}

export function Discounts({ products, discounts, company, Form, change }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [start, setStart] = useState(today);
  return <>
    <section>
      <h2>Chegirma qo‘shish</h2>
      {products.length ? <Form label="Chegirmani saqlash" onSubmit={fields => change('add_product_discount', {
        p_company: company, p_product: fields.get('product'), p_percent: Number(fields.get('percent')),
        p_start: fields.get('start'), p_end: fields.get('end'),
      })}>
        <label>Mahsulot<select name="product">{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Chegirma, %<input name="percent" type="number" min=".01" max="100" step=".01" required /></label>
        <label>Boshlanishi<input name="start" type="date" value={start} onChange={event => setStart(event.target.value)} required /></label>
        <label>Tugashi<input name="end" type="date" min={start} defaultValue={today} required /></label>
      </Form> : <p>Chegirma qo‘shish uchun avval mahsulot kiriting.</p>}
      <p>Bir mahsulotga bir nechta chegirma mos kelsa, eng yuqori foiz qo‘llanadi.</p>
    </section>
    <section>
      <h2>Chegirmalar ro‘yxati</h2>
      {discounts.length ? <div className="table"><table>
        <thead><tr><th>Mahsulot</th><th>Foiz</th><th>Muddat</th><th>Holat</th><th>Amal</th></tr></thead>
        <tbody>{discounts.map(item => <tr key={item.id}>
          <td>{products.find(product => product.id === item.product_id)?.name}</td><td>{item.percent}%</td>
          <td>{item.starts_on} — {item.ends_on}</td><td>{!item.enabled ? 'To‘xtatilgan' : item.ends_on < today ? 'Tugagan' : item.starts_on > today ? 'Rejalangan' : 'Faol'}</td>
          <td>{item.enabled && item.ends_on >= today && <button className="secondary" type="button" onClick={() => change('stop_product_discount', {
            p_company: company, p_discount: item.id,
          })}>To‘xtatish</button>}</td>
        </tr>)}</tbody>
      </table></div> : <p>Chegirmalar hali yo‘q.</p>}
    </section>
  </>;
}
