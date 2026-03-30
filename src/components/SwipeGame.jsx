import { useState } from "react";
import { RESTAURANTS } from "../data/restaurants";

const C = { bark:"rgba(255,255,255,0.04)", terra2:"#e07850", cream:"#f5f0eb", sage:"#6b8f71", terracotta:"#ff9632", bg:"#0a0a0f", text:"#f5f0eb" };
const THRESHOLD = 75;

export default function SwipeGame({ onDone }) {
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState({ love:[], nope:[], maybe:[] });
  const [history, setHistory] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x:0, y:0 });
  const [startPos, setStartPos] = useState({ x:0, y:0 });
  const [exitAnim, setExitAnim] = useState(null);
  const [done, setDone] = useState(false);

  const card = RESTAURANTS[current];
  const nextCard = RESTAURANTS[current + 1];
  const indicator = dragging ? (pos.x > 40 ? "love" : pos.x < -40 ? "nope" : pos.y < -40 ? "maybe" : null) : null;

  const triggerSwipe = (dir) => {
    if (current >= RESTAURANTS.length) return;
    setExitAnim(dir);
    const c = RESTAURANTS[current];
    setTimeout(() => {
      setResults(r => ({ ...r, [dir]: [...r[dir], c] }));
      setHistory(h => [...h, { id: c.id, dir }]);
      setPos({ x:0, y:0 });
      setExitAnim(null);
      const next = current + 1;
      setCurrent(next);
      if (next >= RESTAURANTS.length) setDone(true);
    }, 340);
  };

  const onDragStart = (e) => {
    const t = e.touches?.[0] || e;
    setStartPos({ x:t.clientX, y:t.clientY });
    setDragging(true);
  };
  const onDragMove = (e) => {
    if (!dragging) return;
    const t = e.touches?.[0] || e;
    setPos({ x: t.clientX - startPos.x, y: t.clientY - startPos.y });
  };
  const onDragEnd = () => {
    setDragging(false);
    if (pos.x > THRESHOLD) triggerSwipe("love");
    else if (pos.x < -THRESHOLD) triggerSwipe("nope");
    else if (pos.y < -THRESHOLD) triggerSwipe("maybe");
    else setPos({ x:0, y:0 });
  };

  const undo = () => {
    if (!history.length) return;
    const last = history[history.length - 1];
    setResults(r => ({ ...r, [last.dir]: r[last.dir].filter(c => c.id !== last.id) }));
    setHistory(h => h.slice(0, -1));
    setCurrent(s => s - 1);
    setDone(false);
  };

  const rotation = pos.x * 0.13;
  const cardStyle = exitAnim
    ? { transform: exitAnim==="love" ? "translateX(130%) rotate(22deg)" : exitAnim==="nope" ? "translateX(-130%) rotate(-22deg)" : "translateY(-130%)", transition:"transform 0.34s ease", opacity:0 }
    : dragging
    ? { transform:`translate(${pos.x}px,${pos.y}px) rotate(${rotation}deg)`, transition:"none" }
    : { transform:"translate(0,0) rotate(0deg)", transition:"transform 0.38s cubic-bezier(0.34,1.46,0.64,1)" };

  if (done) return (
    <div style={{ minHeight:"100vh", background:C.bark, padding:"28px 22px 48px", fontFamily:"'Inter', sans-serif", overflowY:"auto" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,700;1,700&family=DM+Sans:wght@400;500&family=DM+Mono:wght@400&display=swap');`}</style>
      <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:34, fontWeight:700, fontStyle:"italic", color:C.cream, marginBottom:4 }}>You've been around. 🍽️</div>
      <div style={{ fontSize:13, color:"rgba(255,255,255,0.45)", marginBottom:28 }}>Here's what we learned.</div>
      {[{key:"love",emoji:"♥",label:"You'd go back"},{key:"maybe",emoji:"🔖",label:"On the list"},{key:"nope",emoji:"✕",label:"Hard pass"}].map(({key,emoji,label}) => (
        <div key={key} style={{ marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, paddingBottom:8, borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize:18 }}>{emoji}</span>
            <span style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:18, fontWeight:700, color:C.cream }}>{label}</span>
            <span style={{ fontFamily:"'Inter', -apple-system, sans-serif", fontSize:11, color:"rgba(255,255,255,0.3)", marginLeft:"auto" }}>{results[key].length}</span>
          </div>
          {results[key].map(r => (
            <div key={r.id} style={{ display:"flex", gap:12, alignItems:"center", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              <img src={r.img2||r.img} style={{ width:58, height:58, borderRadius:10, objectFit:"cover", flexShrink:0 }} alt={r.name} />
              <div>
                <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:16, fontWeight:700, color:C.cream }}>{r.name}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontFamily:"'Inter', -apple-system, sans-serif", marginTop:2 }}>{r.cuisine} · {r.city}</div>
              </div>
              <div style={{ marginLeft:"auto", fontFamily:"'Inter', -apple-system, sans-serif", fontSize:14, color:C.terra2 }}>{r.rating}</div>
            </div>
          ))}
        </div>
      ))}
      <button onClick={() => onDone(results)} style={{ width:"100%", padding:16, border:"none", borderRadius:14, background:C.terracotta, color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"'Inter', sans-serif" }}>
        See my taste profile →
      </button>
    </div>
  );

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:C.bark, fontFamily:"'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,700;1,700&family=DM+Sans:wght@400;500&family=DM+Mono:wght@400&display=swap');`}</style>
      <div style={{ padding:"16px 20px 0", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:24, fontWeight:700, fontStyle:"italic", color:C.cream }}>cook<span style={{color:C.terra2}}>ed</span></div>
        <div style={{ display:"flex", gap:4 }}>
          {RESTAURANTS.map((_,i) => (
            <div key={i} style={{ width:5, height:5, borderRadius:"50%", background: i < current ? C.terra2 : i === current ? C.terra2 : "rgba(255,255,255,0.2)", transform: i === current ? "scale(1.5)" : "scale(1)", transition:"all 0.3s" }} />
          ))}
        </div>
        <button onClick={undo} disabled={!history.length} style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.2)", borderRadius:20, padding:"5px 12px", color:"rgba(255,255,255,0.5)", fontSize:11, fontFamily:"'Inter', -apple-system, sans-serif", cursor:"pointer", opacity: history.length ? 1 : 0.3 }}>↩ undo</button>
      </div>

      <div style={{ display:"flex", gap:8, justifyContent:"center", padding:"10px 0 6px", flexShrink:0 }}>
        {[{k:"love",c:C.sage,l:`♥ ${results.love.length}`},{k:"maybe",c:"#6b9fff",l:`🔖 ${results.maybe.length}`},{k:"nope",c:C.terracotta,l:`✕ ${results.nope.length}`}].map(({k,c,l}) => (
          <div key={k} style={{ padding:"4px 12px", borderRadius:20, fontFamily:"'Inter', -apple-system, sans-serif", fontSize:10, letterSpacing:"0.5px", border:`1px solid ${c}`, color:c }}>{l}</div>
        ))}
      </div>

      <div style={{ flex:1, position:"relative", padding:"0 14px", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
        {RESTAURANTS[current+2] && <div style={{ position:"absolute", width:"100%", maxWidth:480, height:"calc(100% - 40px)", bottom:2, borderRadius:24, background:"#3a2a18", transform:"scale(0.86) translateY(24px)", opacity:0.2 }} />}
        {nextCard && (
          <div style={{ position:"absolute", width:"100%", maxWidth:480, height:"calc(100% - 28px)", bottom:6, borderRadius:24, overflow:"hidden", transform:"scale(0.93) translateY(12px)", opacity:0.45 }}>
            <img src={nextCard.img} style={{ width:"100%", height:"100%", objectFit:"cover", opacity:0.5 }} alt="" />
          </div>
        )}
        {card && (
          <div className="glass-card-border" style={{ position:"absolute", width:"100%", maxWidth:480, height:"calc(100% - 4px)", borderRadius:24, overflow:"hidden", cursor:"grab", userSelect:"none", boxShadow:"0 24px 80px rgba(0,0,0,0.55)", touchAction:"none", ...cardStyle }}
            onMouseDown={onDragStart} onMouseMove={onDragMove} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}
            onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}>
            <img src={card.img} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", pointerEvents:"none" }} alt={card.name} draggable="false" />
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(0,0,0,0.05) 0%, transparent 30%, rgba(10,6,2,0.6) 65%, rgba(10,6,2,0.95) 100%)" }} />
            {indicator==="love" && <div style={{ position:"absolute", top:32, right:22, padding:"10px 18px", borderRadius:10, border:`4px solid ${C.sage}`, fontFamily:"'Playfair Display', Georgia, serif", fontSize:30, fontWeight:700, fontStyle:"italic", color:C.sage, transform:"rotate(10deg)" }}>LOVE IT</div>}
            {indicator==="nope" && <div style={{ position:"absolute", top:32, left:22, padding:"10px 18px", borderRadius:10, border:`4px solid ${C.terracotta}`, fontFamily:"'Playfair Display', Georgia, serif", fontSize:30, fontWeight:700, fontStyle:"italic", color:C.terracotta, transform:"rotate(-10deg)" }}>NOPE</div>}
            {indicator==="maybe" && <div style={{ position:"absolute", bottom:"52%", left:"50%", transform:"translateX(-50%) rotate(-4deg)", padding:"10px 18px", borderRadius:10, border:"4px solid #6b9fff", fontFamily:"'Playfair Display', Georgia, serif", fontSize:22, fontWeight:700, fontStyle:"italic", color:"#6b9fff" }}>HAVEN'T BEEN</div>}
            <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"18px 20px 22px" }}>
              <div style={{ fontFamily:"'Inter', -apple-system, sans-serif", fontSize:9, color:"rgba(255,255,255,0.45)", letterSpacing:"1.5px", marginBottom:8 }}>via {card.source}</div>
              <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:34, fontWeight:700, color:"#fff", lineHeight:1.05, marginBottom:4 }}>{card.name}</div>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
                <span style={{ fontSize:12, color:"rgba(255,255,255,0.65)" }}>{card.cuisine}</span>
                <span style={{ color:"rgba(255,255,255,0.25)" }}>·</span>
                <span style={{ fontFamily:"'Inter', -apple-system, sans-serif", fontSize:11, color:C.terra2 }}>{card.price}</span>
                <span style={{ color:"rgba(255,255,255,0.25)" }}>·</span>
                <span style={{ fontSize:12, color:"rgba(255,255,255,0.55)" }}>{card.city}</span>
              </div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.75)", lineHeight:1.5, marginBottom:12 }}>{card.desc}</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {card.tags.map(t => <span key={t} style={{ padding:"3px 10px", borderRadius:20, border:"1px solid rgba(255,255,255,0.06)", fontSize:10, color:"rgba(255,255,255,0.6)", fontFamily:"'Inter', -apple-system, sans-serif", background:"rgba(255,255,255,0.04)" }}>{t}</span>)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ flexShrink:0, display:"flex", justifyContent:"center", alignItems:"center", gap:14, padding:"14px 20px 28px" }}>
        <button className="glass-icon" onClick={()=>triggerSwipe("nope")} style={{ width:58, height:58, borderRadius:"50%", fontSize:22, cursor:"pointer", color:"rgba(196,96,58,0.9)" }}>✕</button>
        <button className="glass-icon" onClick={()=>triggerSwipe("maybe")} style={{ width:50, height:50, borderRadius:"50%", fontSize:17, cursor:"pointer" }}>🔖</button>
        <button onClick={()=>triggerSwipe("love")} style={{ width:72, height:72, borderRadius:"50%", border:"none", background:"linear-gradient(135deg, #ff9632, #e07850, #c44060)", fontSize:28, cursor:"pointer", boxShadow:"0 0 30px rgba(107,143,113,0.2)", color:"#fff" }}>♥</button>
      </div>
    </div>
  );
}
