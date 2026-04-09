const fs = require('fs');
const axios = require('axios');

const OPENFOOTBALL_URLS = [
  { url: 'https://raw.githubusercontent.com/openfootball/south-america/master/brazil/2026_br1.txt', leagueName: 'Brasileirão Série A' },
  { url: 'https://raw.githubusercontent.com/openfootball/south-america/master/copa-libertadores/2026_copal.txt', leagueName: 'Copa Libertadores' }
];

const manualLibertadores = {
  "team": "Fluminense",
  "competition": "Copa Libertadores 2026",
  "stage": "Fase de Grupos",
  "group": "C",
  "matches": [
    { "round": 1, "date": "2026-04-07", "time_brt": "19:00", "home_team": "Deportivo La Guaira", "away_team": "Fluminense", "stadium": "Olímpico de la UCV", "status": "finished", "score": { "home": 0, "away": 0 } },
    { "round": 2, "date": "2026-04-15", "time_brt": "21:30", "home_team": "Fluminense", "away_team": "Independiente Rivadavia", "stadium": "Maracanã", "status": "scheduled", "score": null },
    { "round": 3, "date": "2026-04-30", "time_brt": "19:00", "home_team": "Bolívar", "away_team": "Fluminense", "stadium": "Hernando Siles", "status": "scheduled", "score": null },
    { "round": 4, "date": "2026-05-06", "time_brt": "21:30", "home_team": "Independiente Rivadavia", "away_team": "Fluminense", "stadium": "Bautista Gargantini", "status": "scheduled", "score": null },
    { "round": 5, "date": "2026-05-19", "time_brt": "19:00", "home_team": "Fluminense", "away_team": "Bolívar", "stadium": "Maracanã", "status": "scheduled", "score": null },
    { "round": 6, "date": "2026-05-27", "time_brt": "21:30", "home_team": "Fluminense", "away_team": "Deportivo La Guaira", "stadium": "Maracanã", "status": "scheduled", "score": null }
  ]
};

const TEAM_NAME = 'Fluminense'; // Busca por "Fluminense" flexível

const monthMap = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };

async function fetchJogos() {
  const todosOsJogos = [];

  for (const source of OPENFOOTBALL_URLS) {
    console.log(`Buscando dados em ${source.url}...`);
    try {
      const response = await axios.get(source.url);
      const jogosDaLiga = processData(response.data, source.leagueName);
      todosOsJogos.push(...jogosDaLiga);
    } catch (error) {
      console.error(`Aviso: Não foi possível obter dados de ${source.url} (${error.message})`);
    }
  }

  // Integra os jogos manuais da Libertadores
  for (const match of manualLibertadores.matches) {
    const isHome = match.home_team === manualLibertadores.team;
    const opponent = isHome ? match.away_team : match.home_team;

    // YYYY-MM-DD
    const parts = match.date.split('-');
    const dayFmt = parts[2];
    const monthFmt = parts[1];
    const yearFmt = parts[0];

    const timeStr = match.time_brt;
    let hour = 0, minute = 0;
    if (timeStr !== 'A definir') {
      const tParts = timeStr.split(':');
      hour = parseInt(tParts[0], 10);
      minute = parseInt(tParts[1], 10);
    }

    const isoString = `${yearFmt}-${monthFmt}-${dayFmt}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00-03:00`;
    const dateObj = new Date(isoString);

    let dataFormatadaCale = '';
    if (timeStr === 'A definir') {
      dataFormatadaCale = `${yearFmt}${monthFmt}${dayFmt}`;
    } else {
      dataFormatadaCale = dateObj.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    }

        // Título do evento respeitando o mando de campo e sempre usando "vs"
        const textCal = encodeURIComponent(isHome ? `Fluminense vs ${opponent}` : `${opponent} vs Fluminense`);
    const calendarLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${textCal}&dates=${dataFormatadaCale}/${dataFormatadaCale}`;

    let resultStr = '-';
    if (match.status === 'finished' && match.score) {
      resultStr = `${match.score.home}-${match.score.away}`;
    }

    todosOsJogos.push({
      Fluminense: manualLibertadores.team,
      opponent: opponent,
      isHome: isHome,
      date: `${dayFmt}/${monthFmt}/${yearFmt}`,
      time: timeStr,
      stadium: match.stadium,
      league: `${manualLibertadores.competition} - Rodada ${match.round}`,
      result: resultStr,
      calendarLink: calendarLink,
      dateObj: isoString
    });
  }

  // Ordena os jogos por data
  todosOsJogos.sort((a, b) => {
    return new Date(a.dateObj) - new Date(b.dateObj);
  });

  // Remove a propriedade de data object auxiliar
  const formatados = todosOsJogos.map((j, i) => {
    const { dateObj, ...resto } = j;
    resto.id = i + 1;
    return resto;
  });

  fs.writeFileSync('db.json', JSON.stringify(formatados, null, 2));
  console.log(`✓ ${formatados.length} jogos salvos em db.json`);
}

function processData(data, baseLeagueName) {
  const lines = data.split('\n').map(l => l.replace('\r', ''));

  let currentMatchday = '';
  let currentYear = '2026'; // Default
  let currentMonth = 0;
  let currentDay = 1;
  let currentTime = 'A definir';

  const jogos = [];

  for (let line of lines) {
    if (line.startsWith('»')) {
      let md = line.replace('»', '').trim();
      md = md.replace('Matchday', 'Rodada');
      currentMatchday = md;
      continue;
    }

    // Procura por data: ex. "  Wed Jan/28 2026"
    let dateMatch = line.match(/^\s+([A-Za-z]{3})\s+([A-Za-z]{3})\/(\d+)(?:\s+(\d{4}))?/);
    if (dateMatch) {
      currentMonth = monthMap[dateMatch[2]];
      currentDay = parseInt(dateMatch[3], 10);
      if (dateMatch[4]) {
        currentYear = dateMatch[4];
      }
      currentTime = 'A definir';
      continue;
    }

    const vIndex = line.indexOf(' v ');
    if (vIndex !== -1) {
      let timeStr = currentTime;
      let timeMatch = line.match(/^\s+(\d{2}\.\d{2})\s/);

      let homeStr = line.substring(0, vIndex);
      if (timeMatch) {
        timeStr = timeMatch[1].replace('.', ':');
        currentTime = timeStr;
        homeStr = homeStr.replace(timeMatch[0], '');
      }
      homeStr = homeStr.trim();

      let awayStr = line.substring(vIndex + 3).trim();
      let resultStr = '-';
      let matchStatusIndex = awayStr.search(/\s{2,}.*$/);
      if (matchStatusIndex !== -1) {
        resultStr = awayStr.substring(matchStatusIndex).trim();
        awayStr = awayStr.substring(0, matchStatusIndex).trim();
        // Remover conteúdo entre parênteses
        resultStr = resultStr.replace(/\s*\([^)]*\)/g, '').trim();
        if (resultStr.includes('[postponed]')) resultStr = 'Adiado';
      }

      if (homeStr.includes(TEAM_NAME) || awayStr.includes(TEAM_NAME)) {
        const isHome = homeStr.includes(TEAM_NAME);
        const opponent = isHome ? awayStr : homeStr;

        let hour = 0;
        let minute = 0;
        if (timeStr !== 'A definir') {
          const parts = timeStr.split(':');
          hour = parseInt(parts[0], 10);
          minute = parseInt(parts[1], 10);
        }

        // ISO string requires padding
        const monthFmt = (currentMonth + 1).toString().padStart(2, '0');
        const dayFmt = currentDay.toString().padStart(2, '0');
        const hourFmt = hour.toString().padStart(2, '0');
        const minFmt = minute.toString().padStart(2, '0');

        // Data no BRT (UTC-3)
        const isoString = `${currentYear}-${monthFmt}-${dayFmt}T${hourFmt}:${minFmt}:00-03:00`;
        const dateObj = new Date(isoString);

        let dataFormatadaCale = '';
        // Se "A definir", marca o evento como de dia inteiro
        if (timeStr === 'A definir') {
          dataFormatadaCale = `${currentYear}${monthFmt}${dayFmt}`;
        } else {
          dataFormatadaCale = dateObj.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
        }

        // Título do evento respeitando o mando de campo e sempre usando "vs"
        const textCal = encodeURIComponent(isHome ? `Fluminense vs ${opponent}` : `${opponent} vs Fluminense`);

        // Link pro Google Calendar
        const calendarLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${textCal}&dates=${dataFormatadaCale}/${dataFormatadaCale}`;

        jogos.push({
          id: jogos.length + 1,
          Fluminense: isHome ? homeStr : awayStr,
          opponent: opponent,
          isHome: isHome,
          date: `${dayFmt}/${monthFmt}/${currentYear}`,
          time: timeStr,
          stadium: isHome ? 'Maracanã' : 'A definir',
          league: `${baseLeagueName} - ${currentMatchday}`,
          result: resultStr,
          calendarLink: calendarLink,
          dateObj: isoString
        });
      }
    }
  }

  return jogos;
}

fetchJogos();