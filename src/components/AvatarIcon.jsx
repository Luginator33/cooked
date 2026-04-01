// Shared AvatarIcon component — used in Onboarding + Profile
const AVATAR_GRAD = "url(#av-grad)";

export const AvatarIcon = ({ type, size = 36 }) => {
  const s = { width: size, height: size };
  const icons = {
    flame: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <path d="M24 6c-4 8-11 13-11 22a11 11 0 0 0 22 0c0-9-7-14-11-22z" fill={AVATAR_GRAD}/>
        <path d="M24 18c-2 4-5.5 6.5-5.5 13a5.5 5.5 0 0 0 11 0c0-6.5-3.5-9-5.5-13z" fill="#0a0a0f" opacity="0.3"/>
      </svg>
    ),
    pizza: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <path d="M24 6L8 40h32L24 6z" fill={AVATAR_GRAD}/>
        <circle cx="19" cy="28" r="2.5" fill="#0a0a0f" opacity="0.35"/><circle cx="27" cy="24" r="2" fill="#0a0a0f" opacity="0.35"/>
        <circle cx="23" cy="34" r="2" fill="#0a0a0f" opacity="0.35"/>
        <path d="M8 40h32" stroke="#0a0a0f" strokeWidth="2" opacity="0.15" strokeLinecap="round"/>
      </svg>
    ),
    sushi: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <ellipse cx="24" cy="28" rx="15" ry="10" fill={AVATAR_GRAD}/>
        <ellipse cx="24" cy="22" rx="11" ry="6" fill={AVATAR_GRAD}/>
        <ellipse cx="24" cy="28" rx="15" ry="10" fill="#0a0a0f" opacity="0.1"/>
        <path d="M15 20h18" stroke="#0a0a0f" strokeWidth="1.5" opacity="0.15" strokeLinecap="round"/>
      </svg>
    ),
    taco: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <path d="M6 34c0-14 8-24 18-24s18 10 18 24" fill="none" stroke={AVATAR_GRAD} strokeWidth="3.5" strokeLinecap="round"/>
        <path d="M10 32c0-10 6-18 14-18s14 8 14 18" fill={AVATAR_GRAD} opacity="0.3"/>
        <ellipse cx="24" cy="28" rx="8" ry="4" fill={AVATAR_GRAD} opacity="0.5"/>
      </svg>
    ),
    wine: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <path d="M16 8h16v11c0 6-3.5 10-8 10s-8-4-8-10V8z" fill={AVATAR_GRAD}/>
        <path d="M16 16h16" stroke="#0a0a0f" strokeWidth="1" opacity="0.15"/>
        <line x1="24" y1="29" x2="24" y2="38" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="17" y1="38" x2="31" y2="38" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    ),
    noodles: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <path d="M10 28c0 8 6 14 14 14s14-6 14-14" fill={AVATAR_GRAD} opacity="0.25" stroke={AVATAR_GRAD} strokeWidth="2.5"/>
        <path d="M15 28c1-10 3-16 3-16" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M21 28c0.5-10 1.5-16 1.5-16" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M27 28c0-10 0-16 0-16" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M33 28c-1-10-3-16-3-16" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    ),
    cocktail: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <path d="M12 10h24L24 27z" fill={AVATAR_GRAD} opacity="0.35" stroke={AVATAR_GRAD} strokeWidth="2" strokeLinejoin="round"/>
        <line x1="24" y1="27" x2="24" y2="38" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="17" y1="38" x2="31" y2="38" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="20" cy="17" r="2" fill={AVATAR_GRAD} opacity="0.6"/>
      </svg>
    ),
    coffee: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <rect x="10" y="18" width="22" height="20" rx="4" fill={AVATAR_GRAD} opacity="0.35" stroke={AVATAR_GRAD} strokeWidth="2"/>
        <path d="M32 22h3a4 4 0 0 1 0 8h-3" stroke={AVATAR_GRAD} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <path d="M17 13c0-3 2-4 2-4s2 1 2 4" stroke={AVATAR_GRAD} strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d="M23 11c0-3 2-4 2-4s2 1 2 4" stroke={AVATAR_GRAD} strokeWidth="2" fill="none" strokeLinecap="round"/>
      </svg>
    ),
    knife: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <path d="M22 4h4v22h-4z" fill={AVATAR_GRAD} rx="2"/>
        <path d="M24 4c4 0 8 4 8 10H24V4z" fill={AVATAR_GRAD} opacity="0.4"/>
        <rect x="19" y="26" width="10" height="5" rx="1.5" fill={AVATAR_GRAD} opacity="0.6"/>
        <rect x="20" y="31" width="8" height="12" rx="2" fill={AVATAR_GRAD} opacity="0.35"/>
        <circle cx="24" cy="28" r="1" fill="#0a0a0f" opacity="0.2"/>
      </svg>
    ),
    star: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <path d="M24 4l5.5 12.5L43 18l-10 9 2.5 13.5L24 34l-11.5 6.5L15 27 5 18l13.5-1.5z" fill={AVATAR_GRAD}/>
      </svg>
    ),
    heart: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <path d="M24 42s-16-10-16-22a9 9 0 0 1 16-5.5A9 9 0 0 1 40 20c0 12-16 22-16 22z" fill={AVATAR_GRAD}/>
      </svg>
    ),
    fork: (
      <svg style={s} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="av-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffb347"/><stop offset="100%" stopColor="#e07850"/></linearGradient></defs>
        <line x1="16" y1="6" x2="16" y2="20" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="24" y1="6" x2="24" y2="20" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="32" y1="6" x2="32" y2="20" stroke={AVATAR_GRAD} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M14 20c0 5 4 7 10 7s10-2 10-7" stroke={AVATAR_GRAD} strokeWidth="2.5" fill={AVATAR_GRAD} opacity="0.3" strokeLinecap="round"/>
        <line x1="24" y1="27" x2="24" y2="42" stroke={AVATAR_GRAD} strokeWidth="3" strokeLinecap="round"/>
      </svg>
    ),
  };
  return icons[type] || null;
};

export const STOCK_AVATARS = [
  { id: "av1",  icon: "flame" },
  { id: "av2",  icon: "pizza" },
  { id: "av3",  icon: "sushi" },
  { id: "av4",  icon: "taco" },
  { id: "av5",  icon: "wine" },
  { id: "av6",  icon: "noodles" },
  { id: "av7",  icon: "cocktail" },
  { id: "av8",  icon: "coffee" },
  { id: "av9",  icon: "knife" },
  { id: "av10", icon: "star" },
  { id: "av11", icon: "heart" },
  { id: "av12", icon: "fork" },
];

// Helper: parse photo from localStorage — returns { type, icon } for stock or { type: "upload", url } for uploads
export function parseProfilePhoto(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.type === "stock" && parsed.icon) return parsed;
    if (parsed.type === "upload" && parsed.url) return parsed;
  } catch {
    // Not JSON — it's a plain URL (Clerk image or data URL)
    if (raw.startsWith("http") || raw.startsWith("data:")) return { type: "url", url: raw };
  }
  return null;
}

// Pick a deterministic stock avatar based on a user ID string
export function getDefaultAvatar(userId) {
  if (!userId) return STOCK_AVATARS[0].icon;
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = ((h << 5) - h + userId.charCodeAt(i)) | 0;
  return STOCK_AVATARS[Math.abs(h) % STOCK_AVATARS.length].icon;
}

// Render a profile photo — handles stock icons, uploaded photos, and URLs
// Pass userId to get a deterministic default avatar when no photo is set
export function ProfilePhoto({ photo, size = 60, style = {}, userId }) {
  const parsed = typeof photo === "string" ? parseProfilePhoto(photo) : photo;

  if (!parsed) {
    const defaultIcon = getDefaultAvatar(userId);
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
        <AvatarIcon type={defaultIcon} size={size * 0.55} />
      </div>
    );
  }

  if (parsed.type === "stock") {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
        <AvatarIcon type={parsed.icon} size={size * 0.55} />
      </div>
    );
  }

  // URL or upload
  const url = parsed.url || photo;
  return (
    <img src={url} alt="profile" style={{ width: size, height: size, objectFit: "cover", borderRadius: "50%", ...style }} />
  );
}
