import fs from 'fs';

/* ================================================================
   Agenda Tricolor — atualizador do db.json
   Fonte principal: API pública (não oficial) da ESPN.
   Reserva: OpenFootball, usado só se a ESPN falhar para um campeonato.
   ================================================================ */

const TEAM_NAME = 'Fluminense';
const ESPN_TIME_ID = '3445'; // Fluminense na ESPN
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

const CAMPEONATOS = [
  {
    nome: 'Brasileirão Série A',
    espn: 'bra.1',
    openfootball: 'https://raw.githubusercontent.com/openfootball/south-america/master/brazil/2026_br1.txt',
  },
  {
    nome: 'Copa Libertadores',
    espn: 'conmebol.libertadores',
    openfootball: 'https://raw.githubusercontent.com/openfootball/south-america/master/copa-libertadores/2026_copal.txt',
  },
];

const FASES = {
  'Group Stage': 'Fase de Grupos',
  'Round of 16': 'Oitavas',
  'Quarterfinals': 'Quartas',
  'Semifinals': 'Semifinal',
  'Final': 'Final',
};

// Nomes de estádio mais amigáveis que os da ESPN
const NOMES_ESTADIO = {
  'Estadio do Maracana': 'Maracanã',
  'Joao Havelange Stadium': 'Nilton Santos',
};

const fmtDataBRT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHoraBRT = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

async function buscarJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'agenda-jogos' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function buscarTexto(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function linkCalendario({ isHome, opponent, iso, horaDefinida, inicio }) {
  let datesParam;
  if (!horaDefinida) {
    const [a, m, d] = iso.split('-').map(Number);
    const fim = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '');
    datesParam = `${iso.replace(/-/g, '')}/${fim}`;
  } else {
    const fmt = dt => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    datesParam = `${fmt(inicio)}/${fmt(new Date(inicio.getTime() + 2 * 60 * 60 * 1000))}`;
  }
  const texto = encodeURIComponent(isHome ? `Fluminense vs ${opponent}` : `${opponent} vs Fluminense`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${texto}&dates=${datesParam}`;
}

/* ---------------- ESPN ---------------- */
async function jogosDaEspn(camp) {
  const base = `${ESPN_BASE}/${camp.espn}/teams/${ESPN_TIME_ID}/schedule`;
  const [resultados, proximos] = await Promise.all([buscarJson(base), buscarJson(`${base}?fixture=true`)]);

  // Junta resultados e próximos, sem repetir o mesmo evento
  const eventos = new Map();
  for (const ev of [...(resultados.events ?? []), ...(proximos.events ?? [])]) eventos.set(ev.id, ev);
  const lista = [...eventos.values()].sort((a, b) => new Date(a.date) - new Date(b.date));

  const contadorPorFase = {};
  return lista.map((ev, indice) => {
    const comp = ev.competitions?.[0] ?? {};
    const casa = comp.competitors?.find(c => c.homeAway === 'home');
    const fora = comp.competitors?.find(c => c.homeAway === 'away');
    const flu = [casa, fora].find(c => c?.team?.id === ESPN_TIME_ID);
    const adv = flu === casa ? fora : casa;
    const isHome = flu === casa;
    const opponent = adv?.team?.displayName ?? 'A definir';

    const inicio = new Date(ev.date);
    const iso = fmtDataBRT.format(inicio);
    const horaDefinida = (comp.timeValid ?? ev.timeValid) !== false;
    const time = horaDefinida ? fmtHoraBRT.format(inicio) : 'A definir';
    const [a, m, d] = iso.split('-');

    const status = comp.status?.type ?? {};
    let result = '-';
    let penalties;
    if (status.name === 'STATUS_POSTPONED') result = 'Adiado';
    else if (status.completed) {
      const p = c => c?.score?.displayValue ?? c?.score ?? '';
      result = `${p(casa)}-${p(fora)}`;
      const sc = c => c?.score?.shootoutScore ?? c?.shootoutScore;
      if (sc(casa) != null && sc(fora) != null) penalties = `${sc(casa)}-${sc(fora)}`;
    }

    // Nome da fase/rodada
    let league = camp.nome;
    if (camp.espn === 'bra.1') {
      // A ESPN não informa a rodada: usa a ordem cronológica dos jogos do Fluminense
      league += ` - Rodada ${indice + 1}`;
    } else {
      const faseEn = ev.seasonType?.name ?? '';
      const fase = FASES[faseEn] ?? faseEn;
      contadorPorFase[fase] = (contadorPorFase[fase] ?? 0) + 1;
      const n = contadorPorFase[fase];
      if (fase === 'Fase de Grupos') league += ` - Fase de Grupos - Rodada ${n}`;
      else if (fase === 'Final') league += ' - Final';
      else league += ` - ${fase} - ${n === 1 ? 'Ida' : 'Volta'}`;
    }

    const estadio = comp.venue?.fullName;
    const jogo = {
      Fluminense: flu?.team?.displayName ?? TEAM_NAME,
      opponent,
      isHome,
      date: `${d}/${m}/${a}`,
      time,
      datetime: horaDefinida ? `${iso}T${time}:00-03:00` : `${iso}T00:00:00-03:00`,
      stadium: estadio ? (NOMES_ESTADIO[estadio] ?? estadio) : 'A definir',
      league,
      result,
      calendarLink: linkCalendario({ isHome, opponent, iso, horaDefinida, inicio }),
      fonte: 'ESPN',
    };
    if (penalties) jogo.penalties = penalties;
    return jogo;
  });
}

/* ---------------- OpenFootball (reserva) ---------------- */
async function jogosDoOpenFootball(camp) {
  const texto = await buscarTexto(camp.openfootball);
  const jogos = processData(texto, camp.nome);
  if (jogos.some(j => !j._dataReconhecida)) throw new Error('datas não reconhecidas (formato mudou?)');
  return jogos.map(({ _dataReconhecida, ...j }) => ({ ...j, fonte: 'OpenFootball' }));
}

/* ---------------- Principal ---------------- */
async function fetchJogos() {
  const todos = [];
  for (const camp of CAMPEONATOS) {
    try {
      const jogos = await jogosDaEspn(camp);
      if (jogos.length === 0) throw new Error('nenhum jogo retornado');
      console.log(`✓ ${camp.nome}: ${jogos.length} jogos (ESPN)`);
      todos.push(...jogos);
      continue;
    } catch (e) {
      console.error(`Aviso: ESPN falhou para ${camp.nome} (${e.message}). Tentando OpenFootball...`);
    }
    try {
      const jogos = await jogosDoOpenFootball(camp);
      console.log(`✓ ${camp.nome}: ${jogos.length} jogos (OpenFootball, reserva)`);
      todos.push(...jogos);
    } catch (e) {
      console.error(`Erro: OpenFootball também falhou para ${camp.nome} (${e.message}).`);
    }
  }

  if (todos.length === 0) {
    console.error('Erro: nenhum jogo obtido. db.json NÃO foi alterado.');
    process.exit(1);
  }

  todos.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const formatados = todos.map((j, i) => ({ ...j, id: i + 1 }));
  fs.writeFileSync('db.json', JSON.stringify(formatados, null, 2) + '\n');
  console.log(`✓ ${formatados.length} jogos salvos em db.json`);
}

/* ---------------- Parser do OpenFootball ---------------- */
// Estádios conhecidos (o OpenFootball não informa o local). Chave: data YYYY-MM-DD.
const ESTADIOS_CONHECIDOS = {
  '2026-04-07': 'Olímpico de la UCV',
  '2026-04-30': 'Hernando Siles',
  '2026-05-06': 'Bautista Gargantini'
};

const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// Traduções simples dos títulos de fase/rodada do OpenFootball
function traduzirRodada(texto) {
  return texto
    .replace(/Matchday/g, 'Rodada')
    .replace(/^Group,?\s*/i, 'Fase de Grupos - ')
    .replace(/^Playoffs,?\s*/i, 'Playoffs - ')
    .replace(/^Round of 16,?\s*/i, 'Oitavas - ')
    .replace(/^Quarter-?finals?,?\s*/i, 'Quartas - ')
    .replace(/^Semi-?finals?,?\s*/i, 'Semifinal - ')
    .replace(/^Final\b,?\s*/i, 'Final ')
    .trim();
}

// Remove o código do país, ex.: "Fluminense FC (BRA)" -> "Fluminense FC"
function limparNome(nome) {
  return nome.replace(/\s*\([A-Z]{3}\)\s*$/, '').trim();
}

function processData(data, baseLeagueName) {
  const lines = data.split('\n').map(l => l.replace('\r', ''));

  let currentMatchday = '';
  let currentYear = null;
  let currentMonth = null;
  let currentDay = null;
  let currentTime = 'A definir';

  // Ano padrão vem do cabeçalho "# Date ... 2026"
  const headerYear = data.match(/^#\s*Date.*?(\d{4})/m);
  const defaultYear = headerYear ? headerYear[1] : String(new Date().getFullYear());
  currentYear = defaultYear;

  const jogos = [];

  for (const line of lines) {
    // Cabeçalho de rodada: "» Matchday 1" (formato antigo) ou "▪ Matchday 1" (formato novo)
    const mdMatch = line.match(/^\s*[»▪•]\s*(.+)$/);
    if (mdMatch) {
      currentMatchday = traduzirRodada(mdMatch[1].trim());
      continue;
    }

    // Linha de data: "  Wed Jan/28 2026" (antigo) ou "  Wed Jan 28 2026" (novo)
    const dateMatch = line.match(/^\s+([A-Za-z]{3})\s+([A-Za-z]{3})[\/\s](\d{1,2})(?:\s+(\d{4}))?\s*$/);
    if (dateMatch && monthMap[dateMatch[2]] !== undefined) {
      currentMonth = monthMap[dateMatch[2]];
      currentDay = parseInt(dateMatch[3], 10);
      if (dateMatch[4]) currentYear = dateMatch[4];
      currentTime = 'A definir';
      continue;
    }

    const vIndex = line.indexOf(' v ');
    if (vIndex === -1) continue;

    let homeStr = line.substring(0, vIndex);

    // Horário: "19.00" (antigo) ou "19:00" (novo) no início da linha
    const timeMatch = homeStr.match(/^\s+(\d{1,2})[.:](\d{2})\s+/);
    if (timeMatch) {
      currentTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
      homeStr = homeStr.substring(timeMatch[0].length);
    }
    const timeStr = currentTime;
    homeStr = limparNome(homeStr.trim());

    let awayStr = line.substring(vIndex + 3).trim();
    let resultStr = '-';
    const statusIndex = awayStr.search(/\s{2,}\S/);
    if (statusIndex !== -1) {
      resultStr = awayStr.substring(statusIndex).trim();
      awayStr = awayStr.substring(0, statusIndex).trim();
      resultStr = resultStr.replace(/\s*\([^)]*\)/g, '').trim();
      if (resultStr.includes('[postponed]')) resultStr = 'Adiado';
      if (!resultStr) resultStr = '-';
    }
    awayStr = limparNome(awayStr);

    if (!homeStr.includes(TEAM_NAME) && !awayStr.includes(TEAM_NAME)) continue;

    const isHome = homeStr.includes(TEAM_NAME);
    const opponent = isHome ? awayStr : homeStr;
    const dataReconhecida = currentMonth !== null && currentDay !== null;

    const monthFmt = ((currentMonth ?? 0) + 1).toString().padStart(2, '0');
    const dayFmt = (currentDay ?? 1).toString().padStart(2, '0');
    const allDay = timeStr === 'A definir';
    const horaIso = allDay ? '00:00' : timeStr;

    // Data/hora no horário de Brasília (UTC-3)
    const isoString = `${currentYear}-${monthFmt}-${dayFmt}T${horaIso}:00-03:00`;
    const dateObj = new Date(isoString);

    // Link do Google Calendar: dia inteiro se o horário for indefinido, senão 2h de duração
    let datesParam;
    if (allDay) {
      const fim = new Date(Date.UTC(+currentYear, currentMonth ?? 0, (currentDay ?? 1) + 1));
      const fimFmt = fim.toISOString().slice(0, 10).replace(/-/g, '');
      datesParam = `${currentYear}${monthFmt}${dayFmt}/${fimFmt}`;
    } else {
      const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      datesParam = `${fmt(dateObj)}/${fmt(new Date(dateObj.getTime() + 2 * 60 * 60 * 1000))}`;
    }

    const textCal = encodeURIComponent(isHome ? `Fluminense vs ${opponent}` : `${opponent} vs Fluminense`);
    const calendarLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${textCal}&dates=${datesParam}`;

    const dataChave = `${currentYear}-${monthFmt}-${dayFmt}`;
    const stadium = ESTADIOS_CONHECIDOS[dataChave] || (isHome ? 'Maracanã' : 'A definir');

    jogos.push({
      Fluminense: isHome ? homeStr : awayStr,
      opponent,
      isHome,
      date: `${dayFmt}/${monthFmt}/${currentYear}`,
      time: timeStr,
      datetime: isoString,
      stadium,
      league: currentMatchday ? `${baseLeagueName} - ${currentMatchday}` : baseLeagueName,
      result: resultStr,
      calendarLink,
      _dataReconhecida: dataReconhecida
    });
  }

  return jogos;
}

fetchJogos();
