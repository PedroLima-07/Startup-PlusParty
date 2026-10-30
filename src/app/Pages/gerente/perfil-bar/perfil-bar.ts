import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DadosDoBar } from '../../../models';
import { AuthService } from '../../../services/auth.service';
import { BarPerfilService } from '../../../services/bar-perfil.service';
import { Icone } from '../componentes/icone';
import { RedesLocalizacao } from './redes-localizacao';

/** Na ordem da semana brasileira na tela; o valor é o do banco (0 = domingo). */
const DIAS = [
  { valor: 1, rotulo: 'Seg' },
  { valor: 2, rotulo: 'Ter' },
  { valor: 3, rotulo: 'Qua' },
  { valor: 4, rotulo: 'Qui' },
  { valor: 5, rotulo: 'Sex' },
  { valor: 6, rotulo: 'Sáb' },
  { valor: 0, rotulo: 'Dom' },
];

/** O que o formulário edita: horários como "HH:MM" e capacidade como número. */
interface Formulario {
  nome: string;
  descricao: string;
  sobre: string;
  endereco: string;
  capacidade: number | null;
  abre: string;
  fecha: string;
  dias: Set<number>;
}

/** Foto maior que isso não sobe (o bucket aceita até 5 MB). */
const LIMITE_FOTO = 5 * 1024 * 1024;

/**
 * Tela de Configurações do gerente: os dados públicos do bar (gravados na
 * tabela estabelecimentos), as redes e a localização, e a saída da conta.
 */
@Component({
  selector: 'app-perfil-bar',
  imports: [FormsModule, Icone, RedesLocalizacao, RouterLink],
  templateUrl: './perfil-bar.html',
  styleUrl: './perfil-bar.scss',
})
export class PerfilBarComponent implements OnInit, OnDestroy {
  private barPerfilService = inject(BarPerfilService);
  private authService = inject(AuthService);
  private router = inject(Router);

  protected readonly dias = DIAS;
  protected form: Formulario = {
    nome: '',
    descricao: '',
    sobre: '',
    endereco: '',
    capacidade: null,
    abre: '',
    fecha: '',
    dias: new Set(),
  };
  protected readonly fotoDeCapa = signal<string | null>(null);
  private fotoNova: File | null = null;
  private previaLocal: string | null = null;

  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly salvo = signal(false);
  protected readonly erro = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const bar = await this.barPerfilService.carregar();
      this.form = {
        nome: bar.nome,
        descricao: bar.descricao ?? '',
        sobre: bar.sobre ?? '',
        endereco: bar.endereco ?? '',
        capacidade: bar.capacidade,
        abre: bar.horario_abre?.slice(0, 5) ?? '',
        fecha: bar.horario_fecha?.slice(0, 5) ?? '',
        dias: new Set(bar.dias_abertos),
      };
      this.fotoDeCapa.set(bar.foto_url);
    } catch {
      this.erro.set('Não foi possível carregar os dados do bar.');
    } finally {
      this.carregando.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.previaLocal) URL.revokeObjectURL(this.previaLocal);
  }

  protected escolherFoto(evento: Event): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    if (!arquivo) return;
    if (arquivo.size > LIMITE_FOTO) {
      this.erro.set('A foto passa de 5 MB. Escolha uma menor.');
      return;
    }

    if (this.previaLocal) URL.revokeObjectURL(this.previaLocal);
    this.previaLocal = URL.createObjectURL(arquivo);
    this.fotoNova = arquivo;
    this.fotoDeCapa.set(this.previaLocal);
    this.salvo.set(false);
    this.erro.set(null);
  }

  protected alternarDia(dia: number): void {
    const dias = new Set(this.form.dias);
    if (!dias.delete(dia)) dias.add(dia);
    this.form = { ...this.form, dias };
    this.salvo.set(false);
  }

  protected async salvar(): Promise<void> {
    if (this.salvando()) return;
    const nome = this.form.nome.trim();
    if (!nome) {
      this.erro.set('O bar precisa de um nome.');
      return;
    }
    if (!!this.form.abre !== !!this.form.fecha) {
      this.erro.set('Preencha a hora de abrir e a de fechar, ou deixe as duas em branco.');
      return;
    }

    const dados: DadosDoBar = {
      nome,
      descricao: this.form.descricao.trim() || null,
      sobre: this.form.sobre.trim() || null,
      endereco: this.form.endereco.trim() || null,
      capacidade: this.form.capacidade && this.form.capacidade > 0 ? Math.round(this.form.capacidade) : null,
      horario_abre: this.form.abre ? `${this.form.abre}:00` : null,
      horario_fecha: this.form.fecha ? `${this.form.fecha}:00` : null,
      dias_abertos: [...this.form.dias].sort((a, b) => a - b),
    };

    this.salvando.set(true);
    this.erro.set(null);
    try {
      const bar = await this.barPerfilService.salvar(dados, this.fotoNova);
      this.fotoNova = null;
      this.fotoDeCapa.set(bar.foto_url);
      this.salvo.set(true);
    } catch {
      this.erro.set('Não foi possível salvar agora. Tente de novo.');
    } finally {
      this.salvando.set(false);
    }
  }

  protected async sair(): Promise<void> {
    await this.authService.sair();
    await this.router.navigateByUrl('/login');
  }
}
