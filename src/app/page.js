"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const DEMO_TELEMETRY = [
  { altitude:"42m", speed:"8.2 m/s", signal:"98%", battery:"91%", heading:"NNE", gps:"24 sats" },
  { altitude:"38m", speed:"7.6 m/s", signal:"97%", battery:"89%", heading:"NNE", gps:"24 sats" },
  { altitude:"45m", speed:"9.1 m/s", signal:"99%", battery:"87%", heading:"N",   gps:"23 sats" },
  { altitude:"41m", speed:"8.8 m/s", signal:"96%", battery:"85%", heading:"NW",  gps:"24 sats" },
];

const TABS = [
  { id:"weed",   label:"WEED",   icon:"⬡", color:"#06b6d4", endpoint:"/analyze",        model:"U-Net",   mode:"WEED DETECT",    scanMsg:"Running U-Net on 256×256 tensor",    idleMsg:"AWAITING DRONE DATA INPUT"  },
  { id:"tomato", label:"TOMATO", icon:"◎", color:"#f97316", endpoint:"/analyze-tomato",  model:"YOLOv8",  mode:"DISEASE DETECT", scanMsg:"Running YOLOv8 on 640×640 image",    idleMsg:"UPLOAD TOMATO LEAF IMAGE"   },
  { id:"pest",   label:"PEST",   icon:"◈", color:"#a78bfa", endpoint:"/analyze-pest",    model:"YOLOv8",  mode:"PEST DETECT",    scanMsg:"Running YOLOv8 pest detection",      idleMsg:"UPLOAD CROP / FIELD IMAGE"  },
  { id:"wheat",  label:"WHEAT",  icon:"◇", color:"#facc15", endpoint:"/analyze-wheat",   model:"YOLOv8",  mode:"WHEAT DISEASE",  scanMsg:"Running YOLOv8 on wheat leaf image", idleMsg:"UPLOAD WHEAT LEAF IMAGE"    },
  { id:"corn",   label:"CORN",   icon:"△", color:"#4ade80", endpoint:"/analyze-corn",    model:"YOLOv8",  mode:"CORN DISEASE",   scanMsg:"Running YOLOv8 on corn leaf image",  idleMsg:"UPLOAD CORN LEAF IMAGE"     },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime() {
  return new Date().toLocaleTimeString("en-PK", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
}
function wmoDescription(code) {
  const map = {0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Foggy",48:"Icy fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Slight rain",63:"Moderate rain",65:"Heavy rain",71:"Slight snow",73:"Moderate snow",75:"Heavy snow",80:"Rain showers",81:"Moderate showers",82:"Violent showers",95:"Thunderstorm",96:"Thunderstorm w/ hail",99:"Severe thunderstorm"};
  return map[code] ?? "Unknown";
}
function wmoIcon(code) {
  if (code===0||code===1) return "☀";
  if (code===2||code===3) return "⛅";
  if (code>=51&&code<=67) return "🌧";
  if (code>=71&&code<=77) return "❄";
  if (code>=80&&code<=82) return "🌦";
  if (code>=95) return "⛈";
  if (code===45||code===48) return "🌫";
  return "🌤";
}

// ── Small UI components ───────────────────────────────────────────────────────
function Badge({ label, color }) {
  if (!label) return null;
  return <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.15em", padding:"2px 7px", borderRadius:3, border:`1px solid ${color}`, color }}>{label}</span>;
}
function weedSeverity(pct) {
  if (pct < 5)  return { label:"HEALTHY",  color:"#16a34a" };
  if (pct < 20) return { label:"LOW",      color:"#ca8a04" };
  if (pct < 45) return { label:"MODERATE", color:"#ea580c" };
  return          { label:"CRITICAL", color:"#dc2626" };
}
function StatRow({ label, value, accent }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #1a1a1a" }}>
      <span style={{ fontSize:9, color:"#555", letterSpacing:"0.12em", textTransform:"uppercase" }}>{label}</span>
      <span style={{ fontSize:11, fontFamily:"monospace", color:accent ?? "#888" }}>{value}</span>
    </div>
  );
}
function CornerBrackets({ color="#06b6d4" }) {
  const s = { position:"absolute", width:16, height:16, borderColor:color };
  return (
    <>
      <div style={{ ...s, top:8,    left:8,  borderTop:"1px solid",    borderLeft:"1px solid"  }}/>
      <div style={{ ...s, top:8,    right:8, borderTop:"1px solid",    borderRight:"1px solid" }}/>
      <div style={{ ...s, bottom:8, left:8,  borderBottom:"1px solid", borderLeft:"1px solid"  }}/>
      <div style={{ ...s, bottom:8, right:8, borderBottom:"1px solid", borderRight:"1px solid" }}/>
    </>
  );
}

// ── KhetiSense SVG logo ───────────────────────────────────────────────────────
function KhetiLogo({ size=120, spin=false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <defs>
        <filter id="lg"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="ls"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <g filter="url(#ls)" opacity="0.92">
        <path d="M100 148 C68 126 52 98 63 70 C74 46 96 52 100 64 C100 64 84 82 89 104 Z" stroke="#00e5aa" strokeWidth="1.6" fill="none"/>
        <path d="M100 148 C70 128 58 104 66 80 C72 66 86 66 90 78" stroke="#00e5aa" strokeWidth="0.8" fill="none" opacity="0.5"/>
        <path d="M100 148 L100 64" stroke="#06b6d4" strokeWidth="1" fill="none" opacity="0.55"/>
      </g>
      <g filter="url(#ls)" opacity="0.92">
        <path d="M100 148 C132 126 148 98 137 70 C126 46 104 52 100 64 C100 64 116 82 111 104 Z" stroke="#00e5aa" strokeWidth="1.6" fill="none"/>
        <path d="M100 148 C130 128 142 104 134 80 C128 66 114 66 110 78" stroke="#00e5aa" strokeWidth="0.8" fill="none" opacity="0.5"/>
      </g>
      <g filter="url(#lg)">
        <circle cx="100" cy="83" r="10" stroke="#06b6d4" strokeWidth="1.5" fill="#050505"/>
        <circle cx="100" cy="83" r="3.5" fill="#06b6d4" opacity="0.75"/>
        <path d="M87 76 A16 16 0 0 1 113 76" stroke="#06b6d4" strokeWidth="1" fill="none" opacity="0.8"/>
        <path d="M83 72 A22 22 0 0 1 117 72" stroke="#06b6d4" strokeWidth="0.6" fill="none" opacity="0.45"/>
      </g>
      <g style={spin ? { transformOrigin:"100px 83px", animation:"propSpin 2s linear infinite" } : {}}>
        <g filter="url(#ls)">
          <line x1="108" y1="75" x2="127" y2="58" stroke="#06b6d4" strokeWidth="1.2" opacity="0.8"/>
          <ellipse cx="132" cy="54"  rx="9" ry="3.2" transform="rotate(-45 132 54)"  stroke="#06b6d4" strokeWidth="1" fill="none" opacity="0.7"/>
          <line x1="92"  y1="75" x2="73"  y2="58" stroke="#06b6d4" strokeWidth="1.2" opacity="0.8"/>
          <ellipse cx="68"  cy="54"  rx="9" ry="3.2" transform="rotate(45 68 54)"    stroke="#06b6d4" strokeWidth="1" fill="none" opacity="0.7"/>
          <line x1="108" y1="91" x2="127" y2="108" stroke="#06b6d4" strokeWidth="1.2" opacity="0.8"/>
          <ellipse cx="132" cy="112" rx="9" ry="3.2" transform="rotate(45 132 112)"  stroke="#06b6d4" strokeWidth="1" fill="none" opacity="0.7"/>
          <line x1="92"  y1="91" x2="73"  y2="108" stroke="#06b6d4" strokeWidth="1.2" opacity="0.8"/>
          <ellipse cx="68"  cy="112" rx="9" ry="3.2" transform="rotate(-45 68 112)"  stroke="#06b6d4" strokeWidth="1" fill="none" opacity="0.7"/>
        </g>
      </g>
      <g opacity="0.35">
        <line x1="58" y1="158" x2="142" y2="158" stroke="#06b6d4" strokeWidth="0.7"/>
        <circle cx="58"  cy="158" r="2.2" fill="#06b6d4"/>
        <circle cx="142" cy="158" r="2.2" fill="#06b6d4"/>
        <circle cx="100" cy="158" r="2.2" fill="#00e5aa"/>
      </g>
    </svg>
  );
}

// ── Tab idle icons ────────────────────────────────────────────────────────────
function TabIdleIcon({ tabId, color }) {
  if (tabId === "weed") return <KhetiLogo size={80}/>;
  if (tabId === "tomato") return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <ellipse cx="40" cy="44" rx="20" ry="26" stroke={color} strokeWidth="1.2" fill="none" opacity="0.7"/>
      <path d="M40 18 C40 18 30 11 26 19 C22 27 32 33 40 33 C48 33 58 27 54 19 C50 11 40 18 40 18Z" stroke={color} strokeWidth="1" fill="none" opacity="0.5"/>
      <line x1="40" y1="33" x2="40" y2="70" stroke={color} strokeWidth="0.8" opacity="0.4"/>
      <circle cx="40" cy="40" r="3" fill={color} opacity="0.4"/>
    </svg>
  );
  if (tabId === "pest") return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <ellipse cx="40" cy="44" rx="10" ry="16" stroke={color} strokeWidth="1.2" fill="none" opacity="0.7"/>
      <ellipse cx="40" cy="28" rx="8"  ry="8"  stroke={color} strokeWidth="1.2" fill="none" opacity="0.7"/>
      <line x1="30" y1="36" x2="14" y2="28" stroke={color} strokeWidth="1" opacity="0.6"/>
      <line x1="30" y1="42" x2="12" y2="42" stroke={color} strokeWidth="1" opacity="0.6"/>
      <line x1="50" y1="36" x2="66" y2="28" stroke={color} strokeWidth="1" opacity="0.6"/>
      <line x1="50" y1="42" x2="68" y2="42" stroke={color} strokeWidth="1" opacity="0.6"/>
      <circle cx="36" cy="25" r="2" fill={color} opacity="0.6"/>
      <circle cx="44" cy="25" r="2" fill={color} opacity="0.6"/>
    </svg>
  );
  if (tabId === "wheat") return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <line x1="40" y1="70" x2="40" y2="15" stroke={color} strokeWidth="1" opacity="0.6"/>
      {[20,28,36,44,52,60].map((y,i) => (
        <g key={i}>
          <ellipse cx="33" cy={y} rx="7" ry="4" transform={`rotate(-20 33 ${y})`} stroke={color} strokeWidth="1" fill="none" opacity="0.65"/>
          <ellipse cx="47" cy={y} rx="7" ry="4" transform={`rotate(20 47 ${y})`}  stroke={color} strokeWidth="1" fill="none" opacity="0.65"/>
        </g>
      ))}
    </svg>
  );
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <ellipse cx="40" cy="45" rx="12" ry="22" stroke={color} strokeWidth="1.2" fill="none" opacity="0.7"/>
      {[28,36,44,52,60].map((y,i) => <line key={i} x1="28" y1={y} x2="52" y2={y} stroke={color} strokeWidth="0.7" opacity="0.4"/>)}
      {[32,38,44,48].map((x,i) => <line key={i} x1={x} y1="24" x2={x} y2="67" stroke={color} strokeWidth="0.7" opacity="0.3"/>)}
    </svg>
  );
}

// ── Confidence bars (classification mode) ─────────────────────────────────────
function ConfidenceBars({ detections }) {
  if (!detections || detections.length === 0) return null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5, marginTop:6 }}>
      {detections.slice(0,4).map((d,i) => (
        <div key={i}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
            <span style={{ fontSize:8, color:i===0?d.color:"#334155" }}>{d.class.replace(/_/g," ")}</span>
            <span style={{ fontSize:8, fontFamily:"monospace", color:i===0?d.color:"#334155" }}>{d.confidence}%</span>
          </div>
          <div style={{ height:3, background:"#111", borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${d.confidence}%`, background:i===0?d.color:"#1e293b", borderRadius:2, transition:"width 0.6s ease" }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── YOLO result panel ─────────────────────────────────────────────────────────
function YoloResult({ result, tabColor, onRescan }) {
  const primary    = result.primary;
  const detections = result.detections || [];
  const isClean    = primary.severity === "HEALTHY" || primary.severity === "NONE";
  const isClassification = detections.length > 0 && detections.every(d => !d.bbox);
  return (
    <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", padding:20, gap:10, animation:"fadeSlide 0.5s ease" }}>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
        <img src={result.image} alt="Detection" style={{ maxHeight:"100%", maxWidth:"100%", borderRadius:6, objectFit:"contain", border:`1px solid ${isClean?"#14532d":"#3b0a0a"}` }}/>
      </div>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
            <span style={{ fontSize:9, color:"#334155", letterSpacing:"0.15em" }}>PRIMARY DETECTION</span>
            <Badge label={primary.severity} color={primary.color}/>
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:primary.color, marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {primary.class.replace(/_/g," ")}
          </div>
          {primary.confidence > 0 && <div style={{ fontSize:9, color:"#475569", marginBottom:3 }}>{primary.confidence}% confidence</div>}
          <div style={{ fontSize:9, color:"#334155", lineHeight:1.5, maxWidth:300 }}>{primary.action}</div>
          {isClassification
            ? <ConfidenceBars detections={detections}/>
            : detections.length > 1 && (
              <div style={{ display:"flex", gap:4, marginTop:6, flexWrap:"wrap" }}>
                {detections.slice(0,5).map((d,i) => (
                  <span key={i} style={{ fontSize:8, padding:"1px 5px", borderRadius:2, border:`1px solid ${d.color}44`, color:d.color }}>
                    {d.class.replace(/_/g," ").substring(0,20)} {d.confidence}%
                  </span>
                ))}
              </div>
            )
          }
        </div>
        <label style={{ cursor:"pointer", padding:"8px 14px", border:`1px solid ${tabColor}44`, borderRadius:6, color:tabColor, fontSize:9, letterSpacing:"0.15em", flexShrink:0, marginTop:2 }}>
          RE-SCAN <input type="file" style={{ display:"none" }} onChange={onRescan} accept="image/*"/>
        </label>
      </div>
    </div>
  );
}

// ── Splash screen ─────────────────────────────────────────────────────────────
function SplashScreen({ onDone }) {
  const [outerOpacity, setOuterOpacity] = useState(0);
  const [showText,     setShowText]     = useState(false);
  const [showSub,      setShowSub]      = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setOuterOpacity(1),  80);
    const t2 = setTimeout(() => setShowText(true),  900);
    const t3 = setTimeout(() => setShowSub(true),  1200);
    const t4 = setTimeout(() => setOuterOpacity(0), 1700);
    const t5 = setTimeout(() => onDone(),           2100);
    return () => [t1,t2,t3,t4,t5].forEach(clearTimeout);
  }, [onDone]);
  return (
    <>
      <style>{`
        @keyframes propSpin    { to{transform:rotate(360deg)} }
        @keyframes splashPulse { 0%,100%{opacity:0.35} 50%{opacity:0.85} }
        @keyframes bracketIn   { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        @keyframes splashScan  { from{top:0px;opacity:1} to{top:210px;opacity:0} }
      `}</style>
      <div style={{ position:"fixed", inset:0, zIndex:9999, background:"#050808", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", opacity:outerOpacity, transition:"opacity 0.6s ease" }}>
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.045, pointerEvents:"none" }}>
          <defs><pattern id="dotgrid" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#06b6d4"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#dotgrid)"/>
        </svg>
        <div style={{ position:"absolute", width:320, height:320, border:"1px solid #06b6d422", borderRadius:"50%" }}/>
        <div style={{ position:"absolute", width:260, height:260, border:"1px solid #06b6d415", borderRadius:"50%" }}/>
        <div style={{ position:"relative", width:210, height:210 }}>
          <KhetiLogo size={210} spin={true}/>
          <div style={{ position:"absolute", left:-16, right:-16, top:0, height:2, background:"linear-gradient(90deg,transparent,#00e5aa44 10%,#06b6d4 40%,#00e5aa 50%,#06b6d4 60%,#00e5aa44 90%,transparent)", pointerEvents:"none", animation:"splashScan 0.55s ease-out 0.3s both" }}/>
          {showText && (
            <div style={{ animation:"bracketIn 0.4s ease" }}>
              {[{top:-10,left:-10,borderTop:"1.5px solid #06b6d4",borderLeft:"1.5px solid #06b6d4"},{top:-10,right:-10,borderTop:"1.5px solid #06b6d4",borderRight:"1.5px solid #06b6d4"},{bottom:-10,left:-10,borderBottom:"1.5px solid #06b6d4",borderLeft:"1.5px solid #06b6d4"},{bottom:-10,right:-10,borderBottom:"1.5px solid #06b6d4",borderRight:"1.5px solid #06b6d4"}].map((s,i)=>(
                <div key={i} style={{ position:"absolute", width:22, height:22, ...s }}/>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginTop:28, textAlign:"center", opacity:showText?1:0, transform:showText?"translateY(0)":"translateY(12px)", transition:"all 0.55s cubic-bezier(0.16,1,0.3,1)" }}>
          <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:900, fontSize:46, letterSpacing:"0.04em", color:"#f0fdff", textShadow:"0 0 40px rgba(6,182,212,0.35)" }}>
            KHETI<span style={{ color:"#06b6d4", fontWeight:300 }}>SENSE</span>
          </div>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9, letterSpacing:"0.45em", color:"#164e63", marginTop:8, opacity:showSub?1:0, transition:"opacity 0.5s ease" }}>
            AI-POWERED PRECISION AGRICULTURE
          </div>
        </div>
        {showSub && <div style={{ position:"absolute", bottom:52, fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"#0e4a5a", letterSpacing:"0.18em", animation:"splashPulse 0.9s ease infinite" }}>INITIALIZING MISSION CONTROL…</div>}
      </div>
    </>
  );
}

// ── KhetiBot system prompt builder ───────────────────────────────────────────
function buildSystemPrompt({ results, weather, locationName, activeTab }) {
  const scanContext = [
    results.weed   && `Weed scan: ${results.weed.percentage}% density. Herbicide needed: ${results.weed.herbicide}. Status: ${results.weed.msg}`,
    results.tomato && `Tomato scan: ${results.tomato.primary.class.replace(/_/g," ")} at ${results.tomato.primary.confidence}% confidence. Severity: ${results.tomato.primary.severity}. Action: ${results.tomato.primary.action}`,
    results.pest   && `Pest scan: ${results.pest.primary.class.replace(/_/g," ")} at ${results.pest.primary.confidence}% confidence. Severity: ${results.pest.primary.severity}. Action: ${results.pest.primary.action}`,
    results.wheat  && `Wheat scan: ${results.wheat.primary.class.replace(/_/g," ")} at ${results.wheat.primary.confidence}% confidence. Severity: ${results.wheat.primary.severity}. Action: ${results.wheat.primary.action}`,
    results.corn   && `Corn scan: ${results.corn.primary.class.replace(/_/g," ")} at ${results.corn.primary.confidence}% confidence. Severity: ${results.corn.primary.severity}. Action: ${results.corn.primary.action}`,
  ].filter(Boolean).join("\n") || "No scans have been run yet.";

  const weatherContext = weather
    ? `Weather at ${locationName}: ${weather.temp}°C, humidity ${weather.humidity}%, wind ${weather.wind} m/s, condition: ${wmoDescription(weather.code)}.`
    : "Weather data not yet available.";

  return `You are KhetiBot, an AI agronomist for KhetiSense — a precision agriculture platform for Pakistani farmers.

LIVE SCAN RESULTS:
${scanContext}

LIVE WEATHER:
${weatherContext}

ACTIVE TAB: ${activeTab.toUpperCase()}

YOUR RULES:
- You are a bilingual (English + Urdu) precision agriculture expert
- Always base your advice on the ACTUAL scan results shown above — you can already see them
- Cross-reference weather with disease/pest risk in your advice
- Suggest specific pesticides and fungicides available in Pakistan
- Keep answers concise and practical — farmers need quick answers
- ALWAYS respond in both English and Urdu. Write English first, then add a line with just "—", then write the Urdu translation below
- In Urdu address the farmer as "کسان بھائی"
- If asked something unrelated to agriculture, politely redirect`;
}

// ── KhetiBot Agent Chat ───────────────────────────────────────────────────────
function AgentChat({ results, weather, locationName, activeTab }) {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior:"smooth" });
  }, [messages, thinking]);

  // Greeting on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      const hasScan = Object.values(results).some(Boolean);
      setMessages([{ role:"assistant", text: hasScan
        ? `Assalam-u-Alaikum! I'm KhetiBot. I can see your scan results — ask me anything about your field.\n\n—\n\nالسلام علیکم! میں KhetiBot ہوں۔ میں آپ کے اسکین نتائج دیکھ سکتا ہوں۔ اپنے کھیت کے بارے میں پوچھیں۔`
        : `Assalam-u-Alaikum! I'm KhetiBot. Run a scan first, then ask me about your results!\n\n—\n\nالسلام علیکم! پہلے اسکین کریں، پھر نتائج کے بارے میں پوچھیں!`
      }]);
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || thinking) return;
    const userMsg = input.trim();
    setInput("");
    const updatedMessages = [...messages, { role:"user", text:userMsg }];
    setMessages(updatedMessages);
    setThinking(true);
    try {
      const res = await axios.post(`${API}/chat`, {
        messages: messages.map(m => ({ role:m.role, text:m.text })),
        systemPrompt: buildSystemPrompt({ results, weather, locationName, activeTab }),
        userMessage: userMsg,
      });
      const data = res.data;
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, { role:"assistant", text:data.reply }]);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Unknown error";
      setMessages(prev => [...prev, { role:"assistant", text:`Error: ${msg}\n\nMake sure GROQ_API_KEY is set in your backend .env file.` }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, messages, results, weather, locationName, activeTab]);

  const chips = ["What should I spray?", "Is my crop at risk?", "Weather impact on my field?", "Give me a treatment plan"];

  return (
    <>
      {/* Bubble button */}
      <button onClick={() => setOpen(o => !o)} style={{
        position:"fixed", bottom:28, right:28, zIndex:1000,
        width:54, height:54, borderRadius:"50%",
        background:open?"#0e2a35":"#06b6d4", border:"1px solid #06b6d4",
        cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:open?"none":"0 0 24px #06b6d455", transition:"all 0.25s ease",
      }}>
        {open
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#020e11" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        }
      </button>

      {/* Dot when results exist and chat is closed */}
      {!open && Object.values(results).some(Boolean) && (
        <div style={{ position:"fixed", bottom:74, right:28, zIndex:1001, width:9, height:9, borderRadius:"50%", background:"#f97316", boxShadow:"0 0 7px #f97316" }}/>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position:"fixed", bottom:92, right:28, zIndex:999,
          width:340, height:510, background:"#090909",
          border:"1px solid #1e1e1e", borderRadius:14,
          display:"flex", flexDirection:"column", overflow:"hidden",
          boxShadow:"0 12px 48px rgba(0,0,0,0.7)",
          animation:"chatSlideIn 0.25s cubic-bezier(0.16,1,0.3,1)",
        }}>
          <style>{`@keyframes chatSlideIn{from{opacity:0;transform:translateY(14px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>

          {/* Header */}
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #111", display:"flex", alignItems:"center", gap:10, flexShrink:0, background:"#0a0a0a" }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:"#06b6d41a", border:"1px solid #06b6d433", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <KhetiLogo size={20}/>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"#06b6d4", letterSpacing:"0.12em" }}>KHETIBOT</div>
              <div style={{ fontSize:8, color:"#1e3a4a", letterSpacing:"0.08em" }}>AI AGRONOMIST · English + اردو</div>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 6px #22c55e" }}/>
              <span style={{ fontSize:8, color:"#334155" }}>ONLINE</span>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"12px 12px", display:"flex", flexDirection:"column", gap:10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                <div style={{
                  maxWidth:"88%", padding:"9px 12px",
                  borderRadius:m.role==="user"?"12px 12px 3px 12px":"12px 12px 12px 3px",
                  background:m.role==="user"?"#06b6d41a":"#111",
                  border:m.role==="user"?"1px solid #06b6d433":"1px solid #1e1e1e",
                  fontSize:11, color:"#c8d6e0", lineHeight:1.7,
                  whiteSpace:"pre-wrap", wordBreak:"break-word",
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {thinking && (
              <div style={{ display:"flex", justifyContent:"flex-start" }}>
                <div style={{ padding:"10px 14px", background:"#111", border:"1px solid #1e1e1e", borderRadius:"12px 12px 12px 3px", display:"flex", gap:5, alignItems:"center" }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:"#06b6d4", animation:`pulse 1.2s ${i*0.2}s infinite` }}/>
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef}/>
          </div>

          {/* Quick chips */}
          {messages.length <= 1 && (
            <div style={{ padding:"0 10px 8px", display:"flex", gap:5, flexWrap:"wrap", flexShrink:0 }}>
              {chips.map((c,i) => (
                <button key={i} onClick={() => setInput(c)} style={{ padding:"4px 10px", background:"transparent", border:"1px solid #1e3a4a", borderRadius:12, color:"#475569", fontSize:8, cursor:"pointer", letterSpacing:"0.05em", fontFamily:"inherit", transition:"border-color 0.2s" }}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{ padding:"10px 12px", borderTop:"1px solid #111", display:"flex", gap:8, flexShrink:0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
              placeholder="Ask about your field… / اپنے کھیت کے بارے میں پوچھیں"
              style={{ flex:1, padding:"8px 11px", background:"#111", border:"1px solid #1e3a4a", borderRadius:7, color:"#e2e8f0", fontSize:10, fontFamily:"inherit", outline:"none" }}
            />
            <button onClick={sendMessage} disabled={thinking || !input.trim()} style={{
              padding:"8px 13px", background:thinking||!input.trim()?"#111":"#06b6d4",
              border:"none", borderRadius:7, cursor:thinking||!input.trim()?"default":"pointer",
              transition:"background 0.2s", display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={thinking||!input.trim()?"#334155":"#020e11"} strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Home() {
  const [splashDone, setSplashDone] = useState(false);
  const [activeTab,  setActiveTab]  = useState("weed");
  const [loading,    setLoading]    = useState(false);
  const [results,    setResults]    = useState({ weed:null, tomato:null, pest:null, wheat:null, corn:null });
  const [logs, setLogs] = useState([
    { time:"00:00:00", msg:"KhetiSense Core v2.1 online.",   type:"sys"  },
    { time:"00:00:01", msg:"U-Net (weed) loaded.",           type:"sys"  },
    { time:"00:00:02", msg:"YOLOv8 (tomato) loaded.",        type:"sys"  },
    { time:"00:00:03", msg:"YOLOv8 (pest) loaded.",          type:"sys"  },
    { time:"00:00:04", msg:"YOLOv8 (wheat) loaded.",         type:"sys"  },
    { time:"00:00:05", msg:"YOLOv8 (corn) loaded.",          type:"sys"  },
    { time:"00:00:06", msg:"Requesting GPS location…",       type:"idle" },
  ]);
  const [weather,      setWeather]      = useState(null);
  const [locationName, setLocationName] = useState("Locating…");
  const [userCoords,   setUserCoords]   = useState(null);
  const [telemetry,    setTelemetry]    = useState(DEMO_TELEMETRY[0]);
  const [clock,        setClock]        = useState(fmtTime());
  const logsRef = useRef(null);

  const tab    = TABS.find(t => t.id === activeTab);
  const result = results[activeTab];

  useEffect(() => { const id = setInterval(() => setClock(fmtTime()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, [logs]);
  useEffect(() => {
    const id = setInterval(() => setTelemetry(t => { const i=(DEMO_TELEMETRY.indexOf(t)+1)%DEMO_TELEMETRY.length; return DEMO_TELEMETRY[i]; }), 4000);
    return () => clearInterval(id);
  }, []);

  // Geolocation with 4s hard cap
  useEffect(() => {
    const FB = { lat:24.8607, lon:67.0011, name:"Karachi, PK" };
    const geo = new Promise((res,rej) => {
      if (!navigator.geolocation) return rej("unavailable");
      navigator.geolocation.getCurrentPosition(({coords:{latitude:lat,longitude:lon}}) => res({lat,lon}), rej, { timeout:4000, maximumAge:60000 });
    });
    Promise.race([geo, new Promise((_,rej) => setTimeout(()=>rej("timeout"),4000))])
      .then(({lat,lon}) => { setUserCoords({lat,lon}); addLog(`GPS fix: ${lat.toFixed(4)}°N ${lon.toFixed(4)}°E`,"sys"); fetchWeather(lat,lon); reverseGeocode(lat,lon); })
      .catch(() => { addLog("Location unavailable. Using Karachi fallback.","error"); fetchWeather(FB.lat,FB.lon); setLocationName(FB.name); });
  }, []);

  async function reverseGeocode(lat,lon) {
    try {
      const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)).json();
      const city = j.address?.city||j.address?.town||j.address?.village||j.address?.county||"Unknown";
      setLocationName(`${city}, ${j.address?.country_code?.toUpperCase()??""}`);
    } catch { setLocationName("Unknown"); }
  }
  async function fetchWeather(lat,lon) {
    try {
      const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&wind_speed_unit=ms`)).json();
      const c = j.current;
      setWeather({ temp:Math.round(c.temperature_2m), humidity:c.relative_humidity_2m, wind:c.wind_speed_10m.toFixed(1), code:c.weather_code });
      addLog(`Weather: ${Math.round(c.temperature_2m)}°C, ${wmoDescription(c.weather_code)}.`,"sys");
    } catch { setWeather({temp:"--",humidity:"--",wind:"--",code:0}); addLog("Weather API unreachable.","error"); }
  }

  const addLog = (msg,type="info") => setLogs(prev => [...prev,{time:fmtTime(),msg,type}]);

  const handleUpload = async (e, tabId) => {
    const file = e.target.files[0]; if (!file) return; e.target.value="";
    const t = TABS.find(x=>x.id===tabId);
    setLoading(true); setResults(r=>({...r,[tabId]:null}));
    addLog(`[${tabId.toUpperCase()}] File: ${file.name}`,"sys");
    addLog(`[${tabId.toUpperCase()}] Dispatching to ${t.model}…`,"info");
    const fd = new FormData(); fd.append("file",file);
    try {
      const res  = await axios.post(`${API}${t.endpoint}`, fd);
      const data = res.data;
      if (data.error) {
        addLog(`[${tabId.toUpperCase()}] Error: ${data.error}`,"error");
      } else if (tabId === "weed") {
        setResults(r=>({...r,weed:data}));
        addLog(`[WEED] Density: ${data.percentage}% — ${data.msg}`,"result");
        addLog(`[WEED] Herbicide: ${data.herbicide} | Latency: ${data.latency}`,"result");
      } else {
        setResults(r=>({...r,[tabId]:data}));
        addLog(`[${tabId.toUpperCase()}] Primary: ${data.primary.class.replace(/_/g," ")} (${data.primary.confidence}%)`,"result");
        addLog(`[${tabId.toUpperCase()}] ${data.primary.action}`,"agent");
        addLog(`[${tabId.toUpperCase()}] Latency: ${data.latency}`,"result");
      }
    } catch { addLog(`[${tabId.toUpperCase()}] FastAPI unreachable. Is uvicorn running?`,"error"); }
    finally { setLoading(false); }
  };

  function logColor(type) {
    return {sys:"#334155",info:"#475569",result:"#06b6d4",agent:"#22d3ee",error:"#ef4444",idle:"#374151"}[type]??"#555";
  }

  if (!splashDone) return <SplashScreen onDone={()=>setSplashDone(true)}/>;

  return (
    <main style={{ display:"flex", height:"100dvh", width:"100%", background:"#080808", color:"#e2e8f0", fontFamily:"'IBM Plex Mono','Courier New',monospace", overflow:"hidden", animation:"dashFadeIn 0.7s ease" }}>
      <style>{`
        @keyframes propSpin   { to{transform:rotate(360deg)} }
        @keyframes dashFadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scanline   { 0%{top:0%;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{top:100%;opacity:0} }
        @keyframes spin       { to{transform:rotate(360deg)} }
        @keyframes pulse      { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes blink      { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeSlide  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatY     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
      `}</style>

      {/* ══ LEFT: AGENT LOG ══ */}
      <div style={{ width:230, borderRight:"1px solid #111", background:"#090909", display:"flex", flexDirection:"column", flexShrink:0 }}>
        <div style={{ padding:"14px 16px 10px", borderBottom:"1px solid #111", display:"flex", alignItems:"center", gap:10 }}>
          <KhetiLogo size={26}/>
          <div>
            <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#06b6d4", fontWeight:700 }}>AGENT CORE</div>
            <div style={{ fontSize:9, color:"#1e3a4a" }}>SYS LOG v2.1</div>
          </div>
        </div>
        <div ref={logsRef} style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {logs.map((log,i) => (
            <div key={i} style={{ padding:"3px 14px", fontSize:10, lineHeight:1.6, animation:i===logs.length-1?"fadeSlide 0.3s ease":undefined }}>
              <span style={{ color:"#1e3a4a", marginRight:6 }}>{log.time}</span>
              <span style={{ color:logColor(log.type) }}>{log.msg}</span>
            </div>
          ))}
        </div>
        <div style={{ padding:"10px 14px", borderTop:"1px solid #111" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 6px #22c55e", animation:"pulse 2s infinite" }}/>
            <span style={{ fontSize:9, color:"#334155", letterSpacing:"0.1em" }}>NEURAL LINK ACTIVE</span>
          </div>
          <div style={{ fontSize:9, color:"#1e293b" }}>
            {clock} <span style={{ animation:"blink 1s infinite", display:"inline-block" }}>|</span>
          </div>
        </div>
      </div>

      {/* ══ CENTER ══ */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ height:52, borderBottom:"1px solid #111", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
            <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:900, fontSize:20, letterSpacing:"-0.04em", color:"#f8fafc" }}>
              KHETI<span style={{ color:"#06b6d4", fontWeight:300 }}>SENSE</span>
            </span>
            <span style={{ fontSize:8, color:"#1e3a4a", letterSpacing:"0.3em" }}>MISSION CONTROL</span>
          </div>
          <div style={{ display:"flex", gap:16 }}>
            {[["MODEL",tab.model],["MODE",tab.mode],["STATUS",result?"SCAN DONE":loading?"SCANNING":"IDLE"]].map(([k,v])=>(
              <div key={k} style={{ textAlign:"right" }}>
                <div style={{ fontSize:8, color:"#1e3a4a", letterSpacing:"0.15em" }}>{k}</div>
                <div style={{ fontSize:10, color:result&&k==="STATUS"?tab.color:loading&&k==="STATUS"?"#f59e0b":"#475569" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 5 tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid #111", flexShrink:0 }}>
          {TABS.map(t => {
            const isActive = activeTab === t.id;
            return (
              <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
                flex:1, padding:"8px 0", border:"none", cursor:"pointer",
                background:isActive?"#0a0a0a":"transparent",
                borderBottom:isActive?`2px solid ${t.color}`:"2px solid transparent",
                color:isActive?t.color:"#252525",
                fontSize:8, letterSpacing:"0.15em", fontFamily:"inherit",
                transition:"all 0.2s ease", display:"flex", alignItems:"center", justifyContent:"center", gap:5,
              }}>
                <span style={{ fontSize:10 }}>{t.icon}</span>
                {t.label}
                {results[t.id] && <span style={{ width:4, height:4, borderRadius:"50%", background:t.color, display:"inline-block" }}/>}
              </button>
            );
          })}
        </div>

        {/* Viewport */}
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:16, overflow:"hidden" }}>
          <div style={{
            width:"100%", maxWidth:680, border:`1px solid ${loading?tab.color+"33":"#111"}`,
            borderRadius:12, background:"#050505", position:"relative", overflow:"hidden",
            aspectRatio:"16/10", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            transition:"border-color 0.3s ease",
          }}>
            <CornerBrackets color={tab.color}/>
            <div style={{ position:"absolute", top:10, left:18, fontSize:9, color:"#1e3a4a", letterSpacing:"0.1em" }}>
              CAM:{activeTab.toUpperCase()}-01 / {userCoords?`${userCoords.lat.toFixed(4)}°N ${userCoords.lon.toFixed(4)}°E`:"ACQUIRING GPS…"}
            </div>
            <div style={{ position:"absolute", top:10, right:18, fontSize:9, color:"#1e3a4a" }}>{clock}</div>

            {loading ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
                <div style={{ position:"absolute", left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${tab.color},transparent)`, animation:"scanline 2.4s ease-in-out infinite" }}/>
                <div style={{ width:52, height:52, border:`2px solid ${tab.color}22`, borderTop:`2px solid ${tab.color}`, borderRadius:"50%", animation:"spin 0.9s linear infinite" }}/>
                <div style={{ fontSize:10, letterSpacing:"0.25em", color:tab.color, animation:"pulse 1.4s infinite" }}>ANALYZING…</div>
                <div style={{ fontSize:9, color:"#1e3a4a" }}>{tab.scanMsg}</div>
              </div>
            ) : activeTab==="weed" && results.weed ? (
              <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", padding:24, gap:14, animation:"fadeSlide 0.5s ease" }}>
                <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
                  <img src={results.weed.image} alt="Weed" style={{ maxHeight:"100%", maxWidth:"100%", borderRadius:6, objectFit:"contain", border:"1px solid #0e2a35" }}/>
                </div>
                <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:9, color:"#334155", letterSpacing:"0.15em", marginBottom:3 }}>WEED DENSITY</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
                      <span style={{ fontSize:48, fontWeight:700, color:tab.color, lineHeight:1 }}>{results.weed.percentage}%</span>
                      <Badge {...weedSeverity(results.weed.percentage)}/>
                    </div>
                    <div style={{ fontSize:9, color:"#334155", marginTop:3 }}>{results.weed.msg}</div>
                  </div>
                  <label style={{ cursor:"pointer", padding:"8px 16px", border:`1px solid ${tab.color}44`, borderRadius:6, color:tab.color, fontSize:9, letterSpacing:"0.15em" }}>
                    RE-SCAN <input type="file" style={{ display:"none" }} onChange={e=>handleUpload(e,"weed")} accept="image/*"/>
                  </label>
                </div>
              </div>
            ) : result && activeTab!=="weed" ? (
              <YoloResult result={result} tabColor={tab.color} onRescan={e=>handleUpload(e,activeTab)}/>
            ) : (
              <div style={{ textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:18 }}>
                <div style={{ animation:"floatY 3s ease-in-out infinite" }}>
                  <TabIdleIcon tabId={activeTab} color={tab.color}/>
                </div>
                <div>
                  <div style={{ fontSize:9, color:"#1e3a4a", letterSpacing:"0.2em", marginBottom:10 }}>{tab.idleMsg}</div>
                  <label style={{ cursor:"pointer", display:"inline-block", padding:"11px 28px", background:tab.color, borderRadius:8, color:"#020e11", fontWeight:700, fontSize:10, letterSpacing:"0.2em" }}>
                    INITIALIZE SCAN
                    <input type="file" style={{ display:"none" }} onChange={e=>handleUpload(e,activeTab)} accept="image/*"/>
                  </label>
                </div>
                {Object.entries(results).some(([k,v])=>k!==activeTab&&v) && (
                  <div style={{ fontSize:8, color:"#1e3a4a" }}>
                    {TABS.filter(t=>t.id!==activeTab&&results[t.id]).map(t=>t.label).join(", ")} result(s) cached
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ RIGHT: TELEMETRY ══ */}
      <div style={{ width:210, borderLeft:"1px solid #111", background:"#090909", display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" }}>
        <div style={{ padding:"14px 14px", borderBottom:"1px solid #111" }}>
          <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#06b6d4", fontWeight:700, marginBottom:10 }}>FIELD WEATHER</div>
          {weather ? (
            <>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:5 }}>
                <span style={{ fontSize:26, fontWeight:700, color:"#e2e8f0", lineHeight:1 }}>{weather.temp}°C</span>
                <span style={{ fontSize:18 }}>{wmoIcon(weather.code)}</span>
              </div>
              <div style={{ fontSize:10, color:"#475569", marginBottom:7 }}>{wmoDescription(weather.code)}</div>
              <StatRow label="Humidity" value={`${weather.humidity}%`} accent="#38bdf8"/>
              <StatRow label="Wind"     value={`${weather.wind} m/s`}  accent="#38bdf8"/>
              <StatRow label="Location" value={locationName}           accent="#475569"/>
              <div style={{ fontSize:8, color:"#1e3a4a", marginTop:5 }}>Open-Meteo · live GPS</div>
            </>
          ) : <div style={{ fontSize:10, color:"#1e3a4a", animation:"pulse 1.5s infinite" }}>Acquiring GPS…</div>}
        </div>

        <div style={{ padding:"14px 14px", borderBottom:"1px solid #111" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#06b6d4", fontWeight:700 }}>DRONE TELEM</div>
            <span style={{ fontSize:8, color:"#ca8a04" }}>⚠ DEMO</span>
          </div>
          <StatRow label="Altitude" value={telemetry.altitude} accent="#a78bfa"/>
          <StatRow label="Speed"    value={telemetry.speed}    accent="#a78bfa"/>
          <StatRow label="Heading"  value={telemetry.heading}  accent="#a78bfa"/>
          <StatRow label="Signal"   value={telemetry.signal}   accent="#22c55e"/>
          <StatRow label="Battery"  value={telemetry.battery}  accent="#22c55e"/>
        </div>

        <div style={{ padding:"14px 14px", borderBottom:"1px solid #111" }}>
          <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#06b6d4", fontWeight:700, marginBottom:8 }}>INFERENCE</div>
          {activeTab==="weed" ? (
            <>
              <StatRow label="Latency"   value={results.weed?.latency   ?? "—"} accent={tab.color}/>
              <StatRow label="Herbicide" value={results.weed?.herbicide ?? "—"} accent="#22c55e"/>
              <StatRow label="Density"   value={results.weed ? `${results.weed.percentage}%` : "—"} accent={tab.color}/>
            </>
          ) : (
            <>
              <StatRow label="Latency"    value={result?.latency ?? "—"}             accent={tab.color}/>
              <StatRow label="Detections" value={result ? `${result.total}` : "—"}  accent={tab.color}/>
              <StatRow label="Severity"   value={result?.primary?.severity ?? "—"}  accent={result?.primary?.color ?? "#888"}/>
              <StatRow label="Model"      value="YOLOv8"                            accent="#475569"/>
            </>
          )}
        </div>

        <div style={{ padding:"14px 14px", marginTop:"auto" }}>
          <div style={{ fontSize:9, letterSpacing:"0.2em", color:"#06b6d4", fontWeight:700, marginBottom:8 }}>SYSTEM</div>
          {[
            ["Weed",    "U-Net",  "#22c55e"],
            ["Tomato",  "YOLOv8", "#22c55e"],
            ["Pest",    "YOLOv8", "#22c55e"],
            ["Wheat",   "YOLOv8", "#22c55e"],
            ["Corn",    "YOLOv8", "#22c55e"],
            ["KhetiBot","Groq",   "#22c55e"],
            ["Weather", weather    ? "LIVE"  : "WAIT", weather    ? "#22c55e":"#ca8a04"],
            ["GPS",     userCoords ? "FIXED" : "WAIT", userCoords ? "#22c55e":"#ca8a04"],
          ].map(([k,v,c]) => (
            <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0", borderBottom:"1px solid #111" }}>
              <span style={{ fontSize:9, color:"#334155" }}>{k}</span>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:c, boxShadow:`0 0 5px ${c}` }}/>
                <span style={{ fontSize:8, color:"#1e3a4a" }}>{v}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ KHETIBOT AGENT ══ */}
      <AgentChat
        results={results}
        weather={weather}
        locationName={locationName}
        activeTab={activeTab}
      />
    </main>
  );
}
