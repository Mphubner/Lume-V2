# Acesso por email no piloto

Verificação remota em 20/10/2026: Email habilitado, confirmação obrigatória, novos cadastros permitidos e acesso anônimo desabilitado. Google está habilitado no Supabase, mas fica oculto na nova versão do aplicativo até uma homologação completa. Site URL é `https://lumefin.com.br` e o retorno permitido `https://lumefin.com.br/**` já cobre o callback novo. Nenhuma dessas configurações foi alterada durante a inspeção.

Na inspeção de 20/10/2026, o projeto usava o serviço de email embutido, que restringe destinatários à equipe. Em 21/10/2026, o SMTP Gmail foi salvo, mas o envio real retornou 535 (credencial recusada). O responsável substituiu esse serviço pelo Brevo no próprio Supabase. [Restrições oficiais do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Brevo configurado no Supabase

| Campo | Configuração verificada |
| --- | --- |
| SMTP personalizado | Habilitado |
| Nome do remetente | Lume Fin |
| Host | `smtp-relay.brevo.com` |
| Porta | `587` |
| Usuário e senha | Credenciais SMTP Brevo inseridas pelo responsável no painel |
| Remetente | Deve corresponder a um remetente verificado no Brevo |

Não coloque a senha SMTP no Git, em variáveis `VITE_` ou no chat. Um `SMTP_PASSWORD` em `backend/.env` não configura o Supabase Auth. O remetente de email é separado do usuário técnico utilizado para autenticar no SMTP Brevo.

O primeiro teste com Brevo foi aceito pelo Supabase (HTTP 200), mas o histórico transacional confirmou erro: o Gmail configurado como remetente não era válido no Brevo. O destinatário confirmou que não recebeu a mensagem. Portanto, HTTP 200 não comprova entrega. A conclusão exige corrigir/verificar o remetente, repetir o envio, conferir o status no provedor e confirmar o recebimento.

O endereço desejado foi informado como `contato@lumefin.com`, enquanto o aplicativo usa `lumefin.com.br`. A confirmação do domínio exato e sua validação no Brevo estão pendentes. Não deduza que esses dois domínios pertençam ao mesmo responsável e não salve um remetente não verificado como se a configuração estivesse concluída.

## Retorno e confirmação

Mantenha Confirm email ligado. Publique frontend com `VITE_GOOGLE_AUTH_ENABLED=false`, chave pública Supabase e a rota `/auth/callback`. O provedor envia o link de confirmação; o aplicativo só informa que a solicitação foi aceita, sem garantir entrega. Links inválidos/expirados levam a uma ação de recuperação. Cadastro existente orienta login/recuperação e preserva o destino de convites.

O padrão atual `https://lumefin.com.br/**` permite o callback com `?next=`. Se substituir por regras mais específicas depois, inclua `/auth/callback**` e os retornos antigos `/login`, `/resetar-senha` e `/convite` enquanto houver links em circulação. Não permita origens de terceiros. [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

Confira os modelos de confirmação/recuperação para manter o link `{{ .ConfirmationURL }}` fornecido pelo Supabase; evite rastreamento que reescreva links de autenticação. Para uso local, inclua explicitamente `http://localhost:5173/auth/callback**` e `http://127.0.0.1:5173/auth/callback**` na lista permitida do projeto; cada origem usada no navegador precisa de seu próprio retorno.

## Aceite antes de liberar convidados

Use duas contas fictícias controladas pelo responsável, em homologação: cadastro, recebimento na caixa de entrada, confirmação, login, reenvio com intervalo, link expirado, recuperação em outro navegador e login de uma conta que antes usava Google. Para essa última, a recuperação permite definir senha sem depender de OAuth. Teste também que o convite chega ao espaço correto após confirmar o email.

Esse roteiro envolve recebimento e acesso humanos reais. Testes locais com respostas simuladas não comprovam entrega, reputação ou limites do serviço. O SMTP Brevo já está salvo; o aceite de entrega permanece pendente até corrigir o remetente e confirmar o recebimento de um link válido. As duas identidades sintéticas usadas nos testes de API foram confirmadas administrativamente apenas para QA: esses testes não validam entrega de email.
