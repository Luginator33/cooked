import { useState, useEffect } from "react";
import { ARCHETYPES } from "../data/restaurants";

const C = { cream:"#faf6f0", parchment:"#ede4d3", terracotta:"#c4603a", text:"#1e1208", muted:"#8a7060", border:"#ddd0bc" };

export default function TasteResult({ quizData, swipeData, onDone }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { setTimeout(() => setRevealed(true), 500); }, []);

  const tags = { ...quizData?.tags };
  swipeData?.love?.forEach(r => {
    if (r.price === "$$$$") tags.upscale = (tags.upscale||0)+2;
    if (r.price === "$") tags.local = (tags.local||0)+2;
  });
  const dominant = Object.entries(tags).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const archetype = ARCHETYPES.find(a=>a.dominant===dominant)||ARCHETYPES[0];
  const max = Math.max(...Object.values(tags),1);
  const scores = Object.fromEntries(Object.entries(tags).map(([k,v])=>[k,Math.max(1,Math.round((v/max)*10))]));

  return (
    <div style={{ minHeight:"100vh", fontFamily:"'DM Sans',sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,700;1,700&family=DM+Sans:wght@400;500&family=DM+Mono:wght@400&display=swap');`}</style>
      <div style={{ position:"relative", overflow:"hidden", minHeight:"52vh", display:"flex", flexDirection:"column", justifyContent:"flex-end", padding:"32px 24px" }}>
        <img src="https://picsum.photos/seed/result/800/600" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} alt="" />
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(30,18,8,0.3) 0%, rgba(30,18,8,0.92) 100%)" }} />
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"rgba(255,255,255,0.5)", letterSpacing:"2px", marginBottom:12 }}>YOUR TASTE PROFILE</div>
          <div style={{ fontSize:52, marginBottom:10 }}>{archetype.emoji}</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:44, fontWeight:700, fontStyle:"italic", color:archetype.color, lineHeight:1.05, marginBottom:10 }}>{archetype.label}</div>
          <div style={{ fontSize:15, color:"rgba(255,255,255,0.75)", lineHeight:1.65 }}>{archetype.desc}</div>
        </div>
      </div>
      <div style={{ background:C.cream, padding:"28px 22px 40px", flex:1 }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.muted, letterSpacing:"2px", marginBottom:16 }}>TASTE DNA</div>
        {Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([k,v],i) => (
          <div key={k} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.muted, width:80, textTransform:"uppercase", letterSpacing:"0.5px" }}>{k}</div>
            <div style={{ flex:1, height:5, background:C.parchment, borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", background:C.terracotta, borderRadius:3, width: revealed ? `${v*10}%` : "0%", transition:`width 1.1s cubic-bezier(0.4,0,0.2,1) ${i*0.1}s` }} />
            </div>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:C.terracotta, width:20, textAlign:"right" }}>{v}</div>
          </div>
        ))}
        <button onClick={onDone} style={{ width:"100%", padding:16, border:"none", borderRadius:14, background:C.terracotta, color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", marginTop:24, fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 20px rgba(196,96,58,0.3)" }}>
          Start discovering →
        </button>
      </div>
    </div>
  );
}
