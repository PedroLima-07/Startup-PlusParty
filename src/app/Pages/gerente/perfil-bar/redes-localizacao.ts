import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Mapa } from '../../../components/mapa/mapa';
import { AuthService } from '../../../services/auth.service';
import {
  EstabelecimentosService,
  RedeInvalidaError,
  RedesELocalizacao,
} from '../../../services/estabelecimentos.service';
import { Coordenadas } from '../../../services/google-maps.service';

const MENSAGENS: Record<RedeInvalidaError['campo'], string> = {
  instagram: 'O Instagram não parece um usuário válido. Use só o nome, como bardoze.',
  tiktok: 'O TikTok não parece um usuário válido. Use só o nome, como bardoze.',
  whatsapp: 'O WhatsApp precisa ter DDD e número, como (11) 98765-4321.',
  localizacao: 'O ponto no mapa ficou incompleto. Marque de novo.',
};

/**
 * Parte das Configurações do gerente: as redes do bar e o ponto no mapa.
 * Salva direto na tabela `estabelecimentos` (supabase/bar_redes_localizacao.sql).
 * O cliente vê os botões das redes e o "Como chegar" no perfil do bar.
 */
@Component({
  selector: 'app-redes-localizacao',
  imports: [FormsModule, Mapa],
  templateUrl: './redes-localizacao.html',
  styleUrl: './redes-localizacao.scss',
})
export class RedesLocalizacao implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly estabelecimentos = inject(EstabelecimentosService);

  private barId: string | null = null;
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly salvo = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected dados: RedesELocalizacao = {
    instagram: null,
    tiktok: null,
    whatsapp: null,
    latitude: null,
    longitude: null,
  };
  protected readonly ponto = signal<Coordenadas | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.barId = (await this.auth.perfilAtual())?.estabelecimento?.id ?? null;
      const bar = this.barId ? await this.estabelecimentos.buscarPorId(this.barId) : null;
      if (bar) {
        this.dados = {
          instagram: bar.instagram,
          tiktok: bar.tiktok,
          whatsapp: bar.whatsapp,
          latitude: bar.latitude,
          longitude: bar.longitude,
        };
        if (bar.latitude !== null && bar.longitude !== null) {
          this.ponto.set({ lat: bar.latitude, lng: bar.longitude });
        }
      }
    } catch {
      this.erro.set('Não foi possível carregar as redes do bar.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected marcarPonto(ponto: Coordenadas): void {
    this.ponto.set(ponto);
    this.dados = { ...this.dados, latitude: ponto.lat, longitude: ponto.lng };
    this.salvo.set(false);
  }

  protected tirarPonto(): void {
    this.ponto.set(null);
    this.dados = { ...this.dados, latitude: null, longitude: null };
    this.salvo.set(false);
  }

  protected async salvar(): Promise<void> {
    if (!this.barId || this.salvando()) return;
    this.salvando.set(true);
    this.erro.set(null);

    const vazioViraNulo = (texto: string | null) => (texto?.trim() ? texto.trim() : null);
    try {
      this.dados = await this.estabelecimentos.salvarRedesELocalizacao(this.barId, {
        ...this.dados,
        instagram: vazioViraNulo(this.dados.instagram),
        tiktok: vazioViraNulo(this.dados.tiktok),
        whatsapp: vazioViraNulo(this.dados.whatsapp),
      });
      this.salvo.set(true);
    } catch (e) {
      this.erro.set(
        e instanceof RedeInvalidaError ? MENSAGENS[e.campo] : 'Não foi possível salvar agora. Tente de novo.',
      );
    } finally {
      this.salvando.set(false);
    }
  }
}
