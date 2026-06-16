
function normalizeImageUrl(url){
  if(!url) return '';
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if(m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w2000`;
  const m2 = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w2000`;
  return url;
}

// Converte texto TDF (Tab Delimited File) para array de objetos JSON
function parseTDF(tdfText) {
  const lines = tdfText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map(h => h.trim());
  return lines.slice(1).map(rowText => {
    const row = rowText.split('\t');
    const obj = {};
    headers.forEach((header, index) => {
      let val = row[index] || '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      val = val.trim();
      if (val !== '' && !isNaN(val)) {
        obj[header] = Number(val);
      } else {
        obj[header] = val;
      }
    });
    return obj;
  });
}

// Liga Atlântica de Pokémon TCG - Script Principal

// --- DADOS DE DEMONSTRAÇÃO (MOCK DATA) ---
// Usados se a Google Sheet não estiver configurada ou se houver erro ao carregar
const MOCK_DATA = {
  Ranking: [],
  ScoresAntigos: [],
  Calendario: [],
  Campeoes: [],
  Regras: [],
  Galeria: []
};

// Armazenamento local dos dados carregados
let appData = { ...MOCK_DATA };
let stagesIndex = [];
let currentRankingList = [];
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

function detectEventLinkType(url) {
  if (!url) return 'none';
  const value = String(url).toLowerCase();
  if (value.includes('whatsapp.com') || value.includes('wa.me')) return 'whatsapp';
  if (value.includes('playlatam')) return 'playlatam';
  return 'generic';
}

function getEventLinkIcon(type) {
  if (type === 'whatsapp') {
    return '<svg class="btn-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16.03 3C8.86 3 3.04 8.82 3.04 15.99c0 2.29.6 4.52 1.74 6.49L3 29l6.68-1.75a12.92 12.92 0 0 0 6.35 1.64h.01c7.16 0 12.98-5.82 12.98-12.99C29.02 8.82 23.2 3 16.03 3Zm0 23.69h-.01c-1.9 0-3.76-.51-5.38-1.47l-.39-.23-3.96 1.04 1.06-3.86-.25-.4a10.71 10.71 0 0 1-1.65-5.78c0-5.84 4.75-10.59 10.59-10.59 2.83 0 5.49 1.1 7.49 3.1a10.53 10.53 0 0 1 3.1 7.49c0 5.84-4.75 10.7-10.6 10.7Zm5.81-7.93c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.72.16-.21.32-.83 1.04-1.02 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.89-1.78-2.21-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.53-.72-.54h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66s1.15 3.09 1.31 3.3c.16.21 2.26 3.45 5.47 4.84.77.33 1.36.53 1.83.68.77.24 1.47.21 2.02.13.62-.09 1.89-.77 2.16-1.52.27-.75.27-1.39.19-1.52-.08-.13-.29-.21-.61-.37Z"/></svg>';
  }
  if (type === 'playlatam') {
    return '<svg class="btn-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 5.5 6.4 4l3 5.2-3 1.7L3 5.5Zm6.8-1.6L13.2 3l2 5.5-3 1.7-2.4-6.3Zm6.6-1L19 2l1 5.7-3 1.7-.6-6.5ZM4 12.4l3.4-1.9 1.6 5.6L6.3 19 4 12.4Zm6.8-3.8 3.4-1.9 1 5.7-3 1.7-1.4-5.5Zm6.6-3.7L20 3l.4 5.7-3 1.7v-5.5ZM2 18.6 5.5 17l1.7 4.6-3.5 1.6L2 18.6Zm7-4 3.5-1.6 1.4 4.5-3.3 1.5L9 14.6Zm6.8-3.8 3.4-1.6 1 4.5-3.3 1.5-1.1-4.4Z"/></svg>';
  }
  return '<svg class="btn-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z"/></svg>';
}

function getEventLinkConfig(url) {
  const type = detectEventLinkType(url);
  if (type === 'none') return null;
  if (type === 'whatsapp') {
    return { type, url, label: 'Confirme sua presença', icon: getEventLinkIcon('whatsapp'), className: 'btn-evento btn-evento-whatsapp' };
  }
  if (type === 'playlatam') {
    return { type, url, label: 'Inscreva-se', icon: getEventLinkIcon('playlatam'), className: 'btn-evento btn-evento-playlatam' };
  }
  return { type, url, label: 'Inscreva-se', icon: getEventLinkIcon('generic'), className: 'btn-evento btn-evento-generic' };
}

function renderEventLinkButton(url) {
  const config = getEventLinkConfig(url);
  if (!config) return '';
  const safeUrl = safeExternalUrl(config.url);
  if (!safeUrl) return '';
  return `<a href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer" class="${config.className}">${config.icon}<span>${escapeHTML(config.label)}</span></a>`;
}

const STATUS_LABELS = {
  confirmado: 'Evento Confirmado',
  pendente: 'Aguardando Informa\u00e7\u00f5es',
  concluido: 'Conclu\u00eddo'
};

function getStatusLabel(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_LABELS[key] || status;
}

function isInstagramUrl(url) {
  if (!url) return false;
  const value = String(url).toLowerCase();
  return value.includes('instagram.com/');
}

function renderTimelineThumb(url, eventTitle) {
  const safeUrl = safeExternalUrl(normalizeImageUrl(url));
  if (safeUrl) {
    return `<div class="timeline-thumb"><img src="${escapeHTML(safeUrl)}" alt="${escapeHTML(eventTitle || 'Evento')}" loading="lazy"></div>`;
  }
  return '';
}

function getDeckEnergy(deckName) {
  if (!deckName || !appData.Decks) return '';
  const dName = String(deckName).trim().toLowerCase();
  const deckInfo = appData.Decks.find(d => (d.Deck || '').trim().toLowerCase() === dName);
  return deckInfo ? (deckInfo.TipoEnergia || '') : '';
}

function getEnergyDotHTML(value) {
  const allowed = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'dragon', 'colorless'];
  const rawValue = String(value || 'colorless').toLowerCase().trim();
  
  const parts = rawValue.split('+').map(p => p.trim());
  
  if (parts.length > 1) {
    const c1 = allowed.includes(parts[0]) ? parts[0] : 'colorless';
    const c2 = allowed.includes(parts[1]) ? parts[1] : 'colorless';
    return `<span class="energy-dot" style="background: linear-gradient(135deg, var(--energy-${c1}) 50%, var(--energy-${c2}) 50%); box-shadow: -2px 0 6px var(--energy-${c1}), 2px 0 6px var(--energy-${c2}); border-color: rgba(255,255,255,0.4);"></span>`;
  }
  
  const normalized = allowed.includes(rawValue) ? rawValue : 'colorless';
  return `<span class="energy-dot ${normalized}"></span>`;
}

function safeEnergyClass(value) {
  return String(value || 'colorless').toLowerCase().trim();
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

function getVED(player) {
  let v = getFirstDefined(player, ['Vitorias', 'Vitórias', 'Wins', 'Win']);
  let e = getFirstDefined(player, ['Empates', 'Draws', 'Draw']);
  let d = getFirstDefined(player, ['Derrotas', 'Losses', 'Loss']);

  if (v !== undefined) v = toNumber(v);
  if (e !== undefined) e = toNumber(e);
  if (d !== undefined) d = toNumber(d);

  const keys = Object.keys(player || {});
  const hasKey = (k) => keys.includes(k);

  if (v === undefined) {
    if (hasKey('W')) v = toNumber(player['W']);
    else if (hasKey('V')) v = toNumber(player['V']);
    else v = 0;
  }

  if (e === undefined) {
    if (hasKey('E')) {
      e = toNumber(player['E']);
    } else if (hasKey('D') && hasKey('L')) {
      e = toNumber(player['D']);
    } else {
      e = 0;
    }
  }

  if (d === undefined) {
    if (hasKey('L')) {
      d = toNumber(player['L']);
    } else if (hasKey('D') && !hasKey('L')) {
      d = toNumber(player['D']);
    } else {
      d = 0;
    }
  }

  return { v, e, d };
}

function getPlayerMedals(playerName) {
  if (!playerName || !appData || !appData.Campeoes) return '';
  const cleanName = playerName.trim().toLowerCase();
  let medalsHtml = '';

  appData.Campeoes.forEach(champ => {
    if (champ.Campeao && champ.Campeao.trim().toLowerCase() === cleanName) {
      medalsHtml += `
        <svg class="medal-svg gold" width="17" height="17" title="Campeão" viewBox="0 0 8.4666665 8.4666669" xmlns="http://www.w3.org/2000/svg">
          <g fill="#ffcb05" transform="translate(0 -288.533)">
            <path d="m4.2315243 289.45936a3.3072918 3.307292 0 0 0 -3.27060194 2.8448h2.32388834c.1726671-.35084.5304844-.59531.9467136-.59531.4162214 0 .7740439.24447.946711.59531h2.324407a3.3072918 3.307292 0 0 0 -3.271118-2.8448z"/>
            <path d="m.9443859 293.09791a3.3072918 3.307292 0 0 0 3.2871384 2.97603 3.3072918 3.307292 0 0 0 3.2907553-2.97603h-2.2908181c-.1401445.42053-.5333312.7276-.9999372.7276-.4666139 0-.8597953-.30707-.9999398-.7276z"/>
            <path d="m4.2315243 292.12255c-.3542506 0-.6438873.29014-.64389.64439.0000027.35425.2896394.64389.64389.64389.354248 0 .6444033-.28964.6444033-.64389s-.2901553-.64439-.6444033-.64439zm0 .26458c.2112566 0 .37982.16857.37982.37981 0 .21127-.1685634.37931-.37982.37931-.2112592 0-.3793066-.16804-.3793066-.37931 0-.21124.1680474-.37981.3793066-.37981z"/>
          </g>
        </svg>
      `;
    }
    if (champ.Vice && champ.Vice.trim().toLowerCase() === cleanName) {
      medalsHtml += `
        <svg class="medal-svg silver" width="17" height="17" title="Vice-campeão" viewBox="0 0 8.4666665 8.4666669" xmlns="http://www.w3.org/2000/svg">
          <g fill="#cfd8dc" transform="translate(0 -288.533)">
            <path d="m4.2315243 289.45936a3.3072918 3.307292 0 0 0 -3.27060194 2.8448h2.32388834c.1726671-.35084.5304844-.59531.9467136-.59531.4162214 0 .7740439.24447.946711.59531h2.324407a3.3072918 3.307292 0 0 0 -3.271118-2.8448z"/>
            <path d="m.9443859 293.09791a3.3072918 3.307292 0 0 0 3.2871384 2.97603 3.3072918 3.307292 0 0 0 3.2907553-2.97603h-2.2908181c-.1401445.42053-.5333312.7276-.9999372.7276-.4666139 0-.8597953-.30707-.9999398-.7276z"/>
            <path d="m4.2315243 292.12255c-.3542506 0-.6438873.29014-.64389.64439.0000027.35425.2896394.64389.64389.64389.354248 0 .6444033-.28964.6444033-.64389s-.2901553-.64439-.6444033-.64439zm0 .26458c.2112566 0 .37982.16857.37982.37981 0 .21127-.1685634.37931-.37982.37931-.2112592 0-.3793066-.16804-.3793066-.37931 0-.21124.1680474-.37981.3793066-.37981z"/>
          </g>
        </svg>
      `;
    }
  });

  return medalsHtml ? `<span class="player-medals-wrap">${medalsHtml}</span>` : '';
}

function getPodiumCount(row) {
  const value = getFirstDefined(row, ['Podio', 'Pódio', 'Podios', 'Pódios', 'Podium']);
  if (value !== undefined) return toNumber(value);
  const pos = toNumber(row.Pos, 0);
  return (pos > 0 && pos <= 4) ? 1 : 0;
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

function getLatestDeckFromRow(row) {
  if (!row) return null;
  const ignore = ['jogador', 'player', 'nome', 'posicaofinal', 'deck', 'pontos', 'categoria'];
  const keys = Object.keys(row).filter(k => !ignore.includes(k.toLowerCase().trim()));
  for (let i = keys.length - 1; i >= 0; i--) {
    const val = row[keys[i]];
    if (val && typeof val === 'string' && val.trim() !== '') {
      return val.trim();
    }
  }
  return null;
}

function normalizeRanking(rankingRows, partidasRows = []) {
  const statusPodio = window.CONFIG?.StatusPodio || appData.Configuracoes?.StatusPodio || 'auto';
  const isFrozen = window.CONFIG?.dataSource === 'sheets' || statusPodio === 'congelado' || statusPodio === 'offline';
  
  if (isFrozen && appData.Jogadores && appData.Jogadores.length > 0) {
    rankingRows = appData.Jogadores;
  }

  if (!Array.isArray(rankingRows)) return [];

  const normalized = rankingRows
    .filter(player => player && (player.Jogador || player.Name))
    .map(player => {
      const playerName = player.Jogador || player.Name || "";
      const playerNameClean = playerName.trim().toLowerCase();
      
      // Buscar dados extras na aba Jogadores
      const dbPlayer = (appData.Jogadores || []).find(j => {
        const jName = j.Jogador || j.Name || "";
        return jName.trim().toLowerCase() === playerNameClean;
      }) || {};

      const pontosRaw = player.Pontos !== undefined && player.Pontos !== '' ? player.Pontos : player['Match Points'];
      const pontos = pontosRaw !== undefined && pontosRaw !== '' ? toNumber(pontosRaw) : 0;
      const podio = getPodiumCount(player);
      const mediaColocacao = getAveragePlacement(player);
      const categoriaOverride = dbPlayer.Categoria || '';
      const categoria = categoriaOverride ? normalizeCategory({ Categoria: categoriaOverride }) : normalizeCategory(player);

      const { v, e, d } = getVED(player);
      const posRaw = player.Pos || player.Posicao || player.Standing || 0;

      return {
        ...player,
        Jogador: playerName,
        Pos: toNumber(posRaw, 0),
        Categoria: categoria.label,
        CategoriaCodigo: categoria.code,
        Pontos: pontos,
        Podio: podio,
        MediaColocacao: mediaColocacao,
        Vitorias: v,
        Empates: e,
        Derrotas: d,
        Deck: player.Deck || dbPlayer.Deck || getLatestDeckFromRow(dbPlayer) || 'Não registrado',
        TipoEnergia: safeEnergyClass(player.TipoEnergia || dbPlayer.TipoEnergia),
        PosicaoFinal: dbPlayer.PosicaoFinal ? toNumber(dbPlayer.PosicaoFinal) : null
      };
    })
    .sort((a, b) => {
      const statusPodio = window.CONFIG?.StatusPodio || appData.Configuracoes?.StatusPodio || 'auto';
      const isFrozen = window.CONFIG?.dataSource === 'sheets' || statusPodio === 'congelado' || statusPodio === 'offline';
      
      if (isFrozen) {
        return String(a.Jogador).localeCompare(String(b.Jogador), 'pt-BR');
      }

      if (b.Pontos !== a.Pontos) return b.Pontos - a.Pontos;
      if (b.Podio !== a.Podio) return b.Podio - a.Podio;
      
      const mediaA = a.MediaColocacao > 0 ? a.MediaColocacao : 999999;
      const mediaB = b.MediaColocacao > 0 ? b.MediaColocacao : 999999;
      if (mediaA !== mediaB) return mediaA - mediaB;
      
      const posA = a.Pos > 0 ? a.Pos : 999999;
      const posB = b.Pos > 0 ? b.Pos : 999999;
      if (posA !== posB) return posA - posB;
      
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
  const uniqueSeasons = [...new Set(rows.map(row => row.Temporada).filter(Boolean))];
  
  // Sort seasons descending (e.g. Temporada 4, Temporada 3...)
  return uniqueSeasons.sort((a, b) => b.localeCompare(a, 'pt-BR', { numeric: true }));
}

function populateHistoricalSeasonSelector() {
  const selector = document.getElementById('historical-season-selector');
  if (!selector) return;

  const currentValue = selector.value || 'all';
  const seasons = getHistoricalScoreSeasons();
  
  if (seasons.length === 0) {
    selector.innerHTML = '<option value="">Nenhuma temporada</option>';
    return;
  }

  selector.innerHTML = seasons.map(season => `<option value="${escapeHTML(season)}">${escapeHTML(season)}</option>`).join('');

  // Default to the first (most recent) season if current value is 'all' or not in the list
  if (currentValue === 'all' || !seasons.includes(currentValue)) {
    selector.value = seasons[0];
  } else {
    selector.value = currentValue;
  }
}

function populateStageSelector() {
  const selector = document.getElementById('ranking-date-selector');
  if (!selector) return;

  selector.innerHTML = '<option value="general">Ranking Geral</option>';

  const sortedStages = [...stagesIndex].sort((a, b) => b.data.localeCompare(a.data));

  sortedStages.forEach(stage => {
    const parts = stage.data.split('-');
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : stage.data;
    const typeLabel = stage.tipo ? ` (${stage.tipo})` : '';
    const option = document.createElement('option');
    option.value = stage.data;
    option.textContent = stage.label || `Etapa - ${formattedDate}${typeLabel}`;
    selector.appendChild(option);
  });
}

function renderHistoricalScores() {
  const tbody = document.getElementById('historical-scores-tbody');
  if (!tbody) return;

  const selector = document.getElementById('historical-season-selector');
  const searchInput = document.getElementById('historical-player-search');
  
  populateHistoricalSeasonSelector();
  
  const selectedSeason = selector ? selector.value : '';
  const searchValue = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const rows = (appData.ScoresAntigos || []).filter(row => {
    const seasonMatch = row.Temporada === selectedSeason;
    const searchMatch = !searchValue ||
      String(row.Jogador || '').toLowerCase().includes(searchValue) ||
      String(row.Deck || '').toLowerCase().includes(searchValue);
    return seasonMatch && searchMatch;
  });

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="2" class="historical-empty-state">
          Nenhum score encontrado para esta temporada.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  rows.forEach(row => {
      const letter = row.Jogador ? escapeHTML(String(row.Jogador).charAt(0).toUpperCase()) : '?';
      
      html += `
        <tr>
          <td class="row-rank">${toNumber(row.Pos, '-')}</td>
          <td>
            <div class="player-cell">
              <div>
                <div style="font-weight:600;color:var(--text-primary); display:flex; align-items:center; gap:0.5rem;">
                  ${escapeHTML(row.Jogador)}
                  <span class="category-badge category-${escapeHTML(row.CategoriaCodigo || 'ME').toLowerCase()}" title="${escapeHTML(row.Categoria || 'MASTER')}">${escapeHTML(row.CategoriaCodigo || 'ME')}</span>
                </div>
                <div class="historical-deck">${getEnergyDotHTML(getDeckEnergy(row.Deck))}${escapeHTML(row.Deck || 'Não registrado')}</div>
              </div>
            </div>
          </td>
        </tr>
      `;
    });

  tbody.innerHTML = html;
}

// Inicializa o carregamento de dados (Sheets ou Fallback)
async function loadData() {
  const statusBadge = document.getElementById('sheet-status-badge');
  const sheetUrl = window.CONFIG ? window.CONFIG.googleSheetCsvUrl : "";
  const spreadsheetId = getSpreadsheetId(sheetUrl);
  const publishedGid = getPublishedSheetGid(sheetUrl);
  const publishedSheetGids = window.CONFIG && window.CONFIG.publishedSheetGids ? window.CONFIG.publishedSheetGids : {};

  // Parâmetro de URL para testes rápidos: ?source=github ou ?source=sheets
  const urlParams = new URLSearchParams(window.location.search);
  const sourceParam = urlParams.get('source');
  let dataSource = (sourceParam && ["sheets", "github"].includes(sourceParam))
    ? sourceParam
    : (window.CONFIG ? window.CONFIG.dataSource : "sheets");

  const githubSources = window.CONFIG && window.CONFIG.githubSources ? window.CONFIG.githubSources : {};

  // Reseta o estado para o fallback antes de tentar buscar dados externos.
  appData = { ...MOCK_DATA, Configuracoes: { StatusPodio: 'auto' }, Jogadores: [] };

  if (spreadsheetId) {
    try {
      if (statusBadge) {
        statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#3b82f6;border-radius:50%;animation:pulse 1.5s infinite"></span> Conectando...`;
        statusBadge.className = "offline-badge";
        statusBadge.style.color = "#3b82f6";
        statusBadge.style.borderColor = "rgba(59, 130, 246, 0.3)";
      }

      // 1. Buscar a aba de Configurações primeiro para definir dataSource
      let configuracoes = [];
      try {
        const res = await fetchOptionalSheetTab(spreadsheetId, "Configuracoes", publishedSheetGids.Configuracoes);
        if (res && res.length) configuracoes = res;
      } catch(e) {
        console.warn("Falha ao carregar aba Configuracoes");
      }

      configuracoes.forEach(row => {
        const param = (row.Parametro || "").trim().toLowerCase();
        const val = (row.Valor || "").trim();
        if (param === "fonteranking" && !sourceParam) {
          dataSource = val.toLowerCase() === "tdf" ? "github" : "sheets";
        }
        if (param === "statuspodio") {
          appData.Configuracoes.StatusPodio = val.toLowerCase();
        }
      });

      const rankingTabName = "Ranking";
      const historicalScoresTab = window.CONFIG && window.CONFIG.historicalScoresTab ? window.CONFIG.historicalScoresTab : "ScoresAntigos";

      // 2. Definir a promessa de busca do ranking (se do GitHub TDF ou Google Sheets)
      let rankingPromise;
      let stagesPromise;
      if (dataSource === "github" && githubSources.Ranking) {
        rankingPromise = (async () => {
          try {
            const res = await fetch(githubSources.Ranking);
            if (!res.ok) throw new Error("Erro ao carregar ranking TDF do GitHub.");
            const text = await res.text();
            return parseTDF(text);
          } catch (e) {
            console.warn("Falha ao carregar ranking.tdf", e);
            return [];
          }
        })();

        // Buscar index de etapas
        const stagesJsonUrl = githubSources.Ranking.replace('ranking.tdf', 'etapas.json');
        stagesPromise = (async () => {
          try {
            const res = await fetch(`${stagesJsonUrl}?v=${new Date().getTime()}`);
            if (res.ok) return await res.json();
          } catch (e) {
            console.warn("etapas.json não encontrado ou falha ao carregar.");
          }
          return [];
        })();
      } else {
        rankingPromise = fetchSheetTab(spreadsheetId, rankingTabName, publishedSheetGids.Ranking || publishedGid);
        stagesPromise = (async () => {
          try {
            const res = await fetch(`etapas.json?v=${new Date().getTime()}`);
            if (res.ok) return await res.json();
          } catch (e) {
            console.info("etapas.json local não encontrado ou falha ao carregar.");
          }
          return [];
        })();
      }

      const [ranking, partidas, scoresAntigos, calendario, campeoes, regras, galeria, loadedStages, jogadoresSheet, metagame, decks] = await Promise.all([
        rankingPromise,
        fetchOptionalSheetTab(spreadsheetId, "Partidas", publishedSheetGids.Partidas),
        fetchOptionalSheetTab(spreadsheetId, historicalScoresTab, publishedSheetGids[historicalScoresTab]),
        fetchOptionalSheetTab(spreadsheetId, "Calendario", publishedSheetGids.Calendario),
        fetchOptionalSheetTab(spreadsheetId, "Campeoes", publishedSheetGids.Campeoes),
        fetchOptionalSheetTab(spreadsheetId, "Regras", publishedSheetGids.Regras),
        fetchOptionalSheetTab(spreadsheetId, "Galeria", publishedSheetGids.Galeria),
        stagesPromise,
        fetchOptionalSheetTab(spreadsheetId, "Jogadores", publishedSheetGids.Jogadores),
        fetchOptionalSheetTab(spreadsheetId, "Metagame", publishedSheetGids.Metagame),
        fetchOptionalSheetTab(spreadsheetId, "Decks", publishedSheetGids.Decks)
      ]);

      stagesIndex = loadedStages || [];
      populateStageSelector();

      if (jogadoresSheet && jogadoresSheet.length) appData.Jogadores = jogadoresSheet;
      if (ranking && ranking.length) appData.Ranking = normalizeRanking(ranking, partidas);
      if (partidas && partidas.length) appData.Partidas = partidas;
      appData.ScoresAntigos = normalizeHistoricalScores(scoresAntigos || []);
      if (calendario && calendario.length) appData.Calendario = calendario;
      if (campeoes && campeoes.length) appData.Campeoes = campeoes;
      if (regras && regras.length) appData.Regras = regras;
      if (galeria && galeria.length) appData.Galeria = galeria;
      if (metagame && metagame.length) appData.Metagame = metagame;
      if (decks && decks.length) appData.Decks = decks;

      isOfflineMode = false;

      if (statusBadge) {
        const isFrozen = window.CONFIG?.dataSource === 'sheets' || (appData.Configuracoes && (appData.Configuracoes.StatusPodio === 'offline' || appData.Configuracoes.StatusPodio === 'congelado'));
        if (isFrozen) {
          statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#94a3b8;border-radius:50%"></span> Offline`;
          statusBadge.style.color = "#94a3b8";
          statusBadge.style.borderColor = "rgba(148, 163, 184, 0.3)";
          statusBadge.title = "Temporada atual está encerrada/congelada.";
        } else {
          statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#10b981;border-radius:50%"></span> Online`;
          statusBadge.style.color = "#10b981";
          statusBadge.style.borderColor = "rgba(16, 185, 129, 0.3)";
          statusBadge.title = "Conectado e recebendo atualizações.";
        }
      }
    } catch (error) {
      console.warn("Erro ao buscar dados remotos. Usando dados locais de demonstração:", error);
      appData.Ranking = normalizeRanking(MOCK_DATA.Ranking, []);
      appData.ScoresAntigos = normalizeHistoricalScores(MOCK_DATA.ScoresAntigos);
      isOfflineMode = true;
      if (statusBadge) {
        statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#ef4444;border-radius:50%"></span> Offline`;
        statusBadge.style.color = "#ef4444";
        statusBadge.style.borderColor = "rgba(239, 68, 68, 0.3)";
        statusBadge.title = "Não foi possível conectar à fonte de dados.";
      }
    }
  } else {
    appData.Ranking = normalizeRanking(MOCK_DATA.Ranking, []);
    appData.ScoresAntigos = normalizeHistoricalScores(MOCK_DATA.ScoresAntigos);
    isOfflineMode = true;
    if (statusBadge) {
      statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#ef4444;border-radius:50%"></span> Offline`;
      statusBadge.style.color = "#ef4444";
      statusBadge.style.borderColor = "rgba(239, 68, 68, 0.3)";
      statusBadge.title = "Nenhuma fonte de dados configurada.";
    }
  }

  renderAll();
}

// --- SISTEMA DE RENDERIZAÇÃO ---

function renderAll() {
  currentRankingList = appData.Ranking;
  renderDashboard();
  renderRankingTable(appData.Ranking);
  renderHistoricalScores();
  renderCalendar();
  renderRules();
  renderChampions();
  renderGallery();
  renderMetagame();
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
    signupLink: e.LinkInscricao || '',
    active: true
  };
}


// 1. Dashboard (Top 3 e Próximo Evento)
function renderDashboard() {
  const podiumContainer = document.getElementById('podium-cards-container');
  const eventContainer = document.getElementById('event-widget-content');
  
  // Renderizar Top 4 do Ranking
  if (podiumContainer) {
    let top4 = [];
    const statusPodio = (appData.Configuracoes && appData.Configuracoes.StatusPodio) ? appData.Configuracoes.StatusPodio : 'auto';
    
    if (statusPodio === 'congelado' || statusPodio === 'offline') {
       top4 = [...appData.Ranking]
         .filter(p => p.PosicaoFinal && p.PosicaoFinal > 0)
         .sort((a, b) => a.PosicaoFinal - b.PosicaoFinal)
         .slice(0, 4);
         
       if (top4.length === 0) {
         top4 = appData.Ranking.slice(0, 4);
       }
    } else {
       top4 = appData.Ranking.slice(0, 4);
    }

    if (top4.length === 0) {
      podiumContainer.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary)">Aguardando as informações...</div>`;
    } else {
      podiumContainer.innerHTML = top4.map(player => {
        const letter = player.Jogador ? escapeHTML(player.Jogador.charAt(0).toUpperCase()) : '?';
        const playerName = escapeHTML(player.Jogador);
        const playerDeck = escapeHTML(player.Deck || 'Sem deck registrado');
        
        // Se estiver congelado, mostrar a PosicaoFinal no card. Senão, mostrar a Pos do ranking geral.
        const cardRank = (statusPodio === 'congelado' || statusPodio === 'offline') && player.PosicaoFinal ? player.PosicaoFinal : player.Pos;
        
        let pointsHtml = '';
        if (statusPodio === 'congelado' || statusPodio === 'offline') {
          let label = '';
          let color = 'var(--text-secondary)';
          if (cardRank == 1) { label = '🏆 CAMPEÃO'; color = '#fbbf24'; }
          else if (cardRank == 2) { label = '🥈 VICE-CAMPEÃO'; color = '#cbd5e1'; }
          else if (cardRank == 3) { label = '🥉 3º LUGAR'; color = '#b45309'; }
          else if (cardRank == 4) { label = '🏅 4º LUGAR'; color = 'var(--text-secondary)'; }
          else { label = `${cardRank}º LUGAR`; }

          pointsHtml = `
            <div class="podium-points" style="justify-content: center; align-items: flex-end;">
              <div style="font-size:0.9rem; font-weight:700; color:${color}; text-transform:uppercase; text-align:right;">
                ${label}
              </div>
            </div>
          `;
        } else {
          pointsHtml = `
            <div class="podium-points">
              <div class="podium-score">${toNumber(player.Pontos)} <span style="font-size:0.75rem;font-weight:400;color:var(--text-secondary)">PTS</span></div>
              <div class="podium-stats">${toNumber(player.Podio)} pódio(s) &bull; média ${formatAveragePlacement(player.MediaColocacao)}°</div>
            </div>
          `;
        }
        
        return `
          <div class="podium-card rank-${cardRank}" onclick="openPlayerModal(${player.Pos})">
            <div class="podium-badge">${cardRank}</div>
            <div class="podium-info">
              <div class="podium-player-name">${playerName}</div>
              <div class="podium-deck-info">
                ${getEnergyDotHTML(getDeckEnergy(player.Deck))}
                <span>${playerDeck}</span>
              </div>
            </div>
            ${pointsHtml}
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
          ${renderEventLinkButton(eventConf.signupLink)}
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

  const statusPodio = window.CONFIG?.StatusPodio || appData.Configuracoes?.StatusPodio || 'auto';
  const selector = document.getElementById('ranking-date-selector');
  const isGeneral = !selector || selector.value === 'general';
  const isFrozen = (window.CONFIG?.dataSource === 'sheets' || statusPodio === 'congelado' || statusPodio === 'offline') && isGeneral;

  const thPontos = document.getElementById('th-pontos');
  const thVed = document.getElementById('th-ved');
  if (thPontos) thPontos.style.display = isFrozen ? 'none' : 'table-cell';
  if (thVed) thVed.style.display = isFrozen ? 'none' : 'table-cell';

  if (!players || players.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${isFrozen ? 3 : 5}" style="text-align:center;padding:3rem;color:var(--text-secondary);">
          Aguardando as informações...
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = players.map((player, index) => {
    const playerName = escapeHTML(player.Jogador);
    const medals = getPlayerMedals(player.Jogador);

    const v = player.Vitorias || 0;
    const e = player.Empates || 0;
    const d = player.Derrotas || 0;
    
    const rank = player.Pos;
    const rankBadge = index < 8 ? `<div class="rank-badge rank-${rank}">${rank}</div>` : `<div class="rank-badge">${rank}</div>`;
    const rowClass = index < 8 ? `top-${rank}` : '';
    
    const pontosHtml = isFrozen ? '' : `
      <td style="text-align:center;vertical-align:middle;">
        <span class="score-cell">${toNumber(player.Pontos)} PTS</span>
      </td>
    `;
    
    const vedHtml = isFrozen ? '' : `
      <td style="text-align:center;vertical-align:middle;">
        <div class="ved-container">
          <span class="ved-badge v-badge" title="Vitórias">${v}V</span>
          <span class="ved-badge e-badge" title="Empates">${e}E</span>
          <span class="ved-badge d-badge" title="Derrotas">${d}D</span>
        </div>
      </td>
    `;

    return `
      <tr class="${rowClass}" onclick="openPlayerModal('${escapeHTML(player.Jogador)}')" style="cursor:pointer">
        <td class="row-rank">${rankBadge}</td>
        <td>
          <div class="player-cell">
            <div>
              <div style="font-weight:600;color:var(--text-primary);">${playerName} ${medals}</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.35rem; margin-top: 0.25rem;">
                ${getEnergyDotHTML(getDeckEnergy(player.Deck))}
                <span>${escapeHTML(player.Deck || 'Não registrado')}</span>
              </div>
            </div>
          </div>
        </td>
        <td style="text-align:center;vertical-align:middle;">
          <span class="category-badge category-${escapeHTML(player.CategoriaCodigo || 'ME').toLowerCase()}" title="${escapeHTML(player.Categoria || 'MASTER')}">
            ${escapeHTML(player.CategoriaCodigo || 'ME')}
          </span>
        </td>
        ${pontosHtml}
        ${vedHtml}
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
  
  if (!appData.ScoresAntigos || appData.ScoresAntigos.length === 0) {
    if (historicalTab) {
      historicalTab.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary)">Aguardando as informações...</div>`;
    }
    return;
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Filtrar eventos passados (anteriores a hoje) e ordenar cronologicamente
  const sortedEvents = events
    .filter(e => {
      const d = parseDateSafe(e.Data);
      return !isNaN(d) && d >= now;
    })
    .sort((a, b) => parseDateSafe(a.Data) - parseDateSafe(b.Data));

  if (sortedEvents.length === 0) {
    timeline.innerHTML = `<div style="padding:3rem;text-align:center;color:var(--text-secondary);">Nenhum torneio cadastrado no calendário.</div>`;
    return;
  }

  timeline.innerHTML = sortedEvents.map(evt => {
    // Formatar data em PT-BR
    const iso = normalizeDateISO(evt.Data);
    const parts = iso.split('-');
    const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : evt.Data;
    
    const statusKey = ['confirmado', 'concluido', 'pendente'].includes(String(evt.Status || '').toLowerCase()) ? String(evt.Status).toLowerCase() : 'pendente';
    const statusLabel = getStatusLabel(statusKey);
    const eventTitle = escapeHTML(evt.Evento);
    const eventDescription = escapeHTML(evt.Descricao || 'Sem descrição cadastrada para este encontro.');
    const eventLocal = evt.Local || 'Livraria Atlântica +';
    const eventMapUrl = evt.LinkMaps || evt.URLMaps || evt.LinkLocal || evt.GoogleMaps || evt.Mapa || '';
    
    return `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-card">
          ${renderTimelineThumb(evt.Foto, evt.Evento)}
          <div class="timeline-body">
            <div class="timeline-date">
              <span>${escapeHTML(dateFormatted)} às ${escapeHTML(evt.Horario || '10:00')}</span>
              <span class="timeline-status ${statusKey}">${escapeHTML(statusLabel)}</span>
            </div>
            <h3 class="timeline-title">${eventTitle}</h3>
            <p class="timeline-description">${eventDescription}</p>
            <div class="timeline-meta">
              <span>📍 <strong>Local:</strong> ${renderLocationLink(eventLocal, eventMapUrl)}</span>
            </div>
          </div>
          ${renderEventLinkButton(evt.LinkInscricao)}
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
// Encerra o badge "Acontecendo Agora!" sempre às 21:30 do dia do evento.
// Após esse horário, força re-render do dashboard para mostrar o próximo evento.
let countdownInterval;
let eventFinalized = false;
const EVENT_END_HOUR = 21;
const EVENT_END_MINUTE = 30;

function startCountdown() {
  const timerEl = document.getElementById('countdown-timer');
  if (!timerEl) return;

  const targetStr = timerEl.getAttribute('data-target-date');
  const targetTime = new Date(targetStr).getTime();

  if (isNaN(targetTime)) return;

  // Calcula o horário de fim do evento (mesmo dia, 21:30 local)
  const endTime = new Date(targetTime);
  endTime.setHours(EVENT_END_HOUR, EVENT_END_MINUTE, 0, 0);

  if (countdownInterval) clearInterval(countdownInterval);

  function updateTimer() {
    const now = new Date().getTime();
    const difference = targetTime - now;

    // Antes do horário de início: contagem regressiva normal
    if (difference > 0) {
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
      return;
    }

    // Evento já começou mas ainda não acabou (entre horário de início e 21:30)
    if (now < endTime.getTime()) {
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

    // Passou das 21:30 do dia do evento: encerra e re-renderiza
    if (!eventFinalized) {
      eventFinalized = true;
      clearInterval(countdownInterval);
      if (typeof renderAll === 'function') {
        renderAll();
      }
    }
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
window.openPlayerModal = function(playerRef) {
  const modal = document.getElementById('player-modal');
  let player;
  
  if (typeof playerRef === 'number') {
    const listPlayer = currentRankingList.find(p => p.Pos === playerRef);
    if (listPlayer) {
      player = appData.Ranking.find(p => p.Jogador.trim().toLowerCase() === listPlayer.Jogador.trim().toLowerCase());
    }
  } else {
    player = appData.Ranking.find(p => p.Jogador.trim().toLowerCase() === String(playerRef).trim().toLowerCase());
  }
  
  if (!player || !modal) return;

  const letter = player.Jogador ? player.Jogador.charAt(0).toUpperCase() : '?';
  // Inserir elementos no modal
  document.getElementById('modal-avatar').innerText = letter;
  const medals = getPlayerMedals(player.Jogador);
  document.getElementById('modal-player-name').innerHTML = `${escapeHTML(player.Jogador)} ${medals}`;
  document.getElementById('modal-player-deck').innerHTML = `
    ${getEnergyDotHTML(getDeckEnergy(player.Deck))}
    <span>Deck: <strong>${escapeHTML(player.Deck || 'Não registrado')}</strong></span>
  `;
  document.getElementById('modal-stat-podiums').innerText = toNumber(player.Podio);
  document.getElementById('modal-stat-average-placement').innerText = `${formatAveragePlacement(player.MediaColocacao)}º`;
  document.getElementById('modal-detail-category').innerText = `${player.Categoria || 'MASTER'} (${player.CategoriaCodigo || 'ME'})`;
  document.getElementById('modal-detail-points').innerText = `${toNumber(player.Pontos)} PTS`;
  document.getElementById('modal-detail-current-placement').innerText = `${toNumber(player.Pos)}º`;
  
  const vedContainer = document.getElementById('modal-detail-ved');
  if (vedContainer) {
    vedContainer.innerHTML = `
      <div class="ved-container" style="justify-content: flex-end;">
        <span class="ved-badge v-badge" title="Vitórias">${player.Vitorias || 0}V</span>
        <span class="ved-badge e-badge" title="Empates">${player.Empates || 0}E</span>
        <span class="ved-badge d-badge" title="Derrotas">${player.Derrotas || 0}D</span>
      </div>
    `;
  }

  // Preencher a linha do tempo de colocações (Evolução na Temporada)
  const timelineContainer = document.getElementById('modal-player-timeline');
  if (timelineContainer) {
    timelineContainer.innerHTML = '';
    const historyStr = player.HistoricoColocacoes || '';
    if (!historyStr) {
      timelineContainer.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0;">Nenhum histórico disponível para esta temporada.</div>';
    } else {
      const historyArr = String(historyStr).split(';');
      const stepsHtml = historyArr.map((pos, index) => {
        const stageLabel = `Etapa ${index + 1}`;
        let dateLabel = '-';
        
        const stageInfo = stagesIndex[index];
        if (stageInfo && stageInfo.data) {
          const parts = stageInfo.data.split('-');
          dateLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}` : stageInfo.data;
        }
        
        const isPodiumClass = pos !== '-' && toNumber(pos) <= 4 ? 'podium' : '';
        const posText = pos !== '-' ? `${pos}º` : '-';
        
        return `
          <div class="timeline-step ${isPodiumClass}">
            <span class="step-num">${stageLabel}</span>
            <span class="step-pos">${posText}</span>
            <span class="step-date">${dateLabel}</span>
          </div>
        `;
      }).join('');
      timelineContainer.innerHTML = stepsHtml;
    }
  }

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
    const validSections = ['dashboard', 'ranking', 'calendar', 'rules', 'champions', 'gallery', 'metagame'];
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
      
      const filtered = currentRankingList.filter(player => {
        const nameMatch = player.Jogador && player.Jogador.toLowerCase().includes(value);
        const deckMatch = player.Deck && player.Deck.toLowerCase().includes(value);
        return nameMatch || deckMatch;
      });
      
      renderRankingTable(filtered);
    });
  }

  // Filtro de etapa por data
  const rankingDateSelector = document.getElementById('ranking-date-selector');
  if (rankingDateSelector) {
    rankingDateSelector.addEventListener('change', async (e) => {
      const selectedValue = e.target.value;
      const infoBadge = document.getElementById('stage-info-badge');
      const tbody = document.getElementById('ranking-tbody');
      
      const urlParams = new URLSearchParams(window.location.search);
      const sourceParam = urlParams.get('source');
      const dataSource = (sourceParam && ["sheets", "github"].includes(sourceParam))
        ? sourceParam
        : (window.CONFIG ? window.CONFIG.dataSource : "sheets");
      const githubSources = window.CONFIG && window.CONFIG.githubSources ? window.CONFIG.githubSources : {};

      if (selectedValue === 'general') {
        if (infoBadge) infoBadge.classList.remove('active');
        currentRankingList = appData.Ranking;
        renderRankingTable(appData.Ranking);
        // Limpar busca ao trocar
        if (searchInput) searchInput.value = '';
        return;
      }

      // Mostrar loader
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5">
              <div class="loader"><div class="spinner"></div></div>
            </td>
          </tr>
        `;
      }

      let stageTdfUrl = '';
      if (dataSource === "github" && githubSources.Ranking) {
        stageTdfUrl = githubSources.Ranking.replace('ranking.tdf', `etapas/${selectedValue}.tdf`);
      } else {
        stageTdfUrl = `etapas/${selectedValue}.tdf`;
      }

      try {
        const res = await fetch(stageTdfUrl);
        if (!res.ok) throw new Error("Não foi possível carregar o arquivo da etapa.");
        const text = await res.text();
        const stagePlayers = parseTDF(text);
        
        const normalized = normalizeRanking(stagePlayers, []);
        currentRankingList = normalized;
        renderRankingTable(normalized);
        
        // Limpar busca ao trocar
        if (searchInput) searchInput.value = '';
        
        // Exibir info badge
        const stageInfo = stagesIndex.find(s => s.data === selectedValue);
        if (stageInfo && infoBadge) {
          const parts = selectedValue.split('-');
          const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : selectedValue;
          
          document.getElementById('stage-info-date').innerText = formattedDate;
          document.getElementById('stage-info-type').innerText = stageInfo.tipo || 'Liga';
          document.getElementById('stage-info-multiplier').innerText = `${stageInfo.multiplicador || 1.0}x`;
          infoBadge.classList.add('active');
        }
      } catch (err) {
        console.error(err);
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align:center;padding:3rem;color:var(--text-secondary);">
                Erro ao carregar dados desta etapa: ${escapeHTML(err.message)}
              </td>
            </tr>
          `;
        }
        if (infoBadge) infoBadge.classList.remove('active');
      }
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
  
  // Lógica de Troca de Tema (Light/Dark Mode)
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    const savedTheme = localStorage.getItem('site-theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('site-theme', newTheme);
    });
  }
  
  // Iniciar Navegação e Eventos de Escuta
  initNavigation();
  initEvents();
  
  // Carregar dados da Planilha (ou Fallback)
  loadData();
});
// --- METAGAME LOGIC ---

let metagameChart = null;

function renderMetagame() {
  const configVal = (appData.Configuracoes && appData.Configuracoes.ExibirMetagame) ? appData.Configuracoes.ExibirMetagame.toLowerCase().trim() : 'desativado';
  
  const navLink = document.getElementById('nav-metagame');
  const homeContainer = document.getElementById('metagame-home-container');
  
  if (navLink) navLink.style.display = 'none';
  if (homeContainer) homeContainer.style.display = 'none';
  
  if (configVal === 'pagina') {
    if (navLink) navLink.style.display = '';
  } else if (configVal === 'home') {
    if (homeContainer) homeContainer.style.display = '';
  } else if (configVal === 'ambos' || configVal.includes('pagina+home') || configVal.includes('home+pagina')) {
    if (navLink) navLink.style.display = '';
    if (homeContainer) homeContainer.style.display = '';
  }
  
  if (configVal === 'desativado') return;
  
  populateMetagameSeasonSelector(configVal);
  updateMetagameDisplay(configVal);
}

function getMetagameSessions() {
  const rows = appData.Metagame || [];
  if (rows.length === 0) return [];
  
  const ignoreKeys = ['jogador', 'player', 'nome', '', 'posicaofinal', 'pontos', 'deck', 'categoria'];
  const allKeys = new Set();
  
  rows.forEach(row => {
    Object.keys(row).forEach(key => {
      if (!ignoreKeys.includes(key.toLowerCase().trim())) {
        allKeys.add(key);
      }
    });
  });
  
  return [...allKeys].sort((a, b) => b.localeCompare(a, 'pt-BR', { numeric: true }));
}

function populateMetagameSeasonSelector(configVal) {
  const selector = document.getElementById('metagame-season-selector');
  if (!selector) return;
  
  const sessions = getMetagameSessions();
  if (sessions.length === 0) {
    selector.innerHTML = '<option value="">Nenhuma sessão encontrada</option>';
    return;
  }
  
  const currentValue = selector.value;
  let optionsHTML = '<option value="all">Todas as Sessões (Geral)</option>';
  optionsHTML += sessions.map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join('');
  
  selector.innerHTML = optionsHTML;
  
  if (currentValue === 'all' || sessions.includes(currentValue)) {
    selector.value = currentValue;
  } else {
    selector.value = 'all';
  }
  
  selector.removeEventListener('change', handleMetagameSelectorChange);
  selector.addEventListener('change', handleMetagameSelectorChange);
}

function handleMetagameSelectorChange() {
  const configVal = (appData.Configuracoes && appData.Configuracoes.ExibirMetagame) ? appData.Configuracoes.ExibirMetagame.toLowerCase().trim() : 'desativado';
  updateMetagameDisplay(configVal);
}

function updateMetagameDisplay(configVal) {
  let targetContainer;
  let selectedSession = 'all';
  
  if (configVal === 'home') {
    targetContainer = document.getElementById('metagame-home-content');
    selectedSession = 'all'; 
  } else if (configVal === 'ambos' || configVal.includes('pagina+home') || configVal.includes('home+pagina')) {
    // Para renderizar em ambos, precisamos focar no conteiner principal para não duplicar toda a lógica
    // Renderizamos no container da página se estivermos na rota de metagame, caso contrário na home.
    // Mas para facilitar, o renderMetagame principal já cuida disso.
    // Vamos simplesmente desenhar nos dois lugares:
    const homeContent = document.getElementById('metagame-home-content');
    const pageContent = document.getElementById('metagame-page-content');
    if (homeContent) {
       homeContent.innerHTML = '';
    }
    targetContainer = pageContent; 
    const selector = document.getElementById('metagame-season-selector');
    selectedSession = selector ? selector.value : 'all';
  } else {
    targetContainer = document.getElementById('metagame-page-content');
    const selector = document.getElementById('metagame-season-selector');
    selectedSession = selector ? selector.value : 'all';
  }
  
  if (!targetContainer) return;
  
  if (!appData.Metagame || appData.Metagame.length === 0) {
    targetContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Crie as abas "Metagame" e "Decks" na planilha para ver as estatísticas!</div>';
    return;
  }
  
  const sessions = getMetagameSessions();
  if (sessions.length === 0) {
    targetContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Adicione colunas de sessões na aba Metagame.</div>';
    return;
  }
  
  const deckCounts = {};
  const columnsToCount = selectedSession === 'all' ? sessions : [selectedSession];
  
  appData.Metagame.forEach(row => {
    columnsToCount.forEach(col => {
      const deckName = row[col];
      if (deckName && typeof deckName === 'string' && deckName.trim() !== '') {
        const dName = deckName.trim();
        if (!deckCounts[dName]) deckCounts[dName] = 0;
        deckCounts[dName]++;
      }
    });
  });
  
  if (Object.keys(deckCounts).length === 0) {
    targetContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhum deck registrado ${selectedSession === 'all' ? 'no geral' : 'nesta sessão'}.</div>`;
    return;
  }
  
  const decksTab = appData.Decks || [];
  
  const sortedDecks = Object.keys(deckCounts).map(deckName => {
    const deckInfo = decksTab.find(d => (d.Deck || '').trim().toLowerCase() === deckName.toLowerCase());
    return {
      deck: deckName,
      count: deckCounts[deckName],
      image: deckInfo ? deckInfo.Imagem : null,
      energia: deckInfo ? deckInfo.TipoEnergia : ''
    };
  }).sort((a, b) => b.count - a.count);
  
  const labels = sortedDecks.map(d => d.deck);
  const data = sortedDecks.map(d => d.count);
  const colors = ['#FF4216', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e', '#14b8a6'];
  const bgColors = labels.map((_, i) => colors[i % colors.length]);
  
  targetContainer.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:2rem; align-items:center;">
      <div style="width: 100%; max-width: 350px; aspect-ratio: 1; position:relative;">
        <canvas id="metagameChartCanvas_${configVal}"></canvas>
      </div>
      
      <div class="gallery-grid" style="width:100%; margin-top:2rem;">
        ${sortedDecks.filter(d => d.image).map(d => `
          <div class="gallery-item glass-card" style="display:flex; flex-direction:column; align-items:center; padding:1rem; gap:1rem;">
            <img src="${safeExternalUrl(d.image)}" alt="${escapeHTML(d.deck)}" style="width:100%; border-radius:var(--radius); object-fit:cover; aspect-ratio: 3/4;">
            <div style="text-align:center; width:100%;">
              <h3 style="color:var(--text-primary); font-size:1.1rem; margin-bottom:0.5rem; display:flex; justify-content:center; align-items:center; gap:0.5rem;">
                ${getEnergyDotHTML(d.energia)}
                ${escapeHTML(d.deck)}
              </h3>
              <p style="color:var(--text-secondary); font-size:0.9rem; font-weight:600;">
                Usado por ${d.count} jogador(es)
              </p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  const ctx = document.getElementById(`metagameChartCanvas_${configVal}`);
  if (ctx) {
    if (metagameChart) metagameChart.destroy();
    if (window.Chart) {
      Chart.defaults.color = 'rgba(255, 255, 255, 0.7)';
      Chart.defaults.font.family = '"Inter", sans-serif';
      metagameChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: bgColors, borderWidth: 0, hoverOffset: 10 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' } }, tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#fff', bodyColor: '#e2e8f0', borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, padding: 12, displayColors: true, boxPadding: 6 } }, cutout: '65%' }
      });
    }
  }
}
