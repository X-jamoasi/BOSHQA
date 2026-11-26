'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { PanelState, formatDashboardDate } from './dashboard-ui';
import { formatMoney } from './sales';

export const canDownloadOrder = status => ['approved','shipped','delivered'].includes(status);
export const formatOrderNumber = number => number == null ? '—' : 'BQ-' + String(number).padStart(8, '0');

export function OrderDownload({ db, company = null, number, document }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setBusy(true);
    setError('');
    try {
      let payload = document;
      if (!payload) {
        const result = await db.rpc('order_documents_for_user', { p_company: company, p_number: number });
        if (result.error) throw result.error;
        payload = result.data?.[0];
      }
      if (!payload) throw new Error('Bu buyurtma uchun nakladnoy topilmadi.');
      const [{ renderOrderPdf }, font] = await Promise.all([
        import('../lib/order-document-pdf'),
        fetch('/fonts/receipt-mono.ttf').then(response => {
          if (!response.ok) throw new Error('PDF shriftini yuklab bo‘lmadi.');
          return response.arrayBuffer();
        }),
      ]);
      const bytes = await renderOrderPdf(payload, font);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = window.document.createElement('a');
      link.href = url;
      link.download = formatOrderNumber(payload.number) + '.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (error) {
      setError(error.message);
    } finally { setBusy(false); }
  }
  return <>
    <button type="button" className="secondary receipt-download" onClick={download} disabled={busy}>
      <Download size={15} aria-hidden="true" /> {busy ? 'Tayyorlanmoqda…' : 'Nakladnoy PDF'}
    </button>
    {error && <p role="alert">{error}</p>}
  </>;
}

export default function OrderDocuments({ db, company = null }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    db.rpc('order_documents_for_user', { p_company: company }).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.code === 'PGRST202' ? 'Kvitansiyalar uchun Supabase migratsiyasi kerak.' : error.message);
      else setItems(data);
    });
    return () => { active = false; };
  }, [db, company]);
  if (error) return <PanelState kind="error">{error}</PanelState>;
  if (!items) return <PanelState kind="loading">Nakladnoylar yuklanmoqda…</PanelState>;
  if (!items.length) return <PanelState>Buyurtma tasdiqlangach nakladnoy shu yerda paydo bo‘ladi.</PanelState>;
  return <section><div className="table"><table>
    <thead><tr><th>Buyurtma</th><th>Firma va do‘kon</th><th>Sana</th><th>Jami</th><th>Hujjat</th></tr></thead>
    <tbody>{items.map(item => <tr key={item.number}>
      <td>{formatOrderNumber(item.number)}</td><td>{[item.company, item.shop].filter(Boolean).join(' · ')}</td>
      <td>{formatDashboardDate(item.approved_at || item.created_at, true)}</td><td>{formatMoney(item.total)}</td>
      <td><OrderDownload db={db} document={item} /></td>
    </tr>)}</tbody>
  </table></div></section>;
}
