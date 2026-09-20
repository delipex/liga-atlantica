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

  nextEvent: {
    title: "Sessão de Liga Padrão",
    date: "2026-09-26",
    time: "14:00",
    location: "Livraria Atlântica +",
    locationUrl: "https://maps.app.goo.gl/PNzqi2VsaCmUd3vY6",
    description: "Formato Standard. Traga seu melhor deck e venha disputar pontos para o ranking oficial!",
    active: true
  }
};

window.CONFIG = CONFIG;
