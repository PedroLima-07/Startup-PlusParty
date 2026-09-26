import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GerenteAuthService } from '../../services/gerente-auth.service';

@Component({
  selector: 'app-login-gerente',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-gerente.html',
  styleUrls: ['./login-gerente.scss']
})
export class LoginGerente {
  email = '';
  senha = '';

  constructor(private authService: GerenteAuthService) {}

  entrar() {
    this.authService.login(this.email, this.senha);
  }
}
