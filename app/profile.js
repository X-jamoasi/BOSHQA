'use client';

import { useEffect, useState } from 'react';
import { accountLogin, loginEmail, sectors } from '../lib/accounts';

export default function Profile({ db, session, member, title, accountAction, onCompanySaved }) {
  const user = session.user;
  const meta = user.user_metadata || {};
  const personalContact = user.app_metadata?.contact || '';
  const currentLogin = accountLogin(user);
  const [login, setLogin] = useState(currentLogin);
  const [profileStatus, setProfileStatus] = useState('');
  const [companyStatus, setCompanyStatus] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [company, setCompany] = useState(null);
  const [companyError, setCompanyError] = useState('');
  const companyId = member?.company_id;
  const showCompany = ['owner', 'manager'].includes(member?.role);
  const canEdit = member?.role === 'owner';
  const loginChanged = login.trim().toLowerCase() !== currentLogin;

  useEffect(() => {
    if (!showCompany) return;
    let active = true;
    db.rpc('market_company_profile', { p_company: companyId }).single()
      .then(result => result.error?.code === 'PGRST202' ? db.rpc('company_profile', { p_company: companyId }).single() : result)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setCompanyError('Korxona ma’lumotlarini yuklab bo‘lmadi. Profil migratsiyasi bajarilganini tekshiring.');
        else setCompany(data);
      });
    return () => { active = false; };
  }, [companyId, db, showCompany]);

  async function saveProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setSavingProfile(true);
    setProfileStatus('');
    try {
      const result = await accountAction({ action: 'profile', ...fields }, session.access_token);
      setLogin(fields.login.trim().toLowerCase());
      if (result.loginChanged) {
        const { error } = await db.auth.signInWithPassword({
          email: loginEmail(fields.login.trim().toLowerCase()), password: fields.currentPassword,
        });
        if (error) {
          setProfileStatus('Yangi login saqlandi. Hisobdan chiqib, yangi login bilan qayta kiring.');
          return;
        }
      } else {
        const { error } = await db.auth.refreshSession();
        if (error) {
          setProfileStatus('Profil saqlandi. Yangilangan ma’lumotlarni ko‘rish uchun hisobga qayta kiring.');
          return;
        }
      }
      setProfileStatus('Hisob ma’lumotlari saqlandi.');
    } catch (error) {
      setProfileStatus(error.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveCompany(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    let uploaded;
    let saved = false;
    const next = {
      name: fields.name.trim(), sector: fields.sector || null,
      contact: fields.contact.trim() || null, legal_address: fields.legal_address.trim() || null,
      legal_type: fields.legal_type || null, legal_name: fields.legal_name.trim() || null, cover_path: company.cover_path || null,
    };
    setSavingCompany(true);
    setCompanyStatus('');
    try {
      const image = fields.cover;
      const bucket = db.storage.from('product-images');
      if (image.size) {
        if (image.size > 2097152 || !['image/jpeg','image/png','image/webp'].includes(image.type)) throw new Error('2 MB gacha JPEG, PNG yoki WebP rasm tanlang.');
        const path = companyId + '/cover/' + crypto.randomUUID();
        const { error } = await bucket.upload(path, image, { contentType: image.type });
        if (error) throw error;
        uploaded = path;
        next.cover_path = path;
      } else if (fields.remove_cover) {
        next.cover_path = null;
      }
      const { error } = await db.rpc('update_market_company', {
        p_company: companyId, p_name: next.name, p_sector: next.sector, p_contact: next.contact,
        p_address: next.legal_address, p_type: next.legal_type, p_legal_name: next.legal_name, p_cover: next.cover_path,
      });
      if (error?.code === 'PGRST202') {
        if (uploaded || next.legal_type || next.legal_name) throw new Error('Firma rasmi va yuridik shakl uchun Supabase migratsiyasi kerak.');
        const { error: legacyError } = await db.rpc('update_company_profile', {
          p_company: companyId, p_name: next.name, p_sector: next.sector, p_contact: next.contact, p_legal_address: next.legal_address,
        });
        if (legacyError) throw legacyError;
      } else if (error) throw error;
      saved = true;
      if (company.cover_path && company.cover_path !== next.cover_path) await bucket.remove([company.cover_path]);
      setCompany(next);
      onCompanySaved(companyId, next);
      setCompanyStatus('Korxona ma’lumotlari saqlandi.');
    } catch (error) {
      if (uploaded && !saved) await db.storage.from('product-images').remove([uploaded]);
      setCompanyStatus(error.message);
    } finally {
      setSavingCompany(false);
    }
  }

  return <>
    <header className="page-header"><h1>{title}</h1></header>
    <section>
      <h2>Shaxsiy hisob</h2>
      <form className="profile-fields" onSubmit={saveProfile}>
        <label>Ism va familiya<input name="name" autoComplete="name" maxLength="100" defaultValue={meta.full_name || ''} /></label>
        <label>Login<input name="login" autoComplete="username" minLength="3" maxLength="32" value={login}
          required={Boolean(currentLogin)} onChange={event => setLogin(event.target.value)} /></label>
        <label>Aloqa e-pochtasi<input name="email" type="email" autoComplete="email" maxLength="254"
          defaultValue={meta.profile_email ?? (personalContact.includes('@') ? personalContact : !currentLogin ? user.email || '' : '')} /></label>
        <label>Telefon raqami<input name="phone" type="tel" autoComplete="tel" maxLength="16" placeholder="+998901234567"
          defaultValue={meta.profile_phone ?? (personalContact.startsWith('+') ? personalContact : '')} /></label>
        {loginChanged && <label>Amaldagi parol<input name="currentPassword" type="password" autoComplete="current-password" required /></label>}
        <p className="profile-form-note">Aloqa e-pochtasi profil uchun. Yangi login saqlansa, keyingi kirishda undan foydalaning.</p>
        <div><button className="action" disabled={savingProfile}>{savingProfile ? 'Saqlanmoqda…' : 'Profilni saqlash'}</button></div>
      </form>
      {profileStatus && <p role="status">{profileStatus}</p>}
    </section>
    {showCompany && <section>
      <h2>Korxona ma’lumotlari</h2>
      {companyError && <p role="alert">{companyError}</p>}
      {!company && !companyError && <p role="status">Korxona ma’lumotlari yuklanmoqda…</p>}
      {company && (canEdit ? <form className="profile-fields" onSubmit={saveCompany}>
        <label>Korxona nomi<input name="name" minLength="2" maxLength="100" defaultValue={company.name} required /></label>
        <label>Faoliyat yo‘nalishi<select name="sector" defaultValue={company.sector || ''}>
          <option value="">Tanlanmagan</option>{sectors.map(sector => <option key={sector}>{sector}</option>)}
        </select></label>
        <label>Yuridik shakl<select name="legal_type" defaultValue={company.legal_type || ''}>
          <option value="">Tanlang</option>{['YaTT','MChJ','AJ','XK','Oilaviy korxona','Boshqa'].map(type => <option key={type}>{type}</option>)}
        </select></label>
        <label>Yuridik nomi<input name="legal_name" minLength="2" maxLength="150" defaultValue={company.legal_name || ''} /></label>
        <label>Firma rasmi<input key={company.cover_path || 'cover'} name="cover" type="file" accept="image/jpeg,image/png,image/webp" /></label>
        {company.cover_path && <label><input name="remove_cover" type="checkbox" /> Joriy rasmni olib tashlash</label>}
        <label>Korxona e-pochtasi yoki telefoni<input name="contact" maxLength="254" defaultValue={company.contact || ''} /></label>
        <label>Yuridik manzil<input name="legal_address" minLength="5" maxLength="250" defaultValue={company.legal_address || ''} /></label>
        <div><button className="action" disabled={savingCompany}>{savingCompany ? 'Saqlanmoqda…' : 'Korxona ma’lumotlarini saqlash'}</button></div>
      </form> : <dl className="company-details">
        <div><dt>Korxona nomi</dt><dd>{company.name}</dd></div>
        <div><dt>Faoliyat yo‘nalishi</dt><dd>{company.sector || 'Kiritilmagan'}</dd></div>
        <div><dt>E-pochta yoki telefon</dt><dd>{company.contact || 'Kiritilmagan'}</dd></div>
        <div><dt>Yuridik nomi</dt><dd>{[company.legal_type, company.legal_name].filter(Boolean).join(' · ') || 'Kiritilmagan'}</dd></div>
        <div><dt>Yuridik manzil</dt><dd>{company.legal_address || 'Kiritilmagan'}</dd></div>
      </dl>)}
      {companyStatus && <p role="status">{companyStatus}</p>}
    </section>}
  </>;
}
