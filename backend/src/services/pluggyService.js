import { PluggyClient } from 'pluggy-sdk';
import { supabase } from '../config/supabase.js';

// Lazy-init: only instantiate PluggyClient when actually needed,
// so the server boots even without Pluggy credentials configured.
let _client = null;
function getClient() {
  if (!_client) {
    const clientId = process.env.PLUGGY_CLIENT_ID;
    const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('Pluggy não configurado. Insira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env do backend.');
    }
    _client = new PluggyClient({ clientId, clientSecret });
  }
  return _client;
}

/**
 * Generates an access token for the embedded Connect Widget on the Front-End.
 * @param {string} itemId - (Optional) To update an existing connection.
 */
export const generateConnectToken = async (itemId = null) => {
  try {
    const data = await getClient().createConnectToken(itemId);
    return data.accessToken;
  } catch (error) {
    console.error('Error generating Pluggy connect token:', error);
    throw new Error('Falha ao gerar Token do Open Finance. Verifique suas chaves reais do Pluggy Client_ID e Secret.');
  }
};

/**
 * Retrieves all transactions from a connected Pluggy Item (Bank Connection).
 * Should be triggered by webhooks or manual sync.
 */
export const syncTransactions = async (itemId, userId) => {
  try {
    console.log(`Buscando contas bancárias do Item (Conexão): ${itemId}`);
    const accounts = await getClient().fetchAccounts(itemId);
    
    for (const remoteAcc of accounts.results) {
        console.log(`Sincronizando transações da conta Pluggy: ${remoteAcc.id} - ${remoteAcc.name}`);
        const transactions = await getClient().fetchTransactions(remoteAcc.id);
        
        const preparedTransactions = transactions.results.map(tx => {
            let type = 'expense';
            if (tx.type === 'CREDIT' && tx.amount > 0) type = 'income';
            
            return {
                user_id: userId,
                description: tx.description,
                raw_description: tx.descriptionRaw || tx.description,
                amount: tx.amount,
                type: type,
                date: tx.date.split('T')[0],
                import_hash: `pluggy_${tx.id}`,
                origin: 'import',
                is_confirmed: true
            };
        });

        if (preparedTransactions.length > 0) {
            const { error } = await supabase.from('transactions')
                .upsert(preparedTransactions, { onConflict: 'import_hash', ignoreDuplicates: true });
            
            if (error) {
                console.error(`Erro ao salvar transações Pluggy no Supabase (Account ${remoteAcc.id}):`, error);
            } else {
                console.log(`Importadas ${preparedTransactions.length} transações com sucesso.`);
            }
        }
    }

    return true;
  } catch (error) {
    console.error(`Failed to sync transactions for Item ${itemId}:`, error);
    throw error;
  }
};
