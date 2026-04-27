import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase client ──────────────────────────────────────────────────────────
// Replace these two values with your own from the Supabase dashboard.
// See SUPABASE_SETUP.md for step-by-step instructions.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Utilities ────────────────────────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function parseTime(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function workerOnDuty(worker, hour, dayIdx) {
  const dayName = DAYS[dayIdx];
  const daysOff = (worker.days_off || "").split(",").map(d => d.trim());
  if (daysOff.includes(dayName)) return false;
  const start = parseTime(worker.shift_start);
  const end = parseTime(worker.shift_end);
  if (start === null || end === null) return false;
  const slotStart = hour * 60;
  const slotEnd = slotStart + 60;
  if (start < end) return start < slotEnd && end > slotStart;
  return start < slotEnd || end > slotStart; // midnight crossing
}

function computeOccupancy(workers, rooms, dayIdx) {
  const result = {};
  rooms.forEach(room => {
    result[room.id] = {};
    HOURS.forEach(h => {
      result[room.id][h] = workers.filter(
        w => w.room_id === room.id && workerOnDuty(w, h, dayIdx)
      ).length;
    });
  });
  return result;
}

function cellColor(count, capacity) {
  if (count === 0) return "#0d1b26";
  const p = count / capacity;
  if (p <= 0.25) return "#0a3d2e";
  if (p <= 0.50) return "#0f6e56";
  if (p <= 0.70) return "#1d9e75";
  if (p <= 0.85) return "#b07d10";
  if (p <  1.00) return "#c05510";
  return "#9b2020";
}

function pctLabel(count, cap) {
  return Math.round((count / cap) * 100);
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: "File is empty or has no data rows." };
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const required = ["employee_id","full_name","room_id","shift_start","shift_end","days_off"];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length) return { error: `Missing required columns: ${missing.join(", ")}` };
  const workers = [], errors = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",").map(v => v.trim());
    if (vals.length < required.length) { errors.push(`Row ${i+1}: too few columns`); continue; }
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
    if (!row.employee_id) { errors.push(`Row ${i+1}: missing employee_id`); continue; }
    if (!row.shift_start.match(/^\d{1,2}:\d{2}$/) || !row.shift_end.match(/^\d{1,2}:\d{2}$/)) {
      errors.push(`Row ${i+1}: invalid time format (use HH:MM)`); continue;
    }
    workers.push(row);
  }
  return { workers, errors };
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  app: { fontFamily:"'Georgia',serif", background:"#0b1520", minHeight:"100vh", color:"#ddd8cc", display:"flex", flexDirection:"column" },
  topbar: { background:"#111e2d", borderBottom:"1px solid #1e3048", padding:"0 20px", display:"flex", alignItems:"center", gap:16, height:52, flexShrink:0 },
  brandBox: { width:28, height:28, background:"#e8a020", borderRadius:5, display:"grid", gridTemplateColumns:"1fr 1fr", gap:3, padding:6 },
  brandDot: { background:"#0b1520", borderRadius:1 },
  brandName: { fontFamily:"'Courier New',monospace", fontSize:13, letterSpacing:2, color:"#ddd8cc", fontWeight:"normal" },
  brandAccent: { color:"#e8a020" },
  siteSel: { display:"flex", alignItems:"center", gap:6, background:"#162232", border:"1px solid #1e3048", borderRadius:5, padding:"4px 10px", fontFamily:"'Courier New',monospace", fontSize:11, color:"#8a9ab0", cursor:"pointer" },
  siteDot: { width:6, height:6, borderRadius:"50%", background:"#1d9e75" },
  navArea: { display:"flex", gap:2, marginLeft:"auto" },
  navBtn: (a) => ({ background:a?"#1e3048":"none", border:a?"1px solid #a06e12":"1px solid transparent", color:a?"#e8a020":"#8a9ab0", fontFamily:"'Courier New',monospace", fontSize:10, letterSpacing:1, padding:"5px 14px", borderRadius:4, cursor:"pointer" }),
  body: { display:"flex", flex:1, overflow:"hidden", height:"calc(100vh - 52px)" },
  sidebar: { width:210, background:"#111e2d", borderRight:"1px solid #1e3048", flexShrink:0, display:"flex", flexDirection:"column", overflowY:"auto" },
  sbSec: { padding:"12px 0", borderBottom:"1px solid #1e3048" },
  sbLabel: { fontFamily:"'Courier New',monospace", fontSize:8, letterSpacing:2, color:"#3a4f64", padding:"0 12px 6px", textTransform:"uppercase" },
  floorHdr: { fontFamily:"'Courier New',monospace", fontSize:10, color:"#e8a020", padding:"4px 12px", letterSpacing:1 },
  roomRow: (ov) => ({ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"4px 12px 4px 22px", fontSize:11, borderLeft:`2px solid ${ov?"#9b2020":"transparent"}`, color: ov?"#e06060":"#7a8fa6" }),
  rcap: (ov) => ({ fontFamily:"'Courier New',monospace", fontSize:9, color:ov?"#e06060":"#3a4f64", background:"#0b1520", padding:"1px 4px", borderRadius:2 }),
  warnBadge: { fontFamily:"'Courier New',monospace", fontSize:8, color:"#e06060", background:"rgba(155,32,32,0.2)", padding:"1px 4px", borderRadius:2, marginRight:4 },
  uploadZone: { margin:"10px 12px", border:"1px dashed #1e3048", borderRadius:5, padding:"10px 8px", textAlign:"center", cursor:"pointer" },
  main: { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  dayTabs: { display:"flex", background:"#111e2d", borderBottom:"1px solid #1e3048", flexShrink:0 },
  dayTab: (a) => ({ flex:1, textAlign:"center", fontFamily:"'Courier New',monospace", fontSize:10, letterSpacing:1, color:a?"#e8a020":"#4a5f74", padding:"8px 4px", cursor:"pointer", background:"none", border:"none", borderBottom:a?"2px solid #e8a020":"2px solid transparent" }),
  mainHdr: { padding:"10px 18px", borderBottom:"1px solid #1e3048", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, background:"#0e1a28" },
  heatmapWrap: { flex:1, overflowY:"auto", overflowX:"auto", padding:"12px 18px" },
  statsBar: { display:"flex", gap:1, background:"#1e3048", borderTop:"1px solid #1e3048", flexShrink:0 },
  statCard: { flex:1, background:"#111e2d", padding:"10px 14px" },
  statLbl: { fontFamily:"'Courier New',monospace", fontSize:8, letterSpacing:1.5, color:"#3a4f64", textTransform:"uppercase", marginBottom:3 },
  statVal: { fontFamily:"'Courier New',monospace", fontSize:20, color:"#ddd8cc" },
  statSub: { fontSize:10, color:"#5a7090", marginTop:1 },
  setupWrap: { flex:1, overflowY:"auto", padding:18 },
  card: { background:"#111e2d", border:"1px solid #1e3048", borderRadius:8, padding:16, marginBottom:14 },
  cardTitle: { fontFamily:"'Courier New',monospace", fontSize:9, letterSpacing:2, color:"#e8a020", textTransform:"uppercase", marginBottom:12, paddingBottom:8, borderBottom:"1px solid #1e3048" },
  flbl: { fontFamily:"'Courier New',monospace", fontSize:9, color:"#5a7090", marginBottom:3 },
  finput: { width:"100%", background:"#0b1520", border:"1px solid #1e3048", borderRadius:4, color:"#ddd8cc", fontFamily:"'Courier New',monospace", fontSize:11, padding:"5px 8px", outline:"none", boxSizing:"border-box" },
  fbtn: (v="primary") => ({ background:v==="primary"?"#e8a020":"none", color:v==="primary"?"#0b1520":"#1d9e75", border:v==="primary"?"none":"1px solid #0f6e56", borderRadius:4, fontFamily:"'Courier New',monospace", fontSize:10, fontWeight:"700", padding:"6px 14px", cursor:"pointer", letterSpacing:1 }),
  csvCol: { fontFamily:"'Courier New',monospace", fontSize:10, color:"#1d9e75", background:"rgba(29,158,117,0.1)", padding:"2px 6px", borderRadius:3, minWidth:130, flexShrink:0 },
  badge: (t) => ({ fontFamily:"'Courier New',monospace", fontSize:8, marginLeft:"auto", flexShrink:0, padding:"1px 5px", borderRadius:3, color:t==="req"?"#e06060":"#1d9e75", background:t==="req"?"rgba(155,32,32,0.15)":"rgba(29,158,117,0.1)" }),
  loader: { display:"flex", alignItems:"center", justifyContent:"center", flex:1, flexDirection:"column", gap:12 },
  loaderSpinner: { width:28, height:28, border:"2px solid #1e3048", borderTop:"2px solid #e8a020", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
  toast: (type) => ({ position:"fixed", bottom:24, right:24, background:type==="error"?"#9b2020":"#0f6e56", border:`1px solid ${type==="error"?"#c94040":"#1d9e75"}`, borderRadius:6, padding:"10px 16px", fontFamily:"'Courier New',monospace", fontSize:11, color:"#ddd8cc", zIndex:9999, maxWidth:360 }),
};

// ─── Toast notification ───────────────────────────────────────────────────────
function Toast({ message, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, []);
  return <div style={S.toast(type)}>{type === "error" ? "✗ " : "✓ "}{message}</div>;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x:0, y:0 });
  return (
    <div style={{ position:"relative", display:"inline-block" }}
      onMouseEnter={e => { setShow(true); setPos({ x:e.clientX, y:e.clientY }); }}
      onMouseMove={e => setPos({ x:e.clientX, y:e.clientY })}
      onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{ position:"fixed", left:pos.x+12, top:pos.y-30, background:"#0b1520", border:"1px solid #2a4060", borderRadius:4, padding:"4px 8px", fontFamily:"'Courier New',monospace", fontSize:10, color:"#ddd8cc", pointerEvents:"none", zIndex:9999, whiteSpace:"nowrap" }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
function Heatmap({ workers, rooms, dayIdx }) {
  const occupancy = computeOccupancy(workers, rooms, dayIdx);
  const CELL_W = Math.max(44, Math.min(72, Math.floor((680 - 52) / Math.max(rooms.length, 1))));
  const CELL_H = 18;
  const overflowRooms = rooms.filter(r => HOURS.some(h => (occupancy[r.id]?.[h] || 0) > r.capacity));

  if (rooms.length === 0) {
    return (
      <div style={{ ...S.heatmapWrap, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontFamily:"'Courier New',monospace", fontSize:11, color:"#3a4f64", textAlign:"center" }}>
          No rooms configured for this site.<br/>Go to Room Setup to add rooms.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>
      {overflowRooms.length > 0 && (
        <div style={{ background:"rgba(155,32,32,0.12)", borderBottom:"1px solid rgba(155,32,32,0.3)", padding:"6px 18px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <div style={{ width:14, height:14, borderRadius:"50%", background:"#9b2020", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Courier New',monospace", fontSize:9, color:"#fff", flexShrink:0 }}>!</div>
          <div style={{ fontFamily:"'Courier New',monospace", fontSize:10, color:"#e06060" }}>
            Overflow detected: {overflowRooms.map(r => r.name).join(", ")}
          </div>
        </div>
      )}
      <div style={S.heatmapWrap}>
        {/* Room headers */}
        <div style={{ display:"flex", alignItems:"flex-end", marginBottom:6 }}>
          <div style={{ width:52, flexShrink:0 }} />
          {rooms.map(r => {
            const hasOv = HOURS.some(h => (occupancy[r.id]?.[h] || 0) > r.capacity);
            return (
              <div key={r.id} style={{ width:CELL_W, fontFamily:"'Courier New',monospace", fontSize:7, color:hasOv?"#e06060":"#6a8aaa", textAlign:"center", lineHeight:1.3, paddingRight:1 }}>
                {r.name.includes("—") ? r.name.split("—")[0].trim() : r.name}<br/>
                <span style={{ color:hasOv?"#e06060":"#3a4f64", fontSize:6 }}>{r.capacity}ws</span>
              </div>
            );
          })}
        </div>
        {/* Hour rows */}
        {HOURS.map(h => (
          <div key={h} style={{ display:"flex", alignItems:"center", marginBottom:1 }}>
            <div style={{ width:52, flexShrink:0, fontFamily:"'Courier New',monospace", fontSize:8, color:"#3a4f64", textAlign:"right", paddingRight:6 }}>
              {String(h).padStart(2,"0")}:00
            </div>
            {rooms.map(r => {
              const count = occupancy[r.id]?.[h] || 0;
              const overflow = count > r.capacity;
              return (
                <Tooltip key={r.id} text={`${r.name} · ${String(h).padStart(2,"0")}:00 — ${count}/${r.capacity} (${pctLabel(count,r.capacity)}%)${overflow?" ⚠ OVERFLOW":""}`}>
                  <div
                    style={{ width:CELL_W-1, height:CELL_H, background:cellColor(count,r.capacity), borderRadius:2, cursor:"pointer", marginRight:1, outline:overflow?"1px solid #9b2020":"none" }}
                    onMouseEnter={e => e.currentTarget.style.filter="brightness(1.4)"}
                    onMouseLeave={e => e.currentTarget.style.filter="brightness(1)"}
                  />
                </Tooltip>
              );
            })}
          </div>
        ))}
        {/* Legend */}
        <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:12, paddingTop:10, borderTop:"1px solid #1e3048", flexWrap:"wrap" }}>
          <span style={{ fontFamily:"'Courier New',monospace", fontSize:8, color:"#3a4f64", marginRight:4 }}>occupancy:</span>
          {[{c:"#0d1b26",l:"Empty"},{c:"#0a3d2e",l:"<25%"},{c:"#0f6e56",l:"25–50%"},{c:"#1d9e75",l:"50–70%"},{c:"#b07d10",l:"70–85%"},{c:"#c05510",l:"85–99%"},{c:"#9b2020",l:"Overflow"}].map(g => (
            <span key={g.l} style={{ display:"flex", alignItems:"center", gap:3, marginRight:6 }}>
              <span style={{ width:18, height:11, borderRadius:1, background:g.c, display:"inline-block" }} />
              <span style={{ fontFamily:"'Courier New',monospace", fontSize:8, color:"#3a4f64" }}>{g.l}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Setup View ───────────────────────────────────────────────────────────────
function SetupView({ sites, rooms, onAddSite, onAddRoom, onDeleteRoom, saving }) {
  const [siteName, setSiteName] = useState("");
  const [siteAddr, setSiteAddr] = useState("");
  const [siteFloors, setSiteFloors] = useState("2");
  const [selSite, setSelSite] = useState(sites[0]?.id || "");
  const [selFloor, setSelFloor] = useState("1");
  const [roomName, setRoomName] = useState("");
  const [roomCap, setRoomCap] = useState("");

  useEffect(() => { if (sites.length && !selSite) setSelSite(sites[0].id); }, [sites]);

  const site = sites.find(s => s.id === selSite);
  const floors = Array.from({ length: parseInt(site?.floors) || 2 }, (_, i) => String(i + 1));
  const siteRooms = rooms.filter(r => r.site_id === selSite);
  const floorGroups = floors.reduce((acc, f) => { acc[f] = siteRooms.filter(r => r.floor === f); return acc; }, {});

  const handleAddSite = async () => {
    if (!siteName.trim()) return;
    await onAddSite({ name: siteName.trim(), address: siteAddr.trim(), floors: parseInt(siteFloors) || 2 });
    setSiteName(""); setSiteAddr(""); setSiteFloors("2");
  };

  const handleAddRoom = async () => {
    if (!roomName.trim() || !roomCap || !selSite) return;
    await onAddRoom({ site_id: selSite, floor: selFloor, name: roomName.trim(), capacity: parseInt(roomCap) });
    setRoomName(""); setRoomCap("");
  };

  return (
    <div style={S.setupWrap}>
      <div style={{ fontSize:14, marginBottom:4 }}>Room configuration</div>
      <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginBottom:16 }}>All changes save instantly to the cloud and appear for all users</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        {/* Add site */}
        <div style={S.card}>
          <div style={S.cardTitle}>Add office site</div>
          {[["Site name","text",siteName,setSiteName,"e.g. Kampala HQ"],["Location / address","text",siteAddr,setSiteAddr,"e.g. Plot 45, Nakasero"],["Number of floors","number",siteFloors,setSiteFloors,"2"]].map(([lbl,type,val,set,ph]) => (
            <div key={lbl} style={{ marginBottom:8 }}>
              <div style={S.flbl}>{lbl}</div>
              <input style={S.finput} type={type} value={val} placeholder={ph} onChange={e => set(e.target.value)} />
            </div>
          ))}
          <button style={S.fbtn()} onClick={handleAddSite} disabled={saving}>{saving ? "Saving…" : "Add site"}</button>
        </div>
        {/* Add room */}
        <div style={S.card}>
          <div style={S.cardTitle}>Add a room</div>
          <div style={{ marginBottom:8 }}>
            <div style={S.flbl}>Site</div>
            <select style={S.finput} value={selSite} onChange={e => setSelSite(e.target.value)}>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:8 }}>
            <div style={S.flbl}>Floor</div>
            <select style={S.finput} value={selFloor} onChange={e => setSelFloor(e.target.value)}>
              {floors.map(f => <option key={f} value={f}>Floor {f}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:8 }}>
            <div style={S.flbl}>Room name / ID</div>
            <input style={S.finput} value={roomName} placeholder="e.g. Room 101 — Inbound A" onChange={e => setRoomName(e.target.value)} />
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
            <div style={{ flex:1 }}>
              <div style={S.flbl}>Workstations</div>
              <input style={S.finput} type="number" value={roomCap} placeholder="12" onChange={e => setRoomCap(e.target.value)} />
            </div>
            <button style={S.fbtn()} onClick={handleAddRoom} disabled={saving}>{saving ? "…" : "Add"}</button>
          </div>
        </div>
      </div>
      {/* Room list */}
      <div style={{ marginBottom:8, display:"flex", alignItems:"center", gap:10 }}>
        <div style={S.flbl}>Viewing rooms for:</div>
        <select style={{ ...S.finput, width:"auto", minWidth:200 }} value={selSite} onChange={e => setSelSite(e.target.value)}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div style={S.card}>
        <div style={S.cardTitle}>{site?.name || "Site"} — rooms by floor</div>
        {floors.map(f => (
          <div key={f} style={{ marginBottom:12 }}>
            <div style={{ fontFamily:"'Courier New',monospace", fontSize:8, color:"#3a4f64", letterSpacing:1, padding:"4px 0", borderBottom:"1px solid #1e3048", marginBottom:4 }}>FLOOR {f}</div>
            {(floorGroups[f] || []).length === 0
              ? <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", padding:"4px 0" }}>No rooms on this floor</div>
              : (floorGroups[f] || []).map(r => (
                <div key={r.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #162232", fontSize:11 }}>
                  <span style={{ color:"#ddd8cc" }}>{r.name}</span>
                  <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#5a7090" }}>{r.capacity} workstations</span>
                    <button onClick={() => onDeleteRoom(r.id)} style={{ background:"none", border:"none", color:"#9b2020", cursor:"pointer", fontSize:13, opacity:0.6 }}
                      onMouseEnter={e => e.currentTarget.style.opacity=1}
                      onMouseLeave={e => e.currentTarget.style.opacity=0.6}>×</button>
                  </span>
                </div>
              ))
            }
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Upload View ──────────────────────────────────────────────────────────────
function UploadView({ rooms, onUpload, lastUpload, saving }) {
  const fileRef = useRef();
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const parsed = parseCSV(e.target.result);
      setResult(parsed);
      if (parsed.workers) await onUpload(parsed.workers, file.name);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const header = "employee_id,full_name,room_id,shift_start,shift_end,days_off,department,employment_type";
    const roomIds = rooms.slice(0, 3).map(r => r.id);
    const sample = [
      `EMP001,Alice Nakato,${roomIds[0]||"r1"},06:00,14:00,Sat,Sun,Inbound,Full-time`,
      `EMP002,Brian Ouma,${roomIds[0]||"r1"},14:00,22:00,Sun,Outbound,Full-time`,
      `EMP003,Carol Apio,${roomIds[1]||"r2"},22:00,06:00,Mon,Tech Support,Contract`,
    ];
    const blob = new Blob([[header,...sample].join("\n")], { type:"text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "occutrack_template.csv"; a.click();
  };

  const CSV_FIELDS = [
    ["employee_id","Unique ID per worker e.g. EMP001","req"],
    ["full_name","Worker's full name","req"],
    ["room_id","Assigned room — must exactly match a room ID in Supabase","req"],
    ["shift_start","Shift start in 24h format e.g. 08:00 or 22:00","req"],
    ["shift_end","Shift end in 24h. If end < start the shift crosses midnight","req"],
    ["days_off","Comma-separated off days e.g. Sat,Sun or Wed","req"],
    ["department","Department for grouping e.g. Inbound","opt"],
    ["employment_type","Full-time, Part-time, Contract etc.","opt"],
  ];

  return (
    <div style={S.setupWrap}>
      <div style={{ fontSize:14, marginBottom:4 }}>Upload worker roster</div>
      <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginBottom:14 }}>Workers are saved to Supabase and shared across all devices instantly</div>

      {result && (
        <div style={{ background:result.error?"rgba(155,32,32,0.1)":"rgba(29,158,117,0.1)", border:`1px solid ${result.error?"#9b2020":"#0f6e56"}`, borderRadius:6, padding:"10px 14px", marginBottom:14, fontFamily:"'Courier New',monospace", fontSize:10 }}>
          {result.error
            ? <span style={{ color:"#e06060" }}>✗ {result.error}</span>
            : <>
                <span style={{ color:"#1d9e75" }}>✓ {saving ? "Saving to cloud…" : `${result.workers.length} workers uploaded successfully`}</span>
                {result.errors?.length > 0 && <div style={{ color:"#e8a020", marginTop:4 }}>⚠ {result.errors.length} rows skipped — {result.errors[0]}</div>}
              </>
          }
        </div>
      )}

      {lastUpload && !result && (
        <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginBottom:14, padding:"6px 10px", background:"#111e2d", borderRadius:4 }}>
          Last upload: {lastUpload}
        </div>
      )}

      {rooms.length > 0 && (
        <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginBottom:14, padding:"8px 12px", background:"#111e2d", border:"1px solid #1e3048", borderRadius:4 }}>
          <span style={{ color:"#e8a020" }}>Room IDs in use (copy these exactly into your CSV room_id column):</span><br/>
          <span style={{ color:"#1d9e75" }}>{rooms.map(r => r.id).join("  ·  ")}</span>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardTitle}>CSV column specification</div>
        {CSV_FIELDS.map(([col, desc, type]) => (
          <div key={col} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:8 }}>
            <div style={S.csvCol}>{col}</div>
            <div style={{ fontSize:11, color:"#7a8fa6", lineHeight:1.5, flex:1 }}>{desc}</div>
            <div style={S.badge(type)}>{type==="req"?"required":"optional"}</div>
          </div>
        ))}
        <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #1e3048" }}>
          <div style={{ fontFamily:"'Courier New',monospace", fontSize:8, letterSpacing:2, color:"#e8a020", textTransform:"uppercase", marginBottom:6 }}>Sample rows</div>
          {["employee_id,full_name,room_id,shift_start,shift_end,days_off","EMP001,Alice Nakato,r1,06:00,14:00,Sat,Sun","EMP002,Brian Ouma,r1,22:00,06:00,Mon","EMP003,Carol Apio,r2,11:30,19:30,Sun"].map((row,i) => (
            <div key={i} style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:i===0?"#1d9e75":"#5a7090", background:"#0b1520", borderRadius:3, padding:"4px 8px", marginBottom:2 }}>{row}</div>
          ))}
        </div>
      </div>

      <div
        style={{ border:`2px dashed ${dragOver?"#1d9e75":"#1e3048"}`, borderRadius:8, padding:28, textAlign:"center", cursor:"pointer", marginBottom:12, background:dragOver?"rgba(29,158,117,0.04)":"transparent" }}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
      >
        <div style={{ fontSize:24, marginBottom:8 }}>↑</div>
        <div style={{ fontSize:13, color:"#7a8fa6" }}>Drop your CSV here or click to browse</div>
        <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginTop:4 }}>Accepts .csv · UTF-8 encoding</div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />
      </div>
      <button style={S.fbtn("secondary")} onClick={downloadTemplate}>↓ Download CSV template</button>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("dash");
  const [sites, setSites] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [activeSiteIdx, setActiveSiteIdx] = useState(0);
  const [dayIdx, setDayIdx] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastUpload, setLastUpload] = useState("");
  const [toast, setToast] = useState(null);
  const [dbError, setDbError] = useState(false);

  const showToast = (message, type="success") => setToast({ message, type });

  // ── Load all data from Supabase on mount ──
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const [sitesRes, roomsRes, workersRes] = await Promise.all([
          supabase.from("sites").select("*").order("created_at"),
          supabase.from("rooms").select("*").order("floor").order("name"),
          supabase.from("workers").select("*").order("full_name"),
        ]);
        if (sitesRes.error) throw sitesRes.error;
        if (roomsRes.error) throw roomsRes.error;
        if (workersRes.error) throw workersRes.error;
        setSites(sitesRes.data || []);
        setRooms(roomsRes.data || []);
        setWorkers(workersRes.data || []);
      } catch (err) {
        console.error("Supabase load error:", err);
        setDbError(true);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  // ── Real-time subscriptions ──
  useEffect(() => {
    if (dbError) return;
    const sitesSub = supabase.channel("sites-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"sites" }, () => {
        supabase.from("sites").select("*").order("created_at").then(({ data }) => { if (data) setSites(data); });
      }).subscribe();
    const roomsSub = supabase.channel("rooms-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"rooms" }, () => {
        supabase.from("rooms").select("*").order("floor").order("name").then(({ data }) => { if (data) setRooms(data); });
      }).subscribe();
    const workersSub = supabase.channel("workers-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"workers" }, () => {
        supabase.from("workers").select("*").order("full_name").then(({ data }) => { if (data) setWorkers(data); });
      }).subscribe();
    return () => {
      supabase.removeChannel(sitesSub);
      supabase.removeChannel(roomsSub);
      supabase.removeChannel(workersSub);
    };
  }, [dbError]);

  // ── CRUD handlers ──
  const handleAddSite = async (siteData) => {
    setSaving(true);
    const { data, error } = await supabase.from("sites").insert([siteData]).select().single();
    setSaving(false);
    if (error) { showToast("Failed to add site: " + error.message, "error"); return; }
    setSites(prev => [...prev, data]);
    showToast(`Site "${data.name}" added`);
  };

  const handleAddRoom = async (roomData) => {
    setSaving(true);
    const { data, error } = await supabase.from("rooms").insert([roomData]).select().single();
    setSaving(false);
    if (error) { showToast("Failed to add room: " + error.message, "error"); return; }
    setRooms(prev => [...prev, data]);
    showToast(`Room "${data.name}" added`);
  };

  const handleDeleteRoom = async (id) => {
    setSaving(true);
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    setSaving(false);
    if (error) { showToast("Failed to delete room: " + error.message, "error"); return; }
    setRooms(prev => prev.filter(r => r.id !== id));
    showToast("Room deleted");
  };

  const handleUpload = async (parsedWorkers, fileName) => {
    setSaving(true);
    // Replace all workers (delete then insert)
    const { error: delError } = await supabase.from("workers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delError) { showToast("Upload failed (delete step): " + delError.message, "error"); setSaving(false); return; }
    // Insert in batches of 500
    const BATCH = 500;
    let allInserted = [];
    for (let i = 0; i < parsedWorkers.length; i += BATCH) {
      const batch = parsedWorkers.slice(i, i + BATCH).map(({ _id, ...w }) => w);
      const { data, error } = await supabase.from("workers").insert(batch).select();
      if (error) { showToast("Upload failed (insert step): " + error.message, "error"); setSaving(false); return; }
      allInserted = allInserted.concat(data || []);
    }
    setWorkers(allInserted);
    setLastUpload(`${fileName} · ${allInserted.length} workers · ${new Date().toLocaleTimeString()}`);
    showToast(`${allInserted.length} workers uploaded successfully`);
    setSaving(false);
  };

  // ── Derived data ──
  const activeSite = sites[activeSiteIdx] || sites[0];
  const siteRooms = rooms.filter(r => r.site_id === activeSite?.id);
  const siteWorkers = workers.filter(w => siteRooms.some(r => r.id === w.room_id));
  const occupancy = computeOccupancy(siteWorkers, siteRooms, dayIdx);
  const totalCap = siteRooms.reduce((s, r) => s + r.capacity, 0);
  const peakHour = HOURS.reduce((best, h) => {
    const t = siteRooms.reduce((s, r) => s + (occupancy[r.id]?.[h] || 0), 0);
    const b = siteRooms.reduce((s, r) => s + (occupancy[r.id]?.[best] || 0), 0);
    return t > b ? h : best;
  }, 0);
  const peakTotal = siteRooms.reduce((s, r) => s + (occupancy[r.id]?.[peakHour] || 0), 0);
  const peakPct = totalCap ? Math.round((peakTotal / totalCap) * 100) : 0;
  const overflowRooms = siteRooms.filter(r => HOURS.some(h => (occupancy[r.id]?.[h] || 0) > r.capacity));
  const onShiftNow = siteRooms.reduce((s, r) => s + (occupancy[r.id]?.[new Date().getHours()] || 0), 0);
  const floorGroups = siteRooms.reduce((acc, r) => { if (!acc[r.floor]) acc[r.floor] = []; acc[r.floor].push(r); return acc; }, {});

  // ── Loading screen ──
  if (loading) return (
    <div style={{ ...S.app, alignItems:"center", justifyContent:"center" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={S.loaderSpinner} />
      <div style={{ fontFamily:"'Courier New',monospace", fontSize:11, color:"#3a4f64", marginTop:8 }}>Connecting to database…</div>
    </div>
  );

  // ── DB error screen ──
  if (dbError) return (
    <div style={{ ...S.app, alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ fontFamily:"'Courier New',monospace", fontSize:12, color:"#e06060", textAlign:"center", maxWidth:400 }}>
        <div style={{ fontSize:20, marginBottom:12 }}>⚠</div>
        <div style={{ marginBottom:8 }}>Could not connect to Supabase.</div>
        <div style={{ color:"#5a7090", fontSize:10 }}>Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set correctly in your .env file, and that your Supabase project is active.</div>
      </div>
    </div>
  );

  return (
    <div style={S.app}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={S.brandBox}><div style={S.brandDot}/><div style={S.brandDot}/><div style={S.brandDot}/><div style={S.brandDot}/></div>
          <div style={S.brandName}>OCCU<span style={S.brandAccent}>TRACK</span></div>
        </div>
        {sites.length > 0 && (
          <div style={S.siteSel} onClick={() => setActiveSiteIdx((activeSiteIdx + 1) % sites.length)}>
            <div style={S.siteDot} />
            {activeSite?.name || "No site"} {sites.length > 1 ? "▾" : ""}
          </div>
        )}
        <div style={S.navArea}>
          {["dash","setup","upload"].map((v,i) => (
            <button key={v} style={S.navBtn(view===v)} onClick={() => setView(v)}>
              {["Dashboard","Room setup","Upload roster"][i]}
            </button>
          ))}
        </div>
        {saving && <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#e8a020", marginLeft:8 }}>● saving…</div>}
      </div>

      {/* BODY */}
      <div style={S.body}>
        {/* SIDEBAR */}
        <div style={S.sidebar}>
          <div style={S.sbSec}>
            <div style={S.sbLabel}>Floors & rooms</div>
            {Object.keys(floorGroups).sort().map(floor => (
              <div key={floor}>
                <div style={S.floorHdr}>▾ Floor {floor}</div>
                {floorGroups[floor].map(r => {
                  const hasOv = HOURS.some(h => (occupancy[r.id]?.[h] || 0) > r.capacity);
                  return (
                    <div key={r.id} style={S.roomRow(hasOv)}>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:120 }}>{r.name}</span>
                      <span style={{ display:"flex", alignItems:"center", gap:3 }}>
                        {hasOv && <span style={S.warnBadge}>!</span>}
                        <span style={S.rcap(hasOv)}>{r.capacity}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
            {siteRooms.length === 0 && <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", padding:"6px 12px" }}>No rooms configured</div>}
          </div>
          <div style={{ ...S.sbSec, flex:1 }}>
            <div style={S.sbLabel}>Roster</div>
            <div style={S.uploadZone} onClick={() => setView("upload")}>
              <div style={{ fontSize:16, marginBottom:3 }}>↑</div>
              <div style={{ fontFamily:"'Courier New',monospace", fontSize:8, letterSpacing:1, color:"#3a4f64" }}>
                <span style={{ color:"#1d9e75" }}>upload CSV</span><br/>or drag & drop
              </div>
            </div>
            <div style={{ fontFamily:"'Courier New',monospace", fontSize:8, color:"#3a4f64", padding:"4px 12px" }}>
              {lastUpload || (workers.length > 0 ? `${workers.length} workers in database` : "No workers uploaded yet")}
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div style={S.main}>
          {view === "dash" && (
            <>
              <div style={S.dayTabs}>
                {DAYS.map((d,i) => <button key={d} style={S.dayTab(dayIdx===i)} onClick={() => setDayIdx(i)}>{d}</button>)}
              </div>
              <div style={S.mainHdr}>
                <div>
                  <div style={{ fontSize:13 }}>Occupancy heatmap — all rooms</div>
                  <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginTop:2 }}>
                    {DAY_FULL[dayIdx].toUpperCase()} · {activeSite?.name?.toUpperCase() || "NO SITE"} · 24H VIEW
                  </div>
                </div>
                <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64" }}>
                  {siteRooms.length} rooms · {totalCap} workstations · {siteWorkers.length} workers
                </div>
              </div>
              <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
                <Heatmap workers={siteWorkers} rooms={siteRooms} dayIdx={dayIdx} />
              </div>
              <div style={S.statsBar}>
                {[
                  ["Peak hour", `${peakPct}%`, `${String(peakHour).padStart(2,"0")}:00 — ${peakTotal} workers`],
                  ["Workstations", `${totalCap}`, `across ${siteRooms.length} rooms`],
                  ["On shift now", `${onShiftNow}`, `of ${siteWorkers.length} total`],
                  ["Overflow rooms", `${overflowRooms.length}`, overflowRooms.length ? overflowRooms.map(r=>r.name.split("—")[0].trim()).join(", ") : "None — all clear"],
                ].map(([lbl,val,sub],i) => (
                  <div key={lbl} style={S.statCard}>
                    <div style={S.statLbl}>{lbl}</div>
                    <div style={{ ...S.statVal, color:i===3&&overflowRooms.length?"#e06060":"#ddd8cc" }}>{val}</div>
                    <div style={{ ...S.statSub, color:i===3&&overflowRooms.length?"#e06060":"#5a7090" }}>{sub}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {view === "setup" && <SetupView sites={sites} rooms={rooms} onAddSite={handleAddSite} onAddRoom={handleAddRoom} onDeleteRoom={handleDeleteRoom} saving={saving} />}
          {view === "upload" && <UploadView rooms={rooms} onUpload={handleUpload} lastUpload={lastUpload} saving={saving} />}
        </div>
      </div>
    </div>
  );
}