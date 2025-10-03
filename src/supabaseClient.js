import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_KEY;

if (!url || !key) {
  throw new Error('Missing Supabase env vars. Define them in .env.local and restart the server.');
}

export const supabase = createClient(url, key);
