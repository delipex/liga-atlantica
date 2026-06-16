// Configurações do Site da Liga Atlântica de Pokémon TCG
const CONFIG = {
  // Nome da sua liga
  leagueName: "Liga Atlântica",
  leagueSubtitle: " Liga de Pokémon TCG - FSA",
  
  // Link da sua Planilha do Google Sheets publicada na Web como CSV.
  // Deixe em branco ("") para usar os dados fictícios de demonstração (mock data).
  // No final do desenvolvimento, explicaremos no guia como preencher este campo.
  googleSheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQrKLqAbkaLT8PoWq7NfDbsz78KLsLfT3R2bZ5Ou5iZOwQwm7YhFpfjhM1lmxQPlti4a7KeQamMqwW4/pubhtml",

  // Fonte de dados ativa: "sheets" (Google Sheets) ou "github" (Arquivo .tdf no GitHub)
  // Deixe como "sheets" por enquanto. Quando quiser virar a chave da nova temporada, altere para "github".
  // Para testar a versão do GitHub temporariamente, você pode acessar: seu-site.com/?source=github
  dataSource: "sheets",

  // Links "Raw" do GitHub para cada aba se dataSource for "github"
  githubSources: {
    Ranking: "https://raw.githubusercontent.com/delipex/liga-atlantica/main/site/ranking.tdf", // O painel admin.html atualizará este arquivo.
    Calendario: "", 
    Campeoes: "",
    Regras: "",
    Galeria: "",
    ScoresAntigos: "",
    Metagame: ""
  },

  // GIDs das abas publicadas. Necessário para links /d/e/.../pubhtml.
  publishedSheetGids: {
    Ranking: "711743754",
    Calendario: "795520659",
    Campeoes: "2040464778",
    Regras: "1560734436",
    Galeria: "1311009323",
    ScoresAntigos: "1809448887",
    Metagame: "1049757256"
  },
  
  // Nome da aba única que guarda o arquivo histórico de scores antigos.
  historicalScoresTab: "ScoresAntigos",
  
  // Lista de temporadas passadas (deve corresponder aos nomes das abas no Google Sheets)
  seasons: [
    { value: "Ranking", label: "Temporada Atual (Ativa)" },
    { value: "Ranking_2025_Outono", label: "Temporada de Outono 2025" },
    { value: "Ranking_2025_Verao", label: "Temporada de Verão 2025" }
  ],
  
  // Detalhes do Próximo Encontro (Caso queira definir manualmente ou usar como padrão)
  nextEvent: {
    title: "Torneio Especial de Fim de Semana",
    date: "2026-06-20", // Formato: AAAA-MM-DD
    time: "14:00",
    location: "Livraria Atlântica +",
    locationUrl: "", // Link do Google Maps do local do próximo evento
    description: "Formato Standard. Traga seu melhor deck e venha disputar pontos extras para o ranking geral da liga!",
    active: true // Define se o card de contagem regressiva aparece no site
  }
};

// Exportar para uso no app.js (no escopo global do navegador)
window.CONFIG = CONFIG;
