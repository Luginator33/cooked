# Cooked — Full System Audit (April 2, 2026)

## How Data Flows Through the App

```
USER ACTION (swipe, love, follow, search, etc.)
  │
  ├─→ React State (in-memory, instant UI update)
  ├─→ localStorage (persists across page reloads)
  ├─→ Supabase (persists across devices, source of truth)
  └─→ Neo4j (graph relationships for recommendations)
```

---

## The Love System — THE BIGGEST ISSUE

There are **4 places** a "love" gets stored. They should ALL be in sync, but they're NOT:

```
When you LOVE a restaurant:

1. heatResults.loved[] (React state) ✅ Updated
2. localStorage "cooked_loved" ✅ Updated (just fixed)
3. Supabase restaurant_interactions ✅ Logged
4. Neo4j LOVED relationship ✅ Created
5. Supabase user_data.loved[] ❌ NOT UPDATED BY toggleLove!
```

### What this means:
- Your Profile page loads `user_data.loved` from Supabase
- But `toggleLove()` never writes back to `user_data.loved`
- The debounced save (every 2 seconds) DOES save `heatResults.loved` to `user_data.heat.loved`
- So loves are in `user_data.heat.loved` but the Profile reads from `user_data.loved`
- **These can get out of sync**

### Fix needed:
Unify to ONE source of truth. The debounced save already writes `heat.loved` to Supabase — the Profile page should read from that, OR `toggleLove` should also update `user_data.loved`.

---

## Storage Systems (22+ localStorage keys, 15 Supabase tables, Neo4j graph)

### localStorage (session/device-specific)
| Key | What it stores | Syncs to Supabase? |
|-----|---------------|-------------------|
| cooked_heat | {loved, noped, skipped, votes} | ✅ via debounced save |
| cooked_loved | Array of loved IDs | ❌ Separate from heat |
| cooked_watchlist | Watchlist IDs | ✅ via debounced save |
| cooked_ratings | User ratings | ✅ via debounced save |
| cooked_notes | Personal notes | ❌ Local only |
| cooked_lists | Custom lists | ❌ Local only |
| cooked_profile_photo | Photo URL | ✅ via debounced save |
| cooked_banner_photo | Banner URL | ✅ via debounced save |
| cooked_chat_history | Chat conversations | ❌ Local only |
| cooked_default_city | Home city | ❌ Local only |
| cooked_private_profile | Privacy toggle | ❌ Local only |

### Supabase Tables
| Table | Purpose | Connected to Neo4j? |
|-------|---------|-------------------|
| user_data | Profiles, loves, watchlist | Partially (loves sync) |
| restaurant_interactions | Every user action log | ❌ Read-only log |
| restaurant_flame_scores | Cached flame scores | ❌ Computed by RPC |
| community_restaurants | User-added places | ❌ (should sync to Neo4j) |
| admin_overrides | Admin edits to static data | ❌ |
| follows | User→User relationships | ✅ syncFollow |
| city_follows | User→City relationships | ✅ syncCityFollow |
| messages | DM conversations | ❌ |
| notifications | Push notifications | ❌ |
| research_new_places | Import queue | ❌ |
| restaurant_photos | Photo library | ❌ |
| activity_log | Admin audit trail | ❌ |

### Neo4j Graph
| Node/Relationship | Synced from | Synced back? |
|-------------------|-------------|-------------|
| User node | Supabase user_data | ❌ One-way |
| Restaurant node | Static data + community | ❌ One-way |
| LOVED relationship | toggleLove/syncLove | ❌ Not read back to Supabase |
| FOLLOWS relationship | followUser/syncFollow | ❌ Not read back |
| FOLLOWS_CITY | followCity/syncCityFollow | ❌ Not read back |
| Tag nodes | Restaurant tags | ❌ Static |

---

## City Filtering

### CITY_GROUPS — Neighborhoods that appear in MULTIPLE cities:
- **Chinatown** — LA, SF, Bangkok, Singapore, Vancouver, London (6 cities!)
- **Calabasas** — LA and Ventura County
- **Koreatown** — Was in NY (FIXED), should only be in LA

### How filtering works:
```
User selects "New York" in city picker
  → CITY_GROUPS["New York"] = ["New York", "Manhattan", "Brooklyn", ...]
  → Filter: restaurant.city IN group OR restaurant.neighborhood IN group
  → Any restaurant with matching neighborhood shows up
```

### Risk: If a neighborhood name appears in multiple CITY_GROUPS, restaurants from one city bleed into another.

---

## ID Type Issues

| System | ID Format | Example |
|--------|-----------|---------|
| Static restaurants.js | Number | 13, 5050, 17013 |
| Community Supabase | String | "100842", "454986" |
| Neo4j | String | "13", "100842" |
| heatResults.loved | Mixed (number from static, can be either) | [13, 5050, "100842"] |

### Defensive handling:
```javascript
// isLovedCheck does triple-check (line 2325):
heatResults.loved.includes(id) ||
heatResults.loved.includes(Number(id)) ||
heatResults.loved.includes(String(id))
```
This works but is fragile. Should normalize to one type everywhere.

---

## Admin Panel — What's Connected, What's Not

| Admin Action | Supabase | Neo4j | UI Refresh | User Notification |
|-------------|----------|-------|-----------|-------------------|
| Edit restaurant | ✅ | ❌ Missing! | ✅ via callback | ❌ |
| Remove restaurant | ✅ | ❌ | ✅ via removedIds | ❌ |
| Merge restaurants | ✅ | ✅ transferLoves | ✅ | ❌ |
| Import restaurant | ✅ | ❌ | ✅ | ❌ |
| Edit user | ✅ | ❌ | ✅ | ❌ |
| Block user | ✅ | ❌ | ✅ | ❌ |
| Set flame score | ✅ | ❌ | ✅ | ❌ |

### Missing: Admin edits don't sync to Neo4j
When you edit a restaurant's city, cuisine, or tags in the admin panel, Neo4j still has the old data. This means recommendations based on cuisine/tag matching may use stale data.

---

## PWA Back-Swipe Support

| Screen | Has pushState? | Back-swipe works? |
|--------|---------------|-------------------|
| Restaurant Detail | ✅ | ✅ |
| User Profile | ✅ | ✅ |
| Taste Profile | ✅ | ✅ |
| Admin Panel | ✅ | ✅ |
| Onboarding slides | ✅ | ✅ |
| Tab navigation | ❌ | ❌ Goes to Google sign-in |
| DM Inbox | ❌ | ❌ |
| Notifications | ❌ | ❌ |
| Filter Sheet | ❌ | ❌ |
| Settings | ❌ | ❌ |
| DM Share Picker | ❌ | ❌ |

---

## What Should Be Fixed (Priority Order)

### HIGH PRIORITY
1. **Unify love system** — One source of truth for loves (currently 4 places)
2. **Admin edits → Neo4j sync** — Restaurant edits should update Neo4j
3. **Tab navigation → pushState** — Back-swipe should switch tabs, not exit app
4. **Normalize IDs** — Pick string or number, not both

### MEDIUM PRIORITY
5. **DM/Notifications → pushState** — Back-swipe should close modals
6. **localStorage notes/lists → Supabase** — Currently local-only, lost on device change
7. **Community restaurant edits** — updateCommunityRestaurant was broken (String ID fix applied)

### LOW PRIORITY
8. **Chinatown city group** — Remove from groups where it doesn't belong
9. **Admin merge → user_data.loved** — Update old love references
10. **Flame score recompute on merge** — Merged restaurant should inherit combined score
