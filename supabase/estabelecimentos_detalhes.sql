-- =====================================================================
-- +party — Detalhes do estabelecimento (perfil do bar no app do cliente)
-- =====================================================================
-- Pode rodar de novo sem erro: só adiciona o que ainda não existe.
--
-- foto_url      caminho da foto de capa. Hoje as imagens ficam no app
--               (public/img/estabelecimentos), então o valor é relativo,
--               ex: 'img/estabelecimentos/neon-club.jpg'. Uma URL completa
--               (Storage do Supabase) também funciona.
-- sobre         texto longo do perfil; `descricao` segue sendo o resumo do card.
-- tags          etiquetas do clima do lugar, ex: {'Agitado','Bom pro rolê'}.
-- horario_*     horário de funcionamento. Se fecha_as < abre_as, a casa
--               fecha no dia seguinte (ex: 18:00 às 02:00).
-- dias_abertos  dias da semana em que abre: 0 = domingo ... 6 = sábado.
-- =====================================================================

alter table estabelecimentos
  add column if not exists foto_url      text,
  add column if not exists sobre         text,
  add column if not exists tags          text[]   not null default '{}',
  add column if not exists horario_abre  time,
  add column if not exists horario_fecha time,
  add column if not exists dias_abertos  smallint[] not null default '{}';
