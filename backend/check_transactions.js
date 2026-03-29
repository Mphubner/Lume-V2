import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, amount, description')
    .or('amount.gt.50000,amount.lt.-50000')
    .order('amount', { ascending: false })
    .limit(50);
    
  if (error) console.error(error);
  else {
    console.log(`Encontradas ${data.length} transações anômalas (abs > 50.000):`);
    console.table(data);
  }
}
run();
