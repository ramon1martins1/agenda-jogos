const API_FOOTBALL_URL = 'https://api-football-v1.p.rapidapi.com/v3/';
const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HEADERS = {
  'X-RapidAPI-Key': API_KEY,
  'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
};

// IDs de times (você deve verificar os IDs reais via API)
const teams = {
  'Fluminense': '192'
};

module.exports = { API_FOOTBALL_URL, API_HEADERS, teams };