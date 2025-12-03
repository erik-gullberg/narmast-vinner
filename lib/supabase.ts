import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)



