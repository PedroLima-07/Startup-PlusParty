import { TestBed } from '@angular/core/testing';
import { ItemPendente, PedidosAtendenteService } from './pedidos-atendente.service';
import { SupabaseService } from './supabase.service';

function linha(dados: Partial<ItemPendente> & Pick<ItemPendente, 'id' | 'pedido_id'>): ItemPendente {
  return {
    quantidade: 1,
    status: 'novo',
    item: { nome: 'Chope', setor: 'bar' },
    pedido: { criado_em: '2026-09-24T22:00:00Z', comanda: { mesa: '12', cliente: { nome: 'Carlos' } } },
    ...dados,
  };
}

describe('PedidosAtendenteService.agruparPorPedidoESetor', () => {
  let service: PedidosAtendenteService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: {} }],
    });
    service = TestBed.inject(PedidosAtendenteService);
  });

  it('separa um mesmo pedido em um card por setor', () => {
    const grupos = service.agruparPorPedidoESetor([
      linha({ id: 'i1', pedido_id: 'p1', item: { nome: 'Chope', setor: 'bar' } }),
      linha({ id: 'i2', pedido_id: 'p1', item: { nome: 'Batata', setor: 'cozinha' } }),
    ]);

    expect(grupos.map((g) => g.setor)).toEqual(['bar', 'cozinha']);
    expect(grupos[0].itens_ids).toEqual(['i1']);
    expect(grupos[1].itens_ids).toEqual(['i2']);
  });

  it('junta os itens do mesmo pedido e setor num único card', () => {
    const grupos = service.agruparPorPedidoESetor([
      linha({ id: 'i1', pedido_id: 'p1', quantidade: 2, item: { nome: 'Chope', setor: 'bar' } }),
      linha({ id: 'i2', pedido_id: 'p1', item: { nome: 'Gin', setor: 'bar' } }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].itens_ids).toEqual(['i1', 'i2']);
    expect(grupos[0].itens).toEqual([
      { nome: 'Chope', quantidade: 2 },
      { nome: 'Gin', quantidade: 1 },
    ]);
  });

  it('ordena do pedido mais antigo para o mais novo', () => {
    const grupos = service.agruparPorPedidoESetor([
      linha({ id: 'i1', pedido_id: 'novo', pedido: { criado_em: '2026-09-24T22:30:00Z', comanda: { mesa: '1', cliente: null } } }),
      linha({ id: 'i2', pedido_id: 'antigo', pedido: { criado_em: '2026-09-24T21:00:00Z', comanda: { mesa: '2', cliente: null } } }),
    ]);

    expect(grupos.map((g) => g.pedido_id)).toEqual(['antigo', 'novo']);
  });

  it('mantém o card como "novo" se algum item ainda não começou', () => {
    const grupos = service.agruparPorPedidoESetor([
      linha({ id: 'i1', pedido_id: 'p1', status: 'em_andamento' }),
      linha({ id: 'i2', pedido_id: 'p1', status: 'novo' }),
    ]);

    expect(grupos[0].status).toBe('novo');
  });

  it('usa "Cliente" quando o nome não vem do banco e mantém mesa nula para balcão', () => {
    const grupos = service.agruparPorPedidoESetor([
      linha({ id: 'i1', pedido_id: 'p1', pedido: { criado_em: '2026-09-24T22:00:00Z', comanda: { mesa: null, cliente: null } } }),
    ]);

    expect(grupos[0].cliente).toBe('Cliente');
    expect(grupos[0].mesa).toBeNull();
  });
});
