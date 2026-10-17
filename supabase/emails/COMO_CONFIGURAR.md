# Confirmação do e-mail com código de 6 números

O app já está pronto: depois do cadastro, ele pede o código que chega por e-mail.
Falta ligar a confirmação no Supabase e configurar quem envia o e-mail.

Enquanto a confirmação estiver **desligada**, o app funciona como sempre: o cadastro entra direto.
Ligou, o código passa a ser pedido. Desligou, volta ao que era. Nada no banco muda.

> Nenhuma senha deste roteiro vai para o código, para o README ou para o chat.
> A senha de app do Gmail fica só no painel do Supabase.

---

## Passo 1 — Senha de app do Gmail (5 min)

O Supabase precisa de uma senha especial para enviar e-mails pelo seu Gmail.
Não é a senha normal da conta.

1. Entre em <https://myaccount.google.com> com o Gmail que vai enviar os e-mails.
2. **Segurança** → **Verificação em duas etapas**: ligue, se ainda não estiver ligada.
   (Sem ela, o Google não deixa criar a senha de app.)
3. Abra <https://myaccount.google.com/apppasswords>.
4. Em "Nome do app", escreva `Supabase +party` → **Criar**.
5. Aparece uma senha de 16 letras (ex.: `abcd efgh ijkl mnop`). **Copie sem os espaços** e
   deixe a janela aberta: ela só aparece uma vez.

## Passo 2 — SMTP próprio no Supabase (5 min)

Sem isso, o Supabase usa o e-mail de teste dele, que manda pouquíssimos e-mails por hora,
e o código pode não chegar.

1. Supabase → seu projeto → **Authentication** → **Emails** → aba **SMTP Settings**.
2. Ligue **Enable custom SMTP**.
3. Preencha:

   | Campo | O que colocar |
   |---|---|
   | Sender email | o Gmail do passo 1 |
   | Sender name | `+party` |
   | Host | `smtp.gmail.com` |
   | Port number | `587` |
   | Minimum interval between emails | `60` (segundos) |
   | Username | o Gmail do passo 1 (completo, com @gmail.com) |
   | Password | a senha de app de 16 letras, sem espaços |

4. **Save changes**.

O Gmail aguenta por volta de 500 envios por dia, suficiente para o projeto.

## Passo 3 — O modelo do e-mail (3 min)

1. Ainda em **Authentication** → **Emails**, aba **Templates** → **Confirm signup**.
2. **Subject** (assunto): `Seu código do +party: {{ .Token }}`
3. **Body** (corpo): apague o que está lá e cole o conteúdo inteiro do arquivo
   [`confirmar-cadastro.html`](confirmar-cadastro.html), desta mesma pasta.
4. **Save changes**.

O `{{ .Token }}` é onde o Supabase coloca o código. Não troque.

O e-mail não tem link de confirmação de propósito: a pessoa digita o código no app.
Um link levaria para o endereço do site configurado no Supabase, que muda entre o
computador de quem desenvolve e o site publicado.

## Passo 4 — Ligar a confirmação e ajustar o código (2 min)

1. **Authentication** → **Sign In / Providers** → **Email**.
2. Ligue **Confirm email**.
3. Confira:
   - **Email OTP Length**: `6`
   - **Email OTP Expiration**: `600` (segundos = 10 minutos, o que o e-mail promete)
4. **Save**.

Os nomes dos campos podem variar um pouco conforme a versão do painel.
Se algum não aparecer, me mande um print da tela.

## Passo 5 — Testar (5 min)

Dica: no Gmail, `seuemail+teste1@gmail.com` chega na mesma caixa que `seuemail@gmail.com`,
mas o Supabase vê como outro e-mail. Dá para criar várias contas de teste com um Gmail só.

1. No app, **Cadastre-se** com um e-mail desses.
2. Deve aparecer a tela **Confirme seu e-mail**, com 6 caixas.
3. Confira o Gmail (e o spam): chega "Seu código do +party: 123456".
4. Digite o código: o app entra na conta sozinho.
5. Teste também:
   - **Código errado**: aparece "Código incorreto ou vencido".
   - **Reenviar**: espere a contagem de 1 minuto e toque em **Reenviar código**.
   - **Fechar o app antes de digitar**: ao tentar entrar com e-mail e senha, o app manda um
     código novo e abre a tela dele.
   - **Convite de atendente**: abra um link de convite, crie a conta, digite o código e veja
     o pedido chegar na aba Equipe do gerente.

## Se algo der errado

| O que acontece | O que fazer |
|---|---|
| O código não chega | Confira o spam; confira o passo 2 (a senha é a de app, sem espaços). Em **Authentication → Logs** aparece o erro do envio. |
| "Error sending confirmation email" no cadastro | Os dados do SMTP estão errados. Refaça o passo 2. |
| O e-mail chega sem o código | O modelo perdeu o `{{ .Token }}`. Refaça o passo 3. |
| Precisa voltar atrás com urgência | Desligue **Confirm email** (passo 4). O app volta a entrar direto no cadastro. |

## O que não muda

- As contas que já existem (gerente, atendentes e clientes de teste) foram criadas com a
  confirmação desligada e já contam como confirmadas. Elas continuam entrando normalmente.
- O banco não muda: nenhum SQL para rodar.
