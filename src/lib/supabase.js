import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── FLAME SCORE / INTERACTION TRACKING ──────────────────────
// Log a user interaction with a restaurant (fire-and-forget)
export function logInteraction(clerkUserId, restaurantId, action, value = null) {
  if (!clerkUserId || !restaurantId) return;
  supabase.from('restaurant_interactions').insert({
    clerk_user_id: clerkUserId,
    restaurant_id: String(restaurantId),
    action,
    value,
  }).then(({ error }) => {
    if (error) console.error('logInteraction error:', error);
  });
}

// Fetch cached flame scores for a list of restaurant IDs
export async function fetchFlameScores(restaurantIds) {
  if (!restaurantIds?.length) return {};
  const ids = restaurantIds.map(String);
  const allRows = [];
  // Batch in chunks of 500 (Supabase filter limit)
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500);
    const { data, error } = await supabase
      .from('restaurant_flame_scores')
      .select('restaurant_id, flame_score, interaction_count')
      .in('restaurant_id', batch);
    if (!error && data) allRows.push(...data);
  }
  const map = {};
  allRows.forEach(row => {
    map[row.restaurant_id] = { flameScore: row.flame_score, interactions: row.interaction_count };
  });
  return map;
}

// Compute flame score for a single restaurant via RPC
export async function computeFlameScore(restaurantId, externalRating) {
  const { data, error } = await supabase.rpc('compute_flame_score', {
    p_restaurant_id: String(restaurantId),
    p_external_rating: externalRating || 3,
  });
  if (error) console.error('computeFlameScore error:', error);
  return data;
}

// Load user data from Supabase
export async function loadUserData(clerkUserId) {
  const { data, error } = await supabase
    .from('user_data')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .single()
  if (error && error.code !== 'PGRST116') console.error(error)
  return data
}

// Save user data to Supabase (upsert)
export async function saveUserData(clerkUserId, updates) {
  const { error } = await supabase
    .from('user_data')
    .upsert(
      { clerk_user_id: clerkUserId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: 'clerk_user_id' }
    )
  if (error) console.error(error)
}

// Save photo cache (both preview + confirmed) to Supabase `user_data.photos`.
export async function saveUserPhotos(clerkUserId, photos) {
  if (!clerkUserId) return;
  const { error } = await supabase
    .from('user_data')
    .update({ photos })
    .eq('clerk_user_id', clerkUserId);
  if (error) console.error('saveUserPhotos error:', error);
}

// Load photo cache from Supabase `user_data.photos`.
export async function loadUserPhotos(clerkUserId) {
  if (!clerkUserId) return {};
  const { data, error } = await supabase
    .from('user_data')
    .select('photos')
    .eq('clerk_user_id', clerkUserId)
    .single();
  if (error || !data) return {};
  return data.photos || {};
}

export async function loadSharedPhotos() {
  const allRows = [];
  let from = 0;
  const batchSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('restaurant_photos')
      .select('restaurant_id, photo_url')
      .range(from, from + batchSize - 1);
    if (error || !data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  const map = {};
  allRows.forEach((row) => {
    map[String(row.restaurant_id)] = row.photo_url;
  });
  return map;
}

// Save a single photo into the shared library (admin-only action).
export async function saveSharedPhoto(restaurantId, photoUrl) {
  if (!restaurantId || !photoUrl) return;
  await supabase
    .from('restaurant_photos')
    .upsert(
      { restaurant_id: String(restaurantId), photo_url: photoUrl },
      { onConflict: 'restaurant_id' }
    );
}

// Save a community restaurant so other users can see it.
// IDs are 100000–999999 so they never collide with static restaurants.js (~1–35400).
export async function addCommunityRestaurant(restaurantObject) {
  const { desc, ...rest } = restaurantObject;
  const name = (restaurantObject.name || '').trim();
  const newId = Math.floor(Math.random() * 900000) + 100000;
  let id = newId;
  if (name) {
    const { data: existingRows } = await supabase
      .from('community_restaurants')
      .select('id')
      .ilike('name', name)
      .limit(1);
    if (existingRows?.length) {
      id = existingRows[0].id;
    }
  }
  const payload = {
    ...rest,
    id,
    name: name || restaurantObject.name,
    description: desc ?? restaurantObject.description,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('community_restaurants')
    .upsert(payload, { onConflict: 'name' })
    .select();
  if (error) {
    console.log('addCommunityRestaurant error:', error)
  }
  return { data, error }
}

// Fetch all community-added restaurants.
export async function getCommunityRestaurants() {
  const { data, error } = await supabase
    .from('community_restaurants')
    .select('*')
  if (error) {
    console.error(error)
    return []
  }
  return data || []
}

// Follow a user
export async function followUser(followerClerkId, followingClerkId) {
  const { error } = await supabase
    .from('follows')
    .upsert({ follower_id: followerClerkId, following_id: followingClerkId }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true })
  return { error }
}

// Unfollow a user
export async function unfollowUser(followerClerkId, followingClerkId) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerClerkId)
    .eq('following_id', followingClerkId)
  return { error }
}

// Get followers of a user
export async function getFollowers(clerkUserId) {
  const { data, error } = await supabase
    .from('follows')
    .select('*')
    .eq('following_id', clerkUserId)
  return { data, error }
}

// Get users a user is following
export async function getFollowing(clerkUserId) {
  const { data, error } = await supabase
    .from('follows')
    .select('*')
    .eq('follower_id', clerkUserId)
  return { data, error }
}

// Check if user A follows user B
export async function isFollowing(followerClerkId, followingClerkId) {
  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', followerClerkId)
    .eq('following_id', followingClerkId)
    .single()
  return { isFollowing: !!data && !error }
}

// Follow a city
export async function followCity(clerkUserId, city) {
  const { error } = await supabase
    .from('city_follows')
    .insert({ clerk_user_id: clerkUserId, city })
  return { error }
}

// Unfollow a city
export async function unfollowCity(clerkUserId, city) {
  const { error } = await supabase
    .from('city_follows')
    .delete()
    .eq('clerk_user_id', clerkUserId)
    .eq('city', city)
  return { error }
}

// Get cities a user follows
export async function getFollowedCities(clerkUserId) {
  const { data, error } = await supabase
    .from('city_follows')
    .select('city')
    .eq('clerk_user_id', clerkUserId)
  return { data, error }
}

// Get user profile data by clerk_user_id
export async function getUserProfile(clerkUserId) {
  const { data, error } = await supabase
    .from('user_data')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .single()
  return { data, error }
}

// ── ADMIN FUNCTIONS ──────────────────────────────────────────

// Admin overrides (edit/remove/merge static restaurants at runtime)
export async function getAdminOverrides() {
  const { data, error } = await supabase.from('admin_overrides').select('*');
  if (error) console.error('getAdminOverrides:', error);
  return data || [];
}

export async function upsertAdminOverride(restaurantId, action, overrideData, adminId) {
  const { error } = await supabase.from('admin_overrides').upsert({
    restaurant_id: String(restaurantId), action, override_data: overrideData || null,
    merged_into_id: null, created_by: adminId, updated_at: new Date().toISOString(),
  }, { onConflict: 'restaurant_id' });
  if (error) console.error('upsertAdminOverride:', error);
  return { error };
}

export async function deleteAdminOverride(restaurantId) {
  const { error } = await supabase.from('admin_overrides').delete().eq('restaurant_id', String(restaurantId));
  return { error };
}

// Blocked users
export async function blockUser(clerkUserId, adminId, reason) {
  const { error } = await supabase.from('blocked_users').upsert({
    clerk_user_id: clerkUserId, blocked_by: adminId, reason: reason || null,
  }, { onConflict: 'clerk_user_id' });
  return { error };
}

export async function unblockUser(clerkUserId) {
  const { error } = await supabase.from('blocked_users').delete().eq('clerk_user_id', clerkUserId);
  return { error };
}

export async function getBlockedUsers() {
  const { data, error } = await supabase.from('blocked_users').select('*').order('blocked_at', { ascending: false });
  return data || [];
}

export async function isUserBlocked(clerkUserId) {
  const { data } = await supabase.from('blocked_users').select('clerk_user_id').eq('clerk_user_id', clerkUserId).single();
  return !!data;
}

// Activity log
export async function logAdminAction(action, actorId, targetType, targetId, details) {
  await supabase.from('activity_log').insert({ action, actor_id: actorId, target_type: targetType, target_id: targetId, details: details || null });
}

export async function getActivityLog(limit = 50, offset = 0) {
  const { data, error } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  return data || [];
}

// Reports
export async function getReports(status = 'pending') {
  const { data } = await supabase.from('reports').select('*').eq('status', status).order('created_at', { ascending: false });
  return data || [];
}

export async function resolveReport(reportId, adminId, resolution) {
  const { error } = await supabase.from('reports').update({ status: resolution, resolved_by: adminId, resolved_at: new Date().toISOString() }).eq('id', reportId);
  return { error };
}

export async function submitReport(reporterId, targetType, targetId, reason) {
  const { error } = await supabase.from('reports').insert({ reporter_id: reporterId, target_type: targetType, target_id: targetId, reason });
  return { error };
}

// Feature flags
export async function getFeatureFlags() {
  const { data } = await supabase.from('feature_flags').select('*').order('key');
  return data || [];
}

export async function setFeatureFlag(key, enabled, adminId, description) {
  const { error } = await supabase.from('feature_flags').upsert({
    key, enabled, description: description || null, updated_by: adminId, updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  return { error };
}

// Photo submissions / moderation
export async function getPhotoSubmissions(status = 'pending') {
  const { data } = await supabase.from('photo_submissions').select('*').eq('status', status).order('created_at', { ascending: false });
  return data || [];
}

export async function reviewPhotoSubmission(submissionId, approved, adminId) {
  const update = { status: approved ? 'approved' : 'rejected', reviewed_by: adminId, reviewed_at: new Date().toISOString() };
  const { error } = await supabase.from('photo_submissions').update(update).eq('id', submissionId);
  return { error };
}

// User management
export async function getAllUsers(limit = 100, offset = 0, search = '') {
  let query = supabase.from('user_data').select('clerk_user_id, profile_name, profile_username, profile_photo, is_admin, updated_at').order('updated_at', { ascending: false });
  if (search) query = query.or(`profile_name.ilike.%${search}%,profile_username.ilike.%${search}%`);
  const { data, error } = await query.range(offset, offset + limit - 1);
  return data || [];
}

export async function setUserAdmin(clerkUserId, isAdmin) {
  const { error } = await supabase.from('user_data').update({ is_admin: isAdmin }).eq('clerk_user_id', clerkUserId);
  return { error };
}

export async function deleteUserData(clerkUserId) {
  await supabase.from('follows').delete().eq('follower_id', clerkUserId);
  await supabase.from('follows').delete().eq('following_id', clerkUserId);
  await supabase.from('city_follows').delete().eq('clerk_user_id', clerkUserId);
  await supabase.from('notifications').delete().eq('user_id', clerkUserId);
  const { error } = await supabase.from('user_data').delete().eq('clerk_user_id', clerkUserId);
  return { error };
}

// Analytics
export async function getAnalytics() {
  const [usersRes, photosRes] = await Promise.all([
    supabase.from('user_data').select('clerk_user_id, profile_name, loved, updated_at'),
    supabase.from('restaurant_photos').select('restaurant_id', { count: 'exact', head: true }),
  ]);
  const users = usersRes.data || [];
  const totalUsers = users.length;
  let totalLoves = 0;
  const cityLoves = {};
  users.forEach(u => {
    const loved = Array.isArray(u.loved) ? u.loved : (u.loved?.loved || []);
    totalLoves += loved.length;
  });
  return { totalUsers, totalLoves, totalPhotos: photosRes.count || 0 };
}

// Send notification to specific users or all
export async function sendBroadcastNotification(adminId, message, targetUserIds) {
  const rows = targetUserIds.map(uid => ({
    user_id: uid, type: 'announcement', from_user_id: adminId,
    restaurant_name: message, read: false,
  }));
  const { error } = await supabase.from('notifications').insert(rows);
  return { error };
}

// Community restaurant management
export async function updateCommunityRestaurant(id, updates) {
  const { error } = await supabase.from('community_restaurants').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  return { error };
}

export async function deleteCommunityRestaurant(id) {
  const { error } = await supabase.from('community_restaurants').delete().eq('id', id);
  return { error };
}

// ── MESSAGING / DM FUNCTIONS ──────────────────────────────────

// Send a DM (text or restaurant share)
export async function sendMessage(senderId, recipientId, content, restaurantId, restaurantName) {
  const { data, error } = await supabase.from('messages').insert({
    sender_id: senderId, recipient_id: recipientId,
    content: content || null, restaurant_id: restaurantId || null,
    restaurant_name: restaurantName || null,
  }).select().single();
  if (error) console.error('sendMessage:', error);
  return { data, error };
}

// Get inbox — latest message per conversation partner
export async function getInbox(userId) {
  // Get all messages involving this user
  const { data, error } = await supabase.from('messages')
    .select('*')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];
  // Group by conversation partner, keep latest
  const convos = {};
  data.forEach(msg => {
    const partnerId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id;
    if (!convos[partnerId]) {
      convos[partnerId] = { ...msg, partnerId, unread: 0 };
    }
    if (msg.recipient_id === userId && !msg.read) {
      convos[partnerId].unread = (convos[partnerId].unread || 0) + 1;
    }
  });
  return Object.values(convos).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// Get conversation between two users
export async function getConversation(userId1, userId2, limit = 50) {
  const { data, error } = await supabase.from('messages')
    .select('*')
    .or(`and(sender_id.eq.${userId1},recipient_id.eq.${userId2}),and(sender_id.eq.${userId2},recipient_id.eq.${userId1})`)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) console.error('getConversation:', error);
  return data || [];
}

// Mark messages as read
export async function markMessagesRead(userId, fromUserId) {
  const { error } = await supabase.from('messages')
    .update({ read: true })
    .eq('recipient_id', userId)
    .eq('sender_id', fromUserId)
    .eq('read', false);
  return { error };
}

// Get total unread message count
export async function getUnreadMessageCount(userId) {
  const { count, error } = await supabase.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('read', false);
  return count || 0;
}
