<div align="center">

<!-- Banner: adicionar docs/img/banner.png e descomentar
<img src="docs/img/banner.png" alt="+party — comanda digital para bares" width="720" />
-->

# +party

<h3>Sua noite, sem complicação.</h3>

Comanda digital para bares: do pedido ao pagamento, sem fila e sem papel.

<p>
  <a href="#-o-que-é-o-party">Sobre</a> ·
  <a href="#-experimente">Como rodar</a> ·
  <a href="#-arquitetura">Arquitetura</a> ·
  <a href="#-estado-do-projeto">Estado do projeto</a> ·
  <a href="#-equipe">Equipe</a>
</p>

<p>
  <img src="https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white" alt="Angular 22" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" alt="TypeScript 6" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/testes-Vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/licença-MIT-blue" alt="Licença MIT" />
</p>

</div>

<!-- Imagem de destaque: adicionar docs/img/tres-acessos.png (uma tela de cada área) e descomentar
<img src="docs/img/tres-acessos.png" alt="As três áreas do +party: cliente, atendente e gerente" width="100%" />
-->

## 🍻 O que é o +party?

O **+party** resolve os atritos de uma noite fora dos dois lados do balcão. Do lado do cliente: escolher o bar, abrir uma comanda digital e pedir sem enfrentar fila. Do lado do estabelecimento: liberar quem chegou, organizar os pedidos entre bar e cozinha e acompanhar o movimento da noite.

É um projeto acadêmico da disciplina **Startup Project One**, do curso de Análise e Desenvolvimento de Sistemas da **Facens**. O protótipo foi validado com professores e com personas reais, incluindo um dono de bar em atividade.

O sistema tem **três acessos**, todos pela mesma tela de login. O app identifica o tipo do usuário e leva cada um para a sua área:

| Acesso | Quem usa | O que faz |
|---|---|---|
| 🍹 **Cliente** | Quem está no bar | Encontra o bar, abre a comanda, faz pedidos e fecha a conta |
| 👨‍🍳 **Atendente** | Barman, cozinha e caixa | Libera a entrada, acompanha bar e cozinha e confirma o pagamento |
| 📊 **Gerente** | Dono do bar | Acompanha o movimento e os resultados da noite, publica postagens, monta a equipe e edita o perfil do bar |

## ⚡ Experimente

Com Node.js e npm instalados:

```bash
git clone https://github.com/PedroLima-07/Startup-PlusParty.git
cd Startup-PlusParty
npm install
npm start
```

O app abre em **http://localhost:4200**, na tela de login.

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o app em modo de desenvolvimento |
| `npm test` | Roda os testes unitários |
| `npm run build` | Gera a versão de produção |

A conexão com o Supabase já vem configurada em `src/environments`. A chave usada é a pública (*publishable*): quem protege os dados são as regras do próprio banco.

<!-- Resultado: adicionar docs/img/jornada.png (discovery, comanda e cardápio) e descomentar
<img src="docs/img/jornada.png" alt="Jornada do cliente: discovery, comanda e cardápio" width="100%" />
-->

## 🧭 Jornada principal

O fluxo completo funciona de ponta a ponta, com dados reais:

| # | Quem | O que acontece |
|---|---|---|
| 1 | Cliente | Escolhe o bar no Discovery e vê o perfil do estabelecimento |
| 2 | Cliente | Informa se está em uma mesa ou no balcão |
| 3 | Sistema | A comanda nasce como *aguardando liberação* |
| 4 | Atendente | Confirma a presença do cliente e libera a comanda (ou recusa, se ele não estiver no bar) |
| 5 | Cliente | Monta o carrinho no cardápio e confirma o pedido |
| 6 | Bar e cozinha | Cada setor vê os seus itens e avança: *novo → em andamento → pronto* |
| 7 | Cliente | Fecha a conta, confirmando que recebeu tudo |
| 8 | Cliente | Paga no caixa (fora do sistema) |
| 9 | Atendente | Confirma o pagamento e a comanda é encerrada |

### Regras de negócio

- A **comanda pertence ao cliente**, não à mesa: várias pessoas na mesma mesa têm comandas separadas
- A comanda pode não ter mesa (**balcão**)
- **Nenhum pedido antes da liberação**: o atendente confirma a presença física do cliente
- O **status fica em cada item**: bar e cozinha avançam em ritmos diferentes
- O **preço é congelado no pedido**: mudanças no cardápio não alteram o que já foi pedido
- O **pagamento acontece no caixa**: o app registra o fechamento e a confirmação, mas não processa transações

## ✨ Principais funcionalidades

- **Login único com redirecionamento por perfil**: cliente, atendente e gerente, cada um na sua área
- **Recuperação de senha por e-mail**
- **Discovery de bares** com fotos, busca e perfil completo do estabelecimento
- **Comanda digital** em mesa ou balcão, sem comandas duplicadas
- **Cardápio por categoria** com carrinho; o pedido é gravado numa única transação no banco
- **Telas do atendente**: Pedidos, separados em Bar e Cozinha, e Comandas, para liberar ou recusar a entrada, acompanhar as abertas e conferir os itens antes de confirmar o pagamento, com um contador de pendências na navegação
- **Área do gerente** com movimento, resumo da noite, resultados, postagens, equipe e perfil do bar
- **Atualização em tempo real** entre a tela do cliente e a do atendente (requer o script `realtime.sql` aplicado no banco)
- **Segurança no banco**: as regras valem mesmo para quem chama a API diretamente

## 🏗️ Arquitetura

| Camada | Tecnologia |
|---|---|
| Interface | Angular 22 (standalone components, signals, `@if` / `@for`), SCSS |
| Linguagem | TypeScript 6 |
| Backend | Supabase: PostgreSQL, Auth, Row Level Security e Realtime |
| Testes | Vitest |
| Protótipo e gestão | Figma e Trello |

<!-- Diagrama do banco: adicionar docs/img/diagrama-banco.png (exportado do dbdiagram) e descomentar
<img src="docs/img/diagrama-banco.png" alt="Diagrama do banco de dados" width="100%" />
-->

### Banco de dados

8 tabelas: `estabelecimentos`, `perfis`, `itens`, `comandas`, `pedidos`, `pedido_itens`, `alertas` e `postagens`.

Os scripts ficam versionados na pasta [`supabase/`](supabase/) e são aplicados pelo SQL Editor do Supabase:

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
| `recusar_comanda.sql` | Status `recusada`: o atendente recusa a comanda de quem não está no bar |

### Segurança

- **Row Level Security** em todas as tabelas: o cliente só vê as próprias comandas; funcionário e gerente só veem o que é do seu bar
- **Regras validadas no banco**, não só na tela: um cliente não consegue liberar a própria comanda, marcá-la como paga, mudar o próprio perfil para gerente nem definir o preço do item que pede
- **Rotas protegidas**: as telas do atendente e do gerente só abrem para a equipe do bar, e usar uma comanda exige login

### Estrutura de pastas

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

A landing page do projeto fica em um repositório separado.

## 📍 Estado do projeto

🚧 **Em desenvolvimento** — apresentação final prevista para **15/11/2026**.

| Área | Situação |
|---|---|
| Jornada do cliente | ✅ Pronta, com dados reais |
| Telas do atendente | ✅ Prontas, com dados reais |
| Login, cadastro e recuperação de senha | ✅ Prontos |
| Área do gerente | 🚧 Login real; telas ainda com dados de exemplo |
| Feed, chamar garçom, avaliação e histórico | 📋 Próximas etapas |
| Cadastro de cardápio pelo gerente | ⛔ Fora do escopo: feito pela equipe no banco |
| Pagamento dentro do app | ⛔ Fora do escopo |

## 🤝 Como contribuir

1. Crie uma branch a partir da `main` (`feature/nome-da-tarefa` ou `fix/nome-do-problema`)
2. Faça commits no padrão *conventional commits*: `feat:`, `fix:`, `chore:`, `docs:`, `style:`
3. Rode `npm test` e `npm run build` antes de abrir o pull request
4. Se a mudança exigir alteração no banco, inclua o script em `supabase/` e avise no PR que ele precisa ser aplicado antes do merge

## 👥 Equipe

<!-- Completar com o nome e a função dos 7 integrantes -->

<p>
  <a href="https://github.com/PedroLima-07"><img src="https://github.com/PedroLima-07.png?size=80" width="64" alt="PedroLima-07" /></a>
  <a href="https://github.com/NathanDotAlves"><img src="https://github.com/NathanDotAlves.png?size=80" width="64" alt="NathanDotAlves" /></a>
  <a href="https://github.com/gabrielmarques23"><img src="https://github.com/gabrielmarques23.png?size=80" width="64" alt="gabrielmarques23" /></a>
  <a href="https://github.com/luizeflss"><img src="https://github.com/luizeflss.png?size=80" width="64" alt="luizeflss" /></a>
  <a href="https://github.com/danilobossolani"><img src="https://github.com/danilobossolani.png?size=80" width="64" alt="danilobossolani" /></a>
</p>

## 📄 Licença

Distribuído sob a licença **MIT**. Veja o arquivo [`LICENSE`](LICENSE).

<div align="center">
  <sub>+party 2026 · Startup Project One · Análise e Desenvolvimento de Sistemas · Facens</sub>
</div>
