import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TipoLocal } from '../../models';
import { ComandaService } from '../../services/comanda.service';

@Component({
  selector: 'app-abrir-comanda',
  standalone: true,
  templateUrl: './abrir-comanda.html',
  styleUrl: './abrir-comanda.scss',
})
export class AbrirComanda {
  private readonly router = inject(Router);
  private readonly comandaService = inject(ComandaService);

  protected readonly tipoLocal = signal<TipoLocal | null>(null);
  protected readonly numeroMesa = signal('');

  protected get podeAbrir(): boolean {
    const tipo = this.tipoLocal();
    if (tipo === 'balcao') return true;
    return tipo === 'mesa' && this.numeroMesa().trim().length > 0;
  }

  protected selecionarTipo(tipo: TipoLocal): void {
    this.tipoLocal.set(tipo);
    if (tipo === 'balcao') {
      this.numeroMesa.set('');
    }
  }

  protected abrir(): void {
    const tipo = this.tipoLocal();
    if (!tipo || !this.podeAbrir) return;

    this.comandaService.abrirComanda(
      tipo,
      tipo === 'mesa' ? this.numeroMesa().trim() : undefined,
    );
    void this.router.navigate(['/comanda']);
  }
}