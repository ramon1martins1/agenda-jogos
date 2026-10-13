// Teste da API pública (não oficial) da ESPN — só imprime no log, não altera nada.
// Rodar: node teste-espn.js

const TIME_ID = '3445'; // Fluminense na ESPN
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const LIGAS = [
  { id: 'bra.1', nome: 'Brasileirão' },
  { id: 'conmebol.libertadores', nome: 'Libertadores' },
];

const fmtBRT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function placar(c) {
  if (c?.score == null) return '';
  return typeof c.score === 'object' ? (c.score.displayValue ?? '') : String(c.score);
}

function linha(ev) {
  const comp = ev.competitions?.[0] ?? {};
  const casa = comp.competitors?.find(c => c.homeAway === 'home');
  const fora = comp.competitors?.find(c => c.homeAway === 'away');
  const status = comp.status?.type ?? ev.status?.type ?? {};
  const terminado = status.completed ? `${placar(casa)}-${placar(fora)}` : '-';
  const pen = casa?.shootoutScore != null ? ` (pên ${casa.shootoutScore}-${fora?.shootoutScore})` : '';
  const horaOk = comp.timeValid === false ? 'hora A DEFINIR' : 'hora ok';
  const fase = ev.seasonType?.name ?? comp.type?.abbreviation ?? '';
  return [
    fmtBRT.format(new Date(ev.date)),
    horaOk.padEnd(14),
    `${casa?.team?.displayName ?? '?'} x ${fora?.team?.displayName ?? '?'}`.padEnd(42),
    (terminado + pen).padEnd(16),
    (status.shortDetail ?? '').padEnd(14),
    comp.venue?.fullName ?? '',
    fase ? `[${fase}]` : '',
  ].join(' | ');
}

async function buscar(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'agenda-jogos-teste' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function main() {
  console.log(`Execução: ${fmtBRT.format(new Date())} (Brasília)\n`);
  for (const liga of LIGAS) {
    for (const [rotulo, extra] of [['resultados', ''], ['próximos', '?fixture=true']]) {
      const url = `${BASE}/${liga.id}/teams/${TIME_ID}/schedule${extra}`;
      console.log(`=== ${liga.nome} — ${rotulo} ===`);
      console.log(url);
      try {
        const dados = await buscar(url);
        const eventos = dados.events ?? [];
        console.log(`Temporada: ${dados.season?.displayName ?? '?'} · ${dados.season?.name ?? ''} · ${eventos.length} jogos`);
        if (dados.timestamp) console.log(`Timestamp da ESPN: ${dados.timestamp}`);
        eventos.forEach(ev => console.log('  ' + linha(ev)));
      } catch (e) {
        console.log(`  ERRO: ${e.message}`);
      }
      console.log('');
    }
  }
}

main();
