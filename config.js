// Configurações Globais da Liga Atlântica de Pokémon TCG
// Nota: Parâmetros dinâmicos (próximo evento, avisos, pódio, metagame) são gerenciados via config.json pelo Painel Admin.
const CONFIG = {
  leagueName: "Liga Atlântica",
  leagueSubtitle: "Liga de Pokémon TCG - FSA",
  dataSource: "github",
  temporadaAtual: 5,
  statusTemporada: "ativa",
  statusPodio: "auto",
  exibirMetagame: "ambos",
  historicalScoresTab: "ScoresAntigos",
  
  githubSources: {
    Ranking: "https://raw.githubusercontent.com/delipex/liga-atlantica/main/ranking.tdf"
  },

  nextEvent: null
};

window.CONFIG = CONFIG;
