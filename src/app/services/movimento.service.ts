import { Injectable, signal } from '@angular/core';
import { StatusMovimento, ComandaResumo } from '../models';

@Injectable({
  providedIn: 'root'
})
export class MovimentoService {
  statusMovimento = signal<StatusMovimento>('normal');
  comandasAbertasCount = signal<number>(8);
  comandasDoDiaCount = signal<number>(32);
  consumidoNoDia = signal<number>(927.30);
  
  comandas = signal<ComandaResumo[]>([
    { numero: '001', cliente: 'João Silva', mesa: '12', horario: '19:30', valor: 150.50, status: 'aberta' },
    { numero: '002', cliente: 'Maria Souza', mesa: '04', horario: '20:15', valor: 85.00, status: 'aguardando_pagamento' },
    { numero: '003', cliente: 'Pedro Santos', mesa: '08', horario: '18:45', valor: 320.00, status: 'paga' },
    { numero: '004', cliente: 'Ana Costa', mesa: '15', horario: '21:00', valor: 45.90, status: 'aberta' },
    { numero: '005', cliente: 'Carlos', mesa: 'Balcão', horario: '21:30', valor: 25.00, status: 'aberta' },
    { numero: '006', cliente: 'Fernanda', mesa: '02', horario: '22:00', valor: 110.00, status: 'aguardando_pagamento' },
    { numero: '007', cliente: 'Roberto', mesa: '10', horario: '19:00', valor: 180.00, status: 'paga' },
    { numero: '008', cliente: 'Lucas', mesa: '05', horario: '22:15', valor: 10.90, status: 'aberta' }
  ]);
}
