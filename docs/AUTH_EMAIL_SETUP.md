# Acesso por email no piloto

Verificação remota em 20/10/2026: Email habilitado, confirmação obrigatória, novos cadastros permitidos e acesso anônimo desabilitado. Google está habilitado no Supabase, mas fica oculto na nova versão do aplicativo até uma homologação completa. Site URL é `https://lumefin.com.br` e o retorno permitido `https://lumefin.com.br/**` já cobre o callback novo. Nenhuma dessas configurações foi alterada durante a inspeção.

Na inspeção de 20/10/2026, o projeto usava o serviço de email embutido, que restringe destinatários à equipe e impõe limite de envio. Em 21/10/2026, Marcos escolheu usar SMTP do Gmail no piloto. Os campos públicos foram preparados no painel Supabase; a senha de app e o salvamento ficam com o responsável. Essa preparação não comprova configuração salva nem entrega de mensagens. [Restrições oficiais do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Gmail escolhido para o piloto

1. Na conta Google do remetente, ative a verificação em duas etapas e crie uma senha de app para o Lume. A senha normal do Gmail não serve para essa configuração. O Google pode restringir senhas de app conforme a política da conta.
2. Em Authentication → Emails → SMTP Settings do projeto Lume, habilite o SMTP personalizado e confira os campos abaixo. O remetente e o usuário precisam corresponder à conta Gmail autenticada.
3. Insira a senha de app diretamente no campo Password do painel e salve. Não coloque essa senha no Git, em variáveis `VITE_` ou no chat. Um `SMTP_PASSWORD` em `backend/.env` não configura o Supabase Auth.

| Campo | Valor |
| --- | --- |
| Remetente | `marcosphubner@gmail.com` |
| Nome | `Lume Fin` |
| Host | `smtp.gmail.com` |
| Porta | `465` |
| Usuário | `marcosphubner@gmail.com` |
| Senha | Senha de app do Google, preenchida pelo responsável |

O Supabase documenta `smtp.gmail.com` nas portas 465 e 587; o formulário preparado usa 465. Esta escolha usa o endereço Gmail como remetente e não provisiona um endereço `@lumefin.com.br`. Confira os limites e a entrega do Gmail durante o piloto, antes de convidar outras pessoas. [Integração oficial Supabase/Google](https://supabase.com/docs/guides/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y), [senhas de app do Google](https://support.google.com/mail/answer/185833?hl=pt-BR).

## Retorno e confirmação

Mantenha Confirm email ligado. Publique frontend com `VITE_GOOGLE_AUTH_ENABLED=false`, chave pública Supabase e a rota `/auth/callback`. O provedor envia o link de confirmação; o aplicativo só informa que a solicitação foi aceita, sem garantir entrega. Links inválidos/expirados levam a uma ação de recuperação. Cadastro existente orienta login/recuperação e preserva o destino de convites.

O padrão atual `https://lumefin.com.br/**` permite o callback com `?next=`. Se substituir por regras mais específicas depois, inclua `/auth/callback**` e os retornos antigos `/login`, `/resetar-senha` e `/convite` enquanto houver links em circulação. Não permita origens de terceiros. [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

Confira os modelos de confirmação/recuperação para manter o link `{{ .ConfirmationURL }}` fornecido pelo Supabase; evite rastreamento que reescreva links de autenticação. Para uso local, inclua explicitamente `http://localhost:5173/auth/callback**` e `http://127.0.0.1:5173/auth/callback**` na lista permitida do projeto; cada origem usada no navegador precisa de seu próprio retorno.

## Aceite antes de liberar convidados

Use duas contas fictícias controladas pelo responsável, em homologação: cadastro, recebimento na caixa de entrada, confirmação, login, reenvio com intervalo, link expirado, recuperação em outro navegador e login de uma conta que antes usava Google. Para essa última, a recuperação permite definir senha sem depender de OAuth. Teste também que o convite chega ao espaço correto após confirmar o email.

Esse roteiro envolve recebimento e acesso humanos reais. Testes locais com respostas simuladas não comprovam entrega, reputação ou limites do serviço. A habilitação e o aceite remoto permanecem pendentes até o responsável salvar a senha de app e confirmar o recebimento de um link válido.
