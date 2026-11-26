'use client';
import { useEffect, useState } from 'react';
import { PanelState } from './dashboard-ui';

const quality = { insufficient: 'Tarix yetarli emas', low: 'Past', moderate: 'O‘rtacha' };

export default function DemandBaseline({ db, company }) {
  const [days,setDays]=useState(7);
  const [page,setPage]=useState(0);
  const [result,setResult]=useState(null);
  useEffect(()=>{
    let active=true;
    db.rpc('demand_baseline',{p_company:company,p_days:days}).order('replenishment',{ascending:false,nullsFirst:false})
      .order('product_id').range(page*25,page*25+24).then(({data,error})=>{
        if(active) setResult({data,error});
      });
    return ()=>{active=false;};
  },[db,company,days,page]);
  return <section>
    <div className="panel-heading"><h2>Talab prognozi</h2>
      <label>Prognoz davri<select value={days} onChange={event=>{setResult(null);setPage(0);setDays(Number(event.target.value));}}>
        {[7,14,30,90].map(value=><option value={value} key={value}>{value} kun</option>)}
      </select></label></div>
    <p>Hisob oxirgi 28 to‘liq kunning yetkazilgan mahsulotlariga tayanadi. «Zaxira ehtiyoji» prognoz va minimal qoldiq asosidagi miqdor.</p>
    {!result&&<PanelState kind="loading">Hisoblanmoqda…</PanelState>}
    {result?.error&&<PanelState kind="error">{result.error.message}</PanelState>}
    {result?.data?.length===0&&<PanelState>Mahsulot topilmadi.</PanelState>}
    {result?.data?.length>0&&<>
      <div className="table"><table><thead><tr><th>Mahsulot</th><th>Qoldiq</th><th>28 kunda yetkazilgan</th><th>Yetkazish bo‘lgan kunlar</th><th>Prognoz</th><th>Ishonchlilik</th><th>Zaxira ehtiyoji</th></tr></thead>
        <tbody>{result.data.map(row=><tr key={row.product_id}><td>{row.name} · {row.unit}</td><td>{row.stock}</td><td>{row.observed}</td><td>{row.observed_days}</td>
          <td>{row.expected_units??'—'}</td><td>{quality[row.forecast_quality]}</td><td>{row.replenishment??'—'}</td></tr>)}</tbody>
      </table></div>
      <div className="staff-controls"><button className="secondary" disabled={!page} onClick={()=>{setResult(null);setPage(page-1);}}>Oldingi</button>
        <button className="secondary" disabled={result.data.length!==25} onClick={()=>{setResult(null);setPage(page+1);}}>Keyingi</button></div>
    </>}
  </section>;
}
