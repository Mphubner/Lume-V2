import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const queries = ['profiles', 'members', 'companies', 'accounts', 'transactions'];
  for (const t of queries) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    console.log(`\nTable ${t}:`);
    if (error) console.log('Error/Not found:', error.message);
    else if (data.length > 0) console.log('Columns:', Object.keys(data[0]));
    else console.log('Empty but exists');
  }
}
run();
