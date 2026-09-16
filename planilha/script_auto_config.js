function popularPlanilhaLiga() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var data = {
    "Ranking": {
      "headers": ["Pos", "Jogador", "Categoria", "Pontos", "Vitorias", "Empates", "Derrotas", "Podio", "MediaColocacao", "Deck", "TipoEnergia", "Participacoes", "HistoricoColocacoes"],
      "rows": [
        [1, "Felipe Damasceno", "MASTER", 27, 9, 0, 1, 5, 2.4, "Charizard ex", "fire", 10, "1;2;1;4;1;2;1;1;2;3"],
        [2, "Mariana Costa", "MASTER", 22, 7, 1, 2, 4, 3.1, "Gardevoir ex", "psychic", 10, "2;1;2;3;2;1;3;2;1;4"],
        [3, "Lucas Souza", "SENIOR", 19, 6, 1, 3, 3, 3.8, "Miraidon ex", "lightning", 10, "3;4;3;2;4;3;2;3;4;2"],
        [4, "Beatriz Lima", "SENIOR", 18, 6, 0, 4, 2, 4.2, "Chien-Pao ex", "water", 10, "4;3;4;1;3;4;4;4;3;1"],
        [5, "Thiago Silva", "MASTER", 15, 5, 0, 5, 1, 5.6, "Lugia VSTAR", "colorless", 10, "5;6;5;6;5;5;6;5;5;6"],
        [6, "Rodrigo Alves", "JUNIOR", 12, 4, 0, 6, 1, 6.4, "Roaring Moon ex", "darkness", 10, "6;5;6;5;6;6;5;6;6;5"],
        [7, "Gabriela Reis", "JUNIOR", 9, 3, 0, 7, 0, 7.2, "Gholdengo ex", "metal", 10, "7;8;7;7;7;7;7;7;7;7"],
        [8, "Pedro Henrique", "SENIOR", 4, 1, 1, 8, 0, 8.5, "Regidrago VSTAR", "dragon", 10, "8;7;8;8;8;8;8;8;8;8"]
      ]
    },
    "Partidas": {
      "headers": ["Data", "Jogador1", "Jogador2", "Vencedor"],
      "rows": [
        // Rodada 1
        ["2026-05-03", "Felipe Damasceno", "Mariana Costa", "Felipe Damasceno"],
        ["2026-05-03", "Lucas Souza", "Beatriz Lima", "Lucas Souza"],
        ["2026-05-03", "Thiago Silva", "Rodrigo Alves", "Thiago Silva"],
        ["2026-05-03", "Gabriela Reis", "Pedro Henrique", "Gabriela Reis"],
        // Rodada 2
        ["2026-05-10", "Felipe Damasceno", "Lucas Souza", "Felipe Damasceno"],
        ["2026-05-10", "Mariana Costa", "Thiago Silva", "Mariana Costa"],
        ["2026-05-10", "Beatriz Lima", "Gabriela Reis", "Beatriz Lima"],
        ["2026-05-10", "Rodrigo Alves", "Pedro Henrique", "Rodrigo Alves"]
      ]
    },
    "Calendario": {
      "headers": ["Data", "Evento", "Local", "Horario", "Status", "Descricao", "LinkMaps", "LinkInscricao", "Foto"],
      "rows": [
        ["06-06-2026", "Sessão de Liga Temporada #4", "Livraria Atlântica +", "14:15", "confirmado", "Primeira rodada do mês, focada na disputa oficial de pontos da temporada.", "https://maps.app.goo.gl/PNzqi2VsaCmUd3vY6", "https://chat.whatsapp.com/EpUEb62hq1bKs6iDtQ3ena", ""],
        ["11-06-2026", "Sessão Especial de Liga Temporada #4 (2x)", "Livraria Atlântica +", "18:30", "confirmado", "Rodada especial valendo o dobro de pontos para o fechamento da temporada #3.", "https://maps.app.goo.gl/PNzqi2VsaCmUd3vY6", "https://chat.whatsapp.com/EpUEb62hq1bKs6iDtQ3ena", ""],
        ["13-06-2026", "Final da Liga Temporada #4", "Livraria Atlântica +", "14:00", "pendente", "Final da Temporada #3 da Liga Atlântica. Premiações e mais!", "https://maps.app.goo.gl/PNzqi2VsaCmUd3vY6", "", ""],
        ["18-06-2026", "Evento para Iniciantes", "Livraria Atlântica +", "18:30", "pendente", "Evento de integração para novos jogadores. Conte com o apoio de professores, juízes e veteranos para evoluir sua jornada.", "https://maps.app.goo.gl/PNzqi2VsaCmUd3vY6", "", ""],
        ["20-06-2026", "Evento para Iniciantes + Sessão de Liga (Padrão)", "Livraria Atlântica +", "14:00", "pendente", "Edição especial para iniciantes! Aprendizado prático com auxílio de especialistas, boosters de participação garantidos e premiações.", "https://maps.app.goo.gl/PNzqi2VsaCmUd3vY6", "", ""],
        ["04-07-2026", "Pré-Release Escuridão Absoluta Pokémon TCG", "Livraria Atlântica +", "14:00 / 17:00", "confirmado", "Evento de Pré-Release Escuridão Absoluta Pokémon TCG. Acontecerá em duas sessões.", "https://maps.app.goo.gl/PNzqi2VsaCmUd3vY6", "https://chat.whatsapp.com/EpUEb62hq1bKs6iDtQ3ena", ""]
      ]
    },
    "Campeoes": {
      "headers": ["Temporada", "Campeao", "Vice", "DeckCampeao", "Data", "FotoCampeao", "URLDeck", "ImagemDeck", "ObservacaoDeck"],
      "rows": [
        ["Temporada #1", "Washington Neto", "", "Dragapult ex", "abril/2025", "https://www.pokemon.com/static-assets/content-assets/cms2/img/pokedex/full/887.png", "", "https://assets.pokemon.com/static-assets/content-assets/cms2-pt-br/img/cards/web/SV8PT5/SV8PT5_PT-BR_73.png", ""],
        ["Temporada #2", "Washington Neto", "", "Zoroark ex", "setembro/2025", "https://www.pokemon.com/static-assets/content-assets/cms2/img/pokedex/full/571.png", "", "https://img.mypcards.com/cdn-cgi/image/f=auto,q=85/img/2/2238/pokemon_jtg_098_159/pokemon_jtg_098_159_pt.jpg", ""],
        ["Temporada #3", "João Pedro Oliveira", "Fernando Ribeiro", "Mega Sharpedo", "abril/2026", "https://www.pokemon.com/static-assets/content-assets/cms2/img/pokedex/full/319_f2.png", "", "https://img.mypcards.com/cdn-cgi/image/f=auto,q=85/img/2/2390/pokemon_pfl_061_094/pokemon_pfl_061_094_pt.jpg", ""]
      ]
    },
    "Regras": {
      "headers": ["Titulo", "Descricao"],
      "rows": [
        ["Formato do Torneio", "As partidas das Sessões de Liga seguem o Formato Standard oficial estabelecido pela The Pokémon Company International. Legalidade: São permitidas apenas cartas com a marca de regulamento atual. Listas de Deck: Jogadores são responsáveis por manter seus decks dentro das diretrizes de legalidade vigentes."],
        ["Sistema de Classificação (Ranking)", "A pontuação da temporada é calculada com base nos seguintes critérios cumulativos: Pontuação de Evento, Performance (Top 3) e Média de Colocação."],
        ["Premiação e Playoffs Trimestrais", "Ao final do ciclo de 3 meses, os 4 jogadores melhores ranqueados avançam para o Top Cut (Playoffs). Formato: Eliminatória presencial. Premiação: Boosters exclusivos e acessórios oficiais."],
        ["Código de Conduta e Fair Play", "A integridade do jogo e o respeito mútuo são pilares da nossa comunidade. Seguindo as diretrizes de Play! Pokémon. Penalidades: Atos de antidesportivismo, trapaça e conduta abusiva estão sujeitos a advertências ou desclassificação."]
      ]
    },
    "Galeria": {
      "headers": ["Titulo", "Descricao", "URL_Imagem", "Data"],
      "rows": [
        ["Sessão de Liga Temporada #4", "Top 4 Master", "https://drive.google.com/file/d/1d2dyIs0qFBKrqQ0HzsuZG4gGHWOqQ4g8/view", "30/05/2025"],
        ["Sessão de Liga Temporada #4 Senior", "Top 4 Sênior", "https://drive.google.com/file/d/1zZBjhQzCqMbe_lHScwArAxtjSvHc_ks4/view", "30/05/2025"],
        ["Ditto Draft - Caos Ascendente", "Sessão de Ditto Draft da Coleção Caos Ascendente", "https://drive.google.com/file/d/16QHW5rq5cr1FLPkFkSzVUnwf4EiZ0VwW/view", "23/05/2025"]
      ]
    },
    "ScoresAntigos": {
      "headers": ["Temporada", "DataFechamento", "Pos", "Jogador", "Categoria", "Pontos", "Podio", "MediaColocacao", "Deck", "TipoEnergia"],
      "rows": [
        ["Temporada #3", "11-04-2026", 1, "João Pedro Oliveira", "ME", 320, 0, 0, "", "psychic"],
        ["Temporada #3", "11-04-2026", 2, "Fernando Ribeiro", "ME", 315, 0, 0, "", "colorless"],
        ["Temporada #3", "11-04-2026", 3, "Washington Neto", "ME", 280, 0, 0, "", "fire"],
        ["Temporada #2", "setembro/2025", 1, "Washington Neto", "ME", 0, 0, 0, "Zoroark ex", "darkness"],
        ["Temporada #1", "abril/2025", 1, "Washington Neto", "ME", 0, 0, 0, "Dragapult ex", "dragon"]
      ]
    }
  };
  
  for (var tabName in data) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    sheet.clear();
    
    var headers = data[tabName].headers;
    var rows = data[tabName].rows;
    
    // Escrever cabecalhos
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Escrever dados
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    
    // Auto-ajustar largura das colunas
    sheet.autoResizeColumns(1, headers.length);
  }
  
  // Remover a 'Página1' padrão se ela ainda existir e estiver vazia
  var defaultSheet = ss.getSheetByName("Página1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  
  Logger.log("Planilha configurada e populada com sucesso!");
}
