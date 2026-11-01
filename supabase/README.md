# +party — guia técnico

O [README principal](../README.md) apresenta o produto. Aqui ficam os detalhes para quem desenvolve: como rodar, os scripts do banco, a chave do Google Maps e como contribuir.

## Rodar na sua máquina

Com Node.js e npm instalados:

```bash
npm install
npm start
```

O app abre em **http://localhost:4200**. `npm test` roda os testes e `npm run build` gera a versão de produção. A conexão com o Supabase vem configurada em `src/environments`, com a chave pública (*publishable*): quem protege os dados são as regras do próprio banco.

## Publicar o app

O app é um site estático: `npm run build` gera tudo em `dist/temp/browser`. Já vêm prontos:

- `public/_redirects` e `public/_headers` (Cloudflare Pages e Netlify) e `vercel.json` (Vercel): toda rota abre o app, mesmo ao recarregar a página; cabeçalhos de segurança (anti-*clickjacking*, HTTPS obrigatório, sem acesso a câmera, microfone e localização); e cache longo só para os arquivos com hash no nome.
- `public/manifest.webmanifest` e `public/icons/`: o app pode ser instalado no celular ("Adicionar à tela inicial").

**Cloudflare Pages** (recomendado, mesma conta da landing page):

1. Cloudflare → *Workers & Pages* → *Create* → *Pages* → *Connect to Git* → escolher este repositório.
2. *Framework preset*: **Angular** · *Build command*: `npm run build` · *Build output directory*: `dist/temp/browser`.
3. *Save and Deploy*. Cada merge na `main` publica sozinho; cada PR ganha um endereço de teste.

**Depois de publicar**, no Supabase → *Authentication* → *URL Configuration*:

- *Site URL*: o endereço publicado (ex.: `https://plusparty.pages.dev`);
- *Redirect URLs*: o mesmo endereço com `/**` no fim, e `http://localhost:4200/**` para continuar testando na máquina.

Sem isso, os links de "esqueci minha senha" levam para o endereço antigo.

## Scripts do banco

Os scripts desta pasta são aplicados pelo **SQL Editor** do Supabase. Cada um explica no topo o que faz e termina com uma consulta de conferência.

| Arquivo | Função |
|---|---|
| `rls_policies.sql` | Regras de acesso por linha das 8 tabelas |
| `trigger_criar_perfil.sql` | Cria o perfil automaticamente no cadastro |
| `protecoes.sql` | Valida as regras de negócio no próprio banco |
| `criar_pedido.sql` | Grava o pedido e os itens numa única transação |
| `realtime.sql` | Liga a atualização em tempo real |
| `estabelecimentos_detalhes.sql` | Foto, descrição, tags e horário de funcionamento do bar |
| `seed_novo_bar.sql` | Modelo para cadastrar um bar novo, o seu cardápio e o gerente |
| `equipe.sql` | Atendente pede para entrar na equipe de um bar e o gerente aprova, recusa ou remove |
| `equipe_convites.sql` | Entrada na equipe só por convite, foto de perfil (Storage) e registro de quem entregou cada pedido |
| `recusar_comanda.sql` | Status `recusada`: o atendente recusa a comanda de quem não está no bar |
| `feed_notificacoes.sql` | Postagens com tipo, preço e validade (com promoções de exemplo), fotos no Storage e notificações criadas pelo próprio banco |
| `comanda_regras.sql` | Uma comanda ativa por cliente (trava abas duplicadas e conta não paga), status `cancelada` e `nao_paga` (gerente libera quem saiu sem pagar) e histórico de contas não pagas para quem libera |
| `avaliacoes.sql` | Avaliações verificadas: só quem pagou avalia (uma vez por comanda, até 7 dias), o pedido fica guardado até responder ou dispensar, nota do bar calculada pelo banco, resposta e denúncia do gerente |
| `mesa_fila.sql` | Situação da mesa (livre, em uso, sendo liberada) e fila de espera: quando a mesa libera, o banco abre a comanda do primeiro da fila e avisa |
| `agenda_eventos.sql` | Agenda de eventos do bar (com repetição semanal), "Tenho interesse", lembrete 2 h antes (pg_cron) e aviso de evento cancelado |
| `resultados_periodo.sql` | Números da tela Resultados para 3, 7, 15 ou 30 dias, já somados no banco e comparados com o período anterior |
| `bar_redes_localizacao.sql` | Instagram, TikTok, WhatsApp e ponto no mapa do bar (o banco limpa o que o gerente digita); edição de postagens sem mudar a data de publicação |
| `demo_bar_dze.sql` | Demonstração no Bar D'Zé: a noite de hoje e os 30 dias anteriores (sexta e sábado cheios), avaliações, agenda com interessados, uma fila de mesa e uma conta não paga, com os horários de agora. `demo_bar_dze_remover.sql` apaga tudo |
| `seguranca_advisor.sql` | Correções do Security Advisor do Supabase: `search_path` fixo em todas as funções, funções de trigger fechadas para chamadas diretas e funções `SECURITY DEFINER` fechadas para visitantes, exceto as que o app usa sem login |
| `indices.sql` | Índices das consultas mais usadas (Movimento, Resultados, comandas do cliente, equipe), sugeridos pelo Index Advisor do Supabase |
| `item_nao_recebido.sql` | Fecha a conta sem cobrar o que o cliente não recebeu: tira o item da conta, registra o motivo e avisa a equipe e o gerente |
| `seguranca_pedidos.sql` | Regra de gravação de itens de pedido tão rígida quanto a `criar_pedido` (comanda aberta, item do mesmo bar e disponível, quantidade de 1 a 99) e cadastro de perfil só como cliente |
| `excluir_conta.sql` | "Excluir minha conta" (LGPD): apaga notificações, interesses, fila e pedidos de avaliação, anonimiza o perfil e desativa o login; comandas e avaliações ficam no histórico do bar sem o nome. Só para clientes sem comanda em andamento |

## Google Maps

O mapa do Descobrir e o ponto do bar nas Configurações do gerente usam a **Maps JavaScript API**. Sem chave, o app mostra "Mapa indisponível" e todo o resto funciona, inclusive o "Como chegar", que é só um link para o app do Google Maps e não usa a chave.

Para ligar o mapa:

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto (ou use um existente) e ative o **faturamento**. O uso de um app pequeno fica dentro da cota gratuita mensal, mas o Google exige o cartão cadastrado.
2. Em **APIs e serviços → Biblioteca**, ative a **Maps JavaScript API**.
3. Em **APIs e serviços → Credenciais**, crie uma **chave de API** e restrinja:
   - **Restrições de aplicativo:** *Sites*, com os domínios do app (ex.: `https://seu-dominio.com/*` e `http://localhost:4200/*`);
   - **Restrições de API:** só a *Maps JavaScript API*.
4. Em **Faturamento → Orçamentos e alertas**, crie um alerta de orçamento (ex.: R$ 10) para ser avisado de qualquer uso inesperado.
5. Cole a chave em `googleMapsKey` nos dois arquivos de `src/environments/`. Com as restrições do passo 3 ela pode ficar no código: só funciona nos domínios liberados.

Depois, cada gerente marca o ponto do bar em **Configurações → Redes e localização**, e o bar aparece no mapa do Descobrir.

## Estrutura de pastas

```
src/app/
├── Pages/        telas (login, discovery, comanda, cardápio, atendente, gerente…)
├── components/   componentes reutilizáveis
├── guards/       proteção de rotas por tipo de usuário
├── models/       interfaces compartilhadas
└── services/     acesso ao Supabase, um serviço por área
supabase/         scripts SQL do banco
public/           imagens e ícones
```

## Como contribuir

1. Crie uma branch a partir da `main` (`feature/nome-da-tarefa` ou `fix/nome-do-problema`)
2. Faça commits no padrão *conventional commits*: `feat:`, `fix:`, `chore:`, `docs:`, `style:`
3. Rode `npm test` e `npm run build` antes de abrir o pull request
4. Se a mudança exigir alteração no banco, inclua o script em `supabase/` e avise no PR que ele precisa ser aplicado antes do merge
