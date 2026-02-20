import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'packages/dashboard/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('settings').select('*').limit(1);
  console.log('settings:', data, error);
  const { data: d2, error: e2 } = await supabase.from('user_settings').select('*').limit(1);
  console.log('user_settings:', d2, e2);
}
run();
