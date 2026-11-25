'use client';

import { Fragment, useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, ChevronLeft, ChevronRight, Eye, Package, Pencil, Plus, Search } from 'lucide-react';
import { formatCount, StatusBadge } from './dashboard-ui';
import { formatMoney, units } from './sales';

const stockLabels = {
  empty: ['error', 'Tugagan'],
  low: ['pending', 'Kam qolgan'],
  available: ['success', 'Yetarli'],
  unknown: ['unknown', 'Ma’lumot yo‘q'],
};

function stockState(item) {
  if (item.stock == null) return 'unknown';
  if (item.stock <= 0) return 'empty';
  if (item.stock <= item.minimum) return 'low';
  return 'available';
}

function currentPrice(item) {
  return item.price == null ? null : Number(item.price) * (100 - Number(item.discount || 0)) / 100;
}

function SortHeading({ field, label, sort, changeSort }) {
  const active = sort.key === field;
  const Icon = !active ? ArrowDownUp : sort.desc ? ArrowDown : ArrowUp;
  return <th aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
    <button type="button" className="product-sort" onClick={() => changeSort(field)}>
      {label}<Icon size={13} aria-hidden="true" />
    </button>
  </th>;
}

export default function ProductList({ products, manages, showPrice, addProduct, editProduct }) {
  const [query, setQuery] = useState('');
  const [unit, setUnit] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState({ key: 'name', desc: false });
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);

  const search = query.trim().toLocaleLowerCase('uz');
  const matching = products.filter(item => {
    const searchable = [item.name, item.barcode].some(value => value?.toLocaleLowerCase('uz').includes(search));
    const matchesState = !filter || (manages ? stockState(item) === filter : Number(item.discount) > 0);
    return searchable && (!unit || item.unit === unit) && matchesState;
  }).sort((a, b) => {
    if (sort.key === 'price') {
      const left = currentPrice(a);
      const right = currentPrice(b);
      if (left == null && right != null) return 1;
      if (right == null && left != null) return -1;
      return ((left ?? 0) - (right ?? 0)) * (sort.desc ? -1 : 1) || a.name.localeCompare(b.name, 'uz');
    }
    return a.name.localeCompare(b.name, 'uz') * (sort.desc ? -1 : 1);
  });
  const pageCount = Math.max(1, Math.ceil(matching.length / size));
  const current = Math.min(page, pageCount - 1);
  const start = current * size;
  const visible = matching.slice(start, start + size);
  const colSpan = 3 + Number(showPrice) + Number(manages);

  function resetPage(setter, value) {
    setter(value);
    setPage(0);
    setSelected(null);
  }

  function changeSort(field) {
    resetPage(setSort, { key: field, desc: field === sort.key && !sort.desc });
  }

  return <section className="product-list">
    <div className="product-list-top">
      <div className="product-heading"><h2>Mahsulotlar ro‘yxati</h2><span className="product-count">{formatCount(products.length)} ta</span></div>
      <div className="product-toolbar">
        <label className="product-search"><Search size={17} aria-hidden="true" />
          <input type="search" aria-label="Mahsulot qidirish" placeholder="Mahsulot nomi yoki shtrix kod bo‘yicha qidirish"
            value={query} onChange={event => resetPage(setQuery, event.target.value)} />
        </label>
        <select aria-label="Birlik bo‘yicha filtrlash" value={unit} onChange={event => resetPage(setUnit, event.target.value)}>
          <option value="">Barcha birliklar</option>{units.map(item => <option key={item}>{item}</option>)}
        </select>
        {(manages || showPrice) && <select aria-label={manages ? 'Ombor holati bo‘yicha filtrlash' : 'Chegirma bo‘yicha filtrlash'}
          value={filter} onChange={event => resetPage(setFilter, event.target.value)}>
          <option value="">{manages ? 'Barcha holatlar' : 'Barcha narxlar'}</option>
          {manages ? Object.entries(stockLabels).map(([key, [, label]]) => <option key={key} value={key}>{label}</option>)
            : <option value="discount">Chegirmadagilar</option>}
        </select>}
        {addProduct && <button type="button" className="action product-add" onClick={addProduct}><Plus size={17} aria-hidden="true" />Mahsulot qo‘shish</button>}
      </div>
    </div>
    {visible.length ? <div className="table product-table"><table aria-label="Mahsulotlar ro‘yxati">
      <thead><tr>
        <SortHeading field="name" label="Mahsulot nomi" sort={sort} changeSort={changeSort} />
        <th>Birlik</th>{showPrice && <SortHeading field="price" label="Narx" sort={sort} changeSort={changeSort} />}
        {manages && <th>Ombor holati</th>}<th>Amal</th>
      </tr></thead>
      <tbody>{visible.map(item => {
        const price = currentPrice(item);
        const discounted = price != null && Number(item.discount) > 0;
        const [tone, stockLabel] = manages ? stockLabels[stockState(item)] : [];
        const expanded = selected === item.id;
        return <Fragment key={item.id}>
          <tr>
            <td><div className="product-identity">
              <div className="product-photo">{item.imageUrl ? <img src={item.imageUrl} alt="" width="38" height="38" loading="lazy" />
                : <Package size={18} aria-hidden="true" />}</div>
              <div><strong>{item.name}</strong>{item.barcode && <small>Shtrix kod {item.barcode}</small>}</div>
            </div></td>
            <td>{item.unit || 'dona'}</td>
            {showPrice && <td><div className="product-price"><strong>{formatMoney(price)}</strong>
              {discounted && <small><s>{formatMoney(item.price)}</s> · −{item.discount}%</small>}</div></td>}
            {manages && <td><StatusBadge status={tone}>{stockLabel}</StatusBadge><small className="product-stock">{item.stock == null ? '—' : formatCount(item.stock) + ' ' + item.unit}</small></td>}
            <td><div className="product-row-actions"><button type="button" className="product-detail-button" aria-expanded={expanded} aria-label={item.name + ' tafsilotlari'}
              onClick={() => setSelected(expanded ? null : item.id)}><Eye size={15} aria-hidden="true" />{expanded ? 'Yopish' : 'Ko‘rish'}</button>
              {editProduct && <button type="button" className="product-detail-button" aria-label={item.name + ' mahsulotini tahrirlash'}
                onClick={() => editProduct(item.id)}><Pencil size={15} aria-hidden="true" />Tahrirlash</button>}
            </div></td>
          </tr>
          {expanded && <tr className="product-detail-row"><td colSpan={colSpan}>
            <dl className="company-details">
              <div><dt>O‘lchov birligi</dt><dd>{item.unit || 'dona'}</dd></div>
              <div><dt>Shtrix kod</dt><dd>{item.barcode || 'Kiritilmagan'}</dd></div>
              {manages && <div><dt>Minimal qoldiq</dt><dd>{item.minimum == null ? '—' : formatCount(item.minimum) + ' ' + item.unit}</dd></div>}
              {showPrice && <div><dt>Birlik narxi</dt><dd>{formatMoney(price)}</dd></div>}
            </dl>
          </td></tr>}
        </Fragment>;
      })}</tbody>
    </table></div> : <p className="product-empty">{products.length ? 'Filtrlarga mos mahsulot topilmadi.' : 'Hali mahsulot qo‘shilmagan.'}</p>}
    <footer className="product-footer">
      <label>Ko‘rsatish <select value={size} onChange={event => resetPage(setSize, Number(event.target.value))}>
        {[10, 20, 50].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <span aria-live="polite">{matching.length ? (start + 1) + '–' + (start + visible.length) + ' / ' + matching.length : '0 ta mahsulot'}</span>
      <div className="product-pages">
        <button type="button" aria-label="Oldingi sahifa" disabled={current === 0} onClick={() => { setPage(current - 1); setSelected(null); }}><ChevronLeft size={17} /></button>
        <span>{current + 1} / {pageCount}</span>
        <button type="button" aria-label="Keyingi sahifa" disabled={current >= pageCount - 1} onClick={() => { setPage(current + 1); setSelected(null); }}><ChevronRight size={17} /></button>
      </div>
    </footer>
  </section>;
}
