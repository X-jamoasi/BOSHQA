'use client';

import { useState } from 'react';
import { Archive, Download } from 'lucide-react';

export default function WorkspaceBackup({ db, company = null }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  async function download() {
    setBusy(true);
    setStatus(null);
    try {
      const { data, error } = await db.rpc('export_workspace_backup', { p_company: company });
      if (error) throw error;
      if (!data?.data) throw new Error('Eksport uchun ma’lumot topilmadi.');
      const { createBackupArchive } = await import('../lib/workspace-backup');
      const archive = await createBackupArchive(db, data);
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', dateStyle: 'short' }).format(new Date(data.exported_at));
      const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'BOSHQA-' + data.role + '-' + date.replaceAll('/', '-') + '.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      setStatus({ text: 'ZIP fayl yuklashga tayyor. Brauzeringizdagi yuklamalarni tekshiring.' });
    } catch (error) {
      setStatus({ error: true, text: error.code === 'PGRST202'
        ? 'Zaxira bo‘limini yoqish uchun Supabase migratsiyasi kerak.'
        : error.message || 'Zaxira faylini tayyorlab bo‘lmadi.' });
    } finally {
      setBusy(false);
    }
  }

  return <section aria-busy={busy}>
    <h2 className="icon-heading"><Archive size={18} aria-hidden="true" /> Ma’lumotlar arxivi</h2>
    <p>Hisobingizga ruxsat berilgan yozuvlarni ZIP fayl qilib qurilmangizga saqlang. Arxivga JSON, jadval uchun CSV va mavjud nakladnoylar uchun PDF kiradi.</p>
    <button type="button" className="action receipt-download" onClick={download} disabled={busy}>
      <Download size={16} aria-hidden="true" /> {busy ? 'Arxiv tayyorlanmoqda…' : 'ZIP faylni yuklab olish'}
    </button>
    {status && <p role={status.error ? 'alert' : 'status'}>{status.text}</p>}
  </section>;
}
