'use client';
import { useEffect, useRef, useState } from 'react';
import { PanelState, StatusBadge } from './dashboard-ui';
import { formatMoney } from './sales';

const kinds = { receipt:'Kirim', production:'Ishlab chiqarishga chiqim', damage:'Yaroqsiz mahsulot', expired:'Muddati o‘tgan', supplier_return:'Ta’minotchiga qaytarish', other:'Boshqa chiqim', count:'Inventarizatsiya' };
const states = { draft:'Qoralama', approved:'Tasdiqlangan', cancelled:'Bekor qilingan' };

export default function InventoryOperations({ db, company, products, role, refresh }) {
  const [kind,setKind]=useState('receipt');
  const [lines,setLines]=useState([0]);
  const nextLine=useRef(1);
  const request=useRef(null);
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [page,setPage]=useState(0);
  const [filter,setFilter]=useState('');
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState(null);
  const byId=new Map(products.map(item=>[item.id,item.name]));
  async function load() {
    let builder=db.from('inventory_operations').select('id,kind,reference,reason,operation_date,status,created_by,approved_by,inventory_operation_lines(*)').eq('company_id',company);
    if (filter) builder=builder.eq('kind',filter);
    if (query.trim()) builder=builder.ilike('reference','%'+query.trim()+'%');
    const {data,error}=await builder.order('created_at',{ascending:false}).order('id').range(page*20,page*20+19);
    if(error) throw error;
    setData(data);
  }
  useEffect(()=>{
    setData(null);
    setError('');
    setSelected(null);
    load().catch(error=>setError(error.message));
  },[company,page,filter,query]);

  async function save(name,args,onSaved) {
    if(busy) return;
    setBusy(true);setError('');setNotice('');
    try {
      const {error}=await db.rpc(name,{p_company:company,...args});
      if(error) throw error;
      onSaved?.();
      setNotice('Hujjat saqlandi.');
      await Promise.all([load(),refresh()]);
    } catch(error){setError(error.message);}
    finally{setBusy(false);}
  }

  return <>
    <section>
      <h2>Ombor hujjati yaratish</h2>
      <form className="inventory-operation-form" onSubmit={event=>{
        event.preventDefault();
        const form=event.currentTarget;
        const fields=new FormData(form);
        const args={p_kind:kind,p_reference:fields.get('reference'),p_reason:fields.get('reason'),p_date:fields.get('date'),
          p_lines:lines.map(key=>({product:fields.get('product-'+key),quantity:Number(fields.get('quantity-'+key)),cost:kind==='receipt'?fields.get('cost-'+key):null}))};
        if(new Set(args.p_lines.map(line=>line.product)).size!==lines.length){setError('Bir mahsulotni ikki marta tanlamang.');return;}
        const signature=JSON.stringify(args);
        if(request.current?.signature!==signature) request.current={signature,id:crypto.randomUUID()};
        save('create_inventory_operation',{...args,p_id:request.current.id},()=>{
          request.current=null;
          form.reset();
          setLines([nextLine.current++]);
        });
      }}>
        <div className="staff-controls">
          <label>Turi<select value={kind} onChange={event=>setKind(event.target.value)}>{Object.entries(kinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <label>Hujjat raqami<input name="reference" required maxLength={100}/></label>
          <label>Sana<input type="date" name="date" required defaultValue={new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent'}).format(new Date())}/></label>
        </div>
        <label>Sabab yoki izoh<input name="reason" required maxLength={500}/></label>
        {lines.map((key,index)=><div className="staff-controls" key={key}>
          <label>Mahsulot {index+1}<select name={'product-'+key} required defaultValue=""><option value="" disabled>Tanlang</option>{products.map(product=><option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}</select></label>
          <label>{kind==='count'?'Haqiqiy miqdor':'Miqdor'}<input type="number" name={'quantity-'+key} min={kind==='count'?0:1} max={1000000} required/></label>
          {kind==='receipt'&&<label>Birlik xarid narxi<input type="number" name={'cost-'+key} min="0" step=".01" required/></label>}
          {lines.length>1&&<button type="button" className="secondary" onClick={()=>setLines(previous=>previous.filter(item=>item!==key))}>Qatorni olib tashlash</button>}
        </div>)}
        <div className="staff-controls">
          <button type="button" className="secondary" disabled={lines.length>=100} onClick={()=>setLines(previous=>[...previous,nextLine.current++])}>Mahsulot qo‘shish</button>
          <button className="action" disabled={busy||!products.length}>Qoralamani saqlash</button>
        </div>
      </form>
      {error&&<PanelState kind="error">{error}</PanelState>}
      {notice&&<p role="status">{notice}</p>}
    </section>
    <section>
      <h2>Ombor hujjatlari tarixi</h2>
      <div className="staff-controls"><label>Hujjat raqami<input type="search" value={query} onChange={event=>{setPage(0);setQuery(event.target.value);}}/></label>
        <label>Turi<select value={filter} onChange={event=>{setPage(0);setFilter(event.target.value);}}>
          <option value="">Barchasi</option>{Object.entries(kinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
      {!data&&!error&&<PanelState kind="loading">Hujjatlar yuklanmoqda…</PanelState>}
      {data?.length===0&&<PanelState>Hujjat topilmadi.</PanelState>}
      {data?.length>0&&<div className="table"><table><thead><tr><th>Raqam</th><th>Sana</th><th>Turi</th><th>Holat</th><th>Amal</th></tr></thead>
        <tbody>{data.map(row=><tr key={row.id}><td><button type="button" className="text-button" onClick={()=>setSelected(row)}>{row.reference}</button></td>
          <td>{row.operation_date}</td><td>{kinds[row.kind]}</td><td><StatusBadge status={row.status}>{states[row.status]}</StatusBadge></td>
          <td>{row.status==='draft'&&<>
            {(row.kind!=='count'||role==='owner')&&<button className="action" disabled={busy} onClick={()=>save('review_inventory_operation',{p_id:row.id,p_accept:true},()=>setSelected(null))}>Tasdiqlash</button>}
            <button className="secondary" disabled={busy} onClick={()=>save('review_inventory_operation',{p_id:row.id,p_accept:false},()=>setSelected(null))}>Bekor qilish</button>
          </>}</td></tr>)}</tbody></table></div>}
      <div className="staff-controls"><button className="secondary" disabled={!page} onClick={()=>setPage(page-1)}>Oldingi</button><button className="secondary" disabled={data?.length!==20} onClick={()=>setPage(page+1)}>Keyingi</button></div>
    </section>
    {selected&&<section><h2>{selected.reference}</h2><p>{selected.reason}</p>
      <div className="table"><table><thead><tr><th>Mahsulot</th><th>Miqdor</th><th>Avvalgi qoldiq</th><th>Amaldagi farq</th><th>Tannarx</th><th>Tafovut qiymati</th></tr></thead>
      <tbody>{selected.inventory_operation_lines.map(line=><tr key={line.product_id}><td>{byId.get(line.product_id)||line.product_id}</td><td>{line.quantity}</td>
        <td>{line.expected_stock}</td><td>{line.applied_delta??'—'}</td><td>{formatMoney(line.cost_after)}</td><td>{formatMoney(line.discrepancy_value)}</td></tr>)}</tbody></table></div>
    </section>}
  </>;
}
