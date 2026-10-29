import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EventoDoBar, NovoEvento } from '../../../models';
import { GerenteBarService } from '../../../services/gerente-bar.service';

const DIAS_PLURAL = ['DOMINGOS', 'SEGUNDAS', 'TERÇAS', 'QUARTAS', 'QUINTAS', 'SEXTAS', 'SÁBADOS'];
const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

/** O que o formulário edita: data e hora separadas, entrada como texto ("15,00"). */
interface Formulario {
  titulo: string;
  descricao: string;
  data: string;
  hora: string;
  repete_semanal: boolean;
  entrada: string;
}

function formularioVazio(): Formulario {
  const hoje = new Date();
  return {
    titulo: '',
    descricao: '',
    data: `${hoje.getFullYear()}-${dois(hoje.getMonth() + 1)}-${dois(hoje.getDate())}`,
    hora: '20:00',
    repete_semanal: false,
    entrada: '',
  };
}

function dois(n: number): string {
  return String(n).padStart(2, '0');
}

/** "15,00" → 15; vazio → null (grátis). */
export function lerEntrada(texto: string): number | null | 'invalida' {
  const limpo = texto.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (!limpo) return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor >= 0 ? valor : 'invalida';
}

/**
 * Agenda do gerente: eventos do bar (únicos ou toda semana), com quantos
 * clientes marcaram interesse. Criar e editar num painel lateral; cancelar
 * pede confirmação porque o banco avisa os interessados.
 */
@Component({
  selector: 'app-agenda-gerente',
  imports: [CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './agenda.html',
  styleUrl: './agenda.scss',
  host: { '(document:keydown.escape)': 'fecharPainel()' },
})
export class AgendaGerente implements OnInit {
  private readonly gerente = inject(GerenteBarService);

  protected readonly eventos = signal<EventoDoBar[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  /** Painel aberto: `null` fechado; `'novo'` criando; ou o evento em edição. */
  protected readonly painel = signal<'novo' | EventoDoBar | null>(null);
  protected form: Formulario = formularioVazio();
  protected readonly salvando = signal(false);
  protected readonly erroForm = signal<string | null>(null);

  protected readonly cancelando = signal<EventoDoBar | null>(null);
  protected readonly erroCancelar = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      this.eventos.set(await this.gerente.eventos());
    } catch {
      this.erro.set('Não foi possível carregar a agenda. Tente de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected novo(): void {
    this.form = formularioVazio();
    this.erroForm.set(null);
    this.painel.set('novo');
  }

  protected editar(evento: EventoDoBar): void {
    const inicio = new Date(evento.inicio);
    this.form = {
      titulo: evento.titulo,
      descricao: evento.descricao ?? '',
      data: `${inicio.getFullYear()}-${dois(inicio.getMonth() + 1)}-${dois(inicio.getDate())}`,
      hora: `${dois(inicio.getHours())}:${dois(inicio.getMinutes())}`,
      repete_semanal: evento.repete_semanal,
      entrada: evento.entrada ? evento.entrada.toFixed(2).replace('.', ',') : '',
    };
    this.erroForm.set(null);
    this.painel.set(evento);
  }

  protected fecharPainel(): void {
    if (this.salvando()) return;
    this.painel.set(null);
    this.cancelando.set(null);
  }

  protected async salvar(): Promise<void> {
    const painel = this.painel();
    if (!painel || this.salvando()) return;

    const titulo = this.form.titulo.trim();
    const entrada = lerEntrada(this.form.entrada);
    const inicio = new Date(`${this.form.data}T${this.form.hora}`);
    if (!titulo) return this.erroForm.set('Dê um nome ao evento.');
    if (Number.isNaN(inicio.getTime())) return this.erroForm.set('Escolha o dia e o horário.');
    if (entrada === 'invalida') return this.erroForm.set('A entrada precisa ser um valor, como 15,00.');
    if (painel === 'novo' && !this.form.repete_semanal && inicio.getTime() < Date.now()) {
      return this.erroForm.set('Esse horário já passou. Escolha uma data futura.');
    }

    const evento: NovoEvento = {
      titulo,
      descricao: this.form.descricao.trim() || null,
      inicio: inicio.toISOString(),
      entrada,
      repete_semanal: this.form.repete_semanal,
    };

    this.salvando.set(true);
    this.erroForm.set(null);
    try {
      if (painel === 'novo') await this.gerente.criarEvento(evento);
      else await this.gerente.editarEvento(painel.id, evento);
      this.salvando.set(false);
      this.painel.set(null);
      await this.carregar();
    } catch {
      this.erroForm.set('Não foi possível salvar o evento. Tente de novo.');
    } finally {
      this.salvando.set(false);
    }
  }

  protected pedirCancelamento(evento: EventoDoBar): void {
    this.erroCancelar.set(null);
    this.cancelando.set(evento);
  }

  protected async confirmarCancelamento(): Promise<void> {
    const evento = this.cancelando();
    if (!evento || this.salvando()) return;
    this.salvando.set(true);
    try {
      await this.gerente.cancelarEvento(evento.id);
      this.eventos.update((lista) =>
        lista.map((e) => (e.id === evento.id ? { ...e, cancelado_em: new Date().toISOString() } : e)),
      );
      this.cancelando.set(null);
    } catch {
      this.erroCancelar.set('Não foi possível cancelar agora. Tente de novo.');
    } finally {
      this.salvando.set(false);
    }
  }

  /** "HOJE", "SEXTAS" (semanal) ou "SEX 31". */
  protected dia(evento: EventoDoBar): string {
    const inicio = new Date(evento.inicio);
    if (evento.repete_semanal) return DIAS_PLURAL[inicio.getDay()];
    if (inicio.toDateString() === new Date().toDateString()) return 'HOJE';
    return `${DIAS[inicio.getDay()]} ${dois(inicio.getDate())}`;
  }

  /** Próxima vez de um evento semanal, a partir de hoje. */
  protected proxima(evento: EventoDoBar): Date {
    const inicio = new Date(evento.inicio);
    const agora = new Date();
    if (inicio >= agora) return inicio;
    const proxima = new Date(agora);
    proxima.setHours(inicio.getHours(), inicio.getMinutes(), 0, 0);
    while (proxima.getDay() !== inicio.getDay() || proxima < agora) proxima.setDate(proxima.getDate() + 1);
    return proxima;
  }

  protected editando(): boolean {
    return this.painel() !== 'novo';
  }
}
