import { useState, useEffect } from "react";

// ── SHARED STORAGE KEYS ──────────────────────────────────────────
const RE_KEY    = "pipeline_re_v1";
const SOLAR_KEY = "pipeline_solar_v1";

// ── SEED DATA ────────────────────────────────────────────────────
const SEED_RE    = [];
const SEED_SOLAR = [];

// ── HELPERS ──────────────────────────────────────────────────────
async function loadRE()    { try { const r = await window.storage.get(RE_KEY);    return r ? JSON.parse(r.value) : SEED_RE;    } catch { return SEED_RE; } }
async function saveRE(d)   { try { await window.storage.set(RE_KEY, JSON.stringify(d)); } catch {} }
async function loadSolar() {
  try {
    const r = await window.storage.get(SOLAR_KEY);
    if (r) return JSON.parse(r.value);
    await window.storage.set(SOLAR_KEY, JSON.stringify(SEED_SOLAR));
    return SEED_SOLAR;
  } catch { return SEED_SOLAR; }
}
async function saveSolarField(id, key, val) {
  try {
    const r = await window.storage.get(SOLAR_KEY);
    if (!r) return;
    const list = JSON.parse(r.value).map(x => x.id === id ? { ...x, [key]: val } : x);
    await window.storage.set(SOLAR_KEY, JSON.stringify(list));
  } catch {}
}

function safeJSON(raw) {
  let s = raw.trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a!==-1&&b!==-1) s = s.slice(a,b+1);
  return JSON.parse(s);
}
function uid()  { return Math.random().toString(36).slice(2,9); }
function daysUntil(d)  { if(!d) return null; return Math.round((new Date(d)-new Date(new Date().toDateString()))/86400000); }
function daysSince(d)  { if(!d) return null; return Math.round((new Date(new Date().toDateString())-new Date(d))/86400000); }
function fmt$(n)        { return n>0?"$"+Math.round(n).toLocaleString("en-US"):"—"; }
function gci(c)         { return Math.round((parseFloat(c.budget)||0)*(parseFloat(c.commissionPct)||3)/100); }
function urgCol(d)      { if(d===null) return "#4A6A8A"; if(d<0) return "#FF6B35"; if(d<=1) return "#FF6B35"; if(d<=3) return "#FFB800"; return "#00C2CB"; }
function starColor(s)   { return s>=4?"#FFB800":s>=3?"#7A99BB":"#3A5080"; }

// ── API ──────────────────────────────────────────────────────────
async function getFollowUpMsg(client, context = "") {
  const lc    = daysSince(client.lastContact);
  const fu    = daysUntil(client.followUp);
  const log   = (client.activityLog||[]).slice(-3).map(l=>`${l.date}: ${l.note}`).join("\n");
  const prompt = `Eres un agente de bienes raíces exitoso y profesional en Puerto Rico (Keller Williams PR). Generas mensajes de seguimiento que suenan como los escribiría un top producer — cálidos, directos, profesionales y orientados a cerrar. NUNCA uses groserías, palabras vulgares, ni lenguaje inapropiado. Siempre mantén un tono respetuoso y enfocado en el valor para el cliente.

CLIENTE:
Nombre: ${client.name}
Tipo: ${client.clientType}
Status: ${client.status}
Último contacto: hace ${lc??'?'} días
Próximo seguimiento programado: ${fu===null?'sin fecha':fu<0?`vencido hace ${Math.abs(fu)} días`:`en ${fu} días`}
Timeline: ${client.timeline||'—'}
Motivación: ${client.motivation||'—'}
Intentos de contacto: ${client.followUpAttempts||0}
Presupuesto: $${Number(client.budget||0).toLocaleString()}
Pre-aprobado: ${client.preApproval||'—'}
Hogares mostrados: ${client.homesShown||0}
Ofertas hechas: ${client.offerCount||0}
Preferencia de contacto: ${client.commPref||'WhatsApp'}
Historial reciente:\n${log||'Sin historial'}
Notas: ${client.notes||'—'}
${context ? `\nCONTEXTO ESPECÍFICO PARA ESTE MENSAJE (IMPORTANTE — incluye esto en el mensaje):\n${context}` : ""}

Responde SOLO JSON válido sin markdown:
{
  "urgency": "AHORA" | "HOY" | "ESTA SEMANA",
  "channel": "WhatsApp" | "Llamada" | "Email",
  "reasoning": "1-2 oraciones explicando por qué este approach ahora",
  "message": "mensaje profesional de agente de bienes raíces, personalizado con nombre y situación, máx 90 palabras, texto plano sin asteriscos. REGLAS: lenguaje profesional y respetuoso en todo momento, sin groserías ni palabras vulgares, tono cálido pero enfocado en negocios, como un agente exitoso de KW PR hablaría con un cliente real"
}`;

  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:600,messages:[{role:"user",content:prompt}]})});
    const data = await res.json();
    const raw  = (data.content||[]).map(b=>b.text||"").join("");
    return safeJSON(raw);
  } catch(e) { return {urgency:"HOY",channel:client.commPref||"WhatsApp",reasoning:"Error al analizar.",message:`Hola ${client.name}, ¿cómo estás? Quería hacer seguimiento contigo.`}; }
}

async function getCrossSellMsg(client, targetSide) {
  const prompt = `Eres un estratega de cross-sell para un equipo en PR: bienes raíces (KW PR) y energía solar (Windmar Homes).

CLIENTE DE REAL ESTATE:
Nombre: ${client.name}
Tipo: ${client.clientType}
Status: ${client.status}
Presupuesto: $${Number(client.budget||0).toLocaleString()}
Propiedad: ${client.propertyType||'—'}
Timeline: ${client.timeline||'—'}
Motivación: ${client.motivation||'—'}
Notas: ${client.notes||'—'}

¿Tiene potencial para energía solar residencial?

Responde SOLO JSON sin markdown:
{"score":"CALIENTE","reason":"razón específica con detalles del cliente","timing":"cuándo exactamente","message":"WhatsApp personalizado máx 85 palabras texto plano PR"}
score = CALIENTE | TIBIO | FRIO`;
  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:500,messages:[{role:"user",content:prompt}]})});
    const data = await res.json();
    const raw  = (data.content||[]).map(b=>b.text||"").join("");
    return safeJSON(raw);
  } catch { return {score:"TIBIO",reason:"Error al analizar.",timing:"Próximo contacto.",message:`Hola ${client.name}, quería comentarte algo que te puede interesar.`}; }
}

// ── CONSTANTS ────────────────────────────────────────────────────
const SCORE_COLOR   = {CALIENTE:"#FF6B35",TIBIO:"#FFB800",FRIO:"#7A99BB"};
const URGENCY_COLOR = {AHORA:"#FF6B35",HOY:"#FFB800","ESTA SEMANA":"#00C2CB"};
const STATUSES      = ["Buscando","Oferta activa","En contrato","Cerrado","Inactivo","Suspendido"];
const SOURCES       = ["Referido","Instagram","Facebook","Open House","Zillow","Realtor.com","Llamada fría","Evento","Otro"];
const TIMELINES     = ["ASAP","30-60 días","60-90 días","6+ meses","Cerrado","Sin definir"];
const MOTIVATIONS   = ["Primera compra","Relocation","Inversión","Downsizing","Creciendo familia","Divorcio","Herencia","Otro"];
const COMM_PREFS    = ["WhatsApp","Llamada","Email","Instagram"];
const CROSS_ST      = ["No intentado","Mencionado","Interesado","Convertido","No interesado"];
const CLIENT_TYPES  = ["Comprador","Compradora","Vendedor","Vendedora","Comprador/Vendedor"];
const PROP_TYPES    = ["Casa","Condo","Townhouse","Multifamiliar","Solar","Comercial","Terreno"];
const PRE_APPROVAL  = ["Sí","No","En proceso","N/A"];

const EMPTY = {name:"",phone:"",email:"",address:"",clientType:"Comprador",budget:"",propertyType:"",status:"Buscando",source:"",timeline:"",preApproval:"",preApprovalAmt:"",motivation:"",commPref:"WhatsApp",lastContact:"",followUp:"",crossSellStatus:"No intentado",commissionPct:"3",closingDate:"",offerCount:"0",homesShown:"0",referralPerson:"",attorney:"",star:3,notes:"",activityLog:[],followUpAttempts:0};

function getProjections(clients) {
  const now = new Date();
  const months = {};
  const monthName = (ym) => {
    const [y,m] = ym.split("-");
    return new Date(parseInt(y), parseInt(m)-1, 1).toLocaleDateString("es-PR",{month:"long",year:"numeric"});
  };
  clients.filter(c=>!["Cerrado","Inactivo","Suspendido"].includes(c.status)).forEach(c => {
    let offset = {ASAP:0,"30-60 días":1,"60-90 días":2,"6+ meses":5}[c.timeline] ?? 2;
    let d;
    if (c.closingDate) { d = new Date(c.closingDate); }
    else { d = new Date(now.getFullYear(), now.getMonth()+offset, 1); }
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if (!months[ym]) months[ym] = {label:monthName(ym), total:0, clients:[]};
    months[ym].total += gci(c);
    months[ym].clients.push({name:c.name, val:gci(c), type:c.clientType});
  });
  return Object.entries(months).sort(([a],[b])=>a.localeCompare(b)).slice(0,6).map(([k,v])=>({key:k,...v}));
}

// ══════════════════════════════════════════════════════════════════
export default function REApp() {
  const [clients,setClients]   = useState([]);
  const [solarDB,setSolarDB]   = useState([]);
  const [tab,setTab]           = useState("today");
  const [showForm,setShowForm] = useState(false);
  const [form,setForm]         = useState({...EMPTY});
  const [editId,setEditId]     = useState(null);
  const [loading,setLoading]   = useState(true);
  const [expandedId,setExpandedId] = useState(null);
  const [aiMsgs,setAiMsgs]    = useState({});
  const [aiLoading,setAiLoading] = useState({});
  const [aiContext,setAiContext] = useState({});
  const [crossOpps,setCrossOpps] = useState([]);
  const [crossLoading,setCrossLoading] = useState(false);
  const [crossProgress,setCrossProgress] = useState({c:0,t:0});
  const [expandedCross,setExpandedCross] = useState(null);
  const [copied,setCopied]     = useState(null);
  const [newNote,setNewNote]   = useState({});
  const [filterStatus,setFilterStatus] = useState("Todos");
  const [sortBy,setSortBy]     = useState("followUp");
  const [filterType,setFilterType] = useState("Todos");

  useEffect(()=>{
    Promise.all([loadRE(),loadSolar()]).then(([re,sol])=>{
      setClients(re); setSolarDB(sol); setLoading(false);
    });
  },[]);

  // Persist whenever clients change
  useEffect(()=>{ if(!loading) saveRE(clients); },[clients,loading]);

  // Reload solar when switching to cross tab
  useEffect(()=>{ if(tab==="cross") loadSolar().then(setSolarDB); },[tab]);

  async function persist(list) { setClients(list); }

  function openAdd()  { setEditId(null); setForm({...EMPTY,activityLog:[]}); setShowForm(true); }
  function openEdit(c){ setEditId(c.id); setForm({...c}); setShowForm(true); }
  async function save() {
    if(!form.name.trim()) return;
    const list = editId
      ? clients.map(x=>x.id===editId?{...form,id:editId}:x)
      : [...clients,{...form,id:uid(),activityLog:form.activityLog||[]}];
    await persist(list); setShowForm(false);
  }
  async function del(id) {
    if(!window.confirm("¿Eliminar este cliente? Esta acción no se puede deshacer.")) return;
    await persist(clients.filter(x=>x.id!==id));
  }
  async function addNote(id) {
    if(!newNote[id]?.trim()) return;
    const today = new Date().toISOString().slice(0,10);
    const list  = clients.map(x=>x.id===id?{...x,activityLog:[{date:today,note:newNote[id]},...(x.activityLog||[])],lastContact:today}:x);
    await persist(list);
    setNewNote(p=>({...p,[id]:""}));
  }
  async function updateField(id,key,val) {
    await persist(clients.map(x=>x.id===id?{...x,[key]:val}:x));
  }

  async function getAI(client) {
    setAiLoading(p=>({...p,[client.id]:true}));
    const ctx = aiContext[client.id]||"";
    const r = await getFollowUpMsg(client, ctx);
    setAiMsgs(p=>({...p,[client.id]:r}));
    setAiLoading(p=>({...p,[client.id]:false}));
  }

  async function runCross() {
    setCrossLoading(true); setCrossOpps([]);
    const freshSolar = await loadSolar();
    setSolarDB(freshSolar);
    const eligible = freshSolar.filter(c=>!["Convertido","No interesado"].includes(c.crossSellStatus));
    setCrossProgress({c:0,t:eligible.length});
    const results=[]; let cur=0;
    for(const c of eligible){
      const prompt = `Eres un estratega de cross-sell para un equipo en PR: bienes raíces (KW PR) y energía solar (Windmar Homes).

CLIENTE SOLAR:
Nombre: ${c.name}
Status: ${c.status}
Consumo LUMA: ${c.lumaKwh||'—'} kWh — Factura: $${c.lumaBill||'—'}/mes
Timeline: ${c.timeline||'—'}
Motivación: ${c.motivation||'—'}
Techo: ${c.roofCondition||'—'}
Notas: ${c.notes||'—'}

¿Tiene potencial para comprar o vender propiedad en Puerto Rico (KW PR)?

Responde SOLO JSON sin markdown:
{"score":"CALIENTE","reason":"razón específica con detalles del cliente","timing":"cuándo exactamente","message":"WhatsApp personalizado con nombre, máx 85 palabras, texto plano conversacional PR"}
score = CALIENTE | TIBIO | FRIO`;
      try {
        const res  = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:500,messages:[{role:"user",content:prompt}]})});
        const data = await res.json();
        const raw  = (data.content||[]).map(b=>b.text||"").join("");
        const a    = safeJSON(raw);
        cur++; setCrossProgress({c:cur,t:eligible.length});
        if(a.score!=="FRIO") results.push({client:c,...a});
      } catch { cur++; setCrossProgress({c:cur,t:eligible.length}); }
    }
    // FIX: correct operator precedence for sort comparator
    results.sort((a,b)=>({CALIENTE:0,TIBIO:1}[a.score]??2)-({CALIENTE:0,TIBIO:1}[b.score]??2));
    setCrossOpps(results); setCrossLoading(false);
  }

  function exportCSV() {
    const headers = ["Nombre","Tipo","Teléfono","Email","Dirección","Status","Presupuesto","Tipo Propiedad","Pre-aprobado","Timeline","Motivación","Fuente","Referido por","Último contacto","Próximo seguimiento","Cierre","GCI estimado","Estrellas","Cross-sell","Notas"];
    const rows = clients.map(c=>[c.name,c.clientType,c.phone,c.email,c.address,c.status,c.budget,c.propertyType,c.preApproval,c.timeline,c.motivation,c.source,c.referralPerson,c.lastContact,c.followUp,c.closingDate,gci(c),c.star,c.crossSellStatus,`"${(c.notes||"").replace(/"/g,"'")}"`].join(","));
    const csv  = [headers.join(","),...rows].join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href=url; a.download="RE_Pipeline.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function copyText(txt,key){
    try { navigator.clipboard.writeText(txt); } catch {
      const ta=document.createElement("textarea"); ta.value=txt;
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopied(key); setTimeout(()=>setCopied(null),2500);
  }

  // ── COMPUTED ────────────────────────────────────────────────
  const active    = clients.filter(c=>!["Cerrado","Inactivo","Suspendido"].includes(c.status));
  const totalGCI  = active.reduce((s,c)=>s+gci(c),0);
  const overdue   = clients.filter(c=>{ const d=daysUntil(c.followUp); return d!==null&&d<0; });
  const dueToday  = clients.filter(c=>daysUntil(c.followUp)===0);
  const closingWk = clients.filter(c=>{ const d=daysUntil(c.closingDate); return d!==null&&d>=0&&d<=7; });
  const cold      = clients.filter(c=>{ const d=daysSince(c.lastContact); return d!==null&&d>=14&&!["Cerrado","Inactivo"].includes(c.status); });

  let filtered = [...clients];
  if(filterStatus!=="Todos") filtered=filtered.filter(c=>c.status===filterStatus);
  if(filterType!=="Todos") filtered=filtered.filter(c=>c.clientType===filterType||c.clientType.includes(filterType.replace("Compradores","Comprador").replace("Vendedores","Vendedor")));
  if(sortBy==="followUp") filtered.sort((a,b)=>new Date(a.followUp||"9999")-new Date(b.followUp||"9999"));
  if(sortBy==="gci")      filtered.sort((a,b)=>gci(b)-gci(a));
  if(sortBy==="star")     filtered.sort((a,b)=>(b.star||0)-(a.star||0));
  if(sortBy==="lastContact") filtered.sort((a,b)=>new Date(a.lastContact||"9999")-new Date(b.lastContact||"9999"));

  if(loading) return <div style={{background:"#0A1628",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#4A90D9",fontFamily:"monospace",fontSize:16}}>Cargando pipeline RE...</div>;

  return (
    <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",background:"#0A1628",minHeight:"100vh",color:"#EEF4FF"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box} button:active{opacity:.8} input,select,textarea{font-family:inherit} textarea{resize:vertical}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0D1E3A} ::-webkit-scrollbar-thumb{background:#4A90D944;border-radius:4px}
        .card{background:#0D1E3A;border:1px solid #1A3060;border-radius:10px}
      `}</style>

      {/* HEADER */}
      <div style={{background:"#060E1E",borderBottom:"3px solid #4A90D9",padding:"12px 18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:26,letterSpacing:3,color:"#fff",lineHeight:1}}>
              🏠 PIPELINE <span style={{color:"#4A90D9"}}>REAL ESTATE</span>
            </div>
            <div style={{fontSize:10,color:"#5A7AAA",letterSpacing:1.5,textTransform:"uppercase",marginTop:1}}>KW Puerto Rico · Vance Berrios</div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <HPill label="Activos" val={active.length} color="#4A90D9"/>
            <HPill label="GCI Pipeline" val={fmt$(totalGCI)} color="#FFB800"/>
            <HPill label="⚠ Vencidos" val={overdue.length} color={overdue.length>0?"#FF6B35":"#3A5080"}/>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",background:"#0D1E3A",borderBottom:"1px solid #1A3060",overflowX:"auto"}}>
        {[
          {key:"today", label:"📋 HOY"},
          {key:"list",  label:"👥 CLIENTES"},
          {key:"cross", label:"⚡ CROSS-SELL"},
          {key:"proj",  label:"📊 GCI"},
        ].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            flex:1,minWidth:90,padding:"12px 8px",background:"transparent",border:"none",cursor:"pointer",
            fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:2,
            color:tab===t.key?"#4A90D9":"#3A5080",
            borderBottom:tab===t.key?"3px solid #4A90D9":"3px solid transparent",
            whiteSpace:"nowrap",transition:"all 0.2s"
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── TODAY TAB ── */}
      {tab==="today" && (
        <div style={{padding:"16px"}}>
          <TodaySection title="🔴 SEGUIMIENTOS VENCIDOS" clients={overdue} accent="#FF6B35" onOpen={openEdit} empty="Todo al día ✓"/>
          <TodaySection title="🟡 SEGUIMIENTO HOY" clients={dueToday} accent="#FFB800" onOpen={openEdit} empty="Nada programado para hoy"/>
          <TodaySection title="🏁 CIERRES ESTA SEMANA" clients={closingWk} accent="#00C2CB" onOpen={openEdit} empty="Sin cierres esta semana" fieldLabel={c=>`Cierre: ${c.closingDate}`}/>
          <TodaySection title="🧊 LEADS FRÍOS (+14 días sin contacto)" clients={cold} accent="#7A99BB" onOpen={openEdit} empty="Todos los leads activos con contacto reciente"/>
          <div style={{marginTop:16,display:"flex",gap:8}}>
            <button onClick={openAdd} style={btnStyle("#4A90D9")}>+ NUEVO CLIENTE</button>
            <button onClick={exportCSV} style={btnStyle("#1A3060","#7A99BB")}>⬇ EXPORTAR CSV</button>
          </div>
        </div>
      )}

      {/* ── CLIENTS TAB ── */}
      {tab==="list" && (
        <div style={{padding:"16px"}}>
          {/* CONTROLS */}
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={openAdd} style={btnStyle("#4A90D9")}>+ AGREGAR</button>
            <button onClick={exportCSV} style={btnStyle("#1A3060","#7A99BB")}>⬇ CSV</button>
            <SL value={filterStatus} onChange={setFilterStatus} opts={["Todos",...STATUSES]}/>
            <SL value={filterType}   onChange={setFilterType}   opts={["Todos","Compradores","Vendedores"]}/>
            <SL value={sortBy}       onChange={setSortBy}       opts={[{v:"followUp",l:"📆 Seguimiento"},{v:"gci",l:"💰 GCI"},{v:"star",l:"⭐ Estrellas"},{v:"lastContact",l:"🕐 Último contacto"}]}/>
          </div>

          {/* SUMMARY */}
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <MS label="Pipeline GCI" val={fmt$(totalGCI)} color="#FFB800"/>
            <MS label="Activos" val={active.length} color="#4A90D9"/>
            <MS label="Vencidos" val={overdue.length} color="#FF6B35"/>
            <MS label="Compradores" val={clients.filter(c=>c.clientType?.includes("Comprador")).length} color="#00C2CB"/>
            <MS label="Vendedores" val={clients.filter(c=>c.clientType?.includes("Vendedor")).length} color="#9B59B6"/>
          </div>

          {filtered.map(c=><ClientCard key={c.id} c={c} expanded={expandedId===c.id} onToggle={()=>setExpandedId(expandedId===c.id?null:c.id)} onEdit={()=>openEdit(c)} onDel={()=>del(c.id)} aiMsg={aiMsgs[c.id]} aiLoad={aiLoading[c.id]} aiCtx={aiContext[c.id]||""} onAiCtxChange={v=>setAiContext(p=>({...p,[c.id]:v}))} onClearMsg={()=>{setAiMsgs(p=>({...p,[c.id]:undefined}));setAiContext(p=>({...p,[c.id]:""}));}} onAI={()=>getAI(c)} newNote={newNote[c.id]||""} onNoteChange={v=>setNewNote(p=>({...p,[c.id]:v}))} onAddNote={()=>addNote(c.id)} onCopy={copyText} copied={copied} onCrossChange={v=>updateField(c.id,"crossSellStatus",v)}/>)}
          {filtered.length===0 && <Empty icon="🏠" msg="Sin clientes con ese filtro"/>}
        </div>
      )}

      {/* ── CROSS-SELL TAB ── */}
      {tab==="cross" && (
        <div style={{padding:"16px"}}>
          <div className="card" style={{padding:"18px",marginBottom:14}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2,marginBottom:4,color:"#FFB800"}}>⚡ CLIENTES SOLAR → LEADS DE RE PARA TI</div>
            <div style={{fontSize:12,color:"#5A7AAA",marginBottom:14,lineHeight:1.6}}>
              Claude analiza los clientes de Solar de tu esposa e identifica quiénes tienen potencial para comprar o vender propiedad contigo.
              {solarDB.length===0 && <span style={{color:"#FF6B35"}}> Sin datos del app Solar aún — agrega clientes allá primero.</span>}
            </div>
            <button onClick={runCross} disabled={crossLoading} style={{...btnStyle(crossLoading?"#1A3060":"#FFB800",crossLoading?"#5A7AAA":"#0A1628"),width:"100%",fontSize:16}}>
              {crossLoading?`ANALIZANDO ${crossProgress.c}/${crossProgress.t}...`:"🔍 BUSCAR LEADS DE RE EN BASE SOLAR"}
            </button>
            {crossLoading&&crossProgress.t>0&&<ProgressBar pct={crossProgress.c/crossProgress.t}/>}
          </div>

          {!crossLoading&&crossOpps.length>0&&(
            <div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:2,color:"#5A7AAA",marginBottom:10}}>
                {crossOpps.length} OPORTUNIDADES — {crossOpps.filter(o=>o.score==="CALIENTE").length} 🔥 · {crossOpps.filter(o=>o.score==="TIBIO").length} 🟡
              </div>
              {crossOpps.map((opp,i)=>(
                <CrossCard key={i} opp={opp} expanded={expandedCross===i} onToggle={()=>setExpandedCross(expandedCross===i?null:i)} copied={copied} onCopy={copyText} onStatusChange={async v=>{
                  // FIX: update crossSellStatus in solar storage (not RE clients)
                  await saveSolarField(opp.client.id,"crossSellStatus",v);
                  setSolarDB(prev=>prev.map(x=>x.id===opp.client.id?{...x,crossSellStatus:v}:x));
                  setCrossOpps(prev=>prev.map((o,j)=>j===i?{...o,client:{...o.client,crossSellStatus:v}}:o));
                }}/>
              ))}
            </div>
          )}
          {!crossLoading&&crossOpps.length===0&&<div style={{textAlign:"center",padding:40,color:"#3A5080",fontSize:13}}>Presiona el botón para analizar.</div>}
        </div>
      )}

      {/* ── GCI PROJECTION TAB ── */}
      {tab==="proj" && (
        <div style={{padding:"16px"}}>
          <div className="card" style={{padding:"18px",marginBottom:16}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:2,color:"#FFB800",marginBottom:4}}>📊 PROYECCIÓN DE GCI</div>
            <div style={{fontSize:12,color:"#5A7AAA",lineHeight:1.6}}>
              Basado en closing date (si existe) o timeline estimado de cada cliente activo. Clientes cerrados e inactivos excluidos.
            </div>
          </div>
          {(() => {
            const proj = getProjections(clients);
            const max  = Math.max(...proj.map(p=>p.total), 1);
            const grandTotal = proj.reduce((s,p)=>s+p.total,0);
            if (proj.length === 0) return <Empty icon="📊" msg="SIN CLIENTES ACTIVOS EN PIPELINE"/>;
            return (
              <div>
                <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                  <MS label="Total proyectado" val={fmt$(grandTotal)} color="#FFB800"/>
                  <MS label="Meses con deals" val={proj.length} color="#4A90D9"/>
                  <MS label="Promedio/mes" val={fmt$(grandTotal/Math.max(proj.length,1))} color="#00C2CB"/>
                </div>
                {proj.map((p,i) => (
                  <div key={p.key} className="card" style={{marginBottom:10,overflow:"hidden"}}>
                    <div style={{padding:"12px 16px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,color:"#fff",textTransform:"capitalize"}}>{p.label}</div>
                        <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:"#FFB800",letterSpacing:1}}>{fmt$(p.total)}</div>
                      </div>
                      <div style={{background:"#1A3060",borderRadius:6,height:8,marginBottom:10,overflow:"hidden"}}>
                        <div style={{height:"100%",background:"linear-gradient(90deg,#4A90D9,#FFB800)",borderRadius:6,width:`${(p.total/max)*100}%`,transition:"width 0.5s ease"}}/>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {p.clients.map((c,j)=>(
                          <div key={j} style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                            <span style={{color:"#8AABCC"}}>{c.name} <span style={{color:"#3A5080",fontSize:10}}>({c.type})</span></span>
                            <span style={{color:"#FFB800",fontWeight:600}}>{fmt$(c.val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{fontSize:11,color:"#3A5080",marginTop:8,fontStyle:"italic"}}>* Proyección basada en timelines estimados. Actualiza las fechas de cierre para mayor precisión.</div>
              </div>
            );
          })()}
        </div>
      )}
      {showForm&&(
        <Modal title={editId?"EDITAR CLIENTE":"NUEVO CLIENTE"} accent="#4A90D9" onClose={()=>setShowForm(false)} onSave={save}>
          <SL2 label="Tipo de cliente" k="clientType" f={form} s={setForm} opts={CLIENT_TYPES}/>
          <FI label="Nombre completo *" k="name" f={form} s={setForm}/>
          <FI label="Teléfono" k="phone" f={form} s={setForm} ph="787-000-0000"/>
          <FI label="Email" k="email" f={form} s={setForm}/>
          <FI label="Dirección" k="address" f={form} s={setForm}/>
          <SL2 label="Preferencia de contacto" k="commPref" f={form} s={setForm} opts={COMM_PREFS}/>
          <Sec>DATOS DEL NEGOCIO</Sec>
          <FI label="Presupuesto ($)" k="budget" f={form} s={setForm} type="number" ph="350000"/>
          <SL2 label="Tipo de propiedad" k="propertyType" f={form} s={setForm} opts={PROP_TYPES}/>
          <SL2 label="Pre-aprobado" k="preApproval" f={form} s={setForm} opts={PRE_APPROVAL}/>
          <FI label="Monto pre-aprobado ($)" k="preApprovalAmt" f={form} s={setForm} type="number" ph="350000"/>
          <FI label="Comisión (%)" k="commissionPct" f={form} s={setForm} type="number" ph="3"/>
          <FI label="Casas mostradas" k="homesShown" f={form} s={setForm} type="number" ph="0"/>
          <FI label="Ofertas hechas" k="offerCount" f={form} s={setForm} type="number" ph="0"/>
          <FI label="Fecha de cierre" k="closingDate" f={form} s={setForm} type="date"/>
          <FI label="Abogado / Título" k="attorney" f={form} s={setForm} ph="Lcdo. ..."/>
          <Sec>PIPELINE</Sec>
          <SL2 label="Status" k="status" f={form} s={setForm} opts={STATUSES}/>
          <SL2 label="Fuente" k="source" f={form} s={setForm} opts={SOURCES}/>
          <SL2 label="Timeline" k="timeline" f={form} s={setForm} opts={TIMELINES}/>
          <SL2 label="Motivación" k="motivation" f={form} s={setForm} opts={MOTIVATIONS}/>
          <FI label="Referido por (nombre)" k="referralPerson" f={form} s={setForm} ph="Juan García"/>
          <FI label="Último contacto" k="lastContact" f={form} s={setForm} type="date"/>
          <FI label="Próximo seguimiento" k="followUp" f={form} s={setForm} type="date"/>
          <FI label="Intentos de contacto" k="followUpAttempts" f={form} s={setForm} type="number" ph="0"/>
          <div style={{marginBottom:12}}>
            <label style={labelStyle}>Prioridad (⭐)</label>
            <div style={{display:"flex",gap:6}}>
              {[1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>setForm(p=>({...p,star:n}))} style={{flex:1,padding:"8px 0",background:form.star>=n?"#FFB800":"#1A3060",border:"none",borderRadius:6,cursor:"pointer",fontSize:16,transition:"all 0.2s"}}>★</button>
              ))}
            </div>
          </div>
          <SL2 label="Estado cross-sell" k="crossSellStatus" f={form} s={setForm} opts={CROSS_ST}/>
          <FA label="Notas" k="notes" f={form} s={setForm}/>
        </Modal>
      )}
    </div>
  );
}

// ── CLIENT CARD ──────────────────────────────────────────────────
function ClientCard({c,expanded,onToggle,onEdit,onDel,aiMsg,aiLoad,aiCtx,onAiCtxChange,onClearMsg,onAI,newNote,onNoteChange,onAddNote,onCopy,copied,onCrossChange}) {
  const fu  = daysUntil(c.followUp);
  const lc  = daysSince(c.lastContact);
  const pv  = gci(c);
  const bc  = urgCol(fu);

  return (
    <div className="card" style={{marginBottom:8,borderLeft:`3px solid ${bc}`,overflow:"hidden"}}>
      {/* SUMMARY ROW */}
      <div onClick={onToggle} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
            <span style={{fontWeight:700,fontSize:14}}>{c.name}</span>
            <Tag val={c.clientType} color="#9B59B6"/>
            <Tag val={c.status} color={c.status==="Cerrado"?"#00C2CB":c.status==="En contrato"?"#FFB800":c.status==="Inactivo"?"#3A5080":"#4A90D9"}/>
            {c.star>0&&<span style={{color:starColor(c.star),fontSize:12}}>{"★".repeat(c.star)}</span>}
          </div>
          <div style={{fontSize:11,color:"#5A7AAA",display:"flex",flexWrap:"wrap",gap:"3px 12px",lineHeight:1.9}}>
            {c.phone&&<span>📞 {c.phone}</span>}
            {c.address&&<span>📍 {c.address}</span>}
            {c.budget&&<span>💰 ${Number(c.budget).toLocaleString()}</span>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          {pv>0&&<div style={{fontFamily:"'Bebas Neue'",fontSize:16,color:"#FFB800",letterSpacing:1}}>{fmt$(pv)}</div>}
          <div style={{fontSize:11,color:bc,fontWeight:fu!==null&&fu<0?700:400}}>
            {fu===null?"—":fu===0?"HOY":fu<0?`${Math.abs(fu)}d vencido`:`${fu}d`}
          </div>
          <span style={{color:"#3A5080",fontSize:13}}>{expanded?"▲":"▼"}</span>
        </div>
      </div>

      {expanded&&(
        <div style={{borderTop:"1px solid #1A3060",padding:"14px"}}>
          {/* DETAIL GRID */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px",marginBottom:12}}>
            <D icon="📆" label="Seguimiento" val={c.followUp||(fu!==null?`${fu}d`:"—")} warn={fu!==null&&fu<0}/>
            <D icon="🕐" label="Último contacto" val={lc===null?"—":lc===0?"Hoy":lc===1?"Ayer":`${lc}d atrás`} warn={lc!==null&&lc>10}/>
            <D icon="⏳" label="Timeline" val={c.timeline||"—"}/>
            <D icon="🎯" label="Motivación" val={c.motivation||"—"}/>
            <D icon="✅" label="Pre-aprobado" val={c.preApproval?`${c.preApproval}${c.preApprovalAmt?" — $"+Number(c.preApprovalAmt).toLocaleString():""}` : "—"}/>
            <D icon="🏠" label="Casas mostradas" val={c.homesShown||"0"}/>
            <D icon="📝" label="Ofertas hechas" val={c.offerCount||"0"}/>
            <D icon="🏁" label="Cierre" val={c.closingDate||"—"}/>
            {c.referralPerson&&<D icon="👤" label="Referido por" val={c.referralPerson}/>}
            {c.attorney&&<D icon="⚖️" label="Abogado" val={c.attorney}/>}
            <D icon="📣" label="Fuente" val={c.source||"—"}/>
            <D icon="📞" label="Intentos contacto" val={c.followUpAttempts||"0"}/>
          </div>

          {c.notes&&<div style={{fontSize:11,color:"#3A5080",fontStyle:"italic",marginBottom:10,lineHeight:1.5,borderTop:"1px solid #1A3060",paddingTop:8}}>{c.notes}</div>}

          {/* AI FOLLOW-UP */}
          <div style={{background:"#060E1E",borderRadius:8,padding:"12px",marginBottom:10,border:"1px solid #1A3060"}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:13,letterSpacing:2,color:"#4A90D9",marginBottom:8}}>🤖 RECOMENDACIÓN DE SEGUIMIENTO</div>
            {!aiMsg&&!aiLoad&&(
              <div>
                <div style={{fontSize:11,color:"#5A7AAA",marginBottom:5}}>¿Algo específico que incluir en el mensaje? <span style={{color:"#3A5080"}}>(opcional)</span></div>
                <input value={aiCtx} onChange={e=>onAiCtxChange(e.target.value)} placeholder="Ej: bajamos el precio, salió su aprobación, vi una propiedad perfecta para él..."
                  style={{width:"100%",background:"#060E1E",border:"1px solid #2A4080",borderRadius:6,padding:"8px 11px",color:"#EEF4FF",fontSize:12,outline:"none",marginBottom:8}}/>
                <button onClick={onAI} style={{...btnStyle("#4A90D9"),width:"100%",fontSize:13}}>GENERAR MENSAJE CON IA</button>
              </div>
            )}
            {aiLoad&&<div style={{color:"#4A90D9",fontSize:12,textAlign:"center",padding:8}}>Analizando situación del cliente...</div>}
            {aiMsg&&!aiLoad&&(
              <div>
                <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <Tag val={aiMsg.urgency} color={URGENCY_COLOR[aiMsg.urgency]||"#4A90D9"}/>
                  <Tag val={`📲 ${aiMsg.channel}`} color="#4A90D9"/>
                </div>
                <div style={{fontSize:12,color:"#8AABCC",marginBottom:8,lineHeight:1.5,fontStyle:"italic"}}>{aiMsg.reasoning}</div>
                <div style={{fontSize:13,color:"#EEF4FF",lineHeight:1.8,marginBottom:8}}>{aiMsg.message}</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>onCopy(aiMsg.message,`ai-${c.id}`)} style={{...btnStyle(copied===`ai-${c.id}`?"#00C2CB":"#1A3060",copied===`ai-${c.id}`?"#060E1E":"#EEF4FF"),flex:1,fontSize:11}}>{copied===`ai-${c.id}`?"✓ COPIADO":"COPIAR"}</button>
                  <button onClick={onClearMsg} style={{...btnStyle("#1A3060","#5A7AAA"),flex:1,fontSize:11}}>NUEVO MENSAJE</button>
                </div>
              </div>
            )}
          </div>

          {/* ACTIVITY LOG */}
          <div style={{marginBottom:10}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:2,color:"#5A7AAA",marginBottom:6}}>HISTORIAL DE ACTIVIDAD</div>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              <input value={newNote} onChange={e=>onNoteChange(e.target.value)} placeholder="Agregar nota..." onKeyDown={e=>e.key==="Enter"&&onAddNote()}
                style={{flex:1,background:"#060E1E",border:"1px solid #1A3060",borderRadius:6,padding:"7px 10px",color:"#EEF4FF",fontSize:12,outline:"none"}}/>
              <button onClick={onAddNote} style={{...btnStyle("#4A90D9"),fontSize:12,padding:"7px 14px"}}>+</button>
            </div>
            {(c.activityLog||[]).slice(0,5).map((l,i)=>(
              <div key={i} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:"1px solid #1A3060",fontSize:11}}>
                <span style={{color:"#3A5080",flexShrink:0}}>{l.date}</span>
                <span style={{color:"#8AABCC"}}>{l.note}</span>
              </div>
            ))}
          </div>

          {/* CROSS-SELL STATUS + ACTIONS */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:11,display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:"#5A7AAA"}}>Cross-sell:</span>
              <select value={c.crossSellStatus||"No intentado"} onChange={e=>onCrossChange(e.target.value)}
                style={{background:"#1A3060",border:"1px solid #2A4080",borderRadius:4,color:"#EEF4FF",fontSize:11,padding:"2px 6px",cursor:"pointer"}}>
                {CROSS_ST.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:6}}>
              <a href={`https://wa.me/${c.phone?.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{...btnStyle("#25D366"),fontSize:11,textDecoration:"none",padding:"5px 10px"}}>WhatsApp</a>
              <button onClick={onEdit} style={{...btnStyle("#1A3060","#8AABCC"),fontSize:11,padding:"5px 10px"}}>Editar</button>
              <button onClick={onDel}  style={{background:"transparent",border:"1px solid #3A1020",borderRadius:5,color:"#FF6B35",padding:"5px 10px",cursor:"pointer",fontSize:11}}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SHARED SMALL COMPONENTS ──────────────────────────────────────
function TodaySection({title,clients,accent,onOpen,empty,fieldLabel}) {
  return (
    <div style={{marginBottom:16}}>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:2,color:accent,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
        {title}
        {clients.length>0&&<span style={{background:accent,color:"#fff",borderRadius:10,padding:"1px 8px",fontSize:11}}>{clients.length}</span>}
      </div>
      {clients.length===0
        ? <div style={{fontSize:12,color:"#3A5080",padding:"8px 0"}}>{empty}</div>
        : clients.map(c=>(
          <div key={c.id} onClick={()=>onOpen(c)} className="card" style={{padding:"10px 14px",marginBottom:6,cursor:"pointer",borderLeft:`3px solid ${accent}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:600,fontSize:13}}>{c.name}</div>
              <div style={{fontSize:11,color:"#5A7AAA"}}>{fieldLabel?fieldLabel(c):`${c.status} · ${c.commPref||"—"}`}</div>
            </div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:accent}}>{fmt$(gci(c))}</div>
          </div>
        ))
      }
    </div>
  );
}

function CrossCard({opp,expanded,onToggle,copied,onCopy,onStatusChange}) {
  return (
    <div className="card" style={{marginBottom:8,border:`1px solid ${SCORE_COLOR[opp.score]}55`,overflow:"hidden"}}>
      <div onClick={onToggle} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Tag val={opp.score} color={SCORE_COLOR[opp.score]}/>
          <div>
            <div style={{fontWeight:700,fontSize:13}}>{opp.client.name}</div>
            <div style={{fontSize:10,color:"#5A7AAA"}}>⚡ Solar → 🏠 RE (para ti)</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <select value={opp.client.crossSellStatus||"No intentado"} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();onStatusChange(e.target.value);}}
            style={{background:"#1A3060",border:"1px solid #2A4080",borderRadius:4,color:"#EEF4FF",fontSize:10,padding:"2px 6px",cursor:"pointer"}}>
            {CROSS_ST.map(s=><option key={s}>{s}</option>)}
          </select>
          <span style={{color:"#3A5080"}}>{expanded?"▲":"▼"}</span>
        </div>
      </div>
      {expanded&&(
        <div style={{borderTop:"1px solid #1A3060",padding:"12px 14px"}}>
          <div style={{fontSize:12,color:"#8AABCC",marginBottom:6,lineHeight:1.5}}><strong style={{color:"#00C2CB"}}>Por qué:</strong> {opp.reason}</div>
          <div style={{fontSize:12,color:"#8AABCC",marginBottom:10,lineHeight:1.5}}><strong style={{color:"#FFB800"}}>Cuándo:</strong> {opp.timing}</div>
          <div style={{background:"#060E1E",borderRadius:7,padding:"11px",border:"1px solid #1A3060"}}>
            <div style={{fontSize:10,color:"#5A7AAA",letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>MENSAJE WHATSAPP</div>
            <div style={{fontSize:13,color:"#EEF4FF",lineHeight:1.8}}>{opp.message}</div>
            <button onClick={()=>onCopy(opp.message,`cross-${opp.client.id}`)} style={{marginTop:8,...btnStyle(copied===`cross-${opp.client.id}`?"#00C2CB":"#1A3060",copied===`cross-${opp.client.id}`?"#060E1E":"#EEF4FF"),fontSize:11}}>
              {copied===`cross-${opp.client.id}`?"✓ COPIADO":"COPIAR MENSAJE"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Modal({title,accent,onClose,onSave,children}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(6,14,30,0.96)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16}}>
      <div style={{background:"#0D1E3A",borderRadius:12,padding:"22px 18px",width:"100%",maxWidth:460,border:`2px solid ${accent}`,maxHeight:"94vh",overflowY:"auto"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:2,marginBottom:16,color:accent}}>{title}</div>
        {children}
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={onSave}  style={{flex:1,...btnStyle(accent,"#060E1E"),fontSize:16,fontFamily:"'Bebas Neue'",letterSpacing:2}}>GUARDAR</button>
          <button onClick={onClose} style={{flex:1,...btnStyle("#1A3060","#5A7AAA"),fontSize:16,fontFamily:"'Bebas Neue'",letterSpacing:2}}>CANCELAR</button>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({pct}) {
  return <div style={{background:"#1A3060",borderRadius:6,height:5,marginTop:10,overflow:"hidden"}}><div style={{height:"100%",background:"#FFB800",borderRadius:6,width:`${pct*100}%`,transition:"width 0.4s ease"}}/></div>;
}

function HPill({label,val,color}) {
  return <div style={{background:color+"18",border:`1px solid ${color}44`,borderRadius:8,padding:"5px 12px",textAlign:"right"}}><div style={{fontSize:10,color:"#5A7AAA",letterSpacing:1}}>{label}</div><div style={{fontFamily:"'Bebas Neue'",fontSize:17,color,letterSpacing:1}}>{val}</div></div>;
}
function MS({label,val,color}) {
  return <div style={{background:"#0D1E3A",border:"1px solid #1A3060",borderRadius:7,padding:"7px 12px",flex:1,minWidth:70}}><div style={{fontSize:9,color:"#5A7AAA"}}>{label}</div><div style={{fontFamily:"'Bebas Neue'",fontSize:16,color,letterSpacing:1}}>{val}</div></div>;
}
function Tag({val,color}) {
  return <div style={{background:color+"20",border:`1px solid ${color}44`,borderRadius:4,padding:"1px 7px",fontSize:10,color,letterSpacing:0.5,whiteSpace:"nowrap"}}>{val}</div>;
}
function D({icon,label,val,warn}) {
  return <div><div style={{fontSize:9,color:"#3A5080",letterSpacing:1,textTransform:"uppercase"}}>{icon} {label}</div><div style={{fontSize:11,color:warn?"#FF6B35":"#8AABCC",fontWeight:warn?700:400,marginTop:1}}>{val}</div></div>;
}
function Empty({icon,msg}) {
  return <div style={{textAlign:"center",padding:48,color:"#3A5080"}}><div style={{fontSize:36,marginBottom:8}}>{icon}</div><div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:2}}>{msg}</div></div>;
}
const labelStyle = {display:"block",fontSize:10,textTransform:"uppercase",letterSpacing:1.5,color:"#5A7AAA",marginBottom:4};
const inputBase  = {width:"100%",background:"#060E1E",border:"1px solid #1A3060",borderRadius:6,padding:"8px 11px",color:"#EEF4FF",fontSize:12,outline:"none"};
function FI({label,k,f,s,type="text",ph}) { return <div style={{marginBottom:10}}><label style={labelStyle}>{label}</label><input type={type} value={f[k]||""} onChange={e=>s(p=>({...p,[k]:e.target.value}))} placeholder={ph} style={inputBase}/></div>; }
function SL2({label,k,f,s,opts}) { return <div style={{marginBottom:10}}><label style={labelStyle}>{label}</label><select value={f[k]||""} onChange={e=>s(p=>({...p,[k]:e.target.value}))} style={inputBase}><option value="">Seleccionar...</option>{opts.map(o=><option key={o}>{o}</option>)}</select></div>; }
function FA({label,k,f,s}) { return <div style={{marginBottom:10}}><label style={labelStyle}>{label}</label><textarea value={f[k]||""} onChange={e=>s(p=>({...p,[k]:e.target.value}))} rows={3} style={inputBase}/></div>; }
function Sec({children}) { return <div style={{fontFamily:"'Bebas Neue'",fontSize:12,letterSpacing:2,color:"#4A90D9",margin:"14px 0 8px",borderBottom:"1px solid #1A3060",paddingBottom:3}}>{children}</div>; }
function SL({value,onChange,opts}) {
  const options = Array.isArray(opts)&&typeof opts[0]==="object"?opts:opts.map(o=>({v:o,l:o}));
  return <select value={value} onChange={e=>onChange(e.target.value)} style={{background:"#0D1E3A",border:"1px solid #1A3060",borderRadius:7,color:"#EEF4FF",fontSize:11,padding:"7px 10px",cursor:"pointer",flex:1,minWidth:100}}>{options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
}
function btnStyle(bg,color="#EEF4FF") { return {background:bg,color,border:"none",borderRadius:7,padding:"9px 16px",cursor:"pointer",fontWeight:600,fontSize:12,transition:"opacity 0.2s"}; }
