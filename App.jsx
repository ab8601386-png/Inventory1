import {useEffect,useState,useCallback,useRef} from 'react'
import {createClient} from '@supabase/supabase-js'
import JsBarcode from 'jsbarcode'

const supabase=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY)
const NAV=[['Dashboard','📊'],['Inventory','📦'],['Show Stocks','📈'],['Categories','🏷️'],['Suppliers','🚚'],['Report','🧾'],['Management','🗂️'],['Setting','⚙️'],['Logout','🚪']]

function csv(rows,name){
  if(!rows.length)return
  const k=Object.keys(rows[0]),q=v=>`"${String(v??'').replace(/"/g,'""')}"`
  const b=new Blob([[k.join(','),...rows.map(r=>k.map(c=>q(r[c])).join(','))].join('\n')],{type:'text/csv'})
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name+'.csv';a.click()
}
function printLabel(p,cur){
  if(!p.barcode)return alert('This product has no barcode')
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg')
  JsBarcode(svg,p.barcode,{format:'CODE128',height:50,displayValue:true})
  const w=window.open('','_blank','width=420,height=320');if(!w)return alert('Allow pop-ups to print')
  const n=p.name.replace(/</g,'&lt;')
  w.document.write(`<body style="font-family:sans-serif;text-align:center"><b>${n}</b><br>${svg.outerHTML}<br>${cur}${p.price}<script>onload=()=>print()<\/script></body>`);w.document.close()
}
const Modal=({title,onClose,children})=><div className="ov" onClick={onClose}><div className="md" onClick={e=>e.stopPropagation()}><h3>{title}<button className="x" onClick={onClose}>✕</button></h3>{children}</div></div>

export default function App(){
  const [s,setS]=useState(undefined)
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setS(data.session))
    const {data:l}=supabase.auth.onAuthStateChange((_e,x)=>setS(x))
    return()=>l.subscription.unsubscribe()
  },[])
  if(s===undefined)return <div className="center">Loading…</div>
  return s?<Shell session={s}/>:<Login/>
}

function Login(){
  const [e,setE]=useState(''),[p,setP]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[,tick]=useState(0)
  useEffect(()=>{const t=setInterval(()=>tick(x=>x+1),1000);return()=>clearInterval(t)},[])
  const left=Math.ceil(((+localStorage.getItem('lockUntil')||0)-Date.now())/1000)
  async function go(ev){
    ev.preventDefault();if(left>0||busy)return;setBusy(true);setErr('')
    const {error}=await supabase.auth.signInWithPassword({email:e.trim(),password:p})
    if(error){
      const n=(+localStorage.getItem('fails')||0)+1;localStorage.setItem('fails',n)
      if(n>=5){localStorage.setItem('lockUntil',Date.now()+60000);localStorage.setItem('fails',0);setErr('Too many attempts. Locked for 60 seconds.')}
      else setErr('Invalid email or password ('+(5-n)+' attempts left)')
    }else localStorage.setItem('fails',0)
    setBusy(false)
  }
  return <div className="center"><form className="card login" onSubmit={go}>
    <h2 style={{margin:0}}>📦 Inventory Manager</h2><label>Email<input type="email" required value={e} onChange={x=>setE(x.target.value)} autoComplete="username"/></label>
    <label>Password<input type="password" required value={p} onChange={x=>setP(x.target.value)} autoComplete="current-password"/></label>
    {err&&<div className="err">{err}</div>}{left>0&&<div className="err">Try again in {left}s</div>}
    <button disabled={busy||left>0}>{busy?'Signing in…':'Login'}</button></form></div>
}

function Shell({session}){
  const [page,setPage]=useState('Dashboard'),[db,setDb]=useState(null),[open,setOpen]=useState(false),[toast,setToast]=useState('')
  const notify=m=>{setToast(m);setTimeout(()=>setToast(''),2500)}
  const load=useCallback(async()=>{
    const g=(t,o)=>supabase.from(t).select('*').order(o||'id',{ascending:false})
    const [p,c,s,m,st]=await Promise.all([g('products'),g('categories'),g('suppliers'),g('movements','created_at').limit(5000),supabase.from('settings').select('*').eq('id',1).single()])
    const e=[p,c,s,m,st].find(x=>x.error);if(e)return notify(e.error.message)
    setDb({products:p.data,categories:c.data,suppliers:s.data,movements:m.data,settings:st.data})
  },[])
  useEffect(()=>{load()},[load])
  const go=n=>{setOpen(false);if(n==='Logout'){if(confirm('Log out?'))supabase.auth.signOut()}else setPage(n)}
  const cur=db?.settings.currency||'₹',money=n=>cur+Number(n||0).toLocaleString()
  const pr={db,reload:load,notify,go,cur,money,session}
  const V=db&&{Dashboard:<Dashboard {...pr}/>,Inventory:<Inventory {...pr}/>,'Show Stocks':<Stocks {...pr}/>,
    Categories:<Crud {...pr} table="categories" rows={db.categories} fields={[['name','Name']]}/>,
    Suppliers:<Crud {...pr} table="suppliers" rows={db.suppliers} fields={[['name','Company'],['contact','Contact person'],['phone','Phone'],['email','Email'],['address','Address']]}/>,
    Report:<Report {...pr}/>,Management:<Management {...pr}/>,Setting:<Settings {...pr}/>}[page]
  return <div className="app">
    <nav className={'side'+(open?' open':'')}><h2>📦 {db?.settings.company||'Inventory'}</h2>
      {NAV.map(([n,i])=><button key={n} className={page===n?'on':''} onClick={()=>go(n)}>{i} {n}</button>)}</nav>
    <main className="main"><div className="top"><button className="g" onClick={()=>setOpen(!open)}>☰</button><b>{page}</b></div>
      <h2 style={{marginTop:0}} className="hd">{page}</h2>{V||<div>Loading…</div>}</main>
    {toast&&<div className="toast">{toast}</div>}</div>
}

function Dashboard({db,go,money}){
  const P=db.products,low=P.filter(p=>p.qty>0&&p.qty<=p.min_qty),out=P.filter(p=>p.qty===0),pm=Object.fromEntries(P.map(p=>[p.id,p.name]))
  const C=[['Products',P.length,'Inventory'],['Units in stock',P.reduce((a,p)=>a+p.qty,0),'Show Stocks'],['Stock value',money(P.reduce((a,p)=>a+p.qty*p.cost,0)),'Report'],['Low stock',low.length,'Show Stocks'],['Out of stock',out.length,'Show Stocks'],['Suppliers',db.suppliers.length,'Suppliers']]
  return <>
    <div className="grid">{C.map(([t,v,n])=><div key={t} className="card stat" onClick={()=>go(n)}>{t}<b>{v}</b></div>)}</div>
    <div className="bar">{[['+ Add Product','Inventory'],['Stock In / Out','Show Stocks'],['Categories','Categories'],['Suppliers','Suppliers'],['Reports','Report']].map(([t,n])=><button key={t} onClick={()=>go(n)}>{t}</button>)}</div>
    <div className="card"><b>Recent movements</b><div className="tw"><table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Reason</th></tr></thead><tbody>
      {db.movements.slice(0,8).map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString()}</td><td>{pm[m.product_id]}</td><td>{m.type.toUpperCase()}</td><td>{m.qty}</td><td>{m.reason}</td></tr>)}</tbody></table></div></div></>
}

function Scanner({onScan,onClose}){
  const v=useRef(),[err,setErr]=useState('')
  useEffect(()=>{
    let st,stop=false
    ;(async()=>{try{
      if(!('BarcodeDetector' in window))throw Error('Camera scanning needs Chrome/Edge/Android. A USB or Bluetooth scanner also works: click the barcode field and scan.')
      const d=new BarcodeDetector();st=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
      v.current.srcObject=st;await v.current.play()
      const loop=async()=>{if(stop)return;const r=await d.detect(v.current).catch(()=>[]);if(r[0]){onScan(r[0].rawValue);return}requestAnimationFrame(loop)};loop()
    }catch(e){setErr(e.message)}})()
    return()=>{stop=true;st&&st.getTracks().forEach(t=>t.stop())}
  },[])
  return <Modal title="Scan barcode" onClose={onClose}>{err?<div className="err">{err}</div>:<video ref={v} playsInline muted/>}</Modal>
}

function Inventory({db,reload,notify,cur}){
  const [f,setF]=useState(null),[q,setQ]=useState(''),[sc,setSc]=useState(false),[file,setFile]=useState(null),[busy,setBusy]=useState(false)
  const cm=Object.fromEntries(db.categories.map(c=>[c.id,c.name]))
  const rows=db.products.filter(p=>[p.name,p.sku,p.barcode].some(x=>(x||'').toLowerCase().includes(q.toLowerCase())))
  const set=(k,v)=>setF(o=>({...o,[k]:v}))
  async function save(e){
    e.preventDefault();setBusy(true)
    try{
      let image_url=f.image_url||null
      if(file){const path=Date.now()+'-'+file.name.replace(/\W/g,'_')
        const u=await supabase.storage.from('product-images').upload(path,file);if(u.error)throw u.error
        image_url=supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl}
      const v={name:f.name.trim(),sku:f.sku||null,barcode:f.barcode?.trim()||null,category_id:f.category_id||null,supplier_id:f.supplier_id||null,
        cost:+f.cost||0,price:+f.price||0,min_qty:+f.min_qty||0,image_url}
      if(f.id){const r=await supabase.from('products').update(v).eq('id',f.id);if(r.error)throw r.error}
      else{const r=await supabase.from('products').insert(v).select().single();if(r.error)throw r.error
        if(+f.qty>0){const m=await supabase.rpc('move_stock',{p_id:r.data.id,p_type:'in',p_qty:+f.qty,p_reason:'purchase',p_note:'Opening stock'});if(m.error)throw m.error}}
      setF(null);setFile(null);reload();notify('Product saved')
    }catch(x){notify(x.message.includes('barcode')?'Barcode already used by another product':x.message)}
    setBusy(false)
  }
  async function del(p){if(!confirm('Delete '+p.name+' and its history?'))return;const {error}=await supabase.from('products').delete().eq('id',p.id);error?notify(error.message):(reload(),notify('Deleted'))}
  const gen=()=>set('barcode',String(Date.now()).slice(-12))
  return <>
    <div className="bar"><input placeholder="Search name / SKU / barcode…" value={q} onChange={e=>setQ(e.target.value)}/><button className="g" onClick={()=>setSc('search')}>📷 Scan</button>
      <button onClick={()=>setF({cost:0,price:0,qty:0,min_qty:db.settings.low_stock})}>+ Add product</button></div>
    <div className="tw card"><table><thead><tr><th></th><th>Name</th><th>SKU</th><th>Barcode</th><th>Category</th><th>Cost</th><th>Price</th><th>Qty</th><th></th></tr></thead><tbody>
      {rows.map(p=><tr key={p.id}><td>{p.image_url?<img src={p.image_url} alt=""/>:<div className="ph"/>}</td><td>{p.name}</td><td>{p.sku}</td><td>{p.barcode}</td><td>{cm[p.category_id]}</td><td>{cur}{p.cost}</td><td>{cur}{p.price}</td><td>{p.qty}</td>
        <td><button className="s g" onClick={()=>{setFile(null);setF(p)}}>Edit</button> <button className="s g" onClick={()=>printLabel(p,cur)}>🏷 Label</button> <button className="s r" onClick={()=>del(p)}>Delete</button></td></tr>)}
      {!rows.length&&<tr><td colSpan="9">No products found</td></tr>}</tbody></table></div>
    {sc&&<Scanner onClose={()=>setSc(false)} onScan={c=>{sc==='field'?set('barcode',c):setQ(c);setSc(false)}}/>}
    {f&&<Modal title={f.id?'Edit product':'Add product'} onClose={()=>setF(null)}><form onSubmit={save} style={{display:'grid',gap:10}}>
      <label>Name *<input required value={f.name||''} onChange={e=>set('name',e.target.value)}/></label>
      <div className="f2"><label>SKU<input value={f.sku||''} onChange={e=>set('sku',e.target.value)}/></label>
        <label>Barcode (scan or type)<input value={f.barcode||''} onChange={e=>set('barcode',e.target.value)} onKeyDown={e=>e.key==='Enter'&&e.preventDefault()}/></label></div>
      <div className="bar"><button type="button" className="g s" onClick={gen}>Generate barcode</button><button type="button" className="g s" onClick={()=>setSc('field')}>📷 Scan barcode</button></div>
      <div className="f2"><label>Category<select value={f.category_id||''} onChange={e=>set('category_id',e.target.value)}><option value="">—</option>{db.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Supplier<select value={f.supplier_id||''} onChange={e=>set('supplier_id',e.target.value)}><option value="">—</option>{db.suppliers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Cost price<input type="number" min="0" step="any" value={f.cost} onChange={e=>set('cost',e.target.value)}/></label>
        <label>Selling price<input type="number" min="0" step="any" value={f.price} onChange={e=>set('price',e.target.value)}/></label>
        <label>{f.id?'Current qty (use Stocks to change)':'Opening qty'}<input type="number" min="0" disabled={!!f.id} value={f.qty} onChange={e=>set('qty',e.target.value)}/></label>
        <label>Low-stock alert at<input type="number" min="0" value={f.min_qty} onChange={e=>set('min_qty',e.target.value)}/></label></div>
      <label>Product image<input type="file" accept="image/*" onChange={e=>setFile(e.target.files[0])}/></label>
      <button disabled={busy}>{busy?'Saving…':'Save product'}</button></form></Modal>}</>
}

function Stocks({db,reload,notify,cur}){
  const [q,setQ]=useState(''),[fl,setFl]=useState('all'),[m,setM]=useState(null),[sc,setSc]=useState(false),[busy,setBusy]=useState(false)
  const cm=Object.fromEntries(db.categories.map(c=>[c.id,c.name]))
  const st=p=>p.qty===0?['Out','ot']:p.qty<=p.min_qty?['Low','lw']:['OK','ok']
  const rows=db.products.filter(p=>(fl==='all'||st(p)[0].toLowerCase()===fl)&&[p.name,p.sku,p.barcode].some(x=>(x||'').toLowerCase().includes(q.toLowerCase())))
  const open=(p,type)=>setM({p,type,qty:1,reason:type==='in'?'purchase':'sale',note:''})
  const found=c=>{const p=db.products.find(x=>x.barcode===c);if(p){setQ('');open(p,'in');notify('Found: '+p.name)}else{setQ(c);notify('No product with this barcode')}}
  async function go(e){
    e.preventDefault();setBusy(true)
    const {error}=await supabase.rpc('move_stock',{p_id:m.p.id,p_type:m.type,p_qty:+m.qty,p_reason:m.reason,p_note:m.note})
    setBusy(false);if(error)return notify(error.message.includes('qty')?'Not enough stock':error.message)
    setM(null);reload();notify('Stock updated')
  }
  return <>
    <div className="bar"><input placeholder="Search or scan barcode + Enter" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&q&&found(q)}/>
      <select value={fl} onChange={e=>setFl(e.target.value)}><option value="all">All</option><option value="ok">In stock</option><option value="low">Low</option><option value="out">Out</option></select>
      <button className="g" onClick={()=>setSc(true)}>📷 Scan</button></div>
    <div className="tw card"><table><thead><tr><th>Product</th><th>Barcode</th><th>Category</th><th>Qty</th><th>Min</th><th>Status</th><th>Value</th><th></th></tr></thead><tbody>
      {rows.map(p=>{const[s,c]=st(p);return <tr key={p.id}><td>{p.name}</td><td>{p.barcode}</td><td>{cm[p.category_id]}</td><td>{p.qty}</td><td>{p.min_qty}</td><td><span className={'bd '+c}>{s}</span></td><td>{cur}{(p.qty*p.cost).toLocaleString()}</td>
        <td><button className="s" onClick={()=>open(p,'in')}>+ In</button> <button className="s r" onClick={()=>open(p,'out')}>− Out</button></td></tr>})}</tbody></table></div>
    {sc&&<Scanner onClose={()=>setSc(false)} onScan={c=>{setSc(false);found(c)}}/>}
    {m&&<Modal title={`Stock ${m.type==='in'?'IN':'OUT'}: ${m.p.name}`} onClose={()=>setM(null)}><form onSubmit={go} style={{display:'grid',gap:10}}>
      <div>Current stock: <b>{m.p.qty}</b> · Barcode: {m.p.barcode||'—'}</div>
      <label>Quantity<input type="number" min="1" max={m.type==='out'?m.p.qty:undefined} required value={m.qty} onChange={e=>setM({...m,qty:e.target.value})}/></label>
      <label>Reason<select value={m.reason} onChange={e=>setM({...m,reason:e.target.value})}>{(m.type==='in'?['purchase','return','adjust']:['sale','damage','adjust']).map(r=><option key={r}>{r}</option>)}</select></label>
      <label>Note<input value={m.note} onChange={e=>setM({...m,note:e.target.value})}/></label><button disabled={busy}>{busy?'Saving…':'Confirm'}</button></form></Modal>}</>
}

function Crud({table,rows,fields,reload,notify}){
  const [f,setF]=useState(null),[busy,setBusy]=useState(false)
  async function save(e){
    e.preventDefault();setBusy(true);const {id,...v}=f
    const r=id?await supabase.from(table).update(v).eq('id',id):await supabase.from(table).insert(v)
    setBusy(false);if(r.error)return notify(r.error.message.includes('duplicate')?'Already exists':r.error.message)
    setF(null);reload();notify('Saved')
  }
  async function del(r){if(!confirm('Delete '+r.name+'?'))return;const {error}=await supabase.from(table).delete().eq('id',r.id);error?notify(error.message):(reload(),notify('Deleted'))}
  return <><div className="bar"><button onClick={()=>setF({})}>+ Add</button></div>
    <div className="tw card"><table><thead><tr>{fields.map(([k,l])=><th key={k}>{l}</th>)}<th></th></tr></thead><tbody>
      {rows.map(r=><tr key={r.id}>{fields.map(([k])=><td key={k}>{r[k]}</td>)}<td><button className="s g" onClick={()=>setF(r)}>Edit</button> <button className="s r" onClick={()=>del(r)}>Delete</button></td></tr>)}
      {!rows.length&&<tr><td colSpan={fields.length+1}>Nothing added yet</td></tr>}</tbody></table></div>
    {f&&<Modal title={f.id?'Edit':'Add'} onClose={()=>setF(null)}><form onSubmit={save} style={{display:'grid',gap:10}}>
      {fields.map(([k,l],i)=><label key={k}>{l}<input required={i===0} type={k==='email'?'email':'text'} value={f[k]||''} onChange={e=>setF({...f,[k]:e.target.value})}/></label>)}
      <button disabled={busy}>{busy?'Saving…':'Save'}</button></form></Modal>}</>
}

function Report({db,money}){
  const T={'Stock In':m=>m.type==='in','Stock Out':m=>m.type==='out',Purchases:m=>m.type==='in'&&m.reason==='purchase',Sales:m=>m.type==='out'&&m.reason==='sale','Damage / Adjust':m=>['damage','adjust'].includes(m.reason)}
  const [t,setT]=useState('Sales'),[a,setA]=useState(''),[b,setB]=useState('')
  const pm=Object.fromEntries(db.products.map(p=>[p.id,p.name]))
  const rows=db.movements.filter(T[t]).filter(m=>(!a||m.created_at>=a)&&(!b||m.created_at<=b+'T23:59:59'))
  const tot=rows.reduce((s,m)=>s+m.qty*m.unit_price,0)
  const out=rows.map(m=>({Date:new Date(m.created_at).toLocaleString(),Product:pm[m.product_id],Type:m.type,Reason:m.reason,Qty:m.qty,Rate:m.unit_price,Amount:m.qty*m.unit_price,Note:m.note}))
  return <><div className="bar">{Object.keys(T).map(k=><button key={k} className={k===t?'':'g'} onClick={()=>setT(k)}>{k}</button>)}</div>
    <div className="bar"><input type="date" value={a} onChange={e=>setA(e.target.value)}/><input type="date" value={b} onChange={e=>setB(e.target.value)}/><button className="g" onClick={()=>csv(out,'report-'+t)}>⬇ CSV</button></div>
    <div className="grid"><div className="card">Entries<b style={{display:'block',fontSize:22}}>{rows.length}</b></div><div className="card">Total qty<b style={{display:'block',fontSize:22}}>{rows.reduce((s,m)=>s+m.qty,0)}</b></div><div className="card">Total amount<b style={{display:'block',fontSize:22}}>{money(tot)}</b></div></div>
    <div className="tw card"><table><thead><tr>{['Date','Product','Reason','Qty','Rate','Amount','Note'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
      {out.map((r,i)=><tr key={i}><td>{r.Date}</td><td>{r.Product}</td><td>{r.Reason}</td><td>{r.Qty}</td><td>{r.Rate}</td><td>{r.Amount}</td><td>{r.Note}</td></tr>)}</tbody></table></div></>
}

function Management({db,notify,session}){
  const [pw,setPw]=useState('')
  const backup=()=>{const b=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='inventory-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click()}
  async function change(e){e.preventDefault();const {error}=await supabase.auth.updateUser({password:pw});error?notify(error.message):(setPw(''),notify('Password changed'))}
  return <div style={{display:'grid',gap:14,maxWidth:560}}>
    <div className="card"><b>Saved data</b><p>{db.products.length} products · {db.categories.length} categories · {db.suppliers.length} suppliers · {db.movements.length} stock movements (all stored in Supabase)</p>
      <div className="bar"><button onClick={backup}>⬇ Full backup (JSON)</button><button className="g" onClick={()=>csv(db.products,'products')}>Products CSV</button><button className="g" onClick={()=>csv(db.suppliers,'suppliers')}>Suppliers CSV</button></div></div>
    <form className="card" onSubmit={change} style={{display:'grid',gap:10}}><b>Account: {session.user.email}</b>
      <label>New password (min 8 chars)<input type="password" minLength={8} required value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password"/></label><button>Change password</button></form></div>
}

function Settings({db,reload,notify}){
  const [f,setF]=useState(db.settings)
  async function save(e){e.preventDefault();const {error}=await supabase.from('settings').update({company:f.company,currency:f.currency,low_stock:+f.low_stock}).eq('id',1);error?notify(error.message):(reload(),notify('Settings saved'))}
  return <form className="card" onSubmit={save} style={{display:'grid',gap:10,maxWidth:420}}>
    <label>Company name<input required value={f.company} onChange={e=>setF({...f,company:e.target.value})}/></label>
    <label>Currency symbol<input required maxLength={4} value={f.currency} onChange={e=>setF({...f,currency:e.target.value})}/></label>
    <label>Default low-stock level<input type="number" min="0" value={f.low_stock} onChange={e=>setF({...f,low_stock:e.target.value})}/></label><button>Save settings</button></form>
}
