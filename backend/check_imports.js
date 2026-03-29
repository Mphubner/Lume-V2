import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('imports')
    .select('*')
    .limit(1);
    
  if (error) console.error(error);
  else console.log("Columns:", Object.keys(data[0] || {}));
}
run();
