import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lkrjzpxzxurzjoswpeku.supabase.co'
const supabaseAnonKey = 'sb_publishable_6cWubKMz8T6lJqVE6HadnA_MX47WHQz'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
