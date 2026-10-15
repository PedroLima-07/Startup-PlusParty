import { haQuantoTempo } from './tempo';

describe('haQuantoTempo', () => {
  const agora = new Date(2026, 9, 15, 22, 0);
  const antes = (minutos: number) => new Date(agora.getTime() - minutos * 60_000).toISOString();

  it('fala como gente, do mais recente ao mais antigo', () => {
    expect(haQuantoTempo(antes(0.5), agora)).toBe('agora');
    expect(haQuantoTempo(antes(5), agora)).toBe('há 5 min');
    expect(haQuantoTempo(antes(3 * 60), agora)).toBe('há 3 h');
    expect(haQuantoTempo(antes(30 * 60), agora)).toBe('ontem');
    expect(haQuantoTempo(antes(4 * 24 * 60), agora)).toBe('há 4 dias');
    expect(haQuantoTempo(new Date(2026, 8, 2, 21).toISOString(), agora)).toBe('02/09');
  });
});
