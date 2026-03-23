import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
export async function addCommunityRestaurant(restaurantObject) {
  const payload = { ...restaurantObject, description: restaurantObject.desc, updated_at: new Date().toISOString() }
  delete payload.desc;
  const { error } = await supabase
    .from('community_restaurants')
    .upsert(payload, { onConflict: 'id' })
  if (error) {
    console.log('addCommunityRestaurant error:', error)
  }
  return { error }
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
    .insert({ follower_id: followerClerkId, following_id: followingClerkId })
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
