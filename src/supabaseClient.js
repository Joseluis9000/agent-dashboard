// src/supabaseClient.js

import { createClient } from '@supabase/supabase-js';

// Get the Supabase URL and Key from the .env file
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;

// Create the Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);