import { useState, useEffect, useCallback } from "react";

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_KEY;
const SB_SVC = import.meta.env.VITE_SUPABASE_SERVICE_KEY;
const RS_KEY = import.meta.env.VITE_RESEND_KEY;
const PS = 25;
const isRealEmail = e => e && !e.includes("@noemail.local");

// ── API ───────────────────────────────────────────────────────────────────────
async function sb(path, { method="GET", body, prefer, token, svc }={}) {
  const key = svc ? SB_SVC : SB_KEY;
  const tok = svc ? SB_SVC : (token||SB_KEY);
  const h = { "Content-Type":"application/json", "apikey":key, "Authorization":`Bearer ${tok}` };
  if (prefer) h["Prefer"] = prefer;
  const r = await fetch(`${SB_URL}${path}`, { method, headers:h, body:body!=null?JSON.stringify(body):undefined });
  if (r.status===204) return null;
  const d = await r.json();
  if (!r.ok) throw new Error(d.message||d.error_description||d.error||`Errore ${r.status}`);
  return d;
}
const GET  = (t,qs,tok)   => sb(`/rest/v1/${t}?${qs||""}`,{token:tok});
const POST = (t,b,tok)    => sb(`/rest/v1/${t}`,{method:"POST",body:b,prefer:"return=representation",token:tok});
const PATCH= (t,qs,b,tok) => sb(`/rest/v1/${t}?${qs}`,{method:"PATCH",body:b,prefer:"return=representation",token:tok});
const DEL  = (t,qs,tok)   => sb(`/rest/v1/${t}?${qs}`,{method:"DELETE",token:tok});
const UPS  = (t,b,tok)    => sb(`/rest/v1/${t}`,{method:"POST",body:b,prefer:"return=representation,resolution=merge-duplicates",token:tok});

async function createAuthUser(email, password) {
  const realEmail = email||`noemail_${Date.now()}_${Math.random().toString(36).slice(2)}@noemail.local`;
  const d = await sb("/auth/v1/admin/users",{method:"POST",body:{email:realEmail,password,email_confirm:true},svc:true});
  return { id:d.id, email:realEmail, hasRealEmail:!!email };
}

// ── Storage ───────────────────────────────────────────────────────────────────
async function uploadFile(bucket, filePath, file, token) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${filePath}`,{
    method:"POST",
    headers:{"apikey":SB_KEY,"Authorization":`Bearer ${token}`,"Content-Type":file.type||"application/octet-stream","x-upsert":"true"},
    body:file,
  });
  if(!r.ok){const d=await r.json().catch(()=>({})); throw new Error(d.message||"Errore upload");}
  return filePath;
}
async function getSignedUrl(bucket, filePath, token) {
  const r = await fetch(`${SB_URL}/storage/v1/object/sign/${bucket}/${filePath}`,{
    method:"POST",
    headers:{"apikey":SB_KEY,"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({expiresIn:3600}),
  });
  const d = await r.json();
  if(!r.ok) throw new Error(d.message||"Errore URL");
  return `${SB_URL}/storage/v1${d.signedURL}`;
}

// ── Email ─────────────────────────────────────────────────────────────────────
const MAIL_FROM = "Portale Condominiale <portale@studiomazzinibo.com>";
const sendEmail = async(to,subject,html) => {
  await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${RS_KEY}`},body:JSON.stringify({from:MAIL_FROM,to,subject,html})});
};
const mailFooter = `<p style="color:#64748b;font-size:12px;margin-top:16px">Studio Amministrazioni Immobiliari s.a.s. di Mazzini & C.<br><a href="https://studiomazzinibo.com">studiomazzinibo.com</a></p>`;
const catText = c => ({consuntivi:"un nuovo consuntivo",preventivi:"un nuovo preventivo con piano rate",verbali:"un nuovo verbale di assemblea",altro:"un nuovo documento"}[c]||"un nuovo documento");

async function notifyCondoDoc(condId, docName, cat, tok) {
  try {
    const users = await GET("profiles",`cond_id=eq.${condId}&role=eq.condomino&select=name,email`,tok);
    const condo = (await GET("condominii",`id=eq.${condId}&select=nome`,tok))?.[0];
    for(const u of users||[]){
      if(!isRealEmail(u.email)) continue;
      await sendEmail([u.email],`${condo?.nome} — Nuovo documento disponibile`,
        `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <h2 style="color:#1e40af">Studio Amministrazioni Immobiliari</h2>
          <p>Gentile <strong>${u.name}</strong>,</p>
          <p>È disponibile <strong>${catText(cat)}</strong> nel portale condominiale.</p>
          <p style="background:#f1f5f9;padding:12px;border-radius:8px">📄 <strong>${docName}</strong></p>
          ${mailFooter}</div>`);
    }
  }catch(e){console.error("Notifica errore:",e);}
}
async function notifyPersonalDoc(userId, docName, cat, tok) {
  try {
    const u = (await GET("profiles",`id=eq.${userId}&select=name,email`,tok))?.[0];
    if(!isRealEmail(u?.email)) return;
    await sendEmail([u.email],"Nuovo documento personale disponibile",
      `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#1e40af">Studio Amministrazioni Immobiliari</h2>
        <p>Gentile <strong>${u.name}</strong>,</p>
        <p>È disponibile <strong>${catText(cat)}</strong> nel Suo fascicolo personale.</p>
        <p style="background:#f1f5f9;padding:12px;border-radius:8px">📄 <strong>${docName}</strong></p>
        ${mailFooter}</div>`);
  }catch(e){console.error("Notifica errore:",e);}
}
async function notifySegnalazione(segn, userName, condoNome, interno, adminEmail) {
  if(!adminEmail) return;
  try {
    const col = segn.urgenza==="urgente"?"#e53e3e":"#2d3748";
    await sendEmail([adminEmail],`🚨 Nuova segnalazione — ${userName} — ${condoNome}`,
      `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#e53e3e">Nuova Segnalazione</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
          <tr><td style="padding:8px;font-weight:bold;background:#f7fafc">Condomino</td><td style="padding:8px">${userName} · Int. ${interno}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;background:#f7fafc">Condominio</td><td style="padding:8px">${condoNome}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;background:#f7fafc">Tipo</td><td style="padding:8px">${segn.tipo}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;background:#f7fafc">Urgenza</td><td style="padding:8px;color:${col};font-weight:bold">${segn.urgenza.toUpperCase()}</td></tr>
        </table>
        <div style="background:#f7fafc;padding:12px;border-radius:8px"><strong>Descrizione:</strong><br>${segn.descrizione}</div>
        <p style="color:#718096;font-size:12px">Ricevuta il ${new Date().toLocaleDateString("it-IT")} alle ${new Date().toLocaleTimeString("it-IT")}</p>
      </div>`);
  }catch(e){console.error("Notifica errore:",e);}
}
async function sendWelcomeEmail(email, nome, password, condoNome) {
  await sendEmail([email],"Le tue credenziali di accesso al Portale Condominiale",
    `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#1e40af">Studio Amministrazioni Immobiliari s.a.s. di Mazzini & C.</h2>
      <p>Gentile <strong>${nome}</strong>,</p>
      <p>Le sue credenziali per accedere al Portale Condominiale <strong>${condoNome}</strong>:</p>
      <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0">
        <p style="margin:4px 0">🌐 <a href="https://studiomazzinibo.com">studiomazzinibo.com</a></p>
        <p style="margin:4px 0">📧 ${email}</p>
        <p style="margin:4px 0">🔑 ${password}</p>
      </div>
      ${mailFooter}</div>`);
}

// ── UI ────────────────────────────────────────────────────────────────────────
const Inp = ({label,hint,...p}) => (
  <div className="mb-3">
    {label&&<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>}
    <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition" {...p}/>
    {hint&&<p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);
const Sel = ({label,children,...p}) => (
  <div className="mb-3">
    {label&&<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>}
    <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition" {...p}>{children}</select>
  </div>
);
const Btn = ({children,variant="primary",className="",...p}) => {
  const v={primary:"bg-blue-600 hover:bg-blue-700 text-white shadow-sm",secondary:"bg-white hover:bg-gray-50 text-gray-700 border border-gray-200",danger:"bg-red-500 hover:bg-red-600 text-white shadow-sm",success:"bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm",ghost:"hover:bg-gray-100 text-gray-500",warning:"bg-amber-500 hover:bg-amber-600 text-white shadow-sm"}[variant]||"";
  return <button className={`${v} px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`} {...p}>{children}</button>;
};
const Modal = ({title,children,onClose}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-800">{title}</h3>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-xl">×</button>
      </div>
      <div className="px-6 py-5 max-h-96 overflow-y-auto">{children}</div>
    </div>
  </div>
);
const CAT_LABELS = {consuntivi:"Consuntivi",preventivi:"Preventivi & Rate",verbali:"Verbali di Assemblea",altro:"Altro"};
const CAT_ICONS  = {consuntivi:"📊",preventivi:"💶",verbali:"📋",altro:"📎"};
const CAT_COLORS = {consuntivi:"bg-blue-50 text-blue-700",preventivi:"bg-green-50 text-green-700",verbali:"bg-purple-50 text-purple-700",altro:"bg-gray-100 text-gray-600"};
const STATO_COLORS = {aperta:"bg-red-100 text-red-700",in_lavorazione:"bg-amber-100 text-amber-700",chiusa:"bg-emerald-100 text-emerald-700"};
const STATO_LABELS = {aperta:"Aperta","in_lavorazione":"In lavorazione",chiusa:"Chiusa"};
const Badge = ({cat}) => <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[cat]}`}>{CAT_LABELS[cat]}</span>;
const StatoBadge = ({s}) => <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_COLORS[s]||"bg-gray-100 text-gray-600"}`}>{STATO_LABELS[s]||s}</span>;
const EmptyState = ({icon,text}) => <div className="py-12 text-center"><div className="text-4xl mb-3">{icon}</div><p className="text-gray-400 text-sm">{text}</p></div>;
const Spinner = () => <div className="py-12 flex justify-center"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div>;
const ErrBox = ({msg}) => msg?<div className="bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl px-3 py-2 mb-3">{msg}</div>:null;
const SearchBar = ({value,onChange,placeholder}) => (
  <div className="relative flex-1">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
    <input className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
  </div>
);
function useData(fn, deps=[]) {
  const [data,setData]=useState(null); const [loading,setLoading]=useState(true); const [err,setErr]=useState("");
  const load=useCallback(async()=>{setLoading(true);setErr("");try{setData(await fn());}catch(e){setErr(e.message);}setLoading(false);},deps);
  useEffect(()=>{load();},[load]);
  return {data,loading,err,reload:load};
}

// ── Cookie Banner ─────────────────────────────────────────────────────────────
function CookieBanner({onAccept}) {
  const [det,setDet]=useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl pointer-events-auto">
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="w-8 h-8 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">M</div>
          <div><p className="font-bold text-gray-800 text-sm">Studio Mazzini — Portale Condominiale</p><p className="text-xs text-gray-400">Informativa sull'uso dei cookie</p></div>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-gray-600 leading-relaxed">Questo portale utilizza esclusivamente <strong>cookie tecnici strettamente necessari</strong> al funzionamento del servizio: gestione della sessione di autenticazione e sicurezza degli accessi. Non vengono utilizzati cookie di profilazione né strumenti pubblicitari.</p>
          {det&&(
            <div className="mt-3 bg-gray-50 rounded-xl p-4 border border-gray-100 text-xs text-gray-600 space-y-2">
              <p>✓ <strong>Token di sessione (JWT):</strong> mantiene l'utente autenticato — Durata: sessione/24h — Non richiede consenso</p>
              <p>✓ <strong>Cookie di sicurezza (CSRF):</strong> protegge da attacchi informatici — Durata: sessione — Non richiede consenso</p>
            </div>
          )}
          <button onClick={()=>setDet(v=>!v)} className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">{det?"▲ Nascondi dettagli":"▼ Mostra dettagli cookie"}</button>
        </div>
        <div className="px-6 pb-5 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-400 flex-1">Utilizzando il portale accetti l'uso dei cookie tecnici ai sensi dell'art. 122, comma 1, D.Lgs. 196/2003.</p>
          <Btn onClick={onAccept}>Accetta e continua →</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function ContactFooter({c}) {
  if(!c) return null;
  return (
    <div className="bg-white border-t border-gray-200 px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">M</div>
        <span className="text-xs font-semibold text-gray-700">{c.nome}</span>
      </div>
      {c.telefono&&<a href={`tel:${c.telefono}`} className="text-xs text-gray-500 hover:text-blue-600 transition">📞 {c.telefono}</a>}
      {c.email&&<a href={`mailto:${c.email}`} className="text-xs text-gray-500 hover:text-blue-600 transition">✉️ {c.email}</a>}
      {c.indirizzo&&<span className="text-xs text-gray-400">📍 {c.indirizzo}</span>}
      {c.orari&&<span className="text-xs text-gray-400">🕐 {c.orari}</span>}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({items,active,onSelect,user,onLogout}) {
  return (
    <div className="w-60 bg-slate-900 min-h-screen flex flex-col flex-shrink-0">
      <div className="px-5 py-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold">M</div>
          <div><p className="text-white text-sm font-bold">Studio Mazzini</p><p className="text-slate-400 text-xs">Portale Condominiale</p></div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {items.map(({id,label,icon})=>(
          <button key={id} onClick={()=>onSelect(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${active===id?"bg-blue-600 text-white font-medium":"text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
            <span>{icon}</span><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <p className="text-slate-300 text-xs font-medium truncate mb-0.5">{user.name}</p>
        <p className="text-slate-500 text-xs truncate mb-3">{user.email}</p>
        <button onClick={onLogout} className="text-slate-500 hover:text-white text-xs">← Esci</button>
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({onLogin}) {
  const [email,setEmail]=useState(""); const [pwd,setPwd]=useState(""); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false); const [show,setShow]=useState(false);
  const submit=async()=>{
    if(!email||!pwd) return; setLoading(true); setErr("");
    try{
      const auth=await sb("/auth/v1/token?grant_type=password",{method:"POST",body:{email,password:pwd}});
      const profiles=await GET("profiles",`id=eq.${auth.user.id}&select=*,condominii(*)`,auth.access_token);
      if(!profiles?.length) throw new Error("Profilo non trovato. Contatta l'amministratore.");
      onLogin({token:auth.access_token,...profiles[0],email:auth.user.email});
    }catch(e){setErr(e.message);}
    setLoading(false);
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><span className="text-white text-3xl font-black">M</span></div>
          <h1 className="text-2xl font-black text-white">Studio Mazzini</h1>
          <p className="text-blue-200 text-sm mt-1">Portale Condominiale</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <Inp label="Email" type="email" value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} placeholder="tua@email.it" onKeyDown={e=>e.key==="Enter"&&submit()}/>
          <div className="relative mb-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Password</label>
            <input type={show?"text":"password"} value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-20"/>
            <button type="button" onClick={()=>setShow(v=>!v)} className="absolute right-3 top-7 text-gray-400 text-xs">{show?"Nascondi":"Mostra"}</button>
          </div>
          <ErrBox msg={err}/>
          <Btn className="w-full justify-center" onClick={submit} disabled={loading}>{loading?"Accesso...":"Accedi →"}</Btn>
          <p className="text-xs text-gray-400 text-center mt-4">Usa le credenziali fornite dall'amministratore</p>
        </div>
      </div>
    </div>
  );
}

// ── DocModal (condiviso) ──────────────────────────────────────────────────────
function DocModal({onSave,onClose,bucket,pathPrefix,tok}) {
  const [nome,setNome]=useState(""); const [cat,setCat]=useState("consuntivi"); const [anno,setAnno]=useState(new Date().getFullYear());
  const [file,setFile]=useState(null); const [uploading,setUploading]=useState(false);
  const handleFile=e=>{ const fl=e.target.files[0]; if(!fl) return; setFile(fl); setNome(fl.name); };
  const handleSave=async()=>{
    if(!file){alert("Seleziona un file."); return;} setUploading(true);
    try{
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const filePath=`${pathPrefix}/${Date.now()}_${safeName}`;
      await uploadFile(bucket,filePath,file,tok);
      onSave({name:nome||file.name,cat,year:anno,size:`${(file.size/1024).toFixed(0)} KB`,storage_path:filePath});
    }catch(e){alert("Errore upload: "+e.message);}
    setUploading(false);
  };
  return (
    <Modal title="Carica Documento" onClose={onClose}>
      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Seleziona file *</label>
        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleFile} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
        {file&&<p className="text-xs text-emerald-600 mt-1">✓ {file.name} ({(file.size/1024).toFixed(0)} KB)</p>}
      </div>
      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome visualizzato</label>
        <input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Es. Consuntivo 2024.pdf"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
      </div>
      <Sel label="Categoria" value={cat} onChange={e=>setCat(e.target.value)}>{Object.entries(CAT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Sel>
      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Anno</label>
        <input type="number" value={anno} onChange={e=>setAnno(Number(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Btn variant="secondary" onClick={onClose}>Annulla</Btn>
        <Btn onClick={handleSave} disabled={!file||uploading}>{uploading?"Caricamento...":"⬆ Carica file"}</Btn>
      </div>
    </Modal>
  );
}

// ── Admin ─────────────────────────────────────────────────────────────────────
function AdminPanel({user,onLogout,view,setView}) {
  const nav=[
    {id:"condominii",  label:"Condomìni",      icon:"🏢"},
    {id:"utenti",      label:"Utenti",          icon:"👥"},
    {id:"importa",     label:"Importa Excel",   icon:"📥"},
    {id:"inquilini",   label:"Inquilini",        icon:"🏠"},
    {id:"documenti",   label:"Documenti",        icon:"📁"},
    {id:"generali",    label:"Doc. Generali",    icon:"📋"},
    {id:"segnalazioni",label:"Segnalazioni",     icon:"🚨"},
    {id:"contatti",    label:"Contatti Studio",  icon:"📞"},
  ];
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar items={nav} active={view} onSelect={setView} user={user} onLogout={onLogout}/>
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {view==="condominii"   && <AdminCondominii tok={user.token}/>}
          {view==="utenti"       && <AdminUtenti tok={user.token}/>}
          {view==="importa"      && <AdminImport tok={user.token}/>}
          {view==="inquilini"    && <AdminInquilini tok={user.token}/>}
          {view==="documenti"    && <AdminDocumenti tok={user.token}/>}
          {view==="generali"     && <AdminGeneralDocs tok={user.token}/>}
          {view==="segnalazioni" && <AdminSegnalazioni tok={user.token}/>}
          {view==="contatti"     && <AdminContatti tok={user.token}/>}
        </div>
      </div>
    </div>
  );
}

// ── Admin Condomìni ───────────────────────────────────────────────────────────
function CondominioModal({mode,data,onSave,onClose}) {
  const [f,setF]=useState(data); const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Modal title={mode==="add"?"Nuovo Condominio":"Modifica Condominio"} onClose={onClose}>
      <Inp label="Nome" value={f.nome} onChange={e=>s("nome",e.target.value)} placeholder="Es. Cond. Via Parma 5"/>
      <Inp label="Indirizzo" value={f.indirizzo} onChange={e=>s("indirizzo",e.target.value)}/>
      <div className="flex gap-3"><div style={{width:"38%"}}><Inp label="CAP" value={f.cap} onChange={e=>s("cap",e.target.value)}/></div><div className="flex-1"><Inp label="Città" value={f.citta} onChange={e=>s("citta",e.target.value)}/></div></div>
      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>f.nome&&onSave(f)} disabled={!f.nome}>Salva</Btn></div>
    </Modal>
  );
}

function AdminCondominii({tok}) {
  const {data:list,loading,err,reload}=useData(()=>GET("condominii","select=*&order=nome",tok),[tok]);
  const [modal,setModal]=useState(null);
  const save=async f=>{ try{modal.mode==="add"?await POST("condominii",f,tok):await PATCH("condominii",`id=eq.${f.id}`,f,tok); setModal(null); reload();}catch(e){alert(e.message);} };
  const remove=async id=>{ if(!window.confirm("Eliminare?")) return; try{await DEL("condominii",`id=eq.${id}`,tok); reload();}catch(e){alert(e.message);} };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Gestione Condomìni</h2><p className="text-gray-400 text-sm">{list?.length||0} condomìni</p></div>
        <Btn onClick={()=>setModal({mode:"add",data:{nome:"",indirizzo:"",cap:"",citta:""}})}>+ Nuovo</Btn>
      </div>
      <ErrBox msg={err}/>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!list?.length?<EmptyState icon="🏢" text="Nessun condominio."/>:list.map((c,i)=>(
          <div key={c.id} className={`flex items-center justify-between p-5 ${i<list.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-xl">🏢</div>
              <div><p className="font-semibold text-gray-800">{c.nome}</p><p className="text-xs text-gray-400">{c.indirizzo} · {c.cap} {c.citta}</p></div>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...c}})}>Modifica</Btn>
              <Btn variant="danger" onClick={()=>remove(c.id)}>Elimina</Btn>
            </div>
          </div>
        ))}
      </div>
      {modal&&<CondominioModal mode={modal.mode} data={modal.data} onSave={save} onClose={()=>setModal(null)}/>}
    </div>
  );
}

// ── Admin Utenti ──────────────────────────────────────────────────────────────
function UtenteModal({mode,data,condominii,onSave,onClose}) {
  const [f,setF]=useState(data); const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Modal title={mode==="add"?"Nuovo Utente":"Modifica Utente"} onClose={onClose}>
      <Inp label="Nome e Cognome" value={f.name} onChange={e=>s("name",e.target.value)}/>
      {mode==="add"&&<><Inp label="Email (opzionale)" type="email" value={f.email} onChange={e=>s("email",e.target.value)} hint="Lascia vuoto se senza email"/><Inp label="Password" value={f.pwd} onChange={e=>s("pwd",e.target.value)}/></>}
      {mode==="edit"&&<Inp label="Email" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)}/>}
      <Sel label="Condominio" value={f.cond_id} onChange={e=>s("cond_id",e.target.value)}>
        <option value="">— Seleziona —</option>
        {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
      </Sel>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Civico" value={f.scala} onChange={e=>s("scala",e.target.value)}/></div><div className="flex-1"><Inp label="Interno" value={f.interno} onChange={e=>s("interno",e.target.value)}/></div></div>
      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>f.name&&onSave(f)}>Salva</Btn></div>
    </Modal>
  );
}

function AdminUtenti({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [users,setUsers]=useState([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState("");
  const [search,setSearch]=useState(""); const [filterCond,setFilterCond]=useState(""); const [page,setPage]=useState(0); const [hasMore,setHasMore]=useState(false);
  const [modal,setModal]=useState(null);
  const load=useCallback(async()=>{
    setLoading(true); setErr("");
    try{
      let qs=`role=eq.condomino&select=*,condominii(nome,citta)&order=name&limit=${PS+1}&offset=${page*PS}`;
      if(search) qs+=`&or=(name.ilike.*${encodeURIComponent(search)}*,email.ilike.*${encodeURIComponent(search)}*)`;
      if(filterCond) qs+=`&cond_id=eq.${filterCond}`;
      const d=await GET("profiles",qs,tok);
      setHasMore(d.length>PS); setUsers(d.slice(0,PS));
    }catch(e){setErr(e.message);}
    setLoading(false);
  },[tok,search,filterCond,page]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>setPage(0),[search,filterCond]);
  const save=async f=>{
    try{
      if(modal.mode==="add"){
        const {id:uid,email:realEmail}=await createAuthUser(f.email||null,f.pwd);
        await POST("profiles",{id:uid,name:f.name,role:"condomino",cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:isRealEmail(f.email)?f.email:null},tok);
      }else{
        await PATCH("profiles",`id=eq.${f.id}`,{name:f.name,cond_id:Number(f.cond_id),scala:f.scala,interno:f.interno,email:f.email||null},tok);
      }
      setModal(null); load();
    }catch(e){alert(e.message);}
  };
  const remove=async id=>{ if(window.confirm("Eliminare?")){ try{await DEL("profiles",`id=eq.${id}`,tok); load();}catch(e){alert(e.message);} } };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Gestione Utenti</h2></div>
        <Btn onClick={()=>setModal({mode:"add",data:{name:"",email:"",pwd:"",cond_id:condominii?.[0]?.id||"",scala:"",interno:""}})}>+ Nuovo utente</Btn>
      </div>
      <div className="flex gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Cerca nome o email..."/>
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" value={filterCond} onChange={e=>setFilterCond(e.target.value)}>
          <option value="">Tutti i condomìni</option>
          {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <ErrBox msg={err}/>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!users.length?<EmptyState icon="👥" text="Nessun utente trovato."/>:users.map((u,i)=>(
          <div key={u.id} className={`flex items-center justify-between p-4 ${i<users.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-sm">{u.name?.charAt(0)}</div>
              <div><p className="font-semibold text-gray-800 text-sm">{u.name}</p><p className="text-xs text-gray-400">{u.condominii?.nome} · Int.{u.interno}</p></div>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...u,cond_id:u.cond_id||""}})}>Modifica</Btn>
              <Btn variant="danger" onClick={()=>remove(u.id)}>Elimina</Btn>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-gray-400">Pagina {page+1}</p>
        <div className="flex gap-2">
          <Btn variant="secondary" onClick={()=>setPage(p=>p-1)} disabled={page===0}>← Prec</Btn>
          <Btn variant="secondary" onClick={()=>setPage(p=>p+1)} disabled={!hasMore}>Succ →</Btn>
        </div>
      </div>
      {modal&&<UtenteModal mode={modal.mode} data={modal.data} condominii={condominii||[]} onSave={save} onClose={()=>setModal(null)}/>}
    </div>
  );
}

// ── Admin Importa Excel ───────────────────────────────────────────────────────
function AdminImport({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [selCond,setSelCond]=useState(""); const [rows,setRows]=useState([]); const [preview,setPreview]=useState(false);
  const [importing,setImporting]=useState(false); const [progress,setProgress]=useState(0); const [results,setResults]=useState(null); const [err,setErr]=useState("");
  useEffect(()=>{ if(condominii?.length&&!selCond) setSelCond(String(condominii[0].id)); },[condominii]);
  const parseExcel=async file=>{
    setErr(""); setRows([]); setPreview(false); setResults(null);
    try{
      const XLSX=await import("https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs");
      const buf=await file.arrayBuffer(); const wb=XLSX.read(buf); const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{defval:""});
      const col=(row,names)=>{ for(const n of names){ const v=row[n]; if(v!==undefined&&v!=="") return String(v).trim(); } return ""; };
      const proprietari=data.filter(r=>col(r,["Tipo Cond.","Tipo cond.","TIPO COND."]).toLowerCase()==="proprietario");
      const parsed=proprietari.map(r=>{
        const nUn=col(r,["N. Un.","N.Un.","N Un"]);
        const inquilini=data.filter(i=>col(i,["Tipo Cond.","Tipo cond."]).toLowerCase()==="inquilino"&&col(i,["N. Un.","N.Un.","N Un"])===nUn)
          .map(i=>({nome:col(i,["Nome","NOME"]),email:col(i,["Email","EMAIL","email"]),tel:""}));
        const nomeCompleto=col(r,["Nome","NOME"]);
        const primoToken=nomeCompleto.split(/\s+/)[0]||"Utente";
        const cognome=primoToken.charAt(0).toUpperCase()+primoToken.slice(1).toLowerCase();
        const mese=String(new Date().getMonth()+1).padStart(2,"0");
        return { nome:nomeCompleto, email:col(r,["Email","EMAIL","email"]), password:`${cognome}${mese}!`,
          interno:col(r,["Unità","UNITÀ","Unita","UNITA"]), civico:col(r,["Via","VIA"]),
          foglio:col(r,["Foglio","FOGLIO"]), particella:col(r,["Mappale","MAPPALE"]), subalterno:col(r,["Sub","SUB"]), inquilini };
      });
      setRows(parsed); setPreview(true);
    }catch(e){setErr("Errore lettura file: "+e.message);}
  };
  const doImport=async()=>{
    if(!selCond){setErr("Seleziona un condominio."); return;} setImporting(true); setErr(""); setProgress(0);
    const ok=[],noEmail=[],failed=[]; const condo=condominii?.find(c=>String(c.id)===String(selCond));
    for(let i=0;i<rows.length;i++){
      const r=rows[i]; setProgress(Math.round(((i+1)/rows.length)*100));
      try{
        const {id:uid,hasRealEmail}=await createAuthUser(r.email||null,r.password);
        await POST("profiles",{id:uid,name:r.nome,role:"condomino",cond_id:Number(selCond),scala:r.civico,interno:r.interno,email:isRealEmail(r.email)?r.email:null},tok);
        if(r.foglio||r.particella||r.subalterno) await UPS("catastali",{user_id:uid,foglio:r.foglio,particella:r.particella,subalterno:r.subalterno,updated_at:new Date().toISOString()},tok);
        for(const inq of r.inquilini) if(inq.nome) await POST("inquilini",{user_id:uid,nome:inq.nome,email:inq.email,tel:inq.tel},tok);
        if(hasRealEmail&&r.email){ try{await sendWelcomeEmail(r.email,r.nome,r.password,condo?.nome||""); ok.push(r);}catch{noEmail.push(r);} }
        else noEmail.push(r);
        await new Promise(res=>setTimeout(res,200));
      }catch(e){failed.push({...r,errore:e.message});}
    }
    setResults({ok,noEmail,failed}); setImporting(false);
  };
  const stampa=()=>{
    const condo=condominii?.find(c=>String(c.id)===String(selCond)); const tutti=[...(results?.ok||[]),...(results?.noEmail||[])];
    const w=window.open("","_blank");
    w.document.write(`<html><head><title>Credenziali</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px}th{background:#f1f5f9}@media print{button{display:none}}</style></head><body>
    <h2>Studio Amministrazioni Immobiliari s.a.s. di Mazzini & C.</h2><h3>Credenziali — ${condo?.nome||""}</h3>
    <p>Data: ${new Date().toLocaleDateString("it-IT")} | Portale: studiomazzinibo.com</p>
    <table><tr><th>Nome</th><th>Interno</th><th>Email</th><th>Password</th></tr>
    ${tutti.map(r=>`<tr><td>${r.nome}</td><td>${r.interno}</td><td>${r.email||"—"}</td><td>${r.password}</td></tr>`).join("")}
    </table><br><button onclick="window.print()">🖨️ Stampa</button></body></html>`);
    w.document.close();
  };
  return (
    <div>
      <div className="mb-6"><h2 className="text-2xl font-black text-gray-800">Importazione da Excel</h2></div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
        <Sel label="Condominio di destinazione" value={selCond} onChange={e=>setSelCond(e.target.value)}>{condominii?.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.citta}</option>)}</Sel>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">File Excel (.xlsx)</label>
        <input type="file" accept=".xlsx,.xls" onChange={e=>e.target.files[0]&&parseExcel(e.target.files[0])} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
      </div>
      <ErrBox msg={err}/>
      {preview&&rows.length>0&&!results&&(
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div><p className="font-bold text-gray-800">Anteprima</p><p className="text-xs text-gray-400">{rows.length} proprietari · {rows.filter(r=>!r.email).length} senza email</p></div>
            <Btn onClick={doImport} disabled={importing}>{importing?`Importazione... ${progress}%`:"Importa tutti"}</Btn>
          </div>
          {importing&&<div className="h-1 bg-gray-100"><div className="h-1 bg-blue-500 transition-all" style={{width:`${progress}%`}}/></div>}
          <div className="max-h-64 overflow-y-auto">
            {rows.map((r,i)=>(
              <div key={i} className={`flex items-center justify-between px-5 py-3 ${i<rows.length-1?"border-b border-gray-50":""}`}>
                <div><p className="font-medium text-gray-800 text-sm">{r.nome}</p><p className="text-xs text-gray-400">Int.{r.interno} · {r.email||"nessuna email"}</p></div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">{r.password}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {results&&(
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="bg-emerald-50 rounded-xl p-4 text-center"><p className="text-2xl font-black text-emerald-600">{results.ok.length}</p><p className="text-xs text-emerald-600">Email inviata</p></div>
            <div className="bg-amber-50 rounded-xl p-4 text-center"><p className="text-2xl font-black text-amber-600">{results.noEmail.length}</p><p className="text-xs text-amber-600">Senza email</p></div>
            <div className="bg-red-50 rounded-xl p-4 text-center"><p className="text-2xl font-black text-red-600">{results.failed.length}</p><p className="text-xs text-red-600">Errori</p></div>
          </div>
          <div className="flex gap-3">
            <Btn variant="success" onClick={stampa}>🖨️ Stampa credenziali</Btn>
            <Btn variant="secondary" onClick={()=>{setResults(null);setRows([]);setPreview(false);}}>Nuova importazione</Btn>
          </div>
          {results.failed.length>0&&<div className="mt-4 bg-red-50 rounded-xl p-4">{results.failed.map((r,i)=><p key={i} className="text-xs text-red-500">{r.nome}: {r.errore}</p>)}</div>}
        </div>
      )}
    </div>
  );
}

// ── Admin Inquilini ───────────────────────────────────────────────────────────
function AdminInquilini({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [selCond,setSelCond]=useState(""); const [inqList,setInqList]=useState([]); const [loading,setLoading]=useState(false);
  const [modal,setModal]=useState(null); const [docModal,setDocModal]=useState(null);
  useEffect(()=>{ if(condominii?.length&&!selCond) setSelCond(String(condominii[0].id)); },[condominii]);
  useEffect(()=>{ loadInq(); },[selCond,tok]);
  const loadInq=async()=>{
    if(!selCond) return; setLoading(true);
    try{
      const users=await GET("profiles",`cond_id=eq.${selCond}&role=eq.condomino&select=id,name,interno`,tok)||[];
      if(!users.length){setInqList([]); setLoading(false); return;}
      const ids=users.map(u=>u.id).join(",");
      const inq=await GET("inquilini",`user_id=in.(${ids})&select=*`,tok)||[];
      setInqList(inq.map(i=>({...i,proprietario:users.find(u=>u.id===i.user_id)?.name||"—",proprietario_interno:users.find(u=>u.id===i.user_id)?.interno||""})));
    }catch(e){console.error(e);}
    setLoading(false);
  };
  const save=async f=>{
    try{
      modal.mode==="add"?await POST("inquilini",f,tok):await PATCH("inquilini",`id=eq.${f.id}`,f,tok);
      setModal(null); loadInq();
    }catch(e){alert(e.message);}
  };
  const remove=async id=>{ if(window.confirm("Eliminare?")){ try{await DEL("inquilini",`id=eq.${id}`,tok); loadInq();}catch(e){alert(e.message);} } };
  const addDoc=async(docData)=>{
    try{ await POST("personal_docs",{user_id:docModal.userId,...docData},tok); setDocModal(null);}catch(e){alert(e.message);}
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Gestione Inquilini</h2><p className="text-gray-400 text-sm">{inqList.length} inquilino/i nel condominio selezionato</p></div>
      </div>
      <div className="mb-4">
        <Sel label="Condominio" value={selCond} onChange={e=>setSelCond(e.target.value)}>{condominii?.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.citta}</option>)}</Sel>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!inqList.length?<EmptyState icon="🏠" text="Nessun inquilino in questo condominio."/>:inqList.map((i,idx)=>(
          <div key={i.id} className={`flex items-center justify-between p-4 ${idx<inqList.length-1?"border-b border-gray-50":""}`}>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{i.nome}</p>
              <p className="text-xs text-gray-400">Proprietario: {i.proprietario} · Int.{i.proprietario_interno}</p>
              <p className="text-xs text-gray-400">{i.email}{i.tel?` · ${i.tel}`:""}</p>
              <p className="text-xs text-gray-400">{i.dal?`Dal ${new Date(i.dal).toLocaleDateString("it-IT")}`:""}{i.al?` al ${new Date(i.al).toLocaleDateString("it-IT")}`:" · (in corso)"}</p>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" onClick={()=>setDocModal({userId:i.user_id,nome:i.nome})}>📄 Doc</Btn>
              <Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...i}})}>Modifica</Btn>
              <Btn variant="danger" onClick={()=>remove(i.id)}>Elimina</Btn>
            </div>
          </div>
        ))}
      </div>
      {modal&&<InqModal mode={modal.mode} data={modal.data} onSave={save} onClose={()=>setModal(null)}/>}
      {docModal&&<DocModal onSave={addDoc} onClose={()=>setDocModal(null)} bucket="docs-personali" pathPrefix={docModal.userId} tok={tok}/>}
    </div>
  );
}

// ── Admin Documenti ───────────────────────────────────────────────────────────
function AdminDocumenti({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [tipo,setTipo]=useState("cond"); const [selCond,setSelCond]=useState(""); const [selUid,setSelUid]=useState("");
  const [users,setUsers]=useState([]); const [docs,setDocs]=useState([]); const [loading,setLoading]=useState(false); const [modal,setModal]=useState(false);
  useEffect(()=>{ if(condominii?.length&&!selCond) setSelCond(String(condominii[0].id)); },[condominii]);
  useEffect(()=>{ if(!selCond) return; GET("profiles",`cond_id=eq.${selCond}&role=eq.condomino&select=id,name,scala,interno&order=name`,tok).then(d=>{setUsers(d||[]);setSelUid(d?.[0]?.id||"");}); },[selCond,tok]);
  useEffect(()=>{loadDocs();},[tipo,selCond,selUid,tok]);
  const loadDocs=async()=>{
    if(!selCond) return; setLoading(true);
    try{
      if(tipo==="cond") setDocs(await GET("docs",`cond_id=eq.${selCond}&select=*&order=uploaded_at.desc`,tok)||[]);
      else if(selUid) setDocs(await GET("personal_docs",`user_id=eq.${selUid}&select=*&order=uploaded_at.desc`,tok)||[]);
      else setDocs([]);
    }catch{setDocs([]);}
    setLoading(false);
  };
  const addDoc=async f=>{
    try{
      if(tipo==="cond"){
        await POST("docs",{cond_id:Number(selCond),...f},tok);
        notifyCondoDoc(selCond,f.name,f.cat,tok);
      }else{
        await POST("personal_docs",{user_id:selUid,...f},tok);
        notifyPersonalDoc(selUid,f.name,f.cat,tok);
      }
      setModal(false); loadDocs();
    }catch(e){alert(e.message);}
  };
  const remove=async id=>{ if(!window.confirm("Eliminare?")) return; try{tipo==="cond"?await DEL("docs",`id=eq.${id}`,tok):await DEL("personal_docs",`id=eq.${id}`,tok); loadDocs();}catch(e){alert(e.message);} };
  return (
    <div>
      <div className="flex items-center justify-between mb-6"><h2 className="text-2xl font-black text-gray-800">Gestione Documenti</h2><Btn onClick={()=>setModal(true)}>+ Carica documento</Btn></div>
      <div className="flex gap-2 mb-5">
        {[{k:"cond",l:"🏢 Condominiali"},{k:"personal",l:"👤 Personali"}].map(({k,l})=>(
          <button key={k} onClick={()=>setTipo(k)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tipo===k?"bg-slate-800 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-3 mb-5">
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1" value={selCond} onChange={e=>setSelCond(e.target.value)}>
          {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.citta}</option>)}
        </select>
        {tipo==="personal"&&<select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1" value={selUid} onChange={e=>setSelUid(e.target.value)}>
          <option value="">— Seleziona condomino —</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.name} · Int.{u.interno}</option>)}
        </select>}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs.length?<EmptyState icon="📭" text="Nessun documento."/>:docs.map((d,i)=>(
          <div key={d.id} className={`flex items-center justify-between p-4 ${i<docs.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-lg">📄</div>
              <div><p className="font-medium text-gray-800 text-sm">{d.name}</p><div className="flex items-center gap-2 mt-1"><Badge cat={d.cat}/><span className="text-xs text-gray-400">{d.year} · {d.size}</span></div></div>
            </div>
            <Btn variant="danger" onClick={()=>remove(d.id)}>Elimina</Btn>
          </div>
        ))}
      </div>
      {modal&&<DocModal onSave={addDoc} onClose={()=>setModal(false)} bucket={tipo==="cond"?"docs-condominiali":"docs-personali"} pathPrefix={tipo==="cond"?selCond:selUid} tok={tok}/>}
    </div>
  );
}

// ── Admin Documenti Generali ──────────────────────────────────────────────────
function AdminGeneralDocs({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome,citta&order=nome",tok),[tok]);
  const [selCond,setSelCond]=useState("");
  const [modal,setModal]=useState(false);
  useEffect(()=>{ if(condominii?.length&&!selCond) setSelCond(String(condominii[0].id)); },[condominii]);
  const qs = selCond ? `cond_id=eq.${selCond}&select=*&order=uploaded_at.desc` : "select=*&order=uploaded_at.desc";
  const {data:docs,loading,reload}=useData(()=>GET("general_docs",qs,tok),[tok,selCond]);
  const addDoc=async f=>{ try{await POST("general_docs",{...f,cond_id:Number(selCond)},tok); setModal(false); reload();}catch(e){alert(e.message);} };
  const remove=async id=>{ if(!window.confirm("Eliminare?")) return; try{await DEL("general_docs",`id=eq.${id}`,tok); reload();}catch(e){alert(e.message);} };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Documenti Generali</h2><p className="text-gray-400 text-sm mt-0.5">Documenti visibili a tutti i condomini dello stabile selezionato.</p></div>
        <Btn onClick={()=>setModal(true)} disabled={!selCond}>+ Carica documento</Btn>
      </div>
      <div className="mb-5">
        <Sel label="Condominio" value={selCond} onChange={e=>setSelCond(e.target.value)}>
          {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.citta}</option>)}
        </Sel>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs?.length?<EmptyState icon="📋" text="Nessun documento generale per questo condominio."/>:docs.map((d,i)=>(
          <div key={d.id} className={`flex items-center justify-between p-4 ${i<docs.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-lg">📋</div>
              <div><p className="font-medium text-gray-800 text-sm">{d.name}</p><div className="flex items-center gap-2 mt-1"><Badge cat={d.cat}/><span className="text-xs text-gray-400">{d.year} · {d.size}</span></div></div>
            </div>
            <Btn variant="danger" onClick={()=>remove(d.id)}>Elimina</Btn>
          </div>
        ))}
      </div>
      {modal&&<DocModal onSave={addDoc} onClose={()=>setModal(false)} bucket="docs-generali" pathPrefix={selCond} tok={tok}/>}
    </div>
  );
}

// ── Admin Segnalazioni ────────────────────────────────────────────────────────
function AdminSegnalazioni({tok}) {
  const {data:condominii}=useData(()=>GET("condominii","select=id,nome&order=nome",tok),[tok]);
  const [filterStato,setFilterStato]=useState(""); const [filterCond,setFilterCond]=useState("");
  const [expanded,setExpanded]=useState(null);
  let qs="select=*,profiles!inner(name,interno),condominii!inner(nome)&order=created_at.desc";
  if(filterStato) qs+=`&stato=eq.${filterStato}`;
  if(filterCond) qs+=`&cond_id=eq.${filterCond}`;
  const {data:list,loading,reload}=useData(()=>GET("segnalazioni",qs,tok),[tok,filterStato,filterCond]);
  const updateStato=async(id,stato)=>{ try{await PATCH("segnalazioni",`id=eq.${id}`,{stato},tok); reload();}catch(e){alert(e.message);} };
  return (
    <div>
      <div className="mb-6"><h2 className="text-2xl font-black text-gray-800">Segnalazioni</h2><p className="text-gray-400 text-sm">{list?.length||0} segnalazioni</p></div>
      <div className="flex gap-3 mb-5">
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" value={filterStato} onChange={e=>setFilterStato(e.target.value)}>
          <option value="">Tutti gli stati</option>
          <option value="aperta">Aperte</option>
          <option value="in_lavorazione">In lavorazione</option>
          <option value="chiusa">Chiuse</option>
        </select>
        <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1" value={filterCond} onChange={e=>setFilterCond(e.target.value)}>
          <option value="">Tutti i condomìni</option>
          {condominii?.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!list?.length?<EmptyState icon="🚨" text="Nessuna segnalazione."/>:list.map((s,i)=>(
          <div key={s.id} className={`${i<list.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50" onClick={()=>setExpanded(expanded===s.id?null:s.id)}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <StatoBadge s={s.stato}/>
                  {s.urgenza==="urgente"&&<span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">⚠️ Urgente</span>}
                  <span className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString("it-IT")}</span>
                </div>
                <p className="font-semibold text-gray-800 text-sm">{s.profiles?.name} · Int.{s.profiles?.interno}</p>
                <p className="text-xs text-gray-400">{s.condominii?.nome} · {s.tipo}</p>
              </div>
              <span className="text-gray-400 text-sm">{expanded===s.id?"▲":"▼"}</span>
            </div>
            {expanded===s.id&&(
              <div className="px-4 pb-4 bg-gray-50">
                <p className="text-sm text-gray-700 mb-3">{s.descrizione}</p>
                <div className="flex gap-2">
                  {s.stato!=="aperta"&&<Btn variant="danger" onClick={()=>updateStato(s.id,"aperta")}>Riapri</Btn>}
                  {s.stato!=="in_lavorazione"&&<Btn variant="warning" onClick={()=>updateStato(s.id,"in_lavorazione")}>In lavorazione</Btn>}
                  {s.stato!=="chiusa"&&<Btn variant="success" onClick={()=>updateStato(s.id,"chiusa")}>Chiudi</Btn>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Admin Contatti ────────────────────────────────────────────────────────────
function AdminContatti({tok}) {
  const {data,reload}=useData(()=>GET("contatti","id=eq.1",tok),[tok]);
  const [f,setF]=useState(null); const [saved,setSaved]=useState(false);
  useEffect(()=>{ if(data?.[0]) setF({...data[0]}); },[data]);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{ try{await UPS("contatti",{...f,updated_at:new Date().toISOString()},tok); reload(); setSaved(true); setTimeout(()=>setSaved(false),2500);}catch(e){alert(e.message);} };
  if(!f) return <Spinner/>;
  return (
    <div>
      <div className="mb-6"><h2 className="text-2xl font-black text-gray-800">Contatti Studio</h2><p className="text-gray-400 text-sm">Visibili a piè di pagina e usati per le notifiche email.</p></div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {[{k:"nome",l:"Nome studio"},{k:"telefono",l:"Telefono"},{k:"email",l:"Email (riceve le segnalazioni)"},{k:"indirizzo",l:"Indirizzo"},{k:"orari",l:"Orari"}].map(({k,l})=><Inp key={k} label={l} value={f[k]||""} onChange={e=>s(k,e.target.value)}/>)}
        <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
          <Btn variant="success" onClick={save}>✓ Salva</Btn>
          {saved&&<p className="text-emerald-600 text-sm font-semibold">Salvato!</p>}
        </div>
      </div>
      <div className="mt-5"><p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Anteprima footer</p><div className="rounded-2xl overflow-hidden border border-gray-200"><ContactFooter c={f}/></div></div>
    </div>
  );
}

// ── Condomino ─────────────────────────────────────────────────────────────────
function CondominoPanel({user,onLogout,view,setView}) {
  const {data:contattiArr}=useData(()=>GET("contatti","id=eq.1",user.token),[user.token]);
  const condo=user.condominii;
  const nav=[
    {id:"docs",         label:"Documenti",      icon:"📄"},
    {id:"generali",     label:"Doc. Generali",  icon:"📋"},
    {id:"inq",          label:"Inquilini",       icon:"🏠"},
    {id:"cat",          label:"Dati Catastali",  icon:"📊"},
    {id:"segnalazioni", label:"Segnalazioni",    icon:"🚨"},
  ];
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar items={nav} active={view} onSelect={setView} user={user} onLogout={onLogout}/>
      <div className="flex flex-col flex-1 min-h-screen">
        <div className="flex-1 p-8 overflow-auto">
          <div className="max-w-3xl mx-auto">
            <div className="bg-white border border-gray-100 rounded-2xl px-5 py-3 mb-6 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-xl">🏢</div>
              <div><p className="text-sm font-bold text-gray-800">{condo?.nome||"Condominio"}</p><p className="text-xs text-gray-400">{condo?.indirizzo} · {condo?.cap} {condo?.citta} · Int. {user.interno}</p></div>
            </div>
            {view==="docs"         && <CondDocs user={user}/>}
            {view==="generali"     && <CondGeneralDocs user={user}/>}
            {view==="inq"          && <CondInquilini user={user}/>}
            {view==="cat"          && <CondCatastali user={user}/>}
            {view==="segnalazioni" && <CondSegnalazioni user={user}/>}
          </div>
        </div>
        <ContactFooter c={contattiArr?.[0]}/>
      </div>
    </div>
  );
}

function CondDocs({user}) {
  const [sezione,setSezione]=useState("cond"); const [tab,setTab]=useState("consuntivi");
  const {data:docs,loading}=useData(()=>
    sezione==="cond"
      ? GET("docs",`cond_id=eq.${user.cond_id}&cat=eq.${tab}&select=*&order=uploaded_at.desc`,user.token)
      : GET("personal_docs",`user_id=eq.${user.id}&cat=eq.${tab}&select=*&order=uploaded_at.desc`,user.token),
    [sezione,tab,user.token,user.cond_id,user.id]);
  const handleDownload=async d=>{
    if(!d.storage_path){alert("File non disponibile."); return;}
    try{ const url=await getSignedUrl(sezione==="cond"?"docs-condominiali":"docs-personali",d.storage_path,user.token); window.open(url,"_blank"); }
    catch(e){alert("Errore download: "+e.message);}
  };
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-5">Documenti</h2>
      <div className="flex gap-2 mb-4">
        {[{k:"cond",l:"🏢 Condominiali"},{k:"personal",l:"👤 Personali"}].map(({k,l})=>(
          <button key={k} onClick={()=>setSezione(k)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${sezione===k?"bg-slate-800 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">
        {Object.entries(CAT_LABELS).map(([k,v])=>(
          <button key={k} onClick={()=>setTab(k)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${tab===k?"bg-blue-600 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
            <span>{CAT_ICONS[k]}</span><span>{v}</span>
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs?.length?<EmptyState icon={CAT_ICONS[tab]} text={`Nessun documento in "${CAT_LABELS[tab]}".`}/>:docs.map((d,i)=>(
          <div key={d.id} className={`flex items-center justify-between p-4 hover:bg-gray-50 transition ${i<docs.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-xl">📄</div>
              <div><p className="font-medium text-gray-800 text-sm">{d.name}</p><p className="text-xs text-gray-400">Anno {d.year} · {d.size}</p></div>
            </div>
            <Btn variant="secondary" onClick={()=>handleDownload(d)}>⬇ Scarica</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

function CondGeneralDocs({user}) {
  const [tab,setTab]=useState("consuntivi");
  const {data:docs,loading}=useData(()=>GET("general_docs",`cond_id=eq.${user.cond_id}&cat=eq.${tab}&select=*&order=uploaded_at.desc`,user.token),[tab,user.token,user.cond_id]);
  const handleDownload=async d=>{
    if(!d.storage_path){alert("File non disponibile."); return;}
    try{ const url=await getSignedUrl("docs-generali",d.storage_path,user.token); window.open(url,"_blank"); }
    catch(e){alert("Errore download: "+e.message);}
  };
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">Documenti Generali</h2>
      <p className="text-gray-400 text-sm mb-5">Documenti dello studio validi per tutti i condomìni.</p>
      <div className="flex gap-2 mb-5 flex-wrap">
        {Object.entries(CAT_LABELS).map(([k,v])=>(
          <button key={k} onClick={()=>setTab(k)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${tab===k?"bg-blue-600 text-white":"bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
            <span>{CAT_ICONS[k]}</span><span>{v}</span>
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!docs?.length?<EmptyState icon="📋" text="Nessun documento in questa categoria."/>:docs.map((d,i)=>(
          <div key={d.id} className={`flex items-center justify-between p-4 hover:bg-gray-50 transition ${i<docs.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-xl">📋</div>
              <div><p className="font-medium text-gray-800 text-sm">{d.name}</p><p className="text-xs text-gray-400">Anno {d.year} · {d.size}</p></div>
            </div>
            <Btn variant="secondary" onClick={()=>handleDownload(d)}>⬇ Scarica</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

function InqModal({mode,data,onSave,onClose}) {
  const [f,setF]=useState(data); const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Modal title={mode==="add"?"Nuovo Inquilino":"Modifica Inquilino"} onClose={onClose}>
      <Inp label="Nome e Cognome" value={f.nome} onChange={e=>s("nome",e.target.value)}/>
      <Inp label="Email" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)}/>
      <Inp label="Telefono" value={f.tel||""} onChange={e=>s("tel",e.target.value)}/>
      <div className="flex gap-3"><div className="flex-1"><Inp label="Inizio" type="date" value={f.dal||""} onChange={e=>s("dal",e.target.value)}/></div><div className="flex-1"><Inp label="Fine" type="date" value={f.al||""} onChange={e=>s("al",e.target.value)} hint="Vuoto = in corso"/></div></div>
      <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={onClose}>Annulla</Btn><Btn onClick={()=>f.nome&&onSave(f)}>Salva</Btn></div>
    </Modal>
  );
}

function CondInquilini({user}) {
  const {data:inq,loading,reload}=useData(()=>GET("inquilini",`user_id=eq.${user.id}&select=*&order=created_at`,user.token),[user.token,user.id]);
  const [modal,setModal]=useState(null);
  const save=async f=>{ try{modal.mode==="add"?await POST("inquilini",{...f,user_id:user.id},user.token):await PATCH("inquilini",`id=eq.${f.id}`,f,user.token); setModal(null); reload();}catch(e){alert(e.message);} };
  const remove=async id=>{ if(window.confirm("Rimuovere?")){ try{await DEL("inquilini",`id=eq.${id}`,user.token); reload();}catch(e){alert(e.message);} } };
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-black text-gray-800">Gestione Inquilini</h2><p className="text-gray-400 text-sm">{inq?.length||0} inquilino/i</p></div>
        <Btn onClick={()=>setModal({mode:"add",data:{nome:"",email:"",tel:"",dal:"",al:""}})}>+ Aggiungi</Btn>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!inq?.length?<EmptyState icon="🏠" text="Nessun inquilino registrato."/>:inq.map((i,idx)=>(
          <div key={i.id} className={`flex items-center justify-between p-5 ${idx<inq.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-bold text-sm">{i.nome?.charAt(0)}</div>
              <div>
                <p className="font-semibold text-gray-800">{i.nome}</p>
                <p className="text-xs text-gray-400">{i.email}{i.tel?` · ${i.tel}`:""}</p>
                <p className="text-xs text-gray-400">{i.dal?`Dal ${new Date(i.dal).toLocaleDateString("it-IT")}`:""}{i.al?` al ${new Date(i.al).toLocaleDateString("it-IT")}`:" · (in corso)"}</p>
              </div>
            </div>
            <div className="flex gap-2"><Btn variant="secondary" onClick={()=>setModal({mode:"edit",data:{...i}})}>Modifica</Btn><Btn variant="danger" onClick={()=>remove(i.id)}>Rimuovi</Btn></div>
          </div>
        ))}
      </div>
      {modal&&<Modal title={modal.mode==="add"?"Nuovo Inquilino":"Modifica Inquilino"} onClose={()=>setModal(null)}>
        {(()=>{const [f,setF]=useState(modal.data); const s=(k,v)=>setF(p=>({...p,[k]:v})); return(<>
          <Inp label="Nome e Cognome" value={f.nome} onChange={e=>s("nome",e.target.value)}/>
          <Inp label="Email" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)}/>
          <Inp label="Telefono" value={f.tel||""} onChange={e=>s("tel",e.target.value)}/>
          <div className="flex gap-3"><div className="flex-1"><Inp label="Inizio" type="date" value={f.dal||""} onChange={e=>s("dal",e.target.value)}/></div><div className="flex-1"><Inp label="Fine" type="date" value={f.al||""} onChange={e=>s("al",e.target.value)} hint="Vuoto = in corso"/></div></div>
          <div className="flex justify-end gap-3 pt-2"><Btn variant="secondary" onClick={()=>setModal(null)}>Annulla</Btn><Btn onClick={()=>f.nome&&save(f)}>Salva</Btn></div>
        </>);})()}
      </Modal>}
    </div>
  );
}

function CondCatastali({user}) {
  const {data,reload}=useData(()=>GET("catastali",`user_id=eq.${user.id}`,user.token),[user.token,user.id]);
  const empty={foglio:"",particella:"",subalterno:"",categoria:"",classe:"",consistenza:"",rendita:"",superficie:""};
  const [f,setF]=useState(empty); const [saved,setSaved]=useState(false);
  useEffect(()=>{ if(data?.[0]) setF({...data[0]}); else setF(empty); },[data]);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{ try{await UPS("catastali",{...f,user_id:user.id,updated_at:new Date().toISOString()},user.token); reload(); setSaved(true); setTimeout(()=>setSaved(false),2500);}catch(e){alert(e.message);} };
  const fields=[{k:"foglio",l:"Foglio",p:"Es. 15"},{k:"particella",l:"Particella",p:"Es. 234"},{k:"subalterno",l:"Subalterno",p:"Es. 3"},{k:"categoria",l:"Categoria catastale",p:"Es. A/2"},{k:"classe",l:"Classe",p:"Es. 3"},{k:"consistenza",l:"Consistenza",p:"Es. 5 vani"},{k:"rendita",l:"Rendita (€)",p:"Es. 520,00"},{k:"superficie",l:"Superficie (mq)",p:"Es. 85"}];
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">Dati Catastali</h2>
      <p className="text-gray-400 text-sm mb-5">Dati catastali della tua unità immobiliare.</p>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-2 gap-x-5">{fields.map(({k,l,p})=><Inp key={k} label={l} value={f[k]||""} onChange={e=>s(k,e.target.value)} placeholder={p}/>)}</div>
        <div className="flex items-center gap-4 mt-3 pt-4 border-t border-gray-100">
          <Btn variant="success" onClick={save}>✓ Salva dati catastali</Btn>
          {saved&&<p className="text-emerald-600 text-sm font-semibold">Salvato!</p>}
        </div>
      </div>
    </div>
  );
}

function CondSegnalazioni({user}) {
  const {data:list,loading,reload}=useData(()=>GET("segnalazioni",`user_id=eq.${user.id}&select=*&order=created_at.desc`,user.token),[user.token,user.id]);
  const [form,setForm]=useState({tipo:"",descrizione:"",urgenza:"normale"});
  const [sending,setSending]=useState(false); const [sent,setSent]=useState(false);
  const s=(k,v)=>setForm(p=>({...p,[k]:v}));
  const submit=async()=>{
    if(!form.tipo||!form.descrizione){alert("Compila tutti i campi."); return;}
    setSending(true);
    try{
      await POST("segnalazioni",{user_id:user.id,cond_id:user.cond_id,...form},user.token);
      const contatti=(await GET("contatti","id=eq.1",user.token))?.[0];
      await notifySegnalazione(form,user.name,user.condominii?.nome,user.interno,contatti?.email);
      setForm({tipo:"",descrizione:"",urgenza:"normale"});
      setSent(true); setTimeout(()=>setSent(false),3000); reload();
    }catch(e){alert(e.message);}
    setSending(false);
  };
  const tipi=["Guasto impianti","Infiltrazioni d'acqua","Problemi parti comuni","Rumori molesti","Sicurezza","Altro"];
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-800 mb-5">Segnalazioni</h2>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="font-bold text-gray-700 mb-4">Nuova segnalazione</h3>
        <Sel label="Tipo di problema *" value={form.tipo} onChange={e=>s("tipo",e.target.value)}>
          <option value="">— Seleziona —</option>
          {tipi.map(t=><option key={t} value={t}>{t}</option>)}
        </Sel>
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrizione *</label>
          <textarea value={form.descrizione} onChange={e=>s("descrizione",e.target.value)} rows={4} placeholder="Descrivi il problema in dettaglio..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
        </div>
        <Sel label="Urgenza" value={form.urgenza} onChange={e=>s("urgenza",e.target.value)}>
          <option value="normale">Normale</option>
          <option value="urgente">⚠️ Urgente</option>
        </Sel>
        {sent&&<div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-xl px-3 py-2 mb-3">✓ Segnalazione inviata! Lo studio la contatterà al più presto.</div>}
        <Btn onClick={submit} disabled={sending||!form.tipo||!form.descrizione}>{sending?"Invio in corso...":"🚨 Invia segnalazione"}</Btn>
      </div>
      <h3 className="font-bold text-gray-700 mb-3">Le mie segnalazioni</h3>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading?<Spinner/>:!list?.length?<EmptyState icon="🚨" text="Nessuna segnalazione inviata."/>:list.map((s,i)=>(
          <div key={s.id} className={`p-4 ${i<list.length-1?"border-b border-gray-50":""}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold text-gray-800 text-sm">{s.tipo}</p>
              <StatoBadge s={s.stato}/>
            </div>
            <p className="text-xs text-gray-500 mb-1">{s.descrizione}</p>
            <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString("it-IT")} · {s.urgenza==="urgente"?"⚠️ Urgente":"Normale"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── App Root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user,setUser]=useState(null); const [view,setView]=useState("docs"); const [checking,setChecking]=useState(true);
  const [cookieOk,setCookieOk]=useState(()=>localStorage.getItem("cookie_consent_v1")==="accepted");

  useEffect(()=>{
    (async()=>{
      try{
        const saved=localStorage.getItem("sb_session_v1");
        if(saved){
          const sess=JSON.parse(saved);
          const profiles=await GET("profiles",`id=eq.${sess.id}&select=*,condominii(*)`,sess.token);
          if(profiles?.length){ setUser({...sess,...profiles[0]}); setView(sess.role==="admin"?"condominii":"docs"); }
        }
      }catch{}
      setChecking(false);
    })();
  },[]);

  const acceptCookie=()=>{ localStorage.setItem("cookie_consent_v1","accepted"); setCookieOk(true); };
  const handleLogin=async u=>{ try{localStorage.setItem("sb_session_v1",JSON.stringify({id:u.id,token:u.token,role:u.role}));}catch{} setUser(u); setView(u.role==="admin"?"condominii":"docs"); };
  const handleLogout=async()=>{ try{await sb("/auth/v1/logout",{method:"POST",token:user.token});}catch{} localStorage.removeItem("sb_session_v1"); setUser(null); };

  if(checking) return <div className="min-h-screen bg-gradient-to-br from-slate-800 to-blue-900 flex items-center justify-center"><div className="w-10 h-10 border-4 border-blue-300 border-t-white rounded-full animate-spin"/></div>;

  return (
    <>
      {!user && <Login onLogin={handleLogin}/>}
      {user && user.role==="admin" && <AdminPanel user={user} onLogout={handleLogout} view={view} setView={setView}/>}
      {user && user.role!=="admin" && <CondominoPanel user={user} onLogout={handleLogout} view={view} setView={setView}/>}
      {!cookieOk && <CookieBanner onAccept={acceptCookie}/>}
    </>
  );
}