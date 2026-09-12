<div align="center">

# +party

**Sua noite, sem complicação.**

Sistema de vida noturna que conecta quem sai para o rolê com os bares da cidade.

</div>

---

## Sobre

O +party resolve os atritos de uma noite fora dos dois lados do balcão. Do lado do cliente:
descobrir onde a noite está acontecendo, abrir uma comanda digital e pedir sem enfrentar fila.
Do lado do estabelecimento: acompanhar o movimento, organizar os pedidos entre bar e cozinha e
divulgar novidades direto para quem está por perto.

O sistema é dividido em **três acessos independentes** que compartilham a mesma base de dados —
cada um desenhado para um papel específico dentro da experiência.

Projeto acadêmico desenvolvido na disciplina **Startup Project One**, do curso de Análise e
Desenvolvimento de Sistemas.

---

## Os três acessos

| Acesso | Quem usa | Plataforma | O que faz |
|---|---|---|---|
| 🍹 **Cliente** | Rolezeiro | Mobile | Descobre bares, abre comanda, pede e acompanha o feed |
| 📊 **Gerente** | Dono do bar | Responsivo | Acompanha o movimento, publica novidades e gerencia o perfil do bar |
| 👨‍🍳 **Bar/Cozinha** | Equipe operacional | Mobile | Recebe pedidos, libera comandas, atende chamados e confirma pagamentos |

Os três se comunicam através de uma API compartilhada. Nenhum deles conhece o funcionamento
interno do outro — todos operam sobre o mesmo conjunto de dados (comandas, pedidos,
estabelecimentos, postagens).

---

## Funcionalidades

<details>
<summary><b>🍹 Cliente</b></summary>

- Cadastro e autenticação
- **Discovery** — lista de bares com busca, filtro por cidade e indicador de lotação em tempo
  real
- **Feed** — postagens dos estabelecimentos, com curtidas, compartilhamento e visualização
  expandida
- **Comanda digital** — abertura com informação de mesa ou balcão, aguardando liberação de um
  atendente que confirma a presença no local
- **Cardápio e pedidos** — carrinho com controle de quantidade e acompanhamento do status de
  cada pedido (enviado, em andamento, pronto)
- **Chamar garçom** — disponível apenas para quem abriu comanda em uma mesa
- **Fechamento de conta** — conferência dos itens recebidos e orientação para pagamento no
  caixa
- Avaliação do estabelecimento ao final da experiência
- Histórico de rolês anteriores

</details>

<details>
<summary><b>📊 Gerente</b></summary>

- **Movimento** — indicador de lotação da noite, comandas abertas, total do dia e valor
  consumido
- **Comandas do dia** — lista completa com cliente, mesa, valor e status, com filtro por
  situação
- **Postagens** — publicação de novidades que aparecem no feed dos clientes
- **Perfil do bar** — dados do estabelecimento que alimentam o que o cliente vê no app

</details>

<details>
<summary><b>👨‍🍳 Bar/Cozinha</b></summary>

- Login vinculado ao estabelecimento (`@nomedobar`)
- **Pedidos** — fila por ordem de chegada, separada em abas Bar e Cozinha, com avanço de status
  em dois toques
- **Alertas** — chamados de garçom enviados pelos clientes, com número da mesa
- **Comandas** — liberação de novas comandas (confirmando presença do cliente), lançamento de
  pedidos feitos no balcão e confirmação de pagamento no caixa

</details>

---

## Regras de negócio principais

- Uma **comanda pertence ao cliente**, não à mesa — o número da mesa é uma informação da
  comanda, o que permite várias comandas independentes na mesma mesa.
- Nenhum pedido é liberado antes de um atendente **confirmar a presença física** do cliente no
  estabelecimento.
- O **indicador de lotação** é calculado a partir do número de comandas abertas, com uma faixa
  de histerese para evitar oscilação do selo entre "Normal" e "Quente".
- O **pagamento acontece fora do sistema** (caixa do estabelecimento). O app registra o
  fechamento e a confirmação, mas não processa transações.

---

## Tecnologias

**Front-end** · `[especificar — ex: Angular]`
**Back-end** · `[especificar]`
**Banco de dados** · `[especificar]`
**Prototipação** · Figma
**Gestão** · Trello

---

## Estrutura do repositório

```
party/
├── cliente/            # App do cliente (mobile)
├── gerente/            # Acesso do gerente (responsivo)
├── bar-cozinha/        # Acesso da equipe operacional (mobile)
├── api/                # Back-end compartilhado
└── docs/               # Documentação do projeto
```

> A landing page fica em repositório separado: `[link]`

---

## Como rodar

```bash
# Clonar o repositório
git clone [URL]
cd party

# Instalar dependências
[comando]

# Rodar
[comando]
```

---

## Status

🚧 **Em desenvolvimento** — MVP acadêmico, com apresentação prevista para **15/11/2026**.

Protótipo validado com professores e personas reais (incluindo um dono de bar em atividade).
Desenvolvimento das três frentes em andamento.

---

## Equipe

| Nome | Função |
|---|---|
| `[Nome]` | `[Função]` |
| `[Nome]` | `[Função]` |
| `[Nome]` | `[Função]` |
| `[Nome]` | `[Função]` |
| `[Nome]` | `[Função]` |

---

<div align="center">
<sub>Projeto acadêmico · Análise e Desenvolvimento de Sistemas</sub>
</div>
