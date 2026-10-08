import { Injectable, signal } from '@angular/core';
import { PerfilBar } from '../models';

/**
 * Dados públicos do bar que o gerente edita em Configurações.
 *
 * TODO: dados de exemplo, guardados só na memória da aba. Ainda não lê nem
 * grava na tabela `estabelecimentos` do Supabase.
 */
@Injectable({
  providedIn: 'root',
})
export class BarPerfilService {
  readonly perfil = signal<PerfilBar>({
    nome: 'Bar do Zé',
    descricaoCurta: 'Cerveja gelada, petiscos e música ao vivo no coração do Centro.',
    endereco: 'Rua das Flores, 142 – Centro',
    capacidade: 120,
    horarioFuncionamento: 'Ter a Dom, 17h às 00h',
  });

  salvar(perfil: PerfilBar): void {
    this.perfil.set({ ...perfil });
  }
}
