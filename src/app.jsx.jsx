import { useState, useEffect, useRef, useCallback } from "react";

// ─── Utilities ────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
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
  if (start < end) {
    return start < slotEnd && end > slotStart;
  } else {
    // midnight crossing
    return start < slotEnd || end > slotStart;
  }
}

function computeOccupancy(workers, rooms, dayIdx) {
  const result = {};
  rooms.forEach(room => {
    result[room.id] = {};
    HOURS.forEach(h => {
      const count = workers.filter(w => w.room_id === room.id && workerOnDuty(w, h, dayIdx)).length;
      result[room.id][h] = count;
    });
  });
  return result;
}

function cellColor(count, capacity) {
  if (count === 0) return "#0d1b26";
  const pct = count / capacity;
  if (pct <= 0.25) return "#0a3d2e";
  if (pct <= 0.50) return "#0f6e56";
  if (pct <= 0.70) return "#1d9e75";
  if (pct <= 0.85) return "#b07d10";
  if (pct < 1.00)  return "#c05510";
  return "#9b2020";
}

function pct(count, cap) {
  return Math.round((count / cap) * 100);
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: "File is empty or has no data rows." };
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const required = ["employee_id", "full_name", "room_id", "shift_start", "shift_end", "days_off"];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length) return { error: `Missing required columns: ${missing.join(", ")}` };
  const workers = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map(v => v.trim());
    if (vals.length < required.length) { errors.push(`Row ${i + 1}: too few columns`); continue; }
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
    if (!row.employee_id) { errors.push(`Row ${i + 1}: missing employee_id`); continue; }
    if (!row.shift_start.match(/^\d{1,2}:\d{2}$/) || !row.shift_end.match(/^\d{1,2}:\d{2}$/)) {
      errors.push(`Row ${i + 1}: invalid shift time format (use HH:MM)`); continue;
    }
    workers.push({ ...row, _id: uid() });
  }
  return { workers, errors };
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED_SITES = [
  { id: "site1", name: "Kampala HQ", address: "Plot 45, Nakasero Hill" },
];
const SEED_ROOMS = [
  { id: "r1", siteId: "site1", floor: "1", name: "Room 101 — Inbound A", capacity: 12 },
  { id: "r2", siteId: "site1", floor: "1", name: "Room 102 — Inbound B", capacity: 18 },
  { id: "r3", siteId: "site1", floor: "1", name: "Room 103 — Outbound", capacity: 10 },
  { id: "r4", siteId: "site1", floor: "2", name: "Room 201 — Tech Support", capacity: 8 },
  { id: "r5", siteId: "site1", floor: "2", name: "Room 202 — Back Office", capacity: 15 },
];
const SEED_WORKERS = [
  { _id:"w1",  employee_id:"E001", full_name:"Alice Nakato",    room_id:"r1", shift_start:"06:00", shift_end:"14:00", days_off:"Sun" },
  { _id:"w2",  employee_id:"E002", full_name:"Brian Ouma",      room_id:"r1", shift_start:"07:00", shift_end:"15:00", days_off:"Sat,Sun" },
  { _id:"w3",  employee_id:"E003", full_name:"Carol Apio",      room_id:"r1", shift_start:"14:00", shift_end:"22:00", days_off:"Sun" },
  { _id:"w4",  employee_id:"E004", full_name:"David Ssali",     room_id:"r1", shift_start:"22:00", shift_end:"06:00", days_off:"Sat" },
  { _id:"w5",  employee_id:"E005", full_name:"Eve Nambi",       room_id:"r1", shift_start:"09:00", shift_end:"17:00", days_off:"Sat,Sun" },
  { _id:"w6",  employee_id:"E006", full_name:"Frank Okello",    room_id:"r1", shift_start:"10:00", shift_end:"18:00", days_off:"Sun" },
  { _id:"w7",  employee_id:"E007", full_name:"Grace Atim",      room_id:"r2", shift_start:"06:00", shift_end:"14:00", days_off:"Sat,Sun" },
  { _id:"w8",  employee_id:"E008", full_name:"Henry Mugisha",   room_id:"r2", shift_start:"08:00", shift_end:"16:00", days_off:"Sun" },
  { _id:"w9",  employee_id:"E009", full_name:"Irene Tendo",     room_id:"r2", shift_start:"14:00", shift_end:"22:00", days_off:"Sat,Sun" },
  { _id:"w10", employee_id:"E010", full_name:"James Kasozi",    room_id:"r2", shift_start:"22:00", shift_end:"06:00", days_off:"Mon" },
  { _id:"w11", employee_id:"E011", full_name:"Kate Nalwoga",    room_id:"r2", shift_start:"11:00", shift_end:"19:00", days_off:"Sun" },
  { _id:"w12", employee_id:"E012", full_name:"Leo Byamugisha",  room_id:"r2", shift_start:"07:30", shift_end:"15:30", days_off:"Sat,Sun" },
  { _id:"w13", employee_id:"E013", full_name:"Mary Namutebi",   room_id:"r3", shift_start:"08:00", shift_end:"16:00", days_off:"Sat,Sun" },
  { _id:"w14", employee_id:"E014", full_name:"Nelson Kato",     room_id:"r3", shift_start:"16:00", shift_end:"00:00", days_off:"Sun" },
  { _id:"w15", employee_id:"E015", full_name:"Olive Namukasa",  room_id:"r3", shift_start:"00:00", shift_end:"08:00", days_off:"Sat" },
  { _id:"w16", employee_id:"E016", full_name:"Peter Musisi",    room_id:"r4", shift_start:"09:00", shift_end:"17:00", days_off:"Sat,Sun" },
  { _id:"w17", employee_id:"E017", full_name:"Queen Nantume",   room_id:"r4", shift_start:"13:00", shift_end:"21:00", days_off:"Sun" },
  { _id:"w18", employee_id:"E018", full_name:"Robert Waiswa",   room_id:"r4", shift_start:"21:00", shift_end:"05:00", days_off:"Sat,Sun" },
  { _id:"w19", employee_id:"E019", full_name:"Sarah Nalugo",    room_id:"r5", shift_start:"08:00", shift_end:"16:00", days_off:"Sat,Sun" },
  { _id:"w20", employee_id:"E020", full_name:"Tom Kibuuka",     room_id:"r5", shift_start:"10:00", shift_end:"18:00", days_off:"Sun" },
  { _id:"w21", employee_id:"E021", full_name:"Umar Ssenteza",   room_id:"r5", shift_start:"06:00", shift_end:"14:00", days_off:"Sat,Sun" },
  { _id:"w22", employee_id:"E022", full_name:"Vivian Najjemba", room_id:"r5", shift_start:"14:00", shift_end:"22:00", days_off:"Sun" },
  { _id:"w23", employee_id:"E023", full_name:"Walter Nkuutu",   room_id:"r5", shift_start:"22:00", shift_end:"06:00", days_off:"Mon" },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  app: {
    fontFamily: "'Georgia', serif",
    background: "#0b1520",
    minHeight: "100vh",
    color: "#ddd8cc",
    display: "flex",
    flexDirection: "column",
  },
  topbar: {
    background: "#111e2d",
    borderBottom: "1px solid #1e3048",
    padding: "0 20px",
    display: "flex",
    alignItems: "center",
    gap: 16,
    height: 52,
    flexShrink: 0,
  },
  brandBox: {
    width: 28, height: 28,
    background: "#e8a020",
    borderRadius: 5,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 3, padding: 6,
  },
  brandDot: { background: "#0b1520", borderRadius: 1 },
  brandName: {
    fontFamily: "'Courier New', monospace",
    fontSize: 13, letterSpacing: 2,
    color: "#ddd8cc", fontWeight: "normal",
  },
  brandAccent: { color: "#e8a020" },
  siteSel: {
    display: "flex", alignItems: "center", gap: 6,
    background: "#162232", border: "1px solid #1e3048",
    borderRadius: 5, padding: "4px 10px",
    fontFamily: "'Courier New', monospace",
    fontSize: 11, color: "#8a9ab0", cursor: "pointer",
  },
  siteDot: { width: 6, height: 6, borderRadius: "50%", background: "#1d9e75" },
  navArea: { display: "flex", gap: 2, marginLeft: "auto" },
  navBtn: (active) => ({
    background: active ? "#1e3048" : "none",
    border: active ? "1px solid #a06e12" : "1px solid transparent",
    color: active ? "#e8a020" : "#8a9ab0",
    fontFamily: "'Courier New', monospace",
    fontSize: 10, letterSpacing: 1,
    padding: "5px 14px", borderRadius: 4,
    cursor: "pointer",
  }),
  body: { display: "flex", flex: 1, overflow: "hidden", height: "calc(100vh - 52px)" },
  sidebar: {
    width: 210, background: "#111e2d",
    borderRight: "1px solid #1e3048",
    flexShrink: 0, display: "flex",
    flexDirection: "column", overflowY: "auto",
  },
  sbSec: { padding: "12px 0", borderBottom: "1px solid #1e3048" },
  sbLabel: {
    fontFamily: "'Courier New', monospace",
    fontSize: 8, letterSpacing: 2,
    color: "#3a4f64", padding: "0 12px 6px",
    textTransform: "uppercase",
  },
  floorHdr: {
    fontFamily: "'Courier New', monospace",
    fontSize: 10, color: "#e8a020",
    padding: "4px 12px", letterSpacing: 1,
  },
  roomRow: (active, overflow) => ({
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 12px 4px 22px",
    fontSize: 11, cursor: "pointer",
    borderLeft: `2px solid ${overflow ? "#9b2020" : active ? "#e8a020" : "transparent"}`,
    background: active ? "#1a2d40" : "transparent",
    color: active ? "#ddd8cc" : "#7a8fa6",
  }),
  rcap: (overflow) => ({
    fontFamily: "'Courier New', monospace",
    fontSize: 9,
    color: overflow ? "#e06060" : "#3a4f64",
    background: "#0b1520",
    padding: "1px 4px", borderRadius: 2,
  }),
  warnBadge: {
    fontFamily: "'Courier New', monospace",
    fontSize: 8, color: "#e06060",
    background: "rgba(155,32,32,0.2)",
    padding: "1px 4px", borderRadius: 2, marginRight: 4,
  },
  uploadZone: {
    margin: "10px 12px",
    border: "1px dashed #1e3048",
    borderRadius: 5, padding: "10px 8px",
    textAlign: "center", cursor: "pointer",
  },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  dayTabs: {
    display: "flex", background: "#111e2d",
    borderBottom: "1px solid #1e3048", flexShrink: 0,
  },
  dayTab: (active) => ({
    flex: 1, textAlign: "center",
    fontFamily: "'Courier New', monospace",
    fontSize: 10, letterSpacing: 1,
    color: active ? "#e8a020" : "#4a5f74",
    padding: "8px 4px", cursor: "pointer",
    borderBottom: active ? "2px solid #e8a020" : "2px solid transparent",
    background: "none", border: "none",
    borderBottom: active ? "2px solid #e8a020" : "2px solid transparent",
  }),
  mainHdr: {
    padding: "10px 18px",
    borderBottom: "1px solid #1e3048",
    display: "flex", alignItems: "center",
    justifyContent: "space-between", flexShrink: 0,
    background: "#0e1a28",
  },
  overflowBanner: {
    background: "rgba(155,32,32,0.12)",
    borderBottom: "1px solid rgba(155,32,32,0.3)",
    padding: "6px 18px",
    display: "flex", alignItems: "center", gap: 8,
    flexShrink: 0,
  },
  heatmapWrap: { flex: 1, overflowY: "auto", overflowX: "auto", padding: "12px 18px" },
  statsBar: {
    display: "flex", gap: 1,
    background: "#1e3048",
    borderTop: "1px solid #1e3048", flexShrink: 0,
  },
  statCard: {
    flex: 1, background: "#111e2d",
    padding: "10px 14px",
  },
  statLbl: {
    fontFamily: "'Courier New', monospace",
    fontSize: 8, letterSpacing: 1.5,
    color: "#3a4f64", textTransform: "uppercase", marginBottom: 3,
  },
  statVal: {
    fontFamily: "'Courier New', monospace",
    fontSize: 20, color: "#ddd8cc",
  },
  statSub: { fontSize: 10, color: "#5a7090", marginTop: 1 },
  setupWrap: { flex: 1, overflowY: "auto", padding: 18 },
  card: {
    background: "#111e2d",
    border: "1px solid #1e3048",
    borderRadius: 8, padding: 16, marginBottom: 14,
  },
  cardTitle: {
    fontFamily: "'Courier New', monospace",
    fontSize: 9, letterSpacing: 2,
    color: "#e8a020", textTransform: "uppercase",
    marginBottom: 12, paddingBottom: 8,
    borderBottom: "1px solid #1e3048",
  },
  flbl: {
    fontFamily: "'Courier New', monospace",
    fontSize: 9, color: "#5a7090", marginBottom: 3,
  },
  finput: {
    width: "100%", background: "#0b1520",
    border: "1px solid #1e3048",
    borderRadius: 4, color: "#ddd8cc",
    fontFamily: "'Courier New', monospace",
    fontSize: 11, padding: "5px 8px",
    outline: "none", boxSizing: "border-box",
  },
  fbtn: (variant="primary") => ({
    background: variant === "primary" ? "#e8a020" : "none",
    color: variant === "primary" ? "#0b1520" : "#1d9e75",
    border: variant === "primary" ? "none" : "1px solid #0f6e56",
    borderRadius: 4,
    fontFamily: "'Courier New', monospace",
    fontSize: 10, fontWeight: "700",
    padding: "6px 14px", cursor: "pointer",
    letterSpacing: 1,
  }),
  csvCol: {
    fontFamily: "'Courier New', monospace",
    fontSize: 10, color: "#1d9e75",
    background: "rgba(29,158,117,0.1)",
    padding: "2px 6px", borderRadius: 3,
    minWidth: 130, flexShrink: 0,
  },
  badge: (type) => ({
    fontFamily: "'Courier New', monospace",
    fontSize: 8, marginLeft: "auto", flexShrink: 0,
    padding: "1px 5px", borderRadius: 3,
    color: type === "req" ? "#e06060" : "#1d9e75",
    background: type === "req" ? "rgba(155,32,32,0.15)" : "rgba(29,158,117,0.1)",
  }),
};

// ─── Components ───────────────────────────────────────────────────────────────

function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={e => { setShow(true); setPos({ x: e.clientX, y: e.clientY }); }}
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{
          position: "fixed", left: pos.x + 12, top: pos.y - 30,
          background: "#0b1520", border: "1px solid #2a4060",
          borderRadius: 4, padding: "4px 8px",
          fontFamily: "'Courier New', monospace",
          fontSize: 10, color: "#ddd8cc",
          pointerEvents: "none", zIndex: 9999, whiteSpace: "nowrap",
        }}>{text}</div>
      )}
    </div>
  );
}

function Heatmap({ workers, rooms, dayIdx }) {
  const occupancy = computeOccupancy(workers, rooms, dayIdx);
  const CELL_W = Math.max(44, Math.min(70, Math.floor((680 - 48) / rooms.length)));
  const CELL_H = 18;

  const overflowRooms = rooms.filter(r =>
    HOURS.some(h => (occupancy[r.id]?.[h] || 0) > r.capacity)
  );

  return (
    <div>
      {overflowRooms.length > 0 && (
        <div style={S.overflowBanner}>
          <div style={{ width:14, height:14, borderRadius:"50%", background:"#9b2020", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Courier New',monospace", fontSize:9, color:"#fff", flexShrink:0 }}>!</div>
          <div style={{ fontFamily:"'Courier New',monospace", fontSize:10, color:"#e06060" }}>
            Overflow: {overflowRooms.map(r => r.name).join(", ")} — workers exceed workstation capacity
          </div>
        </div>
      )}
      <div style={S.heatmapWrap}>
        {/* Room headers */}
        <div style={{ display:"flex", alignItems:"flex-end", marginBottom:6 }}>
          <div style={{ width:48, flexShrink:0 }} />
          {rooms.map(r => {
            const hasOv = HOURS.some(h => (occupancy[r.id]?.[h] || 0) > r.capacity);
            return (
              <div key={r.id} style={{ width:CELL_W, fontFamily:"'Courier New',monospace", fontSize:7, color: hasOv ? "#e06060" : "#6a8aaa", textAlign:"center", lineHeight:1.3 }}>
                {r.name.split("—")[0].trim()}<br />
                <span style={{ color: hasOv ? "#e06060" : "#3a4f64", fontSize:6 }}>{r.capacity}ws</span>
              </div>
            );
          })}
        </div>

        {/* Hour rows */}
        {HOURS.map(h => (
          <div key={h} style={{ display:"flex", alignItems:"center", marginBottom:1 }}>
            <div style={{ width:48, flexShrink:0, fontFamily:"'Courier New',monospace", fontSize:8, color:"#3a4f64", textAlign:"right", paddingRight:6 }}>
              {String(h).padStart(2,"0")}:00
            </div>
            {rooms.map(r => {
              const count = occupancy[r.id]?.[h] || 0;
              const bg = cellColor(count, r.capacity);
              const overflow = count > r.capacity;
              return (
                <Tooltip key={r.id} text={`${r.name} · ${String(h).padStart(2,"0")}:00 — ${count}/${r.capacity} workers (${pct(count, r.capacity)}%)${overflow ? " ⚠ OVERFLOW" : ""}`}>
                  <div style={{
                    width: CELL_W, height: CELL_H,
                    background: bg, borderRadius: 2,
                    cursor: "pointer", marginRight: 1,
                    outline: overflow ? "1px solid #9b2020" : "none",
                    transition: "filter 0.1s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.4)"}
                    onMouseLeave={e => e.currentTarget.style.filter = "brightness(1)"}
                  />
                </Tooltip>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:12, paddingTop:10, borderTop:"1px solid #1e3048", flexWrap:"wrap" }}>
          <span style={{ fontFamily:"'Courier New',monospace", fontSize:8, color:"#3a4f64", marginRight:4 }}>occupancy:</span>
          {[
            { c:"#0d1b26", l:"Empty" },
            { c:"#0a3d2e", l:"<25%" },
            { c:"#0f6e56", l:"25–50%" },
            { c:"#1d9e75", l:"50–70%" },
            { c:"#b07d10", l:"70–85%" },
            { c:"#c05510", l:"85–99%" },
            { c:"#9b2020", l:"Overflow" },
          ].map(g => (
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

function SetupView({ sites, rooms, onAddSite, onAddRoom, onDeleteRoom }) {
  const [siteName, setSiteName] = useState("");
  const [siteAddr, setSiteAddr] = useState("");
  const [siteFloors, setSiteFloors] = useState("2");
  const [selSite, setSelSite] = useState(sites[0]?.id || "");
  const [selFloor, setSelFloor] = useState("1");
  const [roomName, setRoomName] = useState("");
  const [roomCap, setRoomCap] = useState("");

  const site = sites.find(s => s.id === selSite);
  const floors = site ? Array.from({ length: parseInt(site.floors) || 2 }, (_, i) => String(i + 1)) : ["1", "2"];

  const handleAddSite = () => {
    if (!siteName.trim()) return;
    onAddSite({ id: uid(), name: siteName.trim(), address: siteAddr.trim(), floors: siteFloors });
    setSiteName(""); setSiteAddr(""); setSiteFloors("2");
  };

  const handleAddRoom = () => {
    if (!roomName.trim() || !roomCap || !selSite) return;
    onAddRoom({ id: uid(), siteId: selSite, floor: selFloor, name: roomName.trim(), capacity: parseInt(roomCap) });
    setRoomName(""); setRoomCap("");
  };

  const siteRooms = rooms.filter(r => r.siteId === selSite);
  const floorGroups = floors.reduce((acc, f) => {
    acc[f] = siteRooms.filter(r => r.floor === f);
    return acc;
  }, {});

  return (
    <div style={S.setupWrap}>
      <div style={{ fontSize:14, marginBottom:4 }}>Room configuration</div>
      <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginBottom:16 }}>Define office sites, floors, and rooms with workstation capacity</div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        {/* Add site */}
        <div style={S.card}>
          <div style={S.cardTitle}>Add office site</div>
          {[["Site name","text",siteName,setSiteName,"e.g. Kampala HQ"],
            ["Location / address","text",siteAddr,setSiteAddr,"e.g. Plot 45, Nakasero"],
            ["Number of floors","number",siteFloors,setSiteFloors,"2"]].map(([lbl,type,val,set,ph]) => (
            <div key={lbl} style={{ marginBottom:8 }}>
              <div style={S.flbl}>{lbl}</div>
              <input style={S.finput} type={type} value={val} placeholder={ph} onChange={e => set(e.target.value)} />
            </div>
          ))}
          <button style={S.fbtn()} onClick={handleAddSite}>Add site</button>
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
            <button style={S.fbtn()} onClick={handleAddRoom}>Add</button>
          </div>
        </div>
      </div>

      {/* Site selector for room list */}
      <div style={{ marginBottom:8 }}>
        <div style={S.flbl}>Viewing rooms for site:</div>
        <select style={{ ...S.finput, width:"auto", minWidth:200 }} value={selSite} onChange={e => setSelSite(e.target.value)}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>{site?.name || "Site"} — rooms by floor</div>
        {floors.map(f => (
          <div key={f} style={{ marginBottom:12 }}>
            <div style={{ fontFamily:"'Courier New',monospace", fontSize:8, color:"#3a4f64", letterSpacing:1, padding:"4px 0", borderBottom:"1px solid #1e3048", marginBottom:4 }}>FLOOR {f}</div>
            {(floorGroups[f] || []).length === 0 && (
              <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", padding:"4px 0" }}>No rooms on this floor yet</div>
            )}
            {(floorGroups[f] || []).map(r => (
              <div key={r.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #162232", fontSize:11 }}>
                <span style={{ color:"#ddd8cc" }}>{r.name}</span>
                <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#5a7090" }}>{r.capacity} workstations</span>
                  <button onClick={() => onDeleteRoom(r.id)} style={{ background:"none", border:"none", color:"#9b2020", cursor:"pointer", fontSize:13, opacity:0.6, lineHeight:1 }}
                    onMouseEnter={e => e.currentTarget.style.opacity=1}
                    onMouseLeave={e => e.currentTarget.style.opacity=0.6}>×</button>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadView({ onUpload, lastUpload }) {
  const fileRef = useRef();
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const parsed = parseCSV(e.target.result);
      setResult(parsed);
      if (parsed.workers) onUpload(parsed.workers, file.name);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const header = "employee_id,full_name,room_id,shift_start,shift_end,days_off,site_id,department,employment_type";
    const sample = [
      "EMP001,Alice Nakato,Room_101,06:00,14:00,Sat,Sun,Kampala_HQ,Inbound,Full-time",
      "EMP002,Brian Ouma,Room_101,14:00,22:00,Sun,Kampala_HQ,Outbound,Full-time",
      "EMP003,Carol Apio,Room_201,22:00,06:00,Mon,Kampala_HQ,Tech Support,Contract",
    ];
    const blob = new Blob([[header, ...sample].join("\n")], { type:"text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "occutrack_template.csv";
    a.click();
  };

  const CSV_FIELDS = [
    ["employee_id","Unique ID per worker, e.g. EMP001","req"],
    ["full_name","Worker's full name","req"],
    ["room_id","Assigned room — must match a room ID in setup","req"],
    ["shift_start","Shift start in 24h format, e.g. 08:00 or 22:00","req"],
    ["shift_end","Shift end in 24h format. If end < start, shift crosses midnight","req"],
    ["days_off","Comma-separated off days, e.g. Sat,Sun or Wed","req"],
    ["site_id","Office site for multi-site filtering","opt"],
    ["department","Department for grouping, e.g. Inbound","opt"],
    ["employment_type","Full-time, Part-time, Contract etc.","opt"],
  ];

  return (
    <div style={{ ...S.setupWrap }}>
      <div style={{ fontSize:14, marginBottom:4 }}>Upload worker roster</div>
      <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginBottom:14 }}>Upload a CSV file containing your worker schedule. All required columns must be present.</div>

      {result && (
        <div style={{ background: result.error ? "rgba(155,32,32,0.1)" : "rgba(29,158,117,0.1)", border:`1px solid ${result.error ? "#9b2020" : "#0f6e56"}`, borderRadius:6, padding:"10px 14px", marginBottom:14, fontFamily:"'Courier New',monospace", fontSize:10 }}>
          {result.error
            ? <span style={{ color:"#e06060" }}>✗ {result.error}</span>
            : <>
                <span style={{ color:"#1d9e75" }}>✓ Loaded {result.workers.length} workers successfully</span>
                {result.errors?.length > 0 && <div style={{ color:"#e8a020", marginTop:4 }}>⚠ {result.errors.length} rows skipped: {result.errors[0]}</div>}
              </>
          }
        </div>
      )}

      {lastUpload && !result && (
        <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginBottom:14, padding:"6px 10px", background:"#111e2d", borderRadius:4 }}>
          Last upload: {lastUpload}
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardTitle}>Required CSV columns</div>
        {CSV_FIELDS.map(([col, desc, type]) => (
          <div key={col} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:8 }}>
            <div style={S.csvCol}>{col}</div>
            <div style={{ fontSize:11, color:"#7a8fa6", lineHeight:1.5, flex:1 }}>{desc}</div>
            <div style={S.badge(type)}>{type === "req" ? "required" : "optional"}</div>
          </div>
        ))}
        <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #1e3048" }}>
          <div style={{ fontFamily:"'Courier New',monospace", fontSize:8, letterSpacing:2, color:"#e8a020", textTransform:"uppercase", marginBottom:6 }}>Sample rows</div>
          {[
            "employee_id,full_name,room_id,shift_start,shift_end,days_off",
            "EMP001,Alice Nakato,r1,06:00,14:00,Sat,Sun",
            "EMP002,Brian Ouma,r1,22:00,06:00,Mon",
            "EMP003,Carol Apio,r4,11:30,19:30,Sun",
          ].map((row, i) => (
            <div key={i} style={{ fontFamily:"'Courier New',monospace", fontSize:9, color: i===0 ? "#1d9e75" : "#5a7090", background:"#0b1520", borderRadius:3, padding:"4px 8px", marginBottom:2 }}>{row}</div>
          ))}
        </div>
      </div>

      <div
        style={{ border:`2px dashed ${dragOver ? "#1d9e75" : "#1e3048"}`, borderRadius:8, padding:28, textAlign:"center", cursor:"pointer", marginBottom:12, background: dragOver ? "rgba(29,158,117,0.04)" : "transparent" }}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
      >
        <div style={{ fontSize:24, marginBottom:8 }}>↑</div>
        <div style={{ fontSize:13, color:"#7a8fa6" }}>Drop your CSV here or click to browse</div>
        <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginTop:4 }}>Accepts .csv · max 10 MB · UTF-8 encoding</div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />
      </div>

      <div style={{ display:"flex", gap:8 }}>
        <button style={S.fbtn("secondary")} onClick={downloadTemplate}>↓ Download CSV template</button>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState("dash");
  const [sites, setSites] = useState(() => JSON.parse(localStorage.getItem("ot_sites") || JSON.stringify(SEED_SITES)));
  const [rooms, setRooms] = useState(() => JSON.parse(localStorage.getItem("ot_rooms") || JSON.stringify(SEED_ROOMS)));
  const [workers, setWorkers] = useState(() => JSON.parse(localStorage.getItem("ot_workers") || JSON.stringify(SEED_WORKERS)));
  const [activeSiteIdx, setActiveSiteIdx] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);
  const [lastUpload, setLastUpload] = useState("");

  useEffect(() => { localStorage.setItem("ot_sites", JSON.stringify(sites)); }, [sites]);
  useEffect(() => { localStorage.setItem("ot_rooms", JSON.stringify(rooms)); }, [rooms]);
  useEffect(() => { localStorage.setItem("ot_workers", JSON.stringify(workers)); }, [workers]);

  const activeSite = sites[activeSiteIdx] || sites[0];
  const siteRooms = rooms.filter(r => r.siteId === activeSite?.id).sort((a,b) => a.floor.localeCompare(b.floor) || a.name.localeCompare(b.name));
  const siteWorkers = workers.filter(w => siteRooms.some(r => r.id === w.room_id));

  const occupancy = computeOccupancy(siteWorkers, siteRooms, dayIdx);

  // Stats
  const peakHour = HOURS.reduce((best, h) => {
    const total = siteRooms.reduce((s, r) => s + (occupancy[r.id]?.[h] || 0), 0);
    const bestTotal = siteRooms.reduce((s, r) => s + (occupancy[r.id]?.[best] || 0), 0);
    return total > bestTotal ? h : best;
  }, 0);
  const peakTotal = siteRooms.reduce((s, r) => s + (occupancy[r.id]?.[peakHour] || 0), 0);
  const totalCap = siteRooms.reduce((s, r) => s + r.capacity, 0);
  const peakPct = totalCap ? Math.round((peakTotal / totalCap) * 100) : 0;
  const overflowRooms = siteRooms.filter(r => HOURS.some(h => (occupancy[r.id]?.[h] || 0) > r.capacity));
  const onShiftNow = siteRooms.reduce((s, r) => s + (occupancy[r.id]?.[new Date().getHours()] || 0), 0);

  const floorGroups = siteRooms.reduce((acc, r) => {
    if (!acc[r.floor]) acc[r.floor] = [];
    acc[r.floor].push(r);
    return acc;
  }, {});

  return (
    <div style={S.app}>
      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={S.brandBox}><div style={S.brandDot}/><div style={S.brandDot}/><div style={S.brandDot}/><div style={S.brandDot}/></div>
          <div style={S.brandName}>OCCU<span style={S.brandAccent}>TRACK</span></div>
        </div>

        {/* Site switcher */}
        <div style={S.siteSel} onClick={() => setActiveSiteIdx((activeSiteIdx + 1) % sites.length)}>
          <div style={S.siteDot} />
          {activeSite?.name || "No site"} ▾
        </div>

        <div style={S.navArea}>
          {["dash","setup","upload"].map((v, i) => (
            <button key={v} style={S.navBtn(view===v)} onClick={() => setView(v)}>
              {["Dashboard","Room setup","Upload roster"][i]}
            </button>
          ))}
        </div>
      </div>

      {/* BODY */}
      <div style={S.body}>
        {/* SIDEBAR — always visible */}
        <div style={S.sidebar}>
          <div style={S.sbSec}>
            <div style={S.sbLabel}>Floors & rooms</div>
            {Object.keys(floorGroups).sort().map(floor => (
              <div key={floor}>
                <div style={S.floorHdr}>▾ Floor {floor}</div>
                {floorGroups[floor].map(r => {
                  const hasOv = HOURS.some(h => (occupancy[r.id]?.[h] || 0) > r.capacity);
                  return (
                    <div key={r.id} style={S.roomRow(false, hasOv)}>
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
              {lastUpload || `${workers.length} workers loaded (sample data)`}
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={S.main}>
          {view === "dash" && (
            <>
              {/* Day tabs */}
              <div style={S.dayTabs}>
                {DAYS.map((d, i) => (
                  <button key={d} style={S.dayTab(dayIdx===i)} onClick={() => setDayIdx(i)}>{d}</button>
                ))}
              </div>

              {/* Header */}
              <div style={S.mainHdr}>
                <div>
                  <div style={{ fontSize:13 }}>Occupancy heatmap — all rooms</div>
                  <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64", marginTop:2 }}>
                    {DAY_FULL[dayIdx].toUpperCase()} · {activeSite?.name?.toUpperCase()} · 24H VIEW
                  </div>
                </div>
                <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, color:"#3a4f64" }}>
                  {siteRooms.length} rooms · {totalCap} workstations · {siteWorkers.length} workers
                </div>
              </div>

              {/* Heatmap */}
              <div style={{ flex:1, overflowY:"auto" }}>
                <Heatmap workers={siteWorkers} rooms={siteRooms} dayIdx={dayIdx} />
              </div>

              {/* Stats */}
              <div style={S.statsBar}>
                {[
                  ["Peak hour", `${peakPct}%`, `${String(peakHour).padStart(2,"0")}:00 — ${peakTotal} workers`],
                  ["Workstations", `${totalCap}`, `across ${siteRooms.length} rooms`],
                  ["On shift now", `${onShiftNow}`, `of ${siteWorkers.length} total roster`],
                  ["Overflow rooms", `${overflowRooms.length}`, overflowRooms.length ? overflowRooms.map(r=>r.name.split("—")[0].trim()).join(", ") : "None — all clear"],
                ].map(([lbl, val, sub], i) => (
                  <div key={lbl} style={S.statCard}>
                    <div style={S.statLbl}>{lbl}</div>
                    <div style={{ ...S.statVal, color: i===3 && overflowRooms.length ? "#e06060" : "#ddd8cc" }}>{val}</div>
                    <div style={{ ...S.statSub, color: i===3 && overflowRooms.length ? "#e06060" : "#5a7090" }}>{sub}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {view === "setup" && (
            <SetupView
              sites={sites} rooms={rooms}
              onAddSite={s => setSites(prev => [...prev, s])}
              onAddRoom={r => setRooms(prev => [...prev, r])}
              onDeleteRoom={id => setRooms(prev => prev.filter(r => r.id !== id))}
            />
          )}

          {view === "upload" && (
            <UploadView
              onUpload={(w, name) => {
                setWorkers(w);
                setLastUpload(`${name} · ${w.length} workers · ${new Date().toLocaleTimeString()}`);
              }}
              lastUpload={lastUpload}
            />
          )}
        </div>
      </div>
    </div>
  );
}
