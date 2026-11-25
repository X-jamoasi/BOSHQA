'use client';

import { useEffect, useRef, useState } from 'react';

export default function AiChat({ company, token, openSignal, standalone, role }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const opener = useRef(null);
  const end = useRef(null);
  const visible = standalone || open;

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (standalone || !open) return;
    input.current?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        opener.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, standalone]);

  useEffect(() => {
    if (visible && (messages.length || busy || error)) end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, busy, error, visible]);

  function close() {
    setOpen(false);
    opener.current?.focus();
  }

  async function send(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user', text }];
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ company, messages: next.slice(-9) }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.text !== 'string') {
        setError(result.error || 'Javobni olib bo‘lmadi. Qayta urinib ko‘ring.');
        return;
      }
      setMessages([...next.slice(-9), { role: 'assistant', text: result.text }]);
      setQuestion('');
    } catch {
      setError('AI yordamchi bilan aloqa uzildi. Qayta urinib ko‘ring.');
    } finally {
      setBusy(false);
    }
  }

  return <div className={standalone ? 'ai-workspace' : 'ai-widget'}>
    {standalone && <header className="page-header"><h1>AI yordamchi</h1></header>}
    {visible && <section className="ai-window" id="ai-yordamchi" aria-labelledby="ai-yordamchi-nomi">
      <div className="ai-window-title">
        <h2 id="ai-yordamchi-nomi">{standalone ? 'Suhbat' : 'AI yordamchi'}</h2>
        {!standalone && <button className="secondary" type="button" onClick={close} aria-label="AI yordamchini yopish">×</button>}
      </div>
      <div className="ai-thread" role="log" aria-live="polite">
        {!messages.length && <>
          <p>BOSHQA’dan foydalanish haqida savol yuboring.</p>
          <div className="prompt-list">{(company
            ? [role === 'owner' ? 'Bugun qancha savdo bo‘ldi?' : 'Buyurtmani qanday kuzataman?',
               ['owner', 'manager'].includes(role) ? 'Qaysi mahsulot kam qoldi?' : 'BOSHQA’da qanday yordam ola olaman?']
            : ['Platforma ko‘rsatkichlarini qanday kuzataman?', 'AI monitoring nima ko‘rsatadi?']
          ).map(prompt => <button type="button" key={prompt} className="secondary" disabled={busy}
            onClick={() => { setQuestion(prompt); input.current?.focus(); }}>{prompt}</button>)}</div>
        </>}
        {messages.map(({ role, text }, index) => <div key={index} className={'ai-message ' + role}>
          <strong>{role === 'user' ? 'Siz' : 'AI yordamchi'}</strong>
          <p>{text}</p>
        </div>)}
        {busy && <p role="status">AI javob tayyorlamoqda…</p>}
        {error && <p role="alert">{error}</p>}
        <div ref={end} />
      </div>
      <form className="ai-compose" onSubmit={send}>
        <label>Savolingiz<textarea ref={input} value={question} maxLength={1000} readOnly={busy} rows={2}
          onChange={event => setQuestion(event.target.value)}
          placeholder="Masalan, buyurtmani qanday kuzataman?" required /></label>
        <button className="action" disabled={busy || !question.trim()}>Yuborish</button>
      </form>
    </section>}
    {!standalone && <button ref={opener} className="action ai-launcher" type="button" aria-expanded={open}
      aria-controls={open ? 'ai-yordamchi' : undefined} onClick={() => open ? close() : setOpen(true)}>
      <span aria-hidden="true">✦</span> AI yordamchi
    </button>}
  </div>;
}
