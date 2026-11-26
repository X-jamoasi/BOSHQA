const inventoryTerms = /mahsulot|masulot|maxsulot|ombor|qold|zaxira|kam qol|stok|stock|xomashyo|katalog|narx|chegirma/;
const orderTerms = /buyurtma|zakaz|yetkaz|jo.nat|topshiril/;
const staffTerms = /xodim|hodim|ishchi|hamkor/;
const salesTerms = /savdo|savod|sotuv|sotil|tushum|daromad|foyda|aylanma|xarajat|qancha pul|jami summa|summasi|eng ko.p sot|eng yaxshi sot/;
const shopTerms = /do['‘’ʻ]?kon|d[oö]kon|savdo nuqta|agent/;
const discountTerms = /chegirma|aksiya/;
const platformTerms = /platforma|korxona|kompaniya|foydalanuvchi|buyurtma|monitoring|hisobot/;

export async function loadChatContext({ db, company, role, topic, advice = false }) {
  const query = topic.normalize('NFKC').toLowerCase();
  const manages = role === 'owner' || role === 'manager';
  const context = {};
  const sources = [];
  const signal = AbortSignal.timeout(6500);
  function read(key, fetch, summarize) {
    sources.push((async () => {
      const { data, count, error } = await fetch.abortSignal(signal);
      context[key] = error || !data ? { holat: 'Ma’lumotni o‘qib bo‘lmadi' } : summarize(data, count);
    })().catch(() => { context[key] = { holat: 'Ma’lumotni o‘qib bo‘lmadi' }; }));
  }

  if (role === 'admin' && (advice || platformTerms.test(query))) {
    read('platforma', db.rpc('platform_dashboard'), data => ({
      korxonalar_soni: data.companies?.length,
      yangi_korxonalar_30_kun: data.recent_companies,
      buyurtmalar_soni: data.orders,
      ai_natijalari_30_kun: data.ai_counts,
    }));
  }
  if (role === 'admin' && /korxona|dokon|do.kon|muzlat|faollashtir|arxiv/.test(query)) {
    const kind = /dokon|do.kon/.test(query) ? 'store' : 'company';
    read('platforma_hisoblari', db.rpc('platform_business_directory', {
      p_kind: kind, p_query: null, p_status: null, p_offset: 0,
    }), data => ({ turi: kind, tafsilotlar: data, chegara: 'Birinchi 25 ta yozuv.' }));
  }
  if (company && manages && /inventar|kirim|chiqim|ombor hujjat/.test(query)) {
    read('ombor_hujjatlari', db.from('inventory_operations').select('id,reference,kind,status,operation_date')
      .eq('company_id', company).order('created_at', { ascending: false }).limit(25), data => data);
  }
  if (company && (advice || /qarz|tolov|to['‘’ʻ]lov|toladi|to['‘’ʻ]ladi|muddati/.test(query))) {
    const today = new Date();
    const localDate = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(date);
    const todayLocal = localDate(today);
    const nextWeek = localDate(new Date(today.getTime() + 7 * 86400000));
    const fields = 'shop_name,legal_name,legal_type,total,received,balance,due_on,state';
    if (advice || /kechik|yaqin|yetti|\b7\b|muddati o.t/.test(query)) {
      const receivables = () => db.rpc('company_receivables', { p_company: company }, { count: 'exact' }).select(fields);
      const summarize = (rows, count) => ({ jami_yozuvlar: count, korsatilgan: rows.length, yozuvlar: rows });
      read('muddati_otgan_qarzlar', receivables().eq('state', 'overdue').order('due_on').limit(25), summarize);
      read('yetti_kun_ichidagi_qarzlar', receivables().eq('state', 'due').gte('due_on', todayLocal)
        .lte('due_on', nextWeek).order('due_on').limit(25), summarize);
    } else {
      read('qarzlar', db.rpc('company_receivables', { p_company: company }).select(fields).limit(100), data => {
        const mentioned = data.filter(row => [row.shop_name, row.legal_name].some(name => name && query.includes(name.toLowerCase())));
        return { izoh: 'Ko‘pi bilan 100 ta yozuv. To‘lovlar faqat tasdiqlangach hisoblanadi.',
          yozuvlar: (mentioned.length ? mentioned : data).slice(0, 24) };
      });
    }
  }
  if (company && role === 'owner' && (advice || salesTerms.test(query))) {
    read('savdo', db.rpc('company_sales_summary', { p_company: company }), data => data);
    read('tasdiqlangan_tolovlar',db.rpc('company_payment_summary',{p_company:company}),data=>({
      izoh:'Tushum — menejer yoki ega tasdiqlagan to‘lovlar, tasdiqlash sanasi bo‘yicha.',
      davrlar:data,
    }));
  }
  if (company && (manages || role === 'customer') && shopTerms.test(query)) {
    read('dokonlar', db.rpc('shop_directory', { p_company: company }, { count: 'exact' }).select('id').limit(1),
      (_data, count) => ({ korishga_ruxsat_berilgan_dokonlar_soni: count }));
  }
  if (company && manages && discountTerms.test(query)) {
    read('chegirmalar', db.rpc('company_discounts', { p_company: company }, { count: 'exact' })
      .select('percent,starts_on,ends_on,enabled').limit(20), (data, count) => ({
      jami: count,
      oxirgi_qoidalar: data.map(item => ({ foiz:item.percent, boshlanish:item.starts_on, tugash:item.ends_on, yoqilgan:item.enabled })),
    }));
  }
  if (company && ((advice && manages) || inventoryTerms.test(query))) {
    if (manages) {
      read('ombor', db.rpc('inventory', { p_company: company }, { count: 'exact' })
        .select('name,stock,minimum,unit,price').order('name').range(0, 999), (data, count) => {
        const low = data.filter(item => item.stock <= item.minimum)
          .sort((a, b) => (a.stock - a.minimum) - (b.stock - b.minimum));
        const matchingNames = data.filter(item => query.includes(item.name.toLowerCase())).slice(0, 10);
        const details = [...new Set([...matchingNames, ...low])].slice(0, 30);
        return {
          tekshirilgan_mahsulotlar: data.length,
          katalog_toliq_tekshirildi: count != null && count <= data.length,
          minimum_yoki_undan_kam: low.length,
          mahsulotlar: details.map(({ name, stock, minimum, unit, price }) => ({ nom: name, qoldiq: stock, minimum, birlik: unit, narx_som: price })),
          tafsilot_chegarasi: 'Nomi savolda keltirilgan yoki qoldig‘i minimumga yetgan mahsulotlardan 30 tagacha.',
        };
      });
    } else {
      read('katalog', db.rpc('sales_catalog', { p_company: company })
        .select('name,unit,price,discount').order('name').limit(20), data => ({
        izoh: 'Ko‘pi bilan 20 ta mahsulot. Bu rolda ombor qoldig‘i berilmaydi.',
        mahsulotlar: data.map(({ name, unit, price, discount }) => ({ nom: name, birlik: unit, narx_som: price, chegirma_foiz: discount })),
      }));
    }
  }
  if (company && (advice || orderTerms.test(query))) {
    read('buyurtmalar', db.from('orders').select('status,direction,quantity,created_at,order_unit,expected_delivery_date,order_number', { count: 'exact' })
      .eq('company_id', company).order('created_at', { ascending: false }).limit(40), (data, count) => {
      const statuses = {};
      for (const order of data) statuses[order.status] = (statuses[order.status] || 0) + 1;
      return {
        ko_rishga_ruxsat_berilgan_buyurtmalar_soni: count,
        oxirgi_buyurtmalar_tahlil_qilingan_soni: data.length,
        shu_namunadagi_holatlar: statuses,
        oxirgi_buyurtmalar: data.slice(0, 8).map(({ status, direction, quantity, created_at, order_unit, expected_delivery_date, order_number }) =>
          ({ raqam: order_number, holat: status, yonalish: direction, miqdor: quantity, sana: created_at, birlik: order_unit, yetkazish_muddati: expected_delivery_date })),
      };
    });
  }
  if (company && role === 'owner' && staffTerms.test(query)) {
    read('xodimlar', db.from('company_members').select('role', { count: 'exact' }).eq('company_id', company).neq('role', 'owner')
      .limit(1000), (data, count) => ({
      jami: count,
      rollar: data.reduce((summary, item) => ({ ...summary, [item.role]: (summary[item.role] || 0) + 1 }), {}),
      rollar_toliq: count != null && data.length === count,
    }));
  }

  await Promise.all(sources);
  return Object.keys(context).length ? context : null;
}
