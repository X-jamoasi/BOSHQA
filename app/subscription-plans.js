'use client';

import { useEffect, useState } from 'react';
import { Building2, Check, Layers3, Rocket, Sparkles } from 'lucide-react';
import { formatMoney } from './sales';

const plans = [
  { id: 'free', name: 'Free', icon: Building2, price: 0, description: 'Katalog va buyurtmalar bilan tanishish', features: ['Mahsulotlar katalogi', 'Asosiy buyurtma jarayoni'] },
  { id: 'start', name: 'Start', icon: Rocket, price: 99000, description: 'Kichik korxonalar uchun', features: ['Free imkoniyatlari', 'Ombor qoldig‘i', 'Do‘konlar va agentlar'] },
  { id: 'plus', name: 'Plus', icon: Layers3, price: 249000, description: 'Savdo jamoasi bilan ishlash', features: ['Start imkoniyatlari', 'Chegirmalar', 'AI ombor va savdo tahlili'] },
  { id: 'pro', name: 'Pro', icon: Sparkles, price: 499000, description: 'Kengaygan korxonalar uchun', features: ['Plus imkoniyatlari', 'Kengaytirilgan hisobotlar rejasi', 'Ustuvor yordam rejasi'] },
];

export default function SubscriptionPlans({ company }) {
  const key = 'boshqa-demo-plan:' + company;
  const [selected, setSelected] = useState('free');
  const [status, setStatus] = useState('');

  useEffect(() => {
    try {
      const previous = localStorage.getItem(key);
      setSelected(plans.some(plan => plan.id === previous) ? previous : 'free');
    } catch {
      setSelected('free');
    }
  }, [key]);

  function choose(plan) {
    setSelected(plan.id);
    try {
      localStorage.setItem(key, plan.id);
      setStatus(plan.name + ' demo tarif tanlandi.');
    } catch {
      setStatus(plan.name + ' demo tarif shu sahifada tanlandi.');
    }
  }

  return <section className="subscription-page">
    <div className="subscription-intro">
      <h2>Korxonangiz uchun tarifni tanlang</h2>
      <p>Demo tariflar va sinov narxlari. Tanlov uchun to‘lov olinmaydi va panel huquqlari o‘zgarmaydi.</p>
    </div>
    <div className="plan-grid">{plans.map(plan => {
      const Icon = plan.icon;
      const current = selected === plan.id;
      return <article className={'plan-card plan-' + plan.id} key={plan.id}>
        <div className="plan-icon"><Icon size={21} aria-hidden="true" /></div>
        <h3>{plan.name}</h3><p>{plan.description}</p>
        <div className="plan-price"><strong>{formatMoney(plan.price)}</strong><span> / oy</span></div>
        <ul>{plan.features.map(feature => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
        <button type="button" className={current ? 'secondary' : 'action'} disabled={current}
          aria-label={current ? plan.name + ' tanlangan' : plan.name + ' demo tarifini tanlash'} onClick={() => choose(plan)}>
          {current ? 'Tanlangan' : 'Demo tarifni tanlash'}
        </button>
      </article>;
    })}</div>
    {status && <p className="subscription-status" role="status">{status}</p>}
  </section>;
}
