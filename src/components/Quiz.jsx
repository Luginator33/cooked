import { useState } from "react";

const C = {
  cream: "#f5f0eb", warm: "#12121a", parchment: "#1a1a24",
  terracotta: "#ff9632", terra2: "#e07850", text: "#f5f0eb",
  muted: "rgba(245,240,235,0.3)", border: "rgba(255,255,255,0.06)", card: "rgba(255,220,180,0.02)",
  bg: "#0a0a0f",
};

const STEPS = [
  { id:"scene", type:"pick-one", question:"It's Friday night. Pick a scene.", options:[
    { label:"Dim candlelight, chef decides everything", emoji:"🕯️", img:"https://picsum.photos/seed/scene1/600/400", tags:{adventurous:3,upscale:2} },
    { label:"Loud trattoria, wine already on the table", emoji:"🍷", img:"https://picsum.photos/seed/scene2/600/400", tags:{social:3,cozy:1} },
    { label:"Counter seat watching the chef work", emoji:"👨‍🍳", img:"https://picsum.photos/seed/scene3/600/400", tags:{adventurous:2,upscale:1} },
    { label:"Hole-in-the-wall with the city's best tacos", emoji:"🌮", img:"https://picsum.photos/seed/scene4/600/400", tags:{local:3,spicy:1} },
  ]},
  { id:"budget", type:"slider", question:"Sweet spot per person?", subtitle:"Be honest — we judge nothing", min:15, max:300, step:5,
    formatVal:(v) => v >= 300 ? "$300+" : `$${v}`,
    tags:(v) => v > 150 ? {upscale:3} : v > 80 ? {upscale:1} : {local:2},
  },
  { id:"vibe", type:"pick-one", question:"Which food city are you?", options:[
    { label:"Tokyo — precise, obsessive, perfect", emoji:"🗼", img:"https://picsum.photos/seed/tokyo/600/400", tags:{adventurous:2,upscale:2} },
    { label:"Mexico City — street food, soul, chaos", emoji:"🌮", img:"https://picsum.photos/seed/cdmx/600/400", tags:{spicy:2,local:3} },
    { label:"Paris — bistros, butter, no hurry", emoji:"🥐", img:"https://picsum.photos/seed/paris/600/400", tags:{cozy:3,upscale:1} },
    { label:"NYC — everything, always, now", emoji:"🌆", img:"https://picsum.photos/seed/nyc/600/400", tags:{social:3,adventurous:1} },
  ]},
  { id:"inspo", type:"pick-one", question:"How do you usually find spots?", options:[
    { label:"Instagram deep dives", emoji:"📱", img:"https://picsum.photos/seed/inspo1/600/400", tags:{trendy:3} },
    { label:"Eater / The Infatuation", emoji:"📰", img:"https://picsum.photos/seed/inspo2/600/400", tags:{upscale:1,trendy:1} },
    { label:"Friends & word of mouth", emoji:"💬", img:"https://picsum.photos/seed/inspo3/600/400", tags:{local:3} },
    { label:"I wander until something smells right", emoji:"👃", img:"https://picsum.photos/seed/inspo4/600/400", tags:{adventurous:3,local:1} },
  ]},
];

export default function Quiz({ onDone }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [sliderVal, setSliderVal] = useState(75);
  const [transitioning, setTransitioning] = useState(false);
  const current = STEPS[step];
  const progress = (step / STEPS.length) * 100;

  const advance = (answerData) => {
    const newAnswers = { ...answers, [current.id]: answerData };
    setAnswers(newAnswers);
    setTransitioning(true);
    setTimeout(() => {
      if (step + 1 >= STEPS.length) {
        const tags = Object.values(newAnswers).reduce((acc, a) => {
          if (a?.tags) Object.entries(a.tags).forEach(([k,v]) => { acc[k] = (acc[k]||0)+v; });
          return acc;
        }, {});
        onDone({ tags, answers: newAnswers });
      } else {
        setStep(s => s + 1);
        setTransitioning(false);
      }
    }, 280);
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg || "#0a0a0f", fontFamily:"'Inter', sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=range] { width:100%; -webkit-appearance:none; height:4px; background:${C.parchment}; border-radius:2px; outline:none; cursor:pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:26px; height:26px; border-radius:50%; background:${C.terracotta}; cursor:pointer; box-shadow:0 2px 16px rgba(196,96,58,0.4); }
      `}</style>
      <div style={{ height:3, background:C.parchment }}>
        <div style={{ height:"100%", width:`${progress}%`, background:C.terracotta, transition:"width 0.5s ease" }} />
      </div>
      <div style={{ opacity: transitioning ? 0 : 1, transform: transitioning ? "translateX(-20px)" : "translateX(0)", transition:"all 0.28s ease", flex:1, display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"32px 24px 0" }}>
          <div style={{ fontFamily:"'Inter', sans-serif", fontSize:10, color:C.muted, letterSpacing:"2px", marginBottom:12 }}>STEP {step+1} OF {STEPS.length}</div>
          <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:30, fontWeight:700, lineHeight:1.2, color:C.text }}>{current.question}</div>
          {current.subtitle && <div style={{ fontSize:13, color:C.muted, fontStyle:"italic", marginTop:6 }}>{current.subtitle}</div>}
        </div>
        {current.type === "pick-one" && (
          <div style={{ padding:"20px 16px 0", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {current.options.map((opt, i) => (
              <div key={i} onClick={() => advance(opt)}
                className="glass-subtle"
                style={{ borderRadius:16, overflow:"hidden", height:160, position:"relative", cursor:"pointer", border:"2.5px solid transparent", transition:"all 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor=C.terracotta}
                onMouseLeave={e => e.currentTarget.style.borderColor="transparent"}>
                <img src={opt.img} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 35%, rgba(20,10,5,0.85) 100%)" }} />
                <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"12px" }}>
                  <span style={{ fontSize:18, display:"block", marginBottom:4 }}>{opt.emoji}</span>
                  <span style={{ fontSize:12, color:"#fff", lineHeight:1.3, fontWeight:500 }}>{opt.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {current.type === "slider" && (
          <div style={{ padding:"32px 24px 0", flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:72, fontWeight:700, fontStyle:"italic", color:C.terracotta, lineHeight:1, marginBottom:6 }}>{current.formatVal(sliderVal)}</div>
            <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"'Inter', sans-serif", fontSize:10, color:C.muted, marginBottom:24 }}><span>$15</span><span>$300+</span></div>
            <input type="range" min={current.min} max={current.max} step={current.step} value={sliderVal} onChange={e => setSliderVal(Number(e.target.value))} />
            <div className="glass-subtle" style={{ marginTop:20, padding:"14px 16px", borderRadius:12, fontSize:13, color:C.muted, fontStyle:"italic", lineHeight:1.5 }}>
              {sliderVal < 30 ? "Hole-in-the-wall energy. The good stuff." : sliderVal < 60 ? "Great neighborhood spots, solid wine lists." : sliderVal < 120 ? "Special occasion on a Tuesday." : sliderVal < 200 ? "Full tasting menu territory. You belong here." : "No ceiling. Send the bill to the experience."}
            </div>
            <div style={{ marginTop:"auto", paddingTop:32 }}>
              <button onClick={() => advance({ tags: current.tags(sliderVal), value: sliderVal })}
                style={{ width:"100%", padding:16, border:"none", borderRadius:14, background:C.terracotta, color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"'Inter', sans-serif" }}>
                That's my vibe →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
