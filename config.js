
const CONFIG = {

  leagueName: "Liga Atlântica",
  leagueSubtitle: " Liga de Pokémon TCG - FSA",



  googleSheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQrKLqAbkaLT8PoWq7NfDbsz78KLsLfT3R2bZ5Ou5iZOwQwm7YhFpfjhM1lmxQPlti4a7KeQamMqwW4/pubhtml",



  dataSource: "github",

  githubSources: {
    Ranking: "https://raw.githubusercontent.com/delipex/liga-atlantica/main/ranking.tdf", 
    Calendario: "", 
    Campeoes: "",
    Regras: "",
    Galeria: "",
    ScoresAntigos: "",
    Metagame: ""
  },

  publishedSheetGids: {
    Ranking: "711743754",
    Calendario: "795520659",
    Campeoes: "2040464778",
    Regras: "1560734436",
    Galeria: "1311009323",
    ScoresAntigos: "1809448887",
    Metagame: "",
    Decks: "1459968566",
    Configuracoes: "1275325263",
    Jogadores: "711743754"
  },

  historicalScoresTab: "ScoresAntigos",

  seasons: [
    { value: "Ranking", label: "Temporada Atual (Ativa)" },
    { value: "Ranking_2025_Outono", label: "Temporada de Outono 2025" },
    { value: "Ranking_2025_Verao", label: "Temporada de Verão 2025" }
  ],

  nextEvent: {
    title: "Torneio Especial de Fim de Semana",
    date: "2026-06-20", 
    time: "14:00",
    location: "Livraria Atlântica +",
    locationUrl: "", 
    description: "Formato Standard. Traga seu melhor deck e venha disputar pontos extras para o ranking geral da liga!",
    active: true 
  }
};

window.CONFIG = CONFIG;

