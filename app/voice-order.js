'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';

export default function VoiceOrder({ companies, token, store = false, basket, openBasket }) {
  const [companyId, setCompanyId] = useState(companies.length === 1 ? companies[0].id : '');
  const [phase, setPhase] = useState('idle');
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const capture = useRef(null);
  const session = useRef(null);
  const mounted = useRef(false);
  const company = companies.find(item => item.id === companyId);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      capture.current?.cancel();
      session.current?.abort();
    };
  }, []);

  async function record() {
    setDraft(null);
    setError('');
    setPhase('starting');
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Bu brauzer ovoz yozishni qo‘llamaydi.');
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('Bu brauzerda mos audio formati topilmadi.');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      const chunks = [];
      const release = () => stream.getTracks().forEach(track => track.stop());
      const timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 30000);
      capture.current = { stop: () => recorder.stop(), cancel: () => {
        clearTimeout(timer);
        recorder.onstop = null;
        if (recorder.state === 'recording') recorder.stop();
        release();
      } };
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        capture.current?.cancel();
        capture.current = null;
        setError('Ovoz yozilmadi. Qayta urinib ko‘ring.');
        setPhase('idle');
      };
      recorder.onstop = async () => {
        clearTimeout(timer);
        release();
        capture.current = null;
        setPhase('loading');
        const controller = new AbortController();
        session.current = controller;
        try {
          const form = new FormData();
          form.set('company', companyId);
          form.set('store', String(store));
          form.set('audio', new Blob(chunks, { type: mimeType }), 'order.' + mimeType.split('/')[1]);
          const response = await fetch('/api/voice-order', {
            method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form, signal: controller.signal,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'AI yozuvni tekshira olmadi.');
          if (mounted.current) { setDraft(result); setPhase('review'); }
        } catch (error) {
          if (mounted.current && !controller.signal.aborted) { setError(error.message); setPhase('idle'); }
        }
      };
      recorder.start();
      setPhase('recording');
    } catch (error) {
      capture.current?.cancel();
      capture.current = null;
      stream?.getTracks().forEach(track => track.stop());
      if (mounted.current) {
        setError(error.name === 'NotAllowedError' ? 'Brauzerda mikrofon ruxsatini yoqing.' : error.message);
        setPhase('idle');
      }
    }
  }

  return <section className="voice-order">
    <h2 className="icon-heading"><Mic size={18} aria-hidden="true" /> Ovozli buyurtma</h2>
    {!companies.length ? <p>Avval do‘konni firmaga bog‘lang.</p> : <>
      {companies.length > 1 && <label>Firma<select value={companyId} disabled={phase !== 'idle'} onChange={event => setCompanyId(event.target.value)}>
        <option value="">Firmani tanlang</option>{companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      {phase === 'idle' && <>
        <p>Mahsulot nomi, miqdori va birligini ayting. Ovoz matnga aylantirish uchun Gemini’ga yuboriladi.</p>
        <button type="button" className="action" disabled={!company} onClick={record}>Ovoz yozish</button>
      </>}
      {phase === 'starting' && <p role="status">Mikrofon ochilmoqda…</p>}
      {phase === 'recording' && <button type="button" className="action" onClick={() => capture.current?.stop()}>Yozuvni tugatish · 30 soniyagacha</button>}
      {phase === 'loading' && <p role="status">AI yozuvni tekshirmoqda…</p>}
      {draft && <div className="insight">
        <h3>AI eshitgan matn</h3><p>{draft.transcript}</p>
        {phase === 'review' ? <div className="staff-controls">
          <button type="button" className="action" onClick={() => setPhase('draft')}>Ha, shunday</button>
          <button type="button" className="secondary" onClick={() => { setDraft(null); setPhase('idle'); }}>Yo‘q, xato</button>
        </div> : <>
          <h3>Buyurtma qoralamasi</h3>
          {draft.items.length ? <ul>{draft.items.map(({ product, quantity }) =>
            <li key={product.id}>{product.name} · {quantity} {product.unit}</li>)}</ul> : <p>Mahsulot va miqdor aniq topilmadi.</p>}
          {draft.unmatched.length > 0 && <p>Aniqlanmagan: {draft.unmatched.join('; ')}. Kerakli mahsulotlarni katalogdan qo‘shing.</p>}
          <div className="staff-controls">
            <button type="button" className="action" disabled={!draft.items.length || !company} onClick={() => {
              for (const { product, quantity } of draft.items) basket.adjust(company, product, quantity);
              openBasket();
            }}>Savatga qo‘shish</button>
            <button type="button" className="secondary" onClick={() => { setDraft(null); setPhase('idle'); }}>Qayta yozish</button>
          </div>
        </>}
      </div>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
