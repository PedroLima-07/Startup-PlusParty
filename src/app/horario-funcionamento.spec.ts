import { formatarHora, resumirDias, statusHorario } from './horario-funcionamento';

// 2026-10-02 é uma sexta-feira (dia 5).
const sexta = (hora: string) => new Date(`2026-10-02T${hora}:00`);
const sabado = (hora: string) => new Date(`2026-10-03T${hora}:00`);
const domingo = (hora: string) => new Date(`2026-10-04T${hora}:00`);

const terASab = { horario_abre: '18:00:00', horario_fecha: '02:00:00', dias_abertos: [2, 3, 4, 5, 6] };

describe('horario-funcionamento', () => {
  it('formata a hora sem os minutos zerados', () => {
    expect(formatarHora('02:00:00')).toBe('2h');
    expect(formatarHora('18:30:00')).toBe('18h30');
  });

  it('resume dias em sequência, inclusive virando a semana', () => {
    expect(resumirDias([2, 3, 4, 5, 6])).toBe('Ter a Sáb');
    expect(resumirDias([0, 3, 4, 5, 6])).toBe('Qua a Dom');
    expect(resumirDias([0, 1, 2, 3, 4, 5, 6])).toBe('Todos os dias');
    expect(resumirDias([5, 6])).toBe('Sex e Sáb');
    expect(resumirDias([1, 3, 5])).toBe('Seg, Qua, Sex');
  });

  it('está aberto à noite num dia de funcionamento', () => {
    expect(statusHorario(terASab, sexta('22:00'))).toEqual({
      aberto: true,
      texto: 'Aberto agora · fecha às 2h',
    });
  });

  it('continua aberto de madrugada pela noite do dia anterior', () => {
    // domingo não abre, mas a noite de sábado vai até as 2h de domingo
    expect(statusHorario(terASab, domingo('01:30'))?.aberto).toBe(true);
    expect(statusHorario(terASab, domingo('02:00'))?.aberto).toBe(false);
  });

  it('avisa quando abre hoje, amanhã ou num dia da semana', () => {
    expect(statusHorario(terASab, sexta('15:00'))?.texto).toBe('Fechado · abre hoje às 18h');
    expect(statusHorario(terASab, domingo('15:00'))?.texto).toBe('Fechado · abre terça às 18h');
    expect(statusHorario(terASab, sabado('03:00'))?.texto).toBe('Fechado · abre hoje às 18h');
  });

  it('respeita horário que fecha no mesmo dia', () => {
    const almoco = { horario_abre: '11:00:00', horario_fecha: '15:00:00', dias_abertos: [5] };
    expect(statusHorario(almoco, sexta('14:59'))?.aberto).toBe(true);
    expect(statusHorario(almoco, sexta('15:00'))?.texto).toBe('Fechado · abre sexta às 11h');
  });

  it('sem horário cadastrado não mostra nada', () => {
    expect(statusHorario({ horario_abre: null, horario_fecha: null, dias_abertos: [] })).toBeNull();
  });
});
