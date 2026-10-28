import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/** Ponto no mapa, em graus decimais. */
export interface Coordenadas {
  lat: number;
  lng: number;
}

// Só o pedaço da API do Google Maps que o app usa. Assim não é preciso
// instalar os tipos do Google (@types/google.maps) para compilar.
export interface MapaGoogle {
  setCenter(posicao: Coordenadas): void;
  setZoom(zoom: number): void;
  fitBounds(limites: unknown, margem?: number): void;
  addListener(evento: string, acao: (e: { latLng?: { lat(): number; lng(): number } }) => void): unknown;
}

export interface MarcadorGoogle {
  setMap(mapa: MapaGoogle | null): void;
  setPosition(posicao: Coordenadas): void;
  getPosition(): { lat(): number; lng(): number } | null;
  addListener(evento: string, acao: () => void): unknown;
}

export interface ApiGoogleMaps {
  Map: new (elemento: HTMLElement, opcoes: Record<string, unknown>) => MapaGoogle;
  Marker: new (opcoes: Record<string, unknown>) => MarcadorGoogle;
  LatLngBounds: new () => { extend(posicao: Coordenadas): void };
}

/** Centro do mapa quando ainda não há bar marcado (Praça da Sé, São Paulo). */
export const CENTRO_PADRAO: Coordenadas = { lat: -23.5505, lng: -46.6333 };

const NOME_DO_RETORNO = '__plusPartyMapaPronto';

/**
 * Carrega a biblioteca do Google Maps só quando um mapa vai aparecer: ela não
 * entra no carregamento inicial do app. Sem chave em `environment.googleMapsKey`,
 * ou se o Google recusar a chave, devolve null e o mapa mostra "Mapa indisponível".
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private carregando: Promise<ApiGoogleMaps | null> | null = null;

  get temChave(): boolean {
    return environment.googleMapsKey.trim() !== '';
  }

  carregar(): Promise<ApiGoogleMaps | null> {
    if (!this.temChave) return Promise.resolve(null);
    this.carregando ??= this.injetarScript();
    return this.carregando;
  }

  private injetarScript(): Promise<ApiGoogleMaps | null> {
    const janela = window as unknown as Record<string, unknown>;
    const pronta = () => (janela['google'] as { maps?: ApiGoogleMaps } | undefined)?.maps ?? null;
    if (pronta()) return Promise.resolve(pronta());

    return new Promise((resolve) => {
      const script = document.createElement('script');
      const chave = encodeURIComponent(environment.googleMapsKey.trim());
      script.src = `https://maps.googleapis.com/maps/api/js?key=${chave}&language=pt-BR&region=BR&callback=${NOME_DO_RETORNO}`;
      script.async = true;
      janela[NOME_DO_RETORNO] = () => resolve(pronta());
      // Chave errada ou sem internet: o mapa fica indisponível e a tela segue.
      script.onerror = () => {
        this.carregando = null;
        resolve(null);
      };
      // O Google chama esta função quando a chave é recusada (domínio não liberado, sem faturamento...).
      janela['gm_authFailure'] = () => resolve(null);
      document.head.appendChild(script);
    });
  }
}

/** Link que abre a rota até o bar no app do Google Maps (grátis, não usa a chave). */
export function linkComoChegar(bar: {
  latitude: number | null;
  longitude: number | null;
  endereco: string | null;
}): string | null {
  const destino =
    bar.latitude !== null && bar.longitude !== null ? `${bar.latitude},${bar.longitude}` : bar.endereco;
  return destino
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`
    : null;
}
