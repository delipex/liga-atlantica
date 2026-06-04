
function normalizeImageUrl(url){
  if(!url) return '';
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if(m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w2000`;
  const m2 = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w2000`;
  return url;
}

// Liga Atlântica de Pokémon TCG - Script Principal

// --- DADOS DE DEMONSTRAÇÃO (MOCK DATA) ---
// Usados se a Google Sheet não estiver configurada ou se houver erro ao carregar
const MOCK_DATA = {
  Ranking: [
    { Pos: 1, Jogador: "Felipe Damasceno", Categoria: "MASTER", Pontos: 27, Podio: 5, MediaColocacao: 2.4, Deck: "Charizard ex", TipoEnergia: "fire" },
    { Pos: 2, Jogador: "Mariana Costa", Categoria: "MASTER", Pontos: 22, Podio: 4, MediaColocacao: 3.1, Deck: "Gardevoir ex", TipoEnergia: "psychic" },
    { Pos: 3, Jogador: "Lucas Souza", Categoria: "SENIOR", Pontos: 19, Podio: 3, MediaColocacao: 3.8, Deck: "Miraidon ex", TipoEnergia: "lightning" },
    { Pos: 4, Jogador: "Beatriz Lima", Categoria: "SENIOR", Pontos: 18, Podio: 2, MediaColocacao: 4.2, Deck: "Chien-Pao ex", TipoEnergia: "water" },
    { Pos: 5, Jogador: "Thiago Silva", Categoria: "MASTER", Pontos: 15, Podio: 1, MediaColocacao: 5.6, Deck: "Lugia VSTAR", TipoEnergia: "colorless" },
    { Pos: 6, Jogador: "Rodrigo Alves", Categoria: "JUNIOR", Pontos: 12, Podio: 1, MediaColocacao: 6.4, Deck: "Roaring Moon ex", TipoEnergia: "darkness" },
    { Pos: 7, Jogador: "Gabriela Reis", Categoria: "JUNIOR", Pontos: 9, Podio: 0, MediaColocacao: 7.2, Deck: "Gholdengo ex", TipoEnergia: "metal" },
    { Pos: 8, Jogador: "Pedro Henrique", Categoria: "SENIOR", Pontos: 4, Podio: 0, MediaColocacao: 8.5, Deck: "Regidrago VSTAR", TipoEnergia: "dragon" }
  ],
  ScoresAntigos: [
    { Temporada: "Temporada de Verão 2025", DataFechamento: "2025-02-28", Pos: 1, Jogador: "Mariana Costa", Categoria: "MASTER", Pontos: 24, Podio: 4, MediaColocacao: 2.8, Deck: "Gardevoir ex", TipoEnergia: "psychic" },
    { Temporada: "Temporada de Verão 2025", DataFechamento: "2025-02-28", Pos: 2, Jogador: "Thiago Silva", Categoria: "MASTER", Pontos: 21, Podio: 3, MediaColocacao: 3.5, Deck: "Lugia VSTAR", TipoEnergia: "colorless" },
    { Temporada: "Temporada de Outono 2025", DataFechamento: "2025-05-31", Pos: 1, Jogador: "Felipe Damasceno", Categoria: "MASTER", Pontos: 27, Podio: 5, MediaColocacao: 2.4, Deck: "Charizard ex", TipoEnergia: "fire" },
    { Temporada: "Temporada de Outono 2025", DataFechamento: "2025-05-31", Pos: 2, Jogador: "Mariana Costa", Categoria: "MASTER", Pontos: 22, Podio: 4, MediaColocacao: 3.1, Deck: "Gardevoir ex", TipoEnergia: "psychic" }
  ],
  Calendario: [
    { Data: "2026-06-06", Evento: "Liga Semanal #15 - Rodada Suíça", Local: "Livraria Atlântica +", Horario: "10:00", Status: "confirmado", Descricao: "Primeira rodada de Junho. Formato Standard (Regulamento Temporal).", LinkMaps: "" },
    { Data: "2026-06-13", Evento: "Liga Semanal #16 - Treino & Trocas", Local: "Livraria Atlântica +", Horario: "10:00", Status: "confirmado", Descricao: "Encontro casual para testar decks novos, trocar cartas e tirar dúvidas de regras.", LinkMaps: "" },
    { Data: "2026-06-20", Evento: "Copa Atlântica de Inverno (Especial)", Local: "Livraria Atlântica +", Horario: "14:00", Status: "confirmado", Descricao: "Torneio especial de fim de semana valendo pontuação dobrada e premiação física.", LinkMaps: "" },
    { Data: "2026-06-27", Evento: "Liga Semanal #17 - Formato Alternativo", Local: "Livraria Atlântica +", Horario: "10:00", Status: "pendente", Descricao: "Rodada casual com formato Gym Leader Challenge (apenas cartas singleton de um único tipo).", LinkMaps: "" }
  ],
  Campeoes: [
    { Temporada: "Temporada de Outono 2025", Campeao: "Felipe Damasceno", Vice: "Mariana Costa", DeckCampeao: "Charizard ex", Data: "Maio/2025", FotoCampeao: "", URLDeck: "", ImagemDeck: "", ObservacaoDeck: "" },
    { Temporada: "Temporada de Verão 2025", Campeao: "Mariana Costa", Vice: "Thiago Silva", DeckCampeao: "Gardevoir ex", Data: "Fevereiro/2025", FotoCampeao: "", URLDeck: "", ImagemDeck: "", ObservacaoDeck: "" },
    { Temporada: "Temporada de Primavera 2024", Campeao: "Thiago Silva", Vice: "Beatriz Lima", DeckCampeao: "Lugia VSTAR", Data: "Novembro/2024", FotoCampeao: "", URLDeck: "", ImagemDeck: "", ObservacaoDeck: "" }
  ],
  Regras: [
    { Titulo: "Formato do Jogo", Descricao: "As partidas da liga oficial são jogadas no Formato Standard oficial da Pokémon Company (cartas com a marca de regulamento atual). Atualmente, marcas 'F' ou posterior." },
    { Titulo: "Sistema de Pontuação Geral", Descricao: "A classificação considera a pontuação total dos eventos, a quantidade de pódios alcançados no Top 3 e a média de colocação obtida durante a temporada." },
    { Titulo: "Premiação Trimestral", Descricao: "Ao final de cada temporada (3 meses), os 4 melhores treinadores no ranking disputarão um Top Cut (Playoffs) presencial para decidir o grande campeão da temporada, com premiação em boosters e acessórios." },
    { Titulo: "Fair Play e Conduta", Descricao: "Nossa liga prioriza um ambiente saudável e acolhedor para todas as idades. Comportamentos antidesportivos, trapaças ou desrespeito resultarão em advertência ou desclassificação imediata do circuito." }
  ],
  Galeria: [
    { Titulo: "Primeiro Encontro da Temporada", Descricao: "Abertura oficial com grande presença de jogadores locais no último fim de semana.", URL_Imagem: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop", Data: "03/05/2025" },
    { Titulo: "Duelo do Top Cut presencial", Descricao: "Felipe contra Mariana na final emocionante disputada carta a carta.", URL_Imagem: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=800&auto=format&fit=crop", Data: "25/05/2025" },
    { Titulo: "Mesa de Trocas e Deckbuilding", Descricao: "Jogadores trocando cartas ultra-raras e trocando ideias de estratégias.", URL_Imagem: "https://images.unsplash.com/photo-1544654803-b69140b285a1?w=800&auto=format&fit=crop", Data: "10/05/2025" },
    { Titulo: "Nova Coleção em Destaque", Descricao: "Galera conferindo as artes especiais das cartas recém-lançadas da nova expansão.", URL_Imagem: "https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=800&auto=format&fit=crop", Data: "17/05/2025" }
  ]
};

// Armazenamento local dos dados carregados
let appData = { ...MOCK_DATA };
let isOfflineMode = true;

// --- CONFIGURAÇÃO E EXTRAÇÃO DO GOOGLE SHEETS ---
function getSpreadsheetId(url) {
  if (!url) return null;
  const match = url.match(/\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function getPublishedSheetGid(url) {
  if (!url) return '';
  const match = url.match(/[?#&]gid=([0-9]+)/);
  return match ? match[1] : '';
}

// Converte texto CSV para array de objetos JSON
function parseCSV(csvText) {
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // pular próximo aspa
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentLine.push(currentField.trim());
        if (currentLine.length > 0 && currentLine.some(cell => cell !== '')) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some(cell => cell !== '')) {
      lines.push(currentLine);
    }
  }

  if (lines.length < 2) return [];

  const headers = lines[0];
  return lines.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      let val = row[index] || '';
      // Tentar converter números automaticamente
      if (val !== '' && !isNaN(val)) {
        obj[header] = Number(val);
      } else {
        obj[header] = val;
      }
    });
    return obj;
  });
}

// Busca aba específica da planilha usando a API GViz
async function fetchSheetTab(spreadsheetId, tabName, publishedGid = '') {
  const isPublishedSheet = spreadsheetId.startsWith('2PACX-');
  let url = '';

  if (isPublishedSheet) {
    if (!publishedGid) {
      throw new Error(`Link publicado sem gid cadastrado para a aba ${tabName}`);
    }
    url = `https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?gid=${encodeURIComponent(publishedGid)}&single=true&output=csv`;
  } else {
    url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao buscar a aba ${tabName}`);
  const csvText = await response.text();
  return parseCSV(csvText);
}



// Busca uma aba opcional sem quebrar o site caso ela ainda não exista.
async function fetchOptionalSheetTab(spreadsheetId, tabName, publishedGid = '') {
  try {
    return await fetchSheetTab(spreadsheetId, tabName, publishedGid);
  } catch (error) {
    console.info(`Aba opcional "${tabName}" não encontrada ou indisponível.`, error);
    return [];
  }
}

// Protege textos vindos da planilha antes de inserir no HTML.
function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Garante que links externos vindos da planilha sejam seguros antes de abrir no navegador.
function safeExternalUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';

  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch (error) {
    return '';
  }
}

function parseDateSafe(str) {
  if (!str) return new Date(NaN);
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [d, m, y] = str.split('-');
    return new Date(`${y}-${m}-${d}T12:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return new Date(`${str.substring(0, 10)}T12:00:00`);
  }
  return new Date(str);
}

function normalizeDateISO(str) {
  if (!str) return str;
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [d, m, y] = str.split('-');
    return `${y}-${m}-${d}`;
  }
  return str;
}

function safeEnergyClass(value) {
  const allowed = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'dragon', 'colorless'];
  const normalized = String(value || 'colorless').toLowerCase().trim();
  return allowed.includes(normalized) ? normalized : 'colorless';
}

function toNumber(value, fallback = 0) {
  const normalizedValue = typeof value === 'string' ? value.replace(',', '.') : value;
  const number = Number(normalizedValue);
  return Number.isFinite(number) ? number : fallback;
}

function getFirstDefined(row, fieldNames) {
  for (const fieldName of fieldNames) {
    if (row[fieldName] !== undefined && row[fieldName] !== '') {
      return row[fieldName];
    }
  }
  return undefined;
}

function getPodiumCount(row) {
  const value = getFirstDefined(row, ['Podio', 'Pódio', 'Podios', 'Pódios', 'Podium']);
  return value !== undefined ? toNumber(value) : (toNumber(row.Pos, 9999) <= 3 ? 1 : 0);
}

function getAveragePlacement(row) {
  const value = getFirstDefined(row, [
    'MediaColocacao',
    'MédiaColocação',
    'Media Colocacao',
    'Média Colocação',
    'Media de Colocacao',
    'Média de Colocação',
    'Media',
    'Média'
  ]);
  return value !== undefined ? toNumber(value) : toNumber(row.Pos, 0);
}

function formatAveragePlacement(value) {
  const number = toNumber(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace('.', ',');
}

function normalizeCategory(row) {
  const rawValue = getFirstDefined(row, ['Categoria', 'Category', 'Cat', 'Divisao', 'Divisão']);
  const normalized = String(rawValue || 'MASTER')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  if (['ME', 'MASTER', 'MASTERS'].includes(normalized)) {
    return { code: 'ME', label: 'MASTER' };
  }

  if (['SR', 'SENIOR', 'SENIORS'].includes(normalized)) {
    return { code: 'SR', label: 'SENIOR' };
  }

  if (['JR', 'JUNIOR', 'JUNIORS'].includes(normalized)) {
    return { code: 'JR', label: 'JUNIOR' };
  }

  return { code: 'ME', label: 'MASTER' };
}

function normalizeRanking(rankingRows, partidasRows = []) {
  if (!Array.isArray(rankingRows)) return [];

  const normalized = rankingRows
    .filter(player => player && player.Jogador)
    .map(player => {
      const pontos = player.Pontos !== undefined && player.Pontos !== '' ? toNumber(player.Pontos) : 0;
      const podio = getPodiumCount(player);
      const mediaColocacao = getAveragePlacement(player);
      const categoria = normalizeCategory(player);

      return {
        ...player,
        Pos: toNumber(player.Pos, 0),
        Categoria: categoria.label,
        CategoriaCodigo: categoria.code,
        Pontos: pontos,
        Podio: podio,
        MediaColocacao: mediaColocacao,
        Deck: player.Deck || 'Não registrado',
        TipoEnergia: safeEnergyClass(player.TipoEnergia)
      };
    });

  normalized.sort((a, b) => {
    if (b.Pontos !== a.Pontos) return b.Pontos - a.Pontos;
    if (b.Podio !== a.Podio) return b.Podio - a.Podio;
    if (a.MediaColocacao !== b.MediaColocacao) return a.MediaColocacao - b.MediaColocacao;
    return String(a.Jogador).localeCompare(String(b.Jogador), 'pt-BR');
  });

  normalized.forEach((player, index) => {
    player.Pos = index + 1;
  });

  return normalized;
}

function normalizeHistoricalScores(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter(row => row && row.Temporada && row.Jogador)
    .map(row => ({
      ...row,
      Temporada: String(row.Temporada || '').trim(),
      DataFechamento: row.DataFechamento || '',
      Pos: toNumber(row.Pos, 0),
      Categoria: normalizeCategory(row).label,
      CategoriaCodigo: normalizeCategory(row).code,
      Pontos: toNumber(row.Pontos),
      Podio: getPodiumCount(row),
      MediaColocacao: getAveragePlacement(row),
      Deck: row.Deck || 'Não registrado',
      TipoEnergia: safeEnergyClass(row.TipoEnergia)
    }))
    .sort((a, b) => {
      const seasonCompare = String(b.DataFechamento || b.Temporada).localeCompare(String(a.DataFechamento || a.Temporada), 'pt-BR');
      if (seasonCompare !== 0) return seasonCompare;
      return toNumber(a.Pos, 9999) - toNumber(b.Pos, 9999);
    });
}

function getHistoricalScoreSeasons() {
  const rows = appData.ScoresAntigos || [];
  return [...new Set(rows.map(row => row.Temporada).filter(Boolean))];
}

function populateHistoricalSeasonSelector() {
  const selector = document.getElementById('historical-season-selector');
  if (!selector) return;

  const currentValue = selector.value || 'all';
  const seasons = getHistoricalScoreSeasons();

  selector.innerHTML = [
    '<option value="all">Todas as temporadas</option>',
    ...seasons.map(season => `<option value="${escapeHTML(season)}">${escapeHTML(season)}</option>`)
  ].join('');

  if (seasons.includes(currentValue) || currentValue === 'all') {
    selector.value = currentValue;
  }
}

function renderHistoricalScores() {
  const tbody = document.getElementById('historical-scores-tbody');
  if (!tbody) return;

  const selector = document.getElementById('historical-season-selector');
  const searchInput = document.getElementById('historical-player-search');
  const selectedSeason = selector ? selector.value : 'all';
  const searchValue = searchInput ? searchInput.value.toLowerCase().trim() : '';

  populateHistoricalSeasonSelector();

  const rows = (appData.ScoresAntigos || []).filter(row => {
    const seasonMatch = selectedSeason === 'all' || row.Temporada === selectedSeason;
    const searchMatch = !searchValue ||
      String(row.Jogador || '').toLowerCase().includes(searchValue) ||
      String(row.Deck || '').toLowerCase().includes(searchValue) ||
      String(row.Temporada || '').toLowerCase().includes(searchValue);
    return seasonMatch && searchMatch;
  });

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="historical-empty-state">
          Nenhum score antigo encontrado. Crie a aba <strong>ScoresAntigos</strong> na planilha para alimentar esta consulta.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const letter = row.Jogador ? escapeHTML(String(row.Jogador).charAt(0).toUpperCase()) : '?';

    return `
      <tr>
        <td>
          <div class="historical-season-name">${escapeHTML(row.Temporada)}</div>
          <div class="historical-season-date">${escapeHTML(row.DataFechamento || '')}</div>
        </td>
        <td class="row-rank">${toNumber(row.Pos, '-')}</td>
        <td>
          <div class="player-cell">
            <div class="player-avatar-placeholder historical-avatar">${letter}</div>
            <div>
              <div style="font-weight:600;color:#fff;">${escapeHTML(row.Jogador)}</div>
              <div class="historical-deck"><span class="energy-dot ${safeEnergyClass(row.TipoEnergia)}"></span>${escapeHTML(row.Deck || 'Não registrado')}</div>
            </div>
          </div>
        </td>
        <td style="text-align:center;vertical-align:middle;">
          <span class="score-cell">${toNumber(row.Pontos)} PTS</span>
        </td>
        <td style="text-align:center;vertical-align:middle;">
          <div class="placement-metrics">
            <span class="placement-pill podium">${toNumber(row.Podio)} pódio(s)</span>
            <span class="placement-pill average">Média ${formatAveragePlacement(row.MediaColocacao)}º</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Inicializa o carregamento de dados (Sheets ou Fallback)
async function loadData() {
  const statusBadge = document.getElementById('sheet-status-badge');
  const sheetUrl = window.CONFIG ? window.CONFIG.googleSheetCsvUrl : "";
  const spreadsheetId = getSpreadsheetId(sheetUrl);
  const publishedGid = getPublishedSheetGid(sheetUrl);
  const publishedSheetGids = window.CONFIG && window.CONFIG.publishedSheetGids ? window.CONFIG.publishedSheetGids : {};

  // Reseta o estado para o fallback antes de tentar buscar dados externos.
  appData = { ...MOCK_DATA };

  if (spreadsheetId) {
    try {
      if (statusBadge) {
        statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#3b82f6;border-radius:50%;animation:pulse 1.5s infinite"></span> Conectando ao Sheets...`;
        statusBadge.className = "offline-badge";
        statusBadge.style.color = "#3b82f6";
        statusBadge.style.borderColor = "rgba(59, 130, 246, 0.3)";
      }

      const rankingTabName = "Ranking";

      const historicalScoresTab = window.CONFIG && window.CONFIG.historicalScoresTab ? window.CONFIG.historicalScoresTab : "ScoresAntigos";

      const [ranking, partidas, scoresAntigos, calendario, campeoes, regras, galeria] = await Promise.all([
        fetchSheetTab(spreadsheetId, rankingTabName, publishedSheetGids.Ranking || publishedGid),
        fetchOptionalSheetTab(spreadsheetId, "Partidas", publishedSheetGids.Partidas),
        fetchOptionalSheetTab(spreadsheetId, historicalScoresTab, publishedSheetGids[historicalScoresTab]),
        fetchOptionalSheetTab(spreadsheetId, "Calendario", publishedSheetGids.Calendario),
        fetchOptionalSheetTab(spreadsheetId, "Campeoes", publishedSheetGids.Campeoes),
        fetchOptionalSheetTab(spreadsheetId, "Regras", publishedSheetGids.Regras),
        fetchOptionalSheetTab(spreadsheetId, "Galeria", publishedSheetGids.Galeria)
      ]);

      if (ranking && ranking.length) appData.Ranking = normalizeRanking(ranking, partidas);
      if (partidas && partidas.length) appData.Partidas = partidas;
      appData.ScoresAntigos = normalizeHistoricalScores(scoresAntigos || []);
      if (calendario && calendario.length) appData.Calendario = calendario;
      if (campeoes && campeoes.length) appData.Campeoes = campeoes;
      if (regras && regras.length) appData.Regras = regras;
      if (galeria && galeria.length) appData.Galeria = galeria;

      isOfflineMode = false;

      if (statusBadge) {
        statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#10b981;border-radius:50%"></span> Online`;
        statusBadge.style.color = "#10b981";
        statusBadge.style.borderColor = "rgba(16, 185, 129, 0.3)";
        statusBadge.title = "Dados carregados da planilha em tempo real";
      }
    } catch (error) {
      console.warn("Erro ao buscar dados do Google Sheets. Usando dados locais de demonstração:", error);
      appData.Ranking = normalizeRanking(MOCK_DATA.Ranking, []);
      appData.ScoresAntigos = normalizeHistoricalScores(MOCK_DATA.ScoresAntigos);
      isOfflineMode = true;
      if (statusBadge) {
        statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#f59e0b;border-radius:50%"></span> Modo Demo (Local)`;
        statusBadge.style.color = "#f59e0b";
        statusBadge.style.borderColor = "rgba(245, 158, 11, 0.3)";
        statusBadge.title = "Não foi possível conectar à planilha. Exibindo dados locais fictícios.";
      }
    }
  } else {
    appData.Ranking = normalizeRanking(MOCK_DATA.Ranking, []);
    appData.ScoresAntigos = normalizeHistoricalScores(MOCK_DATA.ScoresAntigos);
    isOfflineMode = true;
    if (statusBadge) {
      statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#f59e0b;border-radius:50%"></span> Modo Demo`;
      statusBadge.style.color = "#f59e0b";
      statusBadge.style.borderColor = "rgba(245, 158, 11, 0.3)";
      statusBadge.title = "Nenhuma planilha configurada em config.js. Exibindo dados fictícios de demonstração.";
    }
  }

  renderAll();
}

// --- SISTEMA DE RENDERIZAÇÃO ---

function renderAll() {
  renderDashboard();
  renderRankingTable(appData.Ranking);
  renderHistoricalScores();
  renderCalendar();
  renderRules();
  renderChampions();
  renderGallery();
}


// Busca automaticamente o próximo evento futuro do calendário
function getNextEventFromCalendar() {
  const events = appData.Calendario || [];
  const now = new Date();
  const future = events.filter(e => {
    if (!e || !e.Data) return false;
    const d = parseDateSafe(e.Data);
    return !isNaN(d) && d >= now;
  }).sort((a,b) => parseDateSafe(a.Data) - parseDateSafe(b.Data));
  if (!future.length) return null;
  const e=future[0];
  return {
    title: e.Evento || 'Próximo Evento',
    date: normalizeDateISO(e.Data),
    time: e.Horario || '00:00',
    location: e.Local || '',
    locationUrl: e.LinkMaps || '',
    description: e.Descricao || '',
    active: true
  };
}


// 1. Dashboard (Top 3 e Próximo Evento)
function renderDashboard() {
  const podiumContainer = document.getElementById('podium-cards-container');
  const eventContainer = document.getElementById('event-widget-content');
  
  // Renderizar Top 3 do Ranking
  if (podiumContainer) {
    const top3 = appData.Ranking.slice(0, 3);
    if (top3.length === 0) {
      podiumContainer.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary)">Nenhum jogador classificado no momento.</div>`;
    } else {
      podiumContainer.innerHTML = top3.map(player => {
        const letter = player.Jogador ? escapeHTML(player.Jogador.charAt(0).toUpperCase()) : '?';
        const energyClass = safeEnergyClass(player.TipoEnergia);
        const playerName = escapeHTML(player.Jogador);
        const playerDeck = escapeHTML(player.Deck || 'Sem deck registrado');
        
        return `
          <div class="podium-card rank-${player.Pos}" onclick="openPlayerModal(${player.Pos})">
            <div class="podium-badge">${player.Pos}</div>
            <div class="player-avatar-placeholder" style="width:44px; height:44px; font-size:1.1rem; margin-right:1rem;">${letter}</div>
            <div class="podium-info">
              <div class="podium-player-name">${playerName}</div>
              <div class="podium-deck-info">
                <span class="energy-dot ${energyClass}"></span>
                <span>${playerDeck}</span>
              </div>
            </div>
            <div class="podium-points">
              <div class="podium-score">${toNumber(player.Pontos)} <span style="font-size:0.75rem;font-weight:400;color:var(--text-secondary)">PTS</span></div>
              <div class="podium-stats">${toNumber(player.Podio)} pódio(s) • média ${formatAveragePlacement(player.MediaColocacao)}º</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Renderizar Card de Evento & Countdown
  if (eventContainer) {
    const eventConf = getNextEventFromCalendar() || (window.CONFIG && window.CONFIG.nextEvent ? window.CONFIG.nextEvent : null);
    
    if (eventConf && eventConf.active) {
      // Formatar data brasileira
      const dateIso = normalizeDateISO(eventConf.date);
      const dateParts = dateIso.split('-');
      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : eventConf.date;
      
      eventContainer.innerHTML = `
        <div class="event-header">
          <div class="event-badge-alert">
            <span></span> Próximo Torneio
          </div>
          <div style="font-size:0.85rem;color:var(--accent-yellow);font-weight:600;">
            ${escapeHTML(formattedDate)} às ${escapeHTML(eventConf.time)}
          </div>
        </div>
        
        <div class="event-details">
          <h3 class="event-title">${escapeHTML(eventConf.title)}</h3>
          <p class="event-description">${escapeHTML(eventConf.description)}</p>
        </div>
        
        <!-- Timer Regressivo -->
        <div class="countdown-container" id="countdown-timer" data-target-date="${eventConf.date}T${eventConf.time}:00">
          <div class="countdown-box">
            <span class="countdown-val" id="timer-days">00</span>
            <span class="countdown-lbl">Dias</span>
          </div>
          <div class="countdown-box">
            <span class="countdown-val" id="timer-hours">00</span>
            <span class="countdown-lbl">Horas</span>
          </div>
          <div class="countdown-box">
            <span class="countdown-val" id="timer-mins">00</span>
            <span class="countdown-lbl">Mins</span>
          </div>
          <div class="countdown-box">
            <span class="countdown-val" id="timer-secs">00</span>
            <span class="countdown-lbl">Segs</span>
          </div>
        </div>
        
        <div class="event-meta">
          <div class="event-meta-item">
            <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            <span><strong>Local:</strong> ${renderLocationLink(eventConf.location, eventConf.locationUrl || eventConf.linkMaps || eventConf.mapsUrl)}</span>
          </div>
        </div>
      `;
      // Inicializar o cronômetro do dashboard
      startCountdown();
    } else {
      eventContainer.innerHTML = `
        <div style="padding:3rem 1.5rem;text-align:center;color:var(--text-secondary)">
          <svg style="width:48px;height:48px;fill:var(--text-muted);margin-bottom:1rem;" viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
          <p>Nenhum torneio agendado no momento.</p>
          <p style="font-size:0.8rem;margin-top:0.5rem;">Fique de olho no grupo para as próximas datas!</p>
        </div>
      `;
    }
  }
}

// 2. Ranking
function renderRankingTable(players) {
  const tbody = document.getElementById('ranking-tbody');
  if (!tbody) return;

  if (!players || players.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;padding:3rem;color:var(--text-secondary);">
          Nenhum treinador encontrado com estes termos.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = players.map(player => {
    const letter = player.Jogador ? escapeHTML(player.Jogador.charAt(0).toUpperCase()) : '?';
    const playerName = escapeHTML(player.Jogador);

    return `
      <tr onclick="openPlayerModal(${player.Pos})">
        <td class="row-rank">${player.Pos}</td>
        <td>
          <div class="player-cell">
            <div class="player-avatar-placeholder">${letter}</div>
            <div style="font-weight: 600; color: #fff;">${playerName}</div>
          </div>
        </td>
        <td style="text-align:center; vertical-align: middle;">
          <span class="category-badge category-${escapeHTML(player.CategoriaCodigo || 'ME').toLowerCase()}" title="${escapeHTML(player.Categoria || 'MASTER')}">${escapeHTML(player.CategoriaCodigo || 'ME')}</span>
        </td>
        <td style="text-align:center; vertical-align: middle;">
          <span class="score-cell">${toNumber(player.Pontos)} PTS</span>
        </td>
        <td style="text-align:center; vertical-align: middle;">
          <div class="placement-metrics">
            <span class="placement-pill podium">${toNumber(player.Podio)} pódio(s)</span>
            <span class="placement-pill average">Média ${formatAveragePlacement(player.MediaColocacao)}º</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Cria link do local para o Google Maps quando houver URL cadastrada.
function renderLocationLink(locationName, mapUrl) {
  const safeName = escapeHTML(locationName || 'Local não informado');
  const safeUrl = safeExternalUrl(mapUrl);

  if (!safeUrl) {
    return safeName;
  }

  return `<a class="location-map-link" href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer" title="Abrir local no Google Maps">${safeName}<span class="location-map-link-icon">↗</span></a>`;
}

// 3. Calendário
function renderCalendar() {
  const timeline = document.getElementById('calendar-timeline');
  if (!timeline) return;

  const events = appData.Calendario;
  
  if (!events || events.length === 0) {
    timeline.innerHTML = `<div style="padding:3rem;text-align:center;color:var(--text-secondary);">Nenhum torneio cadastrado no calendário.</div>`;
    return;
  }

  // Ordenar datas cronologicamente
  const sortedEvents = [...events].sort((a, b) => parseDateSafe(a.Data) - parseDateSafe(b.Data));

  timeline.innerHTML = sortedEvents.map(evt => {
    // Formatar data em PT-BR
    const iso = normalizeDateISO(evt.Data);
    const parts = iso.split('-');
    const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : evt.Data;
    
    const statusClass = ['confirmado', 'concluido', 'pendente'].includes(String(evt.Status || '').toLowerCase()) ? String(evt.Status).toLowerCase() : 'pendente';
    const eventTitle = escapeHTML(evt.Evento);
    const eventDescription = escapeHTML(evt.Descricao || 'Sem descrição cadastrada para este encontro.');
    const eventLocal = evt.Local || 'Livraria Atlântica +';
    const eventMapUrl = evt.LinkMaps || evt.URLMaps || evt.LinkLocal || evt.GoogleMaps || evt.Mapa || '';
    
    return `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-card">
          <div class="timeline-date">
            <span>${escapeHTML(dateFormatted)} às ${escapeHTML(evt.Horario || '10:00')}</span>
            <span class="timeline-status ${statusClass}">${escapeHTML(statusClass)}</span>
          </div>
          <h3 class="timeline-title">${eventTitle}</h3>
          <p class="timeline-description">${eventDescription}</p>
          <div class="timeline-meta">
            <span>📍 <strong>Local:</strong> ${renderLocationLink(eventLocal, eventMapUrl)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 4. Regras
function renderRules() {
  const container = document.getElementById('rules-container');
  if (!container) return;

  const rules = appData.Regras;
  if (!rules || rules.length === 0) {
    container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary);">Nenhum regulamento cadastrado no momento.</div>`;
    return;
  }

  container.innerHTML = rules.map((rule, idx) => {
    return `
      <div class="rule-item" id="rule-${idx}">
        <button class="rule-header" onclick="toggleRule(${idx})">
          <span class="rule-number">${String(idx + 1).padStart(2, '0')}</span>
          <span class="rule-title">${escapeHTML(rule.Titulo)}</span>
          <svg class="rule-chevron" viewBox="0 0 24 24">
            <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
          </svg>
        </button>
        <div class="rule-content">
          <p>${escapeHTML(rule.Descricao)}</p>
        </div>
      </div>
    `;
  }).join('');
}

// 5. Campeões (Hall of Fame)
function renderChampions() {
  const container = document.getElementById('champions-container');
  if (!container) return;

  const champions = appData.Campeoes;
  if (!champions || champions.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1;padding:3rem;text-align:center;color:var(--text-secondary);">Galeria de campeões histórica vazia no momento.</div>`;
    return;
  }

  container.innerHTML = champions.map((champ, index) => {
    const photoUrl = safeExternalUrl(champ.FotoCampeao || champ.Foto || champ.URLFoto || champ.ImagemCampeao);
    const championName = escapeHTML(champ.Campeao || 'Campeão');
    const championInitial = championName ? championName.charAt(0).toUpperCase() : '🏆';
    const hasDeckDetails = Boolean(
      safeExternalUrl(champ.URLDeck || champ.LinkDeck || champ.LinkLista) ||
      safeExternalUrl(champ.ImagemDeck || champ.FotoDeck) ||
      String(champ.ObservacaoDeck || champ.DescricaoDeck || '').trim()
    );

    return `
      <div class="glass-card champion-card">
        <div class="champion-photo-wrap">
          ${photoUrl
            ? `<img class="champion-photo" src="${escapeHTML(photoUrl)}" alt="Foto de ${championName}" loading="lazy">`
            : `<div class="champion-photo-placeholder">${championInitial}</div>`
          }
          <div class="champion-trophy-badge">🏆</div>
        </div>
        <div class="champion-season">${escapeHTML(champ.Temporada)}</div>
        <div class="champion-name">${championName}</div>
        <div class="champion-deck">
          <span class="deck-badge champion-deck-badge">
            Deck: <strong>${escapeHTML(champ.DeckCampeao || 'Não especificado')}</strong>
          </span>
        </div>
        <div class="champion-runners">
          <span>🥈 Vice: <strong>${escapeHTML(champ.Vice || '-')}</strong></span>
        </div>
        ${hasDeckDetails ? `<button class="btn-deck-details" type="button" onclick="openChampionDeckModal(${index})">Ver deck</button>` : ''}
      </div>
    `;
  }).join('');
}

// 6. Galeria
function renderGallery() {
  const container = document.getElementById('gallery-container');
  if (!container) return;

  const photos = appData.Galeria;
  if (!photos || photos.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1;padding:3rem;text-align:center;color:var(--text-secondary);">Nenhuma foto cadastrada na galeria no momento.</div>`;
    return;
  }

  container.innerHTML = photos.map((photo, index) => {
    return `
      <div class="glass-card gallery-item" onclick="openLightbox(${index})">
        <div class="gallery-image-wrapper">
          <img src="${escapeHTML(normalizeImageUrl(photo.URL_Imagem))}" alt="${escapeHTML(photo.Titulo)}" loading="lazy">
        </div>
        <div class="gallery-caption-box">
          <h3 class="gallery-caption-title">${escapeHTML(photo.Titulo)}</h3>
          <div class="gallery-date">${escapeHTML(photo.Data || '')}</div>
        </div>
      </div>
    `;
  }).join('');
}


// --- INTERATIVIDADES E COMPONENTES ---

// Alternar estados do Accordion de Regras
window.toggleRule = function(index) {
  const item = document.getElementById(`rule-${index}`);
  if (!item) return;

  const isOpen = item.classList.contains('open');
  
  // Fechar todas antes
  document.querySelectorAll('.rule-item').forEach(el => {
    el.classList.remove('open');
    el.querySelector('.rule-content').style.maxHeight = null;
  });

  if (!isOpen) {
    item.classList.add('open');
    const content = item.querySelector('.rule-content');
    content.style.maxHeight = (content.scrollHeight + 120) + "px";
  }
};

// Temporizador Regressivo do Dashboard
let countdownInterval;
function startCountdown() {
  const timerEl = document.getElementById('countdown-timer');
  if (!timerEl) return;

  const targetStr = timerEl.getAttribute('data-target-date');
  const targetTime = new Date(targetStr).getTime();

  if (isNaN(targetTime)) return;

  if (countdownInterval) clearInterval(countdownInterval);

  function updateTimer() {
    const now = new Date().getTime();
    const difference = targetTime - now;

    if (difference <= 0) {
      clearInterval(countdownInterval);
      const widget = document.getElementById('event-widget-content');
      if (widget) {
        const badge = widget.querySelector('.event-badge-alert');
        if (badge) {
          badge.innerHTML = `<span style="background:#10b981"></span> Acontecendo Agora!`;
          badge.style.color = '#10b981';
          badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          badge.style.background = 'rgba(16, 185, 129, 0.15)';
        }
      }
      return;
    }

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    const dEl = document.getElementById('timer-days');
    const hEl = document.getElementById('timer-hours');
    const mEl = document.getElementById('timer-mins');
    const sEl = document.getElementById('timer-secs');

    if (dEl) dEl.innerText = String(days).padStart(2, '0');
    if (hEl) hEl.innerText = String(hours).padStart(2, '0');
    if (mEl) mEl.innerText = String(minutes).padStart(2, '0');
    if (sEl) sEl.innerText = String(seconds).padStart(2, '0');
  }

  updateTimer();
  countdownInterval = setInterval(updateTimer, 1000);
}

// Lightbox (Visualizador de Galeria)
let currentPhotoIndex = 0;
window.openLightbox = function(index) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-image');
  const caption = document.getElementById('lightbox-caption');
  
  const photo = appData.Galeria[index];
  if (!photo) return;

  currentPhotoIndex = index;
  img.src = photo.URL_Imagem;
  caption.innerText = `${photo.Titulo} - ${photo.Descricao || ''}`;
  
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden'; // travar scroll principal
};

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

// Modal de Detalhes do Jogador
window.openPlayerModal = function(rankPos) {
  const modal = document.getElementById('player-modal');
  const player = appData.Ranking.find(p => p.Pos === rankPos);
  if (!player || !modal) return;

  const letter = player.Jogador ? player.Jogador.charAt(0).toUpperCase() : '?';
  const energyClass = safeEnergyClass(player.TipoEnergia);

  // Inserir elementos no modal
  document.getElementById('modal-avatar').innerText = letter;
  document.getElementById('modal-player-name').innerText = player.Jogador;
  document.getElementById('modal-player-deck').innerHTML = `
    <span class="energy-dot ${energyClass}"></span>
    <span>Deck: <strong>${escapeHTML(player.Deck || 'Não registrado')}</strong></span>
  `;
  document.getElementById('modal-stat-podiums').innerText = toNumber(player.Podio);
  document.getElementById('modal-stat-average-placement').innerText = `${formatAveragePlacement(player.MediaColocacao)}º`;
  document.getElementById('modal-detail-category').innerText = `${player.Categoria || 'MASTER'} (${player.CategoriaCodigo || 'ME'})`;
  document.getElementById('modal-detail-points').innerText = `${toNumber(player.Pontos)} PTS`;
  document.getElementById('modal-detail-current-placement').innerText = `${toNumber(player.Pos)}º`;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

function closePlayerModal() {
  const modal = document.getElementById('player-modal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

window.openChampionDeckModal = function(index) {
  const modal = document.getElementById('champion-deck-modal');
  const champion = appData.Campeoes && appData.Campeoes[index];
  if (!modal || !champion) return;

  const deckImage = safeExternalUrl(champion.ImagemDeck || champion.FotoDeck);
  const deckUrl = safeExternalUrl(champion.URLDeck || champion.LinkDeck || champion.LinkLista);
  const championName = champion.Campeao || 'Campeão';
  const deckName = champion.DeckCampeao || 'Deck não especificado';
  const observation = champion.ObservacaoDeck || champion.DescricaoDeck || '';

  const titleEl = document.getElementById('champion-deck-title');
  const subtitleEl = document.getElementById('champion-deck-subtitle');
  const imageWrapEl = document.getElementById('champion-deck-image-wrap');
  const noteEl = document.getElementById('champion-deck-note');
  const linkEl = document.getElementById('champion-deck-link');

  if (titleEl) titleEl.innerText = deckName;
  if (subtitleEl) subtitleEl.innerText = `${championName} • ${champion.Temporada || ''}`.trim();

  if (imageWrapEl) {
    imageWrapEl.innerHTML = deckImage
      ? `<img class="champion-deck-image" src="${escapeHTML(deckImage)}" alt="Imagem do deck ${escapeHTML(deckName)}" loading="lazy">`
      : `<div class="champion-deck-empty-image">Imagem do deck não cadastrada.</div>`;
  }

  if (noteEl) {
    noteEl.innerText = observation || 'Sem observações cadastradas para este deck.';
  }

  if (linkEl) {
    if (deckUrl) {
      linkEl.href = deckUrl;
      linkEl.style.display = 'inline-flex';
    } else {
      linkEl.removeAttribute('href');
      linkEl.style.display = 'none';
    }
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

function closeChampionDeckModal() {
  const modal = document.getElementById('champion-deck-modal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
}


// --- NAVEGAÇÃO E SISTEMA DE ROTEAMENTO (SPA) ---

function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const logoBtn = document.getElementById('logo-btn');
  const menuToggle = document.getElementById('menu-toggle');
  const navMenu = document.getElementById('nav-menu');

  // Menu sanduíche responsivo
  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
      menuToggle.classList.toggle('active');
    });
  }

  // Mudança de abas via Link
  function navigateTo(targetId) {
    // Esconder todas as seções
    document.querySelectorAll('.section').forEach(section => {
      section.classList.remove('active');
    });

    // Mostrar a seção alvo
    const activeSection = document.getElementById(targetId);
    if (activeSection) {
      activeSection.classList.add('active');
      window.scrollTo(0, 0);
    }

    // Atualizar links de navegação ativos
    navLinks.forEach(link => {
      if (link.getAttribute('data-target') === targetId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Fechar menu mobile se estiver aberto
    if (navMenu && navMenu.classList.contains('active')) {
      navMenu.classList.remove('active');
      if (menuToggle) {
        menuToggle.classList.remove('active');
      }
    }
  }

  // Escutar cliques nos links
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-target');
      window.location.hash = target;
      navigateTo(target);
    });
  });

  // Escutar clique no logo
  if (logoBtn) {
    logoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = 'dashboard';
      navigateTo('dashboard');
    });
  }

  // Roteamento baseado no hash da URL (Ex: site.com/#ranking)
  function handleHashRoute() {
    const hash = window.location.hash.substring(1);
    const validSections = ['dashboard', 'ranking', 'calendar', 'rules', 'champions', 'gallery'];
    if (hash && validSections.includes(hash)) {
      navigateTo(hash);
    } else {
      navigateTo('dashboard');
    }
  }

  window.addEventListener('hashchange', handleHashRoute);
  handleHashRoute(); // carregar inicial
}

// --- CONFIGURAÇÃO DE EVENTOS GERAIS E INICIALIZAÇÃO ---

function initEvents() {
  // Busca na Tabela de Ranking
  const searchInput = document.getElementById('search-ranking');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const value = e.target.value.toLowerCase().trim();
      
      const filtered = appData.Ranking.filter(player => {
        const nameMatch = player.Jogador && player.Jogador.toLowerCase().includes(value);
        const deckMatch = player.Deck && player.Deck.toLowerCase().includes(value);
        return nameMatch || deckMatch;
      });
      
      renderRankingTable(filtered);
    });
  }

  const historicalSeasonSelector = document.getElementById('historical-season-selector');
  if (historicalSeasonSelector) {
    historicalSeasonSelector.addEventListener('change', renderHistoricalScores);
  }

  const historicalPlayerSearch = document.getElementById('historical-player-search');
  if (historicalPlayerSearch) {
    historicalPlayerSearch.addEventListener('input', renderHistoricalScores);
  }

  // Cliques para fechar Lightbox
  const lightbox = document.getElementById('lightbox');
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
  if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.id === 'lightbox-image') {
        closeLightbox();
      }
    });
  }

  // Escutar teclas (ESC para fechar modais)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
      closePlayerModal();
      closeChampionDeckModal();
    }
  });

  // Cliques para fechar modal do Deck do Campeão
  const championDeckModal = document.getElementById('champion-deck-modal');
  const championDeckCloseBtn = document.getElementById('champion-deck-close-btn');
  if (championDeckCloseBtn) championDeckCloseBtn.addEventListener('click', closeChampionDeckModal);
  if (championDeckModal) {
    championDeckModal.addEventListener('click', (e) => {
      if (e.target === championDeckModal) {
        closeChampionDeckModal();
      }
    });
  }

  // Cliques para fechar modal do Jogador
  const playerModal = document.getElementById('player-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closePlayerModal);
  if (playerModal) {
    playerModal.addEventListener('click', (e) => {
      if (e.target === playerModal) {
        closePlayerModal();
      }
    });
  }
}


// Inicializar tudo ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  // Ajustar títulos dinâmicos baseados no config.js
  const title = window.CONFIG ? window.CONFIG.leagueName : "Liga Atlântica";
  const subtitle = window.CONFIG ? window.CONFIG.leagueSubtitle : "Liga Pessoal de Pokémon TCG";
  
  const hTitle = document.getElementById('header-title');
  const fTitle = document.getElementById('footer-title');
  const wTitle = document.getElementById('welcome-title');
  const wSub = document.getElementById('welcome-subtitle');
  
  if (hTitle) hTitle.innerText = title;
  if (fTitle) fTitle.innerText = title;
  if (wTitle) wTitle.innerText = title;
  if (wSub) wSub.innerText = subtitle;
  
  // Iniciar Navegação e Eventos de Escuta
  initNavigation();
  initEvents();
  
  // Carregar dados da Planilha (ou Fallback)
  loadData();
});
