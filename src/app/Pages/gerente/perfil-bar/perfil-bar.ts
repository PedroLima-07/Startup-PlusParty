import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BarPerfilService } from '../../../services/bar-perfil.service';
import { GerenteAuthService } from '../../../services/gerente-auth.service';
import { PerfilBar } from '../../../models';

@Component({
  selector: 'app-perfil-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './perfil-bar.html',
  styleUrls: ['./perfil-bar.scss']
})
export class PerfilBarComponent implements OnInit {
  barPerfilService = inject(BarPerfilService);
  authService = inject(GerenteAuthService);

  perfilEdit!: PerfilBar;

  ngOnInit() {
    this.perfilEdit = { ...this.barPerfilService.perfil() };
  }

  onFotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.perfilEdit.fotoCapaUrl = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  salvar() {
    this.barPerfilService.salvar(this.perfilEdit);
    alert('Perfil salvo com sucesso!');
  }

  sair() {
    this.authService.logout();
  }
}
