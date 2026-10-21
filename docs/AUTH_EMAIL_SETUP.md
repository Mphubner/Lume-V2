# Acesso por email no piloto

Verificação remota em 20/10/2026: Email habilitado, confirmação obrigatória, novos cadastros permitidos e acesso anônimo desabilitado. Google está habilitado no Supabase, mas fica oculto na nova versão do aplicativo até uma homologação completa. Site URL é `https://lumefin.com.br` e o retorno permitido `https://lumefin.com.br/**` já cobre o callback novo. Nenhuma dessas configurações foi alterada durante a inspeção.

O projeto usa o serviço de email embutido. Ele restringe destinatários à equipe e impõe limite de envio; por isso a confirmação para familiares/amigos precisa de SMTP próprio. Marcos confirmou que ainda não tem esse serviço. [Restrições oficiais do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Opção para o piloto

Resend oferece atualmente uma franquia gratuita de 3.000 emails/mês, limitada a 100/dia. Não foi criada conta nem contratado plano nesta implementação. Confira a franquia no momento de ativar. [Preço oficial](https://resend.com/pricing).

1. Crie uma conta no serviço e verifique um domínio de envio que você controla, por exemplo `conta.lumefin.com.br`. O painel fornecerá os registros DNS reais; não invente valores SPF/DKIM nem substitua os registros de recebimento do domínio.
2. Após a verificação, crie uma chave apenas para envio e restrita ao domínio, quando disponível. Ela deve ser inserida diretamente no painel Supabase, nunca no frontend ou no Git.
3. Em Authentication → Emails → SMTP Settings, configure os valores abaixo e um remetente do domínio verificado. Sugestão de endereço, ainda não provisionado: `acesso@conta.lumefin.com.br`, nome `Lume Fin`.

| Campo | Valor |
| --- | --- |
| Host | `smtp.resend.com` |
| Porta | `465` |
| Usuário | `resend` |
| Senha | Chave privada do serviço, preenchida pelo responsável |

O provedor documenta essa integração e exige domínio verificado e chave válida. [Integração oficial](https://resend.com/docs/send-with-supabase-smtp), [verificação do domínio](https://resend.com/docs/dashboard/domains/introduction).

## Retorno e confirmação

Mantenha Confirm email ligado. Publique frontend com `VITE_GOOGLE_AUTH_ENABLED=false`, chave pública Supabase e a rota `/auth/callback`. O provedor envia o link de confirmação; o aplicativo só informa que a solicitação foi aceita, sem garantir entrega. Links inválidos/expirados levam a uma ação de recuperação. Cadastro existente orienta login/recuperação e preserva o destino de convites.

O padrão atual `https://lumefin.com.br/**` permite o callback com `?next=`. Se substituir por regras mais específicas depois, inclua `/auth/callback**` e os retornos antigos `/login`, `/resetar-senha` e `/convite` enquanto houver links em circulação. Não permita origens de terceiros. [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

Confira os modelos de confirmação/recuperação para manter o link `{{ .ConfirmationURL }}` fornecido pelo Supabase; evite rastreamento que reescreva links de autenticação. O remetente precisa corresponder ao domínio verificado.

## Aceite antes de liberar convidados

Use duas contas fictícias controladas pelo responsável, em homologação: cadastro, recebimento na caixa de entrada, confirmação, login, reenvio com intervalo, link expirado, recuperação em outro navegador e login de uma conta que antes usava Google. Para essa última, a recuperação permite definir senha sem depender de OAuth. Teste também que o convite chega ao espaço correto após confirmar o email.

Esse roteiro envolve recebimento e acesso humanos reais. Testes locais com respostas simuladas não comprovam entrega, DNS, reputação ou limites do serviço. A habilitação remota permanece pendente até conta, domínio e credencial estarem disponíveis.
