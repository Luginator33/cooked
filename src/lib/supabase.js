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

// Save a community restaurant so other users can see it.
export async function addCommunityRestaurant(restaurantObject) {
  const payload = { ...restaurantObject, updated_at: new Date().toISOString() }
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
