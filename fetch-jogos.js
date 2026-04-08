const fs = require('fs');
const axios = require('axios');

const OPENFOOTBALL_URL = 'https://raw.githubusercontent.com/openfootball/south-america/master/brazil/2026_br1.txt';
const TEAM_NAME = 'Fluminense'; // Busca por "Fluminense" flexível

const monthMap = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };

async function fetchJogos() {
  console.log(`Buscando dados em ${OPENFOOTBALL_URL}...`);
  try {
    const response = await axios.get(OPENFOOTBALL_URL);
    processData(response.data);
  } catch (error) {
    console.error('Erro ao buscar dados:', error.message);
  }
}

function processData(data) {
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

            const jogoTime = isHome ? 'vs' : '@';
            const textCal = encodeURIComponent(`${isHome ? homeStr : awayStr} ${jogoTime} ${opponent}`);
            
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
              league: `Brasileirão Série A - ${currentMatchday}`,
              result: resultStr,
              calendarLink: calendarLink
            });
        }
    }
  }

  fs.writeFileSync('db.json', JSON.stringify(jogos, null, 2));
  console.log(`✓ ${jogos.length} jogos salvos em db.json`);
}

fetchJogos();