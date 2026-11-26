'use client';

import { useEffect, useRef, useState } from 'react';
import BrandWordmark from './brand';
import { Boxes, Building2, CalendarDays, ChevronDown, ClipboardList, House, LayoutGrid, LogOut, Menu, Search, Settings2, Sparkles, Users, WalletCards, Store, Percent, Send, ReceiptText, ShoppingBasket, Archive, Inbox, CircleAlert } from 'lucide-react';

const icons = {
  backup: Archive, documents: ReceiptText, offers: Send, basket: ShoppingBasket, overview: House, shops: Store, store: Store, discounts: Percent, subscriptions: WalletCards, receivables: ReceiptText, telegram: Send, agent: Sparkles, products: Boxes, catalog: Boxes, staff: Users, orders: ClipboardList,
  ai: Sparkles, assistant: Sparkles, profile: Settings2, companies: Building2, monitoring: Sparkles, revenue: WalletCards, activity: ClipboardList,
};
const counts = new Intl.NumberFormat('uz-UZ');
const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', dateStyle: 'short' });
const tashkent = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tashkent', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const months = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];

export function formatDashboardDate(value, short = false) {
  if (!value) return 'Sana saqlanmagan';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Sana saqlanmagan';
  const { day, month, year, hour, minute } = Object.fromEntries(tashkent.formatToParts(date).map(part => [part.type, part.value]));
  const label = day + ' ' + months[Number(month) - 1];
  return short ? label : label + ', ' + year + ' · ' + hour + ':' + minute;
}
export const formatCount = value => counts.format(value);

export function DashboardShell({ links, view, selectView, name, role, company, companies, selected, selectCompany, signOut, openAI, children, assistant }) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const input = useRef(null);
  const menuButton = useRef(null);
  const nav = useRef(null);
  const profile = useRef(null);
  const normalize = value => value.toLowerCase().replace(/[‘’ʻʼ']/g, '');
  const terms = normalize(search.trim()).split(/\s+/);
  const matches = links.filter(([, label]) => terms.every(term => normalize(label).includes(term)));
  const title = links.find(([id]) => id === view)?.[1];
  const mobileLinks = ['overview', 'orders', 'companies', 'shops', 'products', 'basket'].filter(id => links.some(([key]) => key === id)).slice(0, 4);
  const shortLabels = { overview: 'Bosh sahifa', orders: 'Buyurtmalar', companies: 'Firmalar', shops: 'Do‘konlar', products: 'Ombor', basket: 'Savat' };
  function closeMenu() {
    setCollapsed(false);
    menuButton.current?.focus();
  }
  function navigate(id) {
    selectView(id);
    setSearch('');
    setSearchOpen(false);
    if (mobile) {
      setCollapsed(false);
      window.scrollTo(0, 0);
    }
  }

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const sync = () => { setMobile(query.matches); setCollapsed(false); };
    sync();
    query.addEventListener('change', sync);
    function shortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        if (query.matches && nav.current?.contains(document.activeElement)) closeMenu();
        if (profile.current) profile.current.open = false;
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => { window.removeEventListener('keydown', shortcut); query.removeEventListener('change', sync); };
  }, []);

  useEffect(() => {
    if (mobile && collapsed) nav.current?.querySelector('button[aria-current], button')?.focus();
  }, [mobile, collapsed]);

  return <div className={'workspace-frame' + (collapsed ? ' sidebar-toggled' : '')}>
    <aside ref={nav} className="workspace-sidebar" id="workspace-navigation">
      <BrandWordmark />
      <button type="button" className="mobile-menu-close secondary" onClick={closeMenu}>Yopish</button>
      <nav aria-label="Boshqaruv bo‘limlari">{links.map(([id, label]) => {
        const Icon = id === 'overview' && !company ? LayoutGrid : icons[id] || ClipboardList;
        return <button key={id} title={label} aria-label={label} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}>
          <Icon size={19} aria-hidden="true" /><span>{label}</span>
        </button>;
      })}</nav>
      {company && <div className="sidebar-company"><Building2 size={18} aria-hidden="true" />
        <div><strong>{company.name}</strong>{company.sector && <small>{company.sector}</small>}</div>
      </div>}
    </aside>
    {collapsed && <button type="button" className="workspace-scrim" aria-label="Menyuni yopish" onClick={closeMenu} />}
    <header className="workspace-header" inert={mobile && collapsed}>
      <button ref={menuButton} type="button" className="icon-button" aria-controls="workspace-navigation" aria-expanded={mobile ? collapsed : !collapsed} aria-label="Yon menyuni ochish yoki yopish" onClick={() => setCollapsed(!collapsed)}><Menu size={20} /></button>
      <div className="header-search">
        <form onSubmit={event => { event.preventDefault(); if (matches[0]) navigate(matches[0][0]); }}>
          <Search size={17} aria-hidden="true" /><input ref={input} type="search" aria-label="Bo‘lim qidirish" placeholder="Bo‘lim qidirish..." value={search}
            onFocus={() => setSearchOpen(true)} onChange={event => { setSearch(event.target.value); setSearchOpen(true); }} />
          <kbd>Ctrl K</kbd>
        </form>
        {searchOpen && search && <div className="search-results">
          {matches.length ? matches.map(([id, label]) => <button type="button" key={id} onClick={() => navigate(id)}>{label}</button>) : <p>Bo‘lim topilmadi.</p>}
        </div>}
      </div>
      <div className="header-actions">
        {companies.length > 1 && <select value={selected} onChange={event => selectCompany(event.target.value)} aria-label="Korxonani tanlash">
          {companies.map(item => <option key={item.company_id} value={item.company_id}>{item.companies.name}</option>)}
        </select>}
        {openAI && <button type="button" className="action header-ai" aria-label="AI yordamchi" onClick={openAI}><Sparkles size={17} /><span>AI yordamchi</span></button>}
        <details className="profile-menu" ref={profile}>
          <summary><span className="avatar" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
            <span className="profile-label"><strong>{name}</strong><small>{role}</small></span><ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="profile-dropdown"><p>{name}</p><button type="button" onClick={signOut}><LogOut size={17} /> Hisobdan chiqish</button></div>
        </details>
      </div>
    </header>
    <main className="workspace-main" inert={mobile && collapsed}>
      {title && <div className="breadcrumb">{company?.name || 'Platforma'} <span aria-hidden="true">/</span> {title}</div>}
      <div className="workspace-view">{children}</div>
      {assistant}
    </main>
    {mobile && links.length > 0 && <nav className="mobile-dock" aria-label="Tezkor bo‘limlar" inert={collapsed}>
      {mobileLinks.map(id => {
        const Icon = icons[id];
        return <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}>
          <Icon size={20} aria-hidden="true" /><span>{shortLabels[id]}</span>
        </button>;
      })}
      <button type="button" onClick={() => setCollapsed(true)} aria-controls="workspace-navigation" aria-expanded={collapsed}>
        <Menu size={20} aria-hidden="true" /><span>Menyu</span>
      </button>
    </nav>}
  </div>;
}

export function Metrics({ values }) {
  return <div className="metrics">{values.map(([label, value, Icon, hint, tone]) =>
    <div key={label} className="metric-card" data-tone={tone}>
      {Icon && <span className="metric-icon"><Icon size={20} aria-hidden="true" /></span>}
      <div><span className="metric-label">{label}</span><strong>{typeof value === 'number' ? formatCount(value) : value}</strong>
        {hint && <small>{hint}</small>}</div>
    </div>
  )}</div>;
}

export function DateWindow({ days, setDays }) {
  return <label className="date-window"><CalendarDays size={16} aria-hidden="true" />
    <select aria-label="Grafik davri" value={days} onChange={event => setDays(Number(event.target.value))}>
      <option value="7">So‘nggi 7 kun</option><option value="30">So‘nggi 30 kun</option>
    </select>
  </label>;
}

export function Trend({ records, dateKey, days, label }) {
  const end = Date.now();
  const byDay = new Map();
  for (const row of records) {
    const date = new Date(row[dateKey]);
    if (row[dateKey] && Number.isFinite(date.getTime())) {
      const day = localDay.format(date);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
  }
  const points = Array.from({ length: days }, (_, index) => {
    const date = new Date(end - (days - 1 - index) * 86400000);
    return { label: formatDashboardDate(date, true), value: byDay.get(localDay.format(date)) || 0 };
  });
  const peak = Math.max(1, ...points.map(point => point.value));
  if (!points.some(point => point.value)) return <PanelState>Tanlangan davrda ma’lumot yo‘q.</PanelState>;
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return <div className="trend" role="img" aria-label={label + '. ' + points.map(point => point.label + ': ' + point.value).join(', ')}>
    <div className="trend-total" aria-hidden="true"><strong>{formatCount(total)}</strong><span>Tanlangan davrda</span></div>
    <div className="trend-bars" aria-hidden="true">{points.map((point, index) =>
      <div key={index} title={point.label + ' · ' + point.value}>
        {days === 7 && point.value > 0 && <span>{point.value}</span>}
        <i style={{ height: (point.value ? point.value / peak * 85 : 1) + '%' }} />
      </div>)}</div>
    <div className="trend-labels" aria-hidden="true">
      {points.filter((_, index) => days === 7 || index % 7 === 0 || index === days - 1).map((point, index) => <span key={index}>{point.label}</span>)}
    </div>
  </div>;
}

export function StatusBadge({ status, children }) {
  return <span className={'status-badge status-' + status}>{children}</span>;
}

export function PanelState({ children, kind = 'empty', action }) {
  const Icon = kind === 'error' ? CircleAlert : Inbox;
  return <div className="panel-state" data-kind={kind} role={kind === 'error' ? 'alert' : 'status'}>
    {kind === 'loading' ? <div className="state-skeleton" aria-hidden="true"><i/><i/><i/></div> :
      <span className="state-icon"><Icon size={19} aria-hidden="true" /></span>}
    <p>{children}</p>
    {action}
  </div>;
}
