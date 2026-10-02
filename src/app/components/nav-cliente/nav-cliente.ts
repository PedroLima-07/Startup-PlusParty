import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-nav-cliente',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav-cliente.html',
  styleUrl: './nav-cliente.scss',
})
export class NavCliente {}
