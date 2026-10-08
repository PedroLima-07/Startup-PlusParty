import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PerfilBar } from '../../../models';
import { AuthService } from '../../../services/auth.service';
import { BarPerfilService } from '../../../services/bar-perfil.service';
import { Icone } from '../componentes/icone';

/** Tela de Configurações do gerente: os dados públicos do bar e a saída da conta. */
@Component({
  selector: 'app-perfil-bar',
  imports: [FormsModule, Icone],
  templateUrl: './perfil-bar.html',
  styleUrl: './perfil-bar.scss',
})
export class PerfilBarComponent {
  private barPerfilService = inject(BarPerfilService);
  private authService = inject(AuthService);
  private router = inject(Router);

  /** Cópia editável: só vai para o serviço ao salvar. */
  protected perfil: PerfilBar = { ...this.barPerfilService.perfil() };
  protected readonly fotoDeCapa = signal(this.perfil.fotoCapaUrl);
  protected readonly salvo = signal(false);

  protected escolherFoto(evento: Event): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = () => {
      this.fotoDeCapa.set(leitor.result as string);
      this.salvo.set(false);
    };
    leitor.readAsDataURL(arquivo);
  }

  protected salvar(): void {
    this.barPerfilService.salvar({ ...this.perfil, fotoCapaUrl: this.fotoDeCapa() });
    this.salvo.set(true);
  }

  protected async sair(): Promise<void> {
    await this.authService.sair();
    await this.router.navigateByUrl('/login');
  }
}
