import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ApiGoogleMaps,
  CENTRO_PADRAO,
  Coordenadas,
  GoogleMapsService,
  MapaGoogle,
  MarcadorGoogle,
} from '../../services/google-maps.service';

/** Um bar como alfinete no mapa. */
export interface BarNoMapa {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  /** Linha curta embaixo do nome no resumo ("★ 4,1 · Aberto até 1h"). */
  detalhe?: string;
  foto_url?: string | null;
}

/**
 * Mapa do Google com dois jeitos de usar:
 * - `modo="ver"`: os bares como alfinetes; tocar num abre o resumo com o link do perfil;
 * - `modo="escolher"`: o gerente arrasta (ou toca) o alfinete e o componente
 *   devolve a posição em `escolheu`.
 * Sem a chave do Google (ou se ela falhar), mostra "Mapa indisponível".
 */
@Component({
  selector: 'app-mapa',
  imports: [RouterLink],
  templateUrl: './mapa.html',
  styleUrl: './mapa.scss',
})
export class Mapa implements OnDestroy {
  private readonly google = inject(GoogleMapsService);

  readonly modo = input<'ver' | 'escolher'>('ver');
  readonly bares = input<BarNoMapa[]>([]);
  /** No modo "escolher": onde o alfinete começa. */
  readonly posicao = input<Coordenadas | null>(null);
  readonly escolheu = output<Coordenadas>();

  protected readonly estado = signal<'carregando' | 'pronto' | 'indisponivel'>('carregando');
  protected readonly selecionado = signal<BarNoMapa | null>(null);

  private readonly area = viewChild.required<ElementRef<HTMLElement>>('area');
  private api: ApiGoogleMaps | null = null;
  private mapa: MapaGoogle | null = null;
  private marcadores: MarcadorGoogle[] = [];

  constructor() {
    afterNextRender(() => void this.iniciar());

    // Lista de bares mudou (filtro, busca): redesenha os alfinetes.
    effect(() => {
      const bares = this.bares();
      if (this.estado() === 'pronto') untracked(() => this.desenharBares(bares));
    });
  }

  ngOnDestroy(): void {
    this.limparMarcadores();
  }

  private async iniciar(): Promise<void> {
    this.api = await this.google.carregar();
    if (!this.api) {
      this.estado.set('indisponivel');
      return;
    }

    const inicio = this.posicao() ?? this.centroDosBares() ?? CENTRO_PADRAO;
    this.mapa = new this.api.Map(this.area().nativeElement, {
      center: inicio,
      zoom: this.posicao() ? 16 : 13,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      clickableIcons: false,
    });
    this.estado.set('pronto');

    if (this.modo() === 'escolher') this.prepararEscolha(inicio);
    else this.desenharBares(this.bares());
  }

  private prepararEscolha(inicio: Coordenadas): void {
    if (!this.api || !this.mapa) return;
    const alfinete = new this.api.Marker({ position: inicio, map: this.mapa, draggable: true });
    this.marcadores = [alfinete];

    const avisar = () => {
      const p = alfinete.getPosition();
      if (p) this.escolheu.emit({ lat: arredondar(p.lat()), lng: arredondar(p.lng()) });
    };
    alfinete.addListener('dragend', avisar);
    this.mapa.addListener('click', (e) => {
      if (!e.latLng) return;
      alfinete.setPosition({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      avisar();
    });
  }

  private desenharBares(bares: BarNoMapa[]): void {
    if (!this.api || !this.mapa) return;
    this.limparMarcadores();
    const limites = new this.api.LatLngBounds();

    for (const bar of bares) {
      const posicao = { lat: bar.latitude, lng: bar.longitude };
      const marcador = new this.api.Marker({ position: posicao, map: this.mapa, title: bar.nome });
      marcador.addListener('click', () => this.selecionado.set(bar));
      this.marcadores.push(marcador);
      limites.extend(posicao);
    }

    if (bares.length > 1) this.mapa.fitBounds(limites, 48);
    else if (bares.length === 1) this.mapa.setCenter({ lat: bares[0].latitude, lng: bares[0].longitude });
    if (!bares.some((b) => b.id === this.selecionado()?.id)) this.selecionado.set(null);
  }

  private centroDosBares(): Coordenadas | null {
    const bares = this.bares();
    if (bares.length === 0) return null;
    return {
      lat: bares.reduce((soma, b) => soma + b.latitude, 0) / bares.length,
      lng: bares.reduce((soma, b) => soma + b.longitude, 0) / bares.length,
    };
  }

  private limparMarcadores(): void {
    for (const marcador of this.marcadores) marcador.setMap(null);
    this.marcadores = [];
  }
}

/** 6 casas decimais: cerca de 10 cm, mais que suficiente para achar a porta do bar. */
function arredondar(grau: number): number {
  return Math.round(grau * 1e6) / 1e6;
}
