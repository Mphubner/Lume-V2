# Categorias na conferência de extratos

Em **Importar → Conferir lote**, movimentos sem categoria recebem sugestões com motivo e origem. Use uma sugestão individualmente ou preencha as sugestões da página. Isso salva apenas a classificação na revisão; o fechamento e os saldos continuam dependendo da aprovação integral do extrato.

O motor consulta, nesta ordem:

1. Regras ativas e específicas do mesmo espaço financeiro, compatíveis com a direção.
2. Pelo menos dois lançamentos da mesma descrição e direção, com classificação consistente, confirmados e revisados, sem pendências legadas ou vínculos de movimentação.
3. Identificação determinística do estabelecimento, como supermercado, transporte por aplicativo ou farmácia, usando categorias e subcategorias disponíveis.

As sugestões exibem uma pontuação de confiança heurística; ela não representa uma probabilidade estatística nem substitui a conciliação. A aplicação exige pontuação mínima de 0,85 e recalcula a proposta no servidor. O processamento não envia descrições a provedores externos de IA.

Pix, nomes de pessoas e descrições ambíguas podem continuar sem categoria. Transferências, estornos, principal de investimentos e demais naturezas especiais exigem conferência própria. A categoria nunca decide, por si só, se o valor é receita, despesa ou movimentação interna.

Para ensinar uma escolha, selecione a categoria e marque **Lembrar para próximos extratos**. Salve a categoria e depois confira/aplique o lote. A regra só é criada durante a aprovação, para receita ou despesa padrão sem vínculos especiais, separada por pessoa, espaço e direção. Sugestões aplicadas não ativam o aprendizado automaticamente. Regras genéricas como “Pix” são ignoradas pelo motor.

## Integridade e implantação

As sugestões ficam limitadas aos espaços autorizados. Categorias existentes são preservadas, inclusive quando outra sessão as preenche durante a operação. A aplicação em lote aceita até 500 linhas distintas de um único lote em revisão e ocorre em uma transação, sem alterar valor, data, documento, natureza ou ledger. A interface apresenta 50 linhas por página.

Aplicar, na sequência do histórico existente, `202610210010_import_categorization.sql` e `202610210011_import_category_learning.sql` antes de publicar o servidor. A primeira adiciona o RPC de classificação; a segunda protege o aprendizado na aprovação. Os RPCs permanecem exclusivos do backend (`service_role`), com conferência de papel e espaço sob lock. A versão-base de readiness continua em `202610210009`; esse indicador não substitui a verificação das novas migrações.

Não há reclassificação automática de lançamentos antigos. O histórico legado precisa de revisão própria antes de servir como referência confiável.
