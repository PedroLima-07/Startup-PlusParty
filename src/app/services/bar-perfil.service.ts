import { Injectable, signal } from '@angular/core';
import { PerfilBar } from '../models';

@Injectable({
  providedIn: 'root'
})
export class BarPerfilService {
  perfil = signal<PerfilBar>({
    nome: 'Bar do Zé',
    descricaoCurta: 'O melhor espetinho da cidade, cerveja gelada e música boa.',
    endereco: 'Rua das Flores, 123 - Centro',
    horarioFuncionamento: 'Ter a Dom - 18h as 02h'
  });

  salvar(perfil: PerfilBar) {
    // TODO: integrar Supabase Auth / db
    this.perfil.set({ ...perfil });
  }
}
