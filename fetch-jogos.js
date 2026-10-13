import fs from 'fs';
import axios from 'axios';

const OPENFOOTBALL_URLS = [
  { url: 'https://raw.githubusercontent.com/openfootball/south-america/master/brazil/2026_br1.txt', leagueName: 'Brasileirão Série A' },
  { url: 'https://raw.githubusercontent.com/openfootball/south-america/master/copa-libertadores/2026_copal.txt', leagueName: 'Copa Libertadores' }
];

const TEAM_NAME = 'Fluminense'; // Busca por "Fluminense" flexível

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

async function fetchJogos() {
  const todosOsJogos = [];

  for (const source of OPENFOOTBALL_URLS) {
    console.log(`Buscando dados em ${source.url}...`);
    try {
      const response = await axios.get(source.url);
      const jogosDaLiga = processData(response.data, source.leagueName);
      console.log(`  ${jogosDaLiga.length} jogos do ${TEAM_NAME} encontrados`);
      todosOsJogos.push(...jogosDaLiga);
    } catch (error) {
      console.error(`Aviso: Não foi possível obter dados de ${source.url} (${error.message})`);
    }
  }

  // Segurança: se o parser não reconheceu nenhuma data, não sobrescreve o db.json
  const semData = todosOsJogos.filter(j => !j._dataReconhecida).length;
  if (todosOsJogos.length === 0) {
    console.error('Erro: nenhum jogo obtido. db.json NÃO foi alterado.');
    process.exit(1);
  }
  if (semData > 0) {
    console.error(`Erro: ${semData} jogos sem data reconhecida (formato do OpenFootball pode ter mudado). db.json NÃO foi alterado.`);
    process.exit(1);
  }

  todosOsJogos.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  const formatados = todosOsJogos.map((j, i) => {
    const { _dataReconhecida, ...resto } = j;
    resto.id = i + 1;
    return resto;
  });

  fs.writeFileSync('db.json', JSON.stringify(formatados, null, 2));
  console.log(`✓ ${formatados.length} jogos salvos em db.json`);
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
