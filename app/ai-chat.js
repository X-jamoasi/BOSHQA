'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, ChartNoAxesCombined, LoaderCircle, MessageCircle, Sparkles, X } from 'lucide-react';

const advicePrompt = 'Bugungi ustuvor tavsiyalarni ruxsatimdagi joriy ma’lumotlar asosida bering.';
const prompts = {
  owner: ['Qaysi do‘konlarning qarzi kechikkan?', 'Omborda nima kam qoldi?', 'Bugun qancha tushum bo‘ldi?'],
  manager: ['Qaysi do‘konlar 7 kun ichida qarzini to‘lashi kerak?', 'Omborda nima kam qoldi?', 'Buyurtmalarda nimaga e’tibor beray?'],
  supplier: ['Menga biriktirilgan buyurtmalar qanday holatda?', 'Qaysi topshirilgan buyurtmalarda qarz bor?'],
  customer: ['Buyurtmalarim qanday holatda?', 'Do‘konlarim bo‘yicha qanday qarzlar bor?'],
  store: ['Qaysi qarzlarimning muddati yaqin?', 'Kechikkan buyurtmalarim bormi?', 'Shu oy qancha xarajat qildim?'],
  admin: ['Platforma faolligi qanday?', 'AI monitoringda nimalarga e’tibor beray?'],
};

export default function AiChat({ company, token, openSignal, standalone, home, role }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const input = useRef(null);
  const launcher = useRef(null);
  const panel = useRef(null);
  const thread = useRef(null);
  const instance = useId();
  const lastSignal = useRef(0);
  const embedded = home || standalone;
  const visible = embedded || open;

  function reveal() {
    if (embedded) {
      panel.current?.scrollIntoView({ block: 'start' });
      input.current?.focus({ preventScroll: true });
    } else {
      setOpen(true);
    }
  }

  useEffect(() => {
    if (openSignal && openSignal !== lastSignal.current) reveal();
    lastSignal.current = openSignal;
  }, [openSignal]);

  useEffect(() => {
    if (embedded || !open) return;
    input.current?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        launcher.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, embedded]);

  useEffect(() => {
    if (visible && thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [messages, pending, error, visible]);

  async function send(text) {
    text = text.trim();
    if (!text || pending) return;
    const next = [...messages, { role: 'user', text }].slice(-9);
    setPending(text);
    setError('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ company, store: role === 'store', messages: next }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.text !== 'string') {
        setError(result.error || 'Javobni olib bo‘lmadi. Qayta urinib ko‘ring.');
        setQuestion(text);
        return;
      }
      setMessages(previous => [...previous, { role: 'user', text }, { role: 'assistant', text: result.text, model: result.model }].slice(-100));
      setQuestion('');
    } catch {
      setError('AI yordamchi bilan aloqa uzildi. Qayta urinib ko‘ring.');
      setQuestion(text);
    } finally {
      setPending('');
    }
  }

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  return <div className={embedded ? 'ai-workspace' : 'ai-widget'}>
    {visible && <section ref={panel} className="ai-window" id={instance} aria-labelledby={instance + '-title'}>
      <div className="ai-window-title">
        <span className="ai-brand-icon"><Sparkles size={21} aria-hidden="true" /></span>
        <div><h2 id={instance + '-title'}>{standalone && role === 'store' ? 'AI nazorati' : 'AI maslahati'}</h2><small>Google Gemini</small></div>
        <button type="button" className="secondary ai-advice" disabled={Boolean(pending)} onClick={() => send(advicePrompt)}>
          <ChartNoAxesCombined size={17} aria-hidden="true" /> Bugungi tavsiyalar
        </button>
        {!embedded && <button type="button" className="secondary ai-close" onClick={close} aria-label="AI yordamchini yopish"><X size={18} /></button>}
      </div>
      <div ref={thread} className="ai-thread" role="log" aria-live="polite">
        {!messages.length && !pending && <div className="ai-welcome">
          <p>Ma’lumotlaringizni tahlil qiling yoki savol bering.</p>
          <div className="ai-suggestions">
            {(prompts[role] || prompts.admin).map(prompt => <button type="button" key={prompt} className="secondary"
              onClick={() => { setQuestion(prompt); input.current?.focus(); }}>{prompt}</button>)}
          </div>
        </div>}
        {[...messages, ...(pending ? [{ role: 'user', text: pending }] : [])].map(({ role, text, model }, index) =>
          <article key={index} className={'ai-message ' + role}>
            <strong>{role === 'user' ? 'Siz' : 'BOSHQA AI'}</strong>
            <p>{text}</p>
            {model && <small>{model}</small>}
          </article>)}
        {pending && <p className="ai-progress" role="status"><LoaderCircle size={16} aria-hidden="true" /> Gemini javob tayyorlamoqda…</p>}
        {error && <p className="ai-error" role="alert">{error}</p>}
      </div>
      <form className="ai-compose" onSubmit={event => { event.preventDefault(); send(question); }}>
        <textarea ref={input} aria-label="Savolingiz" value={question} maxLength={1000} readOnly={Boolean(pending)} rows={2}
          onChange={event => setQuestion(event.target.value)} placeholder="Savolingizni yozing…"
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form.requestSubmit();
            }
          }} required />
        <button className="action" aria-label="Yuborish" title="Yuborish" disabled={Boolean(pending) || !question.trim()}><ArrowUp size={19} /></button>
      </form>
    </section>}
    {!standalone && <button ref={launcher} className={'action ai-launcher' + (home ? ' ai-launcher-home' : '')} type="button"
      aria-expanded={embedded ? undefined : open} aria-controls={visible ? instance : undefined} onClick={() => open && !embedded ? close() : reveal()}>
      <MessageCircle size={18} aria-hidden="true" /> AI yordamchi
    </button>}
  </div>;
}
