// Configurações do Site da Liga Atlântica de Pokémon TCG
const CONFIG = {
  // Nome da sua liga
  leagueName: "Liga Atlântica",
  leagueSubtitle: "Liga Pessoal de Pokémon TCG",
  
  // Link da sua Planilha do Google Sheets publicada na Web como CSV.
  // Deixe em branco ("") para usar os dados fictícios de demonstração (mock data).
  // No final do desenvolvimento, explicaremos no guia como preencher este campo.
  googleSheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQnu84Y1CXAqCSitGLSFAabaqoduGzGOTY96nJth05czUvgb7AP6nUcLcUHMSIMNLWBbSbflqj-tDl9/pubhtml#gid=837990513",

  // GIDs das abas publicadas. Necessário para links /d/e/.../pubhtml.
  publishedSheetGids: {
    Ranking: "837990513",
    Calendario: "294012189",
    Campeoes: "1469582400",
    Regras: "631705301",
    Galeria: "982335265",
    ScoresAntigos: "1540933884"
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
