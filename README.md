# Resenhou

> Sua noite, sem complicação.

Resenhou é um sistema de vida noturna que conecta quem sai para o rolê com os bares da cidade.
De um lado, um app para o cliente descobrir bares, abrir comanda digital e pedir sem enfrentar
fila; do outro, um painel para o dono do estabelecimento gerenciar mesas, comandas e o
movimento da noite. As duas pontas se comunicam por trás através de um backend compartilhado.

Projeto acadêmico desenvolvido na disciplina **Startup Project One** do curso de Análise e
Desenvolvimento de Sistemas.

---

## Índice

- [Sobre o projeto](#sobre-o-projeto)
- [O problema](#o-problema)
- [A solução](#a-solução)
- [As duas frentes](#as-duas-frentes)
- [Principais funcionalidades](#principais-funcionalidades)
- [Tecnologias](#tecnologias)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Como rodar](#como-rodar)
- [Status do projeto](#status-do-projeto)
- [Equipe](#equipe)

---

## Sobre o projeto

Resenhou nasceu da observação de que a saída noturna tem atritos evitáveis dos dois lados do
balcão: o cliente enfrenta filas e falta de informação, e o dono do bar perde controle da
operação na correria da noite. O sistema ataca os dois problemas com uma única base de dados
compartilhada, entregando uma experiência sob medida para cada perfil.

## O problema

- Filas para pagar a conta no fim da noite.
- Dificuldade de chamar atendimento ou fazer novos pedidos em locais lotados.
- Chegar a um estabelecimento e encontrá-lo vazio ou cheio demais, sem saber antes.
- Do lado do dono: controle de comandas manual, sem visão em tempo real da ocupação do salão.

## A solução

Um sistema em duas frentes que se conversam:

- O cliente descobre bares com indicador de lotação em tempo real, abre uma comanda digital
  (com ou sem mesa), faz pedidos pelo próprio celular e fecha a conta sem fila.
- O dono acompanha as comandas abertas, o status de cada mesa e o movimento da noite em um
  painel, além de poder divulgar novidades diretamente para os clientes do app.

## As duas frentes

| Frente | Público | Plataforma | Cor de identidade |
|---|---|---|---|
| App do cliente | Cliente / rolezeiro | Mobile (web) | Azul-marinho |
| Painel do estabelecimento | Dono do bar | Desktop (web) | Verde |
| Landing page | Ambos (entrada) | Web | Azul (marca) |

> Observação: nesta fase do projeto, ambas as frentes são entregues como aplicação **web**.
> Funcionalidades que dependem de recursos exclusivos de dispositivos móveis (como
> geolocalização contínua em segundo plano) ficam previstas para uma futura versão em app
> nativo.

## Principais funcionalidades

**App do cliente**
- Cadastro e login
- Descoberta de bares com indicador de lotação
- Comanda digital com aprovação do estabelecimento
- Cardápio, carrinho e pedidos
- Fechamento de conta com pagamento simulado
- Avaliação do estabelecimento
- Grupo de amigos ("esquadrão")

**Painel do estabelecimento**
- Dashboard com indicador de lotação da noite
- Gestão de mesas e cardápio
- Comandas em tempo real, organizadas por ID e vinculadas ao cliente
- Avaliações recebidas
- Divulgação de novidades para os clientes

## Tecnologias

- **Front-end:** [Angular / especificar versão]
- **Back-end:** [especificar — ex: Node.js, .NET, etc.]
- **Banco de dados:** [especificar]
- **Prototipação:** Figma
- **Gestão de projeto:** Trello

> Preencher conforme as decisões finais da equipe.

## Estrutura do repositório

```
resenhou/
├── cliente/           # App do cliente (mobile web)
├── estabelecimento/   # Painel do dono (desktop web)
├── landing/           # Landing page
└── docs/              # Documentação do projeto
```

> Ajustar conforme a organização real adotada pela equipe (monorepo ou repositórios
> separados).

## Como rodar

```bash
# Clonar o repositório
git clone [URL-do-repositório]
cd resenhou

# Instalar dependências
[comando de instalação — ex: npm install]

# Rodar o projeto
[comando de execução — ex: ng serve]
```

> Preencher com os comandos reais assim que o ambiente estiver definido.

## Status do projeto

🚧 **Em desenvolvimento** — MVP acadêmico.

Fase atual: prototipação validada com professores e personas, iniciando o desenvolvimento das
frentes web.

## Equipe

| Nome | Função |
|---|---|
| [Nome 1] | [Função] |
| [Nome 2] | [Função] |
| [Nome 3] | [Função] |
| [Nome 4] | [Função] |
| [Nome 5] | [Função] |

---

Projeto acadêmico — Análise e Desenvolvimento de Sistemas.
