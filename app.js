function normalizePlayerName(name) {
  if (!name) return "";
  return name.trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeImageUrl(url){
  if(!url) return '';
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if(m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w2000`;
  const m2 = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w2000`;
  return url;
}

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

const MOCK_DATA = {
  Ranking: [],
  ScoresAntigos: [],
  Calendario: [],
  Campeoes: [],
  Regras: [],
  Galeria: []
};

let appData = { ...MOCK_DATA };
let stagesIndex = [];
let currentRankingList = [];
let filteredRankingList = [];
let filteredHistoricalList = [];
let currentRankingPage = 1;
let currentHistoricalPage = 1;
let currentCalendarMonth = null;
const ITEMS_PER_PAGE = 20;
let isOfflineMode = true;

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
          i++; 
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

      if (val !== '' && !isNaN(val)) {
        obj[header] = Number(val);
      } else {
        obj[header] = val;
      }
    });
    return obj;
  });
}

async function fetchSheetTab(spreadsheetId, tabName, publishedGid = '') {
  const isPublishedSheet = spreadsheetId.startsWith('2PACX-');
  let url = '';

  if (isPublishedSheet) {
    if (!publishedGid) {
      throw new Error(`Link publicado sem gid cadastrado para a aba ${tabName}`);
    }
    url = `https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?gid=${encodeURIComponent(publishedGid)}&single=true&output=csv&t=${new Date().getTime()}`;
  } else {
    url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}&t=${new Date().getTime()}`;
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao buscar a aba ${tabName}`);
  const csvText = await response.text();
  return parseCSV(csvText);
}

async function fetchOptionalSheetTab(spreadsheetId, tabName, publishedGid = '') {
  try {
    return await fetchSheetTab(spreadsheetId, tabName, publishedGid);
  } catch (error) {
    console.info(`Aba opcional "${tabName}" não encontrada ou indisponível.`, error);
    return [];
  }
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  pendente: 'Aguardando Informações',
  concluido: 'Concluído'
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
    return `<div class="timeline-thumb" onclick="window.openGenericLightbox('${safeUrl.replace(/'/g, "\\'")}', '${(eventTitle || '').replace(/'/g, "\\'")}')" style="cursor:pointer;"><img src="${escapeHTML(safeUrl)}" alt="${escapeHTML(eventTitle || 'Evento')}" loading="lazy"></div>`;
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
  const normPlayerName = normalizePlayerName(playerName);
  let medalsHtml = '';

  appData.Campeoes.forEach(champ => {
    if (champ.Campeao && normalizePlayerName(champ.Campeao) === normPlayerName) {
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
    if (champ.Vice && normalizePlayerName(champ.Vice) === normPlayerName) {
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

  if (['SE', 'SR', 'SENIOR', 'SENIORS'].includes(normalized)) {
    return { code: 'SE', label: 'SENIOR' };
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
  const isFrozen = window.CONFIG?.dataSource === 'sheets' || 
                   (statusPodio === 'congelado' || statusPodio === 'offline') ||
                   (!rankingRows || rankingRows.length === 0);
  
  if (isFrozen && appData.Jogadores && appData.Jogadores.length > 0) {
    rankingRows = appData.Jogadores;
  }

  if (!Array.isArray(rankingRows)) return [];

  const normalized = rankingRows
    .filter(player => player && (player.Jogador || player.Name))
    .map(player => {
      const playerName = player.Jogador || player.Name || "";
      const normPlayerName = normalizePlayerName(playerName);

      const dbPlayer = (appData.Jogadores || []).find(j => {
        return normalizePlayerName(j.Jogador || j.Name) === normPlayerName;
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
        Jogador: dbPlayer.Jogador || playerName,
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
      const isFrozen = window.CONFIG?.dataSource === 'sheets' || 
                       (statusPodio === 'congelado' || statusPodio === 'offline') ||
                       (!rankingRows || rankingRows.length === 0);
      
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

  const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
  const chronologicalStages = [...cleanStages].sort((a, b) => a.data.localeCompare(b.data));
  const sortedStages = [...cleanStages].sort((a, b) => b.data.localeCompare(a.data));

  sortedStages.forEach(stage => {
    const stageNumber = chronologicalStages.findIndex(s => s.data === stage.data) + 1;
    const parts = stage.data.split('-');
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : stage.data;
    const typeLabel = stage.tipo ? ` (${stage.tipo})` : '';
    const option = document.createElement('option');
    option.value = stage.data;
    option.textContent = stage.label || `Etapa ${stageNumber} - ${formattedDate}${typeLabel}`;
    selector.appendChild(option);
  });
}

function renderHistoricalScores(page = 1) {
  currentHistoricalPage = page;
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

  filteredHistoricalList = rows;
  const totalPages = Math.ceil(rows.length / ITEMS_PER_PAGE) || 1;
  const startIdx = (currentHistoricalPage - 1) * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const pageRows = rows.slice(startIdx, endIdx);

  if (filteredHistoricalList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:2rem;color:var(--text-secondary);">Nenhum resultado encontrado.</td></tr>`;
    renderHistoricalPagination(1);
    return;
  }

  let html = '';
  pageRows.forEach(row => {
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
          <td style="font-weight: bold; color: var(--text-primary); text-align: center;">${toNumber(row.Pontos, 0)}</td>
        </tr>
      `;
    });

  tbody.innerHTML = html;
  renderHistoricalPagination(totalPages);
}

function renderHistoricalPagination(totalPages) {
  const container = document.getElementById('historical-pagination');
  if (!container) return;
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = `
    <button class="pagination-btn" ${currentHistoricalPage === 1 ? 'disabled' : ''} onclick="changeHistoricalPage(-1)">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>
      Anterior
    </button>
    <span class="pagination-info">Página ${currentHistoricalPage} de ${totalPages}</span>
    <button class="pagination-btn" ${currentHistoricalPage === totalPages ? 'disabled' : ''} onclick="changeHistoricalPage(1)">
      Próxima
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"></path></svg>
    </button>
  `;
}

window.changeHistoricalPage = function(delta) {
  const totalPages = Math.ceil(filteredHistoricalList.length / ITEMS_PER_PAGE) || 1;
  let newPage = currentHistoricalPage + delta;
  if (newPage < 1) newPage = 1;
  if (newPage > totalPages) newPage = totalPages;
  if (newPage !== currentHistoricalPage) {
    renderHistoricalScores(newPage);
    const tableEl = document.querySelector('.historical-scores-panel');
    if (tableEl) {
      const y = tableEl.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }
};

async function loadData() {
  const statusBadge = document.getElementById('sheet-status-badge');
  const sheetUrl = window.CONFIG ? window.CONFIG.googleSheetCsvUrl : "";
  const spreadsheetId = getSpreadsheetId(sheetUrl);
  const publishedGid = getPublishedSheetGid(sheetUrl);
  const publishedSheetGids = window.CONFIG && window.CONFIG.publishedSheetGids ? window.CONFIG.publishedSheetGids : {};

  const urlParams = new URLSearchParams(window.location.search);
  const sourceParam = urlParams.get('source');
  let dataSource = (sourceParam && ["sheets", "github"].includes(sourceParam))
    ? sourceParam
    : (window.CONFIG ? window.CONFIG.dataSource : "sheets");

  const githubSources = window.CONFIG && window.CONFIG.githubSources ? window.CONFIG.githubSources : {};

  appData = { ...MOCK_DATA, Configuracoes: { StatusPodio: 'auto' }, Jogadores: [] };

  if (spreadsheetId) {
    try {
      if (statusBadge) {
        statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#3b82f6;border-radius:50%;animation:pulse 1.5s infinite"></span> Conectando...`;
        statusBadge.className = "offline-badge";
        statusBadge.style.color = "#3b82f6";
        statusBadge.style.borderColor = "rgba(59, 130, 246, 0.3)";
      }

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
        // NOTE: fonteranking is obsolete. The site always uses github (TDF) for active ranking.
        if (param === "statuspodio") {
          appData.Configuracoes.StatusPodio = val.toLowerCase();
        }
        if (param === "avisotopo" || param === "aviso-topo" || param === "aviso_topo") {
          appData.Configuracoes.AvisoTopo = val;
        }
        if (param === "linkwhatsapp" || param === "link-whatsapp" || param === "link_whatsapp" || param === "whatsapp") {
          appData.Configuracoes.LinkWhatsApp = val;
        }
        if (param === "linkinstagram" || param === "link-instagram" || param === "link_instagram" || param === "instagram") {
          appData.Configuracoes.LinkInstagram = val;
        }
        if (param === "temapadrao" || param === "tema-padrao" || param === "tema_padrao" || param === "tema") {
          appData.Configuracoes.TemaPadrao = val;
        }
        if (param === "exibirmetagame" || param === "exibir-metagame" || param === "exibir_metagame" || param === "metagame") {
          appData.Configuracoes.ExibirMetagame = val;
        }
      });

      // CORREÇÃO: Sincroniza a variável global para que a tabela não congele o ranking TDF
      if (window.CONFIG) {
        window.CONFIG.dataSource = dataSource;
      }

      const rankingTabName = "Ranking";
      const historicalScoresTab = window.CONFIG && window.CONFIG.historicalScoresTab ? window.CONFIG.historicalScoresTab : "ScoresAntigos";

      let rankingPromise;
      let stagesPromise;
      if (dataSource === "github" && githubSources.Ranking) {
        // Resolve a fresh commit SHA dynamically to bypass the Fastly CDN cache of raw.githubusercontent.com
        let commitSha = "main";
        try {
          const match = githubSources.Ranking.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const owner = match[1];
            const repo = match[2];
            const branch = match[3];
            commitSha = branch; // Default fallback
            
            const shaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}?t=${new Date().getTime()}`);
            if (shaRes.ok) {
              const shaData = await shaRes.json();
              if (shaData && shaData.sha) {
                commitSha = shaData.sha;
                window.latestCommitSha = commitSha;
              }
            }
          }
        } catch (e) {
          console.warn("Falha ao obter commit SHA dinâmico. Usando branch padrão.", e);
        }

        let resolvedRankingUrl = githubSources.Ranking.replace(/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)/, `/raw.githubusercontent.com/$1/$2/${commitSha}`);
        let resolvedStagesUrl = resolvedRankingUrl.replace('ranking.tdf', 'etapas.json');

        // Se estiver rodando localmente (localhost ou 127.0.0.1), carrega os arquivos locais do servidor
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalHost) {
          resolvedRankingUrl = `ranking.tdf?v=${new Date().getTime()}`;
          resolvedStagesUrl = `etapas.json?v=${new Date().getTime()}`;
        }

        rankingPromise = (async () => {
          try {
            const res = await fetch(resolvedRankingUrl);
            if (!res.ok) throw new Error("Erro ao carregar ranking TDF.");
            const text = await res.text();
            return parseTDF(text);
          } catch (e) {
            console.warn("Falha ao carregar ranking.tdf", e);
            return [];
          }
        })();

        stagesPromise = (async () => {
          try {
            const res = await fetch(resolvedStagesUrl);
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
      appData.Metagame = (metagame && metagame.length) ? metagame : (jogadoresSheet || []);
      if (decks && decks.length) appData.Decks = decks;

      isOfflineMode = false;

      if (statusBadge) {
        const statusPodio = window.CONFIG?.StatusPodio || appData.Configuracoes?.StatusPodio || 'auto';
        const isFrozen = window.CONFIG?.dataSource === 'sheets' || 
                         (statusPodio === 'congelado' || statusPodio === 'offline') ||
                         (!appData.Ranking || appData.Ranking.length === 0);
        if (isFrozen) {
          statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#94a3b8;border-radius:50%"></span> Off Season`;
          statusBadge.style.color = "#94a3b8";
          statusBadge.style.borderColor = "rgba(148, 163, 184, 0.3)";
          statusBadge.title = "Temporada atual está inativa ou aguardando torneios (modo Roster).";
        } else {
          statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#10b981;border-radius:50%"></span> Online`;
          statusBadge.style.color = "#10b981";
          statusBadge.style.borderColor = "rgba(16, 185, 129, 0.3)";
          statusBadge.title = "Temporada ativa e recebendo atualizações dos TDFs.";
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

function renderAvisoTopo() {
  const avisoText = appData.Configuracoes?.AvisoTopo;
  const existingAviso = document.getElementById('aviso-topo-banner');
  if (existingAviso) existingAviso.remove();

  if (avisoText && avisoText.trim() !== '') {
    const banner = document.createElement('div');
    banner.id = 'aviso-topo-banner';
    banner.style.cssText = `
      background: linear-gradient(90deg, rgba(255, 203, 5, 0.15) 0%, rgba(245, 158, 11, 0.15) 100%);
      border-bottom: 1px solid rgba(255, 203, 5, 0.25);
      color: #fff;
      font-family: 'Exo 2', sans-serif;
      font-size: 0.85rem;
      font-weight: 500;
      text-align: center;
      padding: 8px 24px;
      position: relative;
      z-index: 101;
      backdrop-filter: blur(8px);
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      flex-wrap: wrap;
    `;

    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const match = avisoText.match(urlRegex);

    if (match) {
      const url = match[0];
      let cleanText = avisoText.replace(url, '').trim();
      if (!cleanText) cleanText = "Novidade disponível! Acesse o link ao lado:";
      
      banner.innerHTML = `
        <span>📢</span>
        <span>${escapeHTML(cleanText)}</span>
        <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; justify-content: center; background: rgba(255, 203, 5, 0.2); border: 1px solid rgba(255, 203, 5, 0.4); color: #fff; text-decoration: none; padding: 3px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; margin-left: 4px; transition: all 0.2s; gap: 4px;" onmouseover="this.style.background='rgba(255, 203, 5, 0.35)'" onmouseout="this.style.background='rgba(255, 203, 5, 0.2)'">
          Acessar Link <svg style="width:12px; height:12px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
        </a>
      `;
    } else {
      banner.innerHTML = `<span>📢</span> <span>${escapeHTML(avisoText)}</span>`;
    }

    document.body.insertBefore(banner, document.body.firstChild);
  }
}

function renderAll() {
  // 1. Render Top Notice Banner (AvisoTopo)
  renderAvisoTopo();

  // 2. Set Theme dynamically if localStorage is empty
  const savedTheme = localStorage.getItem('site-theme');
  if (!savedTheme && appData.Configuracoes && appData.Configuracoes.TemaPadrao) {
    const defaultTheme = appData.Configuracoes.TemaPadrao.trim().toLowerCase();
    let themeToSet = '';
    if (['light', 'claro'].includes(defaultTheme)) {
      themeToSet = 'light';
    } else if (['dark', 'escuro'].includes(defaultTheme)) {
      themeToSet = 'dark';
    }
    if (themeToSet) {
      document.documentElement.setAttribute('data-theme', themeToSet);
      if (typeof updateMetagameDisplay === 'function') {
        updateMetagameDisplay();
      }
    }
  }

  // 3. Update Social Media Links from configuration if present
  if (appData.Configuracoes) {
    if (appData.Configuracoes.LinkWhatsApp) {
      const waBtns = ['btn-whatsapp-welcome', 'btn-whatsapp-footer'];
      waBtns.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.href = appData.Configuracoes.LinkWhatsApp;
      });
    }
    if (appData.Configuracoes.LinkInstagram) {
      const igBtns = ['btn-instagram-welcome', 'btn-instagram-footer'];
      igBtns.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.href = appData.Configuracoes.LinkInstagram;
      });
    }
  }

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

function getNextEventFromCalendar() {
  const events = appData.Calendario || [];
  const now = new Date();
  const future = events.filter(e => {
    if (!e || !e.Data) return false;
    const status = String(e.Status || '').toLowerCase().trim();
    if (status === 'concluido' || status === 'cancelado') return false;
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

function renderDashboard() {
  const podiumContainer = document.getElementById('podium-cards-container');
  const eventContainer = document.getElementById('event-widget-content');

  if (podiumContainer) {
    let top4 = [];
    const statusPodio = (appData.Configuracoes && appData.Configuracoes.StatusPodio) ? appData.Configuracoes.StatusPodio : 'auto';
    
    // O modo congelado/ativo depende exclusivamente do status da planilha ou se não houver dados.
    const isFrozenLayout = window.CONFIG?.dataSource === 'sheets' || 
                           (statusPodio === 'congelado' || statusPodio === 'offline') ||
                           (!appData.Ranking || appData.Ranking.length === 0);
    
    if (isFrozenLayout) {
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

        const cardRank = isFrozenLayout ? (player.PosicaoFinal || player.Pos) : player.Pos;
        
        let pointsHtml = '';
        if (isFrozenLayout) {
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
          <div class="podium-card rank-${cardRank}" onclick="openPlayerModal('${escapeHTML(player.Jogador)}')">
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

  if (eventContainer) {
    const eventConf = getNextEventFromCalendar() || (window.CONFIG && window.CONFIG.nextEvent ? window.CONFIG.nextEvent : null);
    
    if (eventConf && eventConf.active) {

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

function getDeckForStage(playerName, stageDateStr) {
  if (!playerName || !stageDateStr || typeof stageDateStr !== 'string' || !appData.Jogadores) return null;
  
  const parts = stageDateStr.split('-');
  if (parts.length !== 3) return null;
  const dd = parts[2];
  const mm = parts[1];
  const yy = parts[0].substring(2);
  const dateDDMMYY = `${dd}${mm}${yy}`;
  
  const normPlayerName = normalizePlayerName(playerName);
  const dbPlayer = appData.Jogadores.find(j => {
    return normalizePlayerName(j.Jogador || j.Name) === normPlayerName;
  });
  if (!dbPlayer) return null;
  
  // Calcula o número da etapa cronológico para match inteligente (ex: S9T5)
  const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
  const chronologicalStages = [...cleanStages].sort((a, b) => a.data.localeCompare(b.data));
  const stageNumber = chronologicalStages.findIndex(s => s.data === stageDateStr) + 1;
  
  const columnKey = Object.keys(dbPlayer).find(k => {
    const normalizedKey = k.toLowerCase().trim();
    
    // 1. Match por data ddmmyy ou data formatada completa
    if (normalizedKey.includes(dateDDMMYY) || normalizedKey.includes(stageDateStr)) {
      return true;
    }
    
    // 2. Match inteligente por Número da Etapa (S[numero]T...)
    if (stageNumber > 0) {
      const stagePrefix = `s${stageNumber}`;
      const regex = new RegExp(`^${stagePrefix}\\D`, 'i');
      if (regex.test(normalizedKey)) {
        return true;
      }
    }
    
    return false;
  });
  
  if (columnKey) {
    const deckName = dbPlayer[columnKey];
    if (deckName && typeof deckName === 'string' && deckName.trim() !== '') {
      return deckName.trim();
    }
  }
  return null;
}

function renderRankingTable(players, page = 1) {
  currentRankingPage = page;
  filteredRankingList = players;
  const tbody = document.getElementById('ranking-tbody');
  if (!tbody) return;

  const statusPodio = window.CONFIG?.StatusPodio || appData.Configuracoes?.StatusPodio || 'auto';
  const selector = document.getElementById('ranking-date-selector');
  const isGeneral = !selector || selector.value === 'general';
  const isFrozen = (window.CONFIG?.dataSource === 'sheets' || 
                    (statusPodio === 'congelado' || statusPodio === 'offline') ||
                    (!appData.Ranking || appData.Ranking.length === 0)) && isGeneral;

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
    renderRankingPagination(1);
    return;
  }
  
  const totalPages = Math.ceil(players.length / ITEMS_PER_PAGE) || 1;
  const startIdx = (currentRankingPage - 1) * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const pagePlayers = players.slice(startIdx, endIdx);

  tbody.innerHTML = pagePlayers.map((player, index) => {
    const playerName = escapeHTML(player.Jogador);
    const medals = getPlayerMedals(player.Jogador);

    const v = player.Vitorias || 0;
    const e = player.Empates || 0;
    const d = player.Derrotas || 0;
    
    const rank = player.Pos;
    const rankNum = parseInt(rank, 10);
    const rankBadge = rankNum <= 8 ? `<div class="rank-badge rank-${rankNum}">${rank}</div>` : `<div class="rank-badge">${rank}</div>`;
    const rowClass = rankNum <= 8 ? `top-${rankNum}` : '';
    
    const pontosHtml = isFrozen ? '' : `
      <td style="text-align:center;vertical-align:middle;">
        <span class="score-cell">${toNumber(player.Pontos)} PTS</span>
      </td>
    `;
    
    const total = v + e + d;
    const winRate = total > 0 ? Math.round((v / total) * 100) : 0;
    const vPercent = total > 0 ? (v / total) * 100 : 0;
    const ePercent = total > 0 ? (e / total) * 100 : 0;
    const dPercent = total > 0 ? (d / total) * 100 : 0;

    const vedHtml = isFrozen ? '' : `
      <td style="text-align:center;vertical-align:middle;">
        <div class="ved-display" title="${v} Vitórias, ${e} Empates, ${d} Derrotas">
          <span class="ved-text">${winRate}%</span>
          ${total > 0 ? `
            <div class="ved-bar">
              <div class="ved-seg v-seg" style="width: ${vPercent}%"></div>
              <div class="ved-seg e-seg" style="width: ${ePercent}%"></div>
              <div class="ved-seg d-seg" style="width: ${dPercent}%"></div>
            </div>
          ` : `
            <div class="ved-bar-empty"></div>
          `}
        </div>
      </td>
    `;

    let deckIconHtml = '';
    if (!isGeneral && selector) {
      const deckName = getDeckForStage(player.Jogador, selector.value);
      if (deckName) {
        const energy = getDeckEnergy(deckName);
        const energyDot = getEnergyDotHTML(energy);
        
        const decksTab = appData.Decks || [];
        const deckInfo = decksTab.find(d => (d.Deck || '').trim().toLowerCase() === deckName.toLowerCase());
        const customIconUrl = deckInfo ? safeExternalUrl(deckInfo.Icone || deckInfo.Imagem) : null;
        
        if (customIconUrl) {
          deckIconHtml = `
            <div class="deck-badge" style="display:inline-flex; align-items:center; gap:4px; vertical-align:middle; margin-left:6px;">
              <img src="${escapeHTML(customIconUrl)}" alt="${escapeHTML(deckName)}" title="Deck: ${escapeHTML(deckName)}" style="width:23px;height:23px;object-fit:contain;border-radius:4px;vertical-align:middle;background:rgba(255,255,255,0.05);padding:2px;border:1px solid rgba(255,255,255,0.1);">
              <span style="font-size:0.68rem; font-weight:500; color:var(--text-secondary); max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle;">${escapeHTML(deckName)}</span>
            </div>
          `;
        } else {
          deckIconHtml = `
            <div class="deck-badge" style="display:inline-flex; align-items:center; gap:4px; vertical-align:middle; margin-left:6px;">
              <span style="display:inline-block;vertical-align:middle;">${energyDot}</span>
              <span style="font-size:0.68rem; font-weight:500; color:var(--text-secondary); max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle;">${escapeHTML(deckName)}</span>
            </div>
          `;
        }
      }
    }

    return `
      <tr class="${rowClass}" onclick="openPlayerModal('${escapeHTML(player.Jogador)}')" style="cursor:pointer">
        <td class="row-rank">${rankBadge}</td>
        <td>
          <div class="player-cell">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <div style="font-weight:600;color:var(--text-primary);">${playerName} ${medals}</div>
              ${deckIconHtml}
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
  renderRankingPagination(totalPages);
}

function renderRankingPagination(totalPages) {
  const container = document.getElementById('ranking-pagination');
  if (!container) return;
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = `
    <button class="pagination-btn" ${currentRankingPage === 1 ? 'disabled' : ''} onclick="changeRankingPage(-1)">
      Anterior
    </button>
    <span class="pagination-info">Pág ${currentRankingPage} / ${totalPages}</span>
    <button class="pagination-btn" ${currentRankingPage === totalPages ? 'disabled' : ''} onclick="changeRankingPage(1)">
      Próxima
    </button>
  `;
}

window.changeRankingPage = function(dir) {
  const totalPages = Math.ceil(filteredRankingList.length / ITEMS_PER_PAGE) || 1;
  let newPage = currentRankingPage + dir;
  if (newPage < 1) newPage = 1;
  if (newPage > totalPages) newPage = totalPages;
  if (newPage !== currentRankingPage) {
    renderRankingTable(filteredRankingList, newPage);
    const tableEl = document.querySelector('.ranking-panel');
    if (tableEl) {

      const y = tableEl.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }
};

function renderLocationLink(locationName, mapUrl) {
  const safeName = escapeHTML(locationName || 'Local não informado');
  const safeUrl = safeExternalUrl(mapUrl);

  if (!safeUrl) {
    return safeName;
  }

  return `<a class="location-map-link" href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer" title="Abrir local no Google Maps">${safeName}<span class="location-map-link-icon">↗</span></a>`;
}

function renderCalendar() {
  const timeline = document.getElementById('calendar-timeline');
  const tabsContainer = document.getElementById('calendar-month-tabs');
  if (!timeline) return;

  const events = appData.Calendario || [];

  // 1. Filtra eventos válidos e ordena cronologicamente
  const validEvents = events
    .filter(e => e && e.Data && !isNaN(parseDateSafe(e.Data)))
    .sort((a, b) => parseDateSafe(a.Data) - parseDateSafe(b.Data));

  if (validEvents.length === 0) {
    if (tabsContainer) tabsContainer.innerHTML = '';
    timeline.innerHTML = `<div style="padding:3rem;text-align:center;color:var(--text-secondary);">Nenhum torneio cadastrado no calendário.</div>`;
    return;
  }

  // Nomes dos meses em português
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  // 2. Agrupa eventos por chave "YYYY-MM"
  const groups = {}; // key "YYYY-MM" -> { monthKey: "2026-08", label: "Agosto 2026", events: [] }
  validEvents.forEach(evt => {
    const d = parseDateSafe(evt.Data);
    const monthVal = String(d.getMonth() + 1).padStart(2, '0'); // "01"-"12"
    const yearVal = d.getFullYear(); // e.g. 2026
    const key = `${yearVal}-${monthVal}`;
    const label = `${monthNames[d.getMonth()]} de ${yearVal}`;
    
    if (!groups[key]) {
      groups[key] = {
        monthKey: key,
        label: label,
        events: []
      };
    }
    groups[key].events.push(evt);
  });

  // Chaves de meses ordenadas cronologicamente
  const sortedMonthKeys = Object.keys(groups).sort();

  // 3. Determina o mês a ser exibido inicialmente se currentCalendarMonth for nulo
  if (!currentCalendarMonth || !groups[currentCalendarMonth]) {
    // Tenta encontrar o mês atual ("YYYY-MM")
    const now = new Date();
    const nowMonthVal = String(now.getMonth() + 1).padStart(2, '0');
    const nowKey = `${now.getFullYear()}-${nowMonthVal}`;
    
    if (groups[nowKey]) {
      currentCalendarMonth = nowKey;
    } else {
      // Se o mês atual não tiver eventos, pega o primeiro mês disponível que tem eventos
      currentCalendarMonth = sortedMonthKeys[0];
    }
  }

  // 4. Renderiza as abas de meses
  if (tabsContainer) {
    tabsContainer.innerHTML = sortedMonthKeys.map(key => {
      const activeClass = key === currentCalendarMonth ? 'active' : '';
      return `
        <button class="month-tab-btn ${activeClass}" onclick="selectCalendarMonth('${key}')">
          ${escapeHTML(groups[key].label)}
        </button>
      `;
    }).join('');
  }

  // 5. Renderiza os eventos do mês selecionado
  const selectedGroup = groups[currentCalendarMonth];
  if (!selectedGroup || selectedGroup.events.length === 0) {
    timeline.innerHTML = `<div style="padding:3rem;text-align:center;color:var(--text-secondary);">Nenhum torneio cadastrado para este mês.</div>`;
    return;
  }

  timeline.innerHTML = selectedGroup.events.map(evt => {
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

// Função global para trocar o mês do calendário
window.selectCalendarMonth = function(monthKey) {
  currentCalendarMonth = monthKey;
  renderCalendar();
};

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

function renderChampions() {
  const container = document.getElementById('champions-container');
  if (!container) return;

  const champions = appData.Campeoes;
  if (!champions || champions.length === 0) {
    container.className = "champions-grid";
    container.innerHTML = `<div style="grid-column:1/-1;padding:3rem;text-align:center;color:var(--text-secondary);">Galeria de campeões histórica vazia no momento.</div>`;
    return;
  }

  // Set the container class to champions-accordion to use the premium Hall of Fame accordion layout
  container.className = "champions-accordion";

  container.innerHTML = champions.map((champ, index) => {
    const photoUrl = safeExternalUrl(champ.FotoCampeao || champ.Foto || champ.URLFoto || champ.ImagemCampeao);
    const championName = escapeHTML(champ.Campeao || 'Campeão');
    const championInitial = championName ? championName.charAt(0).toUpperCase() : '🏆';
    const hasDeckDetails = Boolean(
      safeExternalUrl(champ.URLDeck || champ.LinkDeck || champ.LinkLista) ||
      safeExternalUrl(champ.ImagemDeck || champ.FotoDeck) ||
      String(champ.ObservacaoDeck || champ.DescricaoDeck || '').trim()
    );
    const isFirstExpanded = index === 0 ? 'expanded' : '';

    // Check for optional seasonal titles columns in the Campeoes sheet row
    const pOuro = champ.PokebolaOuro || champ.PokebolaDeOuro;
    const lGinasio = champ.LiderGinasio || champ.LiderDeGinasio;
    const dPlayer = champ.DittoPlayer;
    const pMurcha = champ.PokebolaMurcha;
    const hasSeasonTitles = Boolean(pOuro || lGinasio || dPlayer || pMurcha);

    let seasonTitlesHtml = '';
    if (hasSeasonTitles) {
      seasonTitlesHtml = `
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.08); display:flex; flex-direction:column; gap:6px; font-size:0.75rem; text-align:left; width:100%; max-width:240px; margin-left:auto; margin-right:auto;">
          <div style="font-weight:600; color:var(--accent-yellow); font-size:0.75rem; margin-bottom:2px; text-transform:uppercase; letter-spacing:0.5px; text-align:center;">Títulos da Temporada:</div>
          ${pOuro ? `
            <div style="display:flex; align-items:center; gap:6px; justify-content:flex-start;">
              <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/52.png" style="width:24px; height:24px; object-fit:contain; margin:-4px 0;" alt="Ouro">
              <span style="color:rgba(255,255,255,0.85); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Ouro: <strong>${escapeHTML(pOuro)}</strong></span>
            </div>
          ` : ''}
          ${lGinasio ? `
            <div style="display:flex; align-items:center; gap:6px; justify-content:flex-start;">
              <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/68.png" style="width:24px; height:24px; object-fit:contain; margin:-4px 0;" alt="Líder">
              <span style="color:rgba(255,255,255,0.85); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Líder: <strong>${escapeHTML(lGinasio)}</strong></span>
            </div>
          ` : ''}
          ${dPlayer ? `
            <div style="display:flex; align-items:center; gap:6px; justify-content:flex-start;">
              <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png" style="width:24px; height:24px; object-fit:contain; margin:-4px 0;" alt="Ditto">
              <span style="color:rgba(255,255,255,0.85); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Ditto: <strong>${escapeHTML(dPlayer)}</strong></span>
            </div>
          ` : ''}
          ${pMurcha ? `
            <div style="display:flex; align-items:center; gap:6px; justify-content:flex-start;">
              <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/129.png" style="width:24px; height:24px; object-fit:contain; margin:-4px 0;" alt="Murcha">
              <span style="color:rgba(255,255,255,0.85); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Murcha: <strong>${escapeHTML(pMurcha)}</strong></span>
            </div>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="champion-accordion-item ${isFirstExpanded}" data-champ-name="${championName}" onclick="
        this.parentNode.querySelectorAll('.champion-accordion-item').forEach(el => el.classList.remove('expanded'));
        this.classList.add('expanded');
      ">
        <div class="champ-acc-season-rotated">${escapeHTML(champ.Temporada)}</div>
        <div class="champ-acc-collapsed-icon">🏆</div>
        
        <div class="champ-acc-expanded-content">
          <div class="champ-acc-season">${escapeHTML(champ.Temporada)}</div>
          <div class="champ-acc-photo-wrap">
            ${photoUrl
              ? `<img class="champ-acc-photo" src="${escapeHTML(photoUrl)}" alt="Foto de ${championName}" loading="lazy">`
              : `<div class="champ-acc-photo-placeholder">${championInitial}</div>`
            }
            <div class="champ-acc-trophy">🏆</div>
          </div>
          <h3 class="champ-acc-name">${championName}</h3>
          
          <div class="champ-acc-details">
            <div class="champ-acc-deck-row">
              Deck Campeão: <span class="champ-acc-deck-value">${escapeHTML(champ.DeckCampeao || 'Não especificado')}</span>
            </div>
            <div class="champ-acc-vice-row">
              🥈 Vice: <strong>${escapeHTML(champ.Vice || '-')}</strong>
            </div>
            ${hasDeckDetails ? `<button class="champ-acc-btn" type="button" onclick="event.stopPropagation(); openChampionDeckModal(${index})" style="margin-bottom:4px;">Ver Lista de Deck</button>` : ''}
            ${seasonTitlesHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

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


window.toggleRule = function(index) {
  const item = document.getElementById(`rule-${index}`);
  if (!item) return;

  const isOpen = item.classList.contains('open');

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

  const endTime = new Date(targetTime);
  endTime.setHours(EVENT_END_HOUR, EVENT_END_MINUTE, 0, 0);

  if (countdownInterval) clearInterval(countdownInterval);

  function updateTimer() {
    const now = new Date().getTime();
    const difference = targetTime - now;

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

let currentPhotoIndex = 0;
window.openLightbox = function(index) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-image');
  const caption = document.getElementById('lightbox-caption');
  
  const photo = appData.Galeria[index];
  if (!photo) return;

  currentPhotoIndex = index;
  img.src = safeExternalUrl(normalizeImageUrl(photo.URL_Imagem));
  caption.innerText = `${photo.Titulo} - ${photo.Descricao || ''}`;
  
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden'; 
};

window.openGenericLightbox = function(imgSrc, title) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-image');
  const caption = document.getElementById('lightbox-caption');
  if (!lightbox || !img) return;

  img.src = safeExternalUrl(normalizeImageUrl(imgSrc));
  if (caption) {
    caption.innerText = title || '';
  }
  
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
};

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

window.openPlayerModal = function(playerRef) {
  const modal = document.getElementById('player-modal');
  let player;
  
  if (typeof playerRef === 'number') {
    const listPlayer = currentRankingList.find(p => p.Pos === playerRef);
    if (listPlayer) {
      player = appData.Ranking.find(p => normalizePlayerName(p.Jogador) === normalizePlayerName(listPlayer.Jogador));
    }
  } else {
    player = appData.Ranking.find(p => normalizePlayerName(p.Jogador) === normalizePlayerName(playerRef));
  }
  
  if (!player || !modal) return;

  const letter = player.Jogador ? player.Jogador.charAt(0).toUpperCase() : '?';

  document.getElementById('modal-avatar').innerText = letter;
  const medals = getPlayerMedals(player.Jogador);
  document.getElementById('modal-player-name').innerHTML = `${escapeHTML(player.Jogador)} ${medals}`;
  document.getElementById('modal-player-deck').innerHTML = `
    ${getEnergyDotHTML(getDeckEnergy(player.Deck))}
    <span>Deck: <strong>${escapeHTML(player.Deck || 'Não registrado')}</strong></span>
  `;
  document.getElementById('modal-stat-participations').innerText = toNumber(player.Participacoes);
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

window.openAwardModal = function(awardKey) {
  let modal = document.getElementById('award-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'award-detail-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-container" style="max-width: 480px; position: relative;">
        <button class="modal-close-btn" onclick="window.closeAwardModal()" style="position: absolute; top: 1rem; right: 1rem; background: none; border: none; color: var(--text-secondary); font-size: 1.25rem; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s;">✕</button>
        <div id="award-modal-content"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  const contentContainer = document.getElementById('award-modal-content');
  if (!contentContainer) return;
  
  const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
  const cupChallengeStages = cleanStages.filter(s => {
    const t = String(s.tipo || '').toLowerCase();
    return t.includes('cup') || t.includes('challenge') || t.includes('copa') || t.includes('desafio');
  });
  const useFallback = cupChallengeStages.length === 0;
  const targetStages = useFallback ? cleanStages : cupChallengeStages;
  
  let title = '';
  let icon = '';
  let winnerName = '';
  let description = '';
  let formulaHtml = '';
  let detailHtml = '';
  let rankingHtml = '';
  
  if (awardKey === 'gold') {
    title = 'Pokébola de Ouro';
    icon = '<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/52.png" style="width:60px; height:60px; object-fit:contain; margin:-8px -4px -8px -8px;" alt="Meowth">';
    const goldCandidates = [...appData.Ranking].map(r => {
      const wins = toNumber(r.Vitorias);
      const losses = toNumber(r.Derrotas);
      const draws = toNumber(r.Empates);
      const total = wins + losses + draws;
      const winRate = total > 0 ? (wins / total) : 0;
      return {
        player: r.Jogador || r.Player || r.Name,
        winRate: winRate,
        podiums: toNumber(r.Podio),
        wins: wins,
        losses: losses,
        draws: draws,
        total: total
      };
    });
    goldCandidates.sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.podiums !== a.podiums) return b.podiums - a.podiums;
      return b.wins - a.wins;
    });
    
    const top = goldCandidates[0];
    winnerName = top ? top.player : 'Nenhum';
    description = 'Prêmio para o jogador com o melhor desempenho geral, avaliado primariamente por taxa de vitória (winrate), com pódios e vitórias como critérios de desempate.';
    formulaHtml = `
      <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; display:flex; flex-direction:column; gap:4px; color:var(--text-secondary); margin-top:8px;">
        <div><strong>Critérios de Ordenação:</strong></div>
        <div>1. Taxa de Vitórias (Winrate) = Vitórias / Partidas Totais</div>
        <div>2. Quantidade total de Pódios na temporada</div>
        <div>3. Quantidade total de Vitórias na temporada</div>
      </div>
    `;
    if (top) {
      detailHtml = `
        <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; margin-top:8px;">
          <div style="font-weight:600; color:#fff; font-size:1rem; margin-bottom:4px;">Cálculo do Vencedor (${escapeHTML(top.player)}):</div>
          <div style="display:flex; justify-content:space-between;"><span>Taxa de Vitória (Winrate):</span><strong style="color:var(--accent-yellow);">${(top.winRate * 100).toFixed(1)}%</strong></div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:-6px; text-align:right;">(${top.wins} vitórias / ${top.total} partidas)</div>
          <div style="display:flex; justify-content:space-between; margin-top:4px;"><span>Pódios Conquistados:</span><strong style="color:#fff;">${top.podiums}</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Vitórias Totais:</span><strong style="color:#fff;">${top.wins}</strong></div>
        </div>
      `;
    }

    rankingHtml = `
      <details style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; cursor: pointer;">
        <summary style="font-size: 0.85rem; font-weight: 600; color: var(--accent-yellow); outline: none; user-select: none;">
          📊 Ver Classificação Completa dos Candidatos
        </summary>
        <div style="margin-top: 10px; max-height: 180px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.78rem;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); font-size: 0.7rem; text-transform: uppercase;">
                <th style="padding: 4px 6px;">Pos</th>
                <th style="padding: 4px 6px;">Jogador</th>
                <th style="padding: 4px 6px; text-align: right;">Winrate / Partidas</th>
              </tr>
            </thead>
            <tbody>
              ${goldCandidates.map((c, i) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); color: ${i === 0 ? 'var(--accent-yellow)' : '#fff'}">
                  <td style="padding: 4px 6px; font-weight: bold;">${i + 1}º</td>
                  <td style="padding: 4px 6px;">${escapeHTML(c.player)}</td>
                  <td style="padding: 4px 6px; text-align: right; font-weight: bold;">
                    ${(c.winRate * 100).toFixed(1)}% 
                    <span style="font-size:0.7rem; font-weight: normal; color:var(--text-secondary);">(${c.wins}/${c.total})</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </details>
    `;
  } else if (awardKey === 'gym') {
    title = 'Líder de Ginásio';
    icon = '<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/68.png" style="width:60px; height:60px; object-fit:contain; margin:-8px -4px -8px -8px;" alt="Machamp">';
    
    const gymCandidates = [...appData.Ranking].map(r => {
      const playerName = r.Jogador || r.Player || r.Name;
      const totalPart = toNumber(r.Participacoes);
      const cupChallengePart = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(playerName, stage.data) !== null).length;
      return {
        player: playerName,
        totalPart: totalPart,
        cupChallengePart: cupChallengePart,
        points: toNumber(r.Pontos)
      };
    });
    gymCandidates.sort((a, b) => {
      if (b.totalPart !== a.totalPart) return b.totalPart - a.totalPart;
      if (b.cupChallengePart !== a.cupChallengePart) return b.cupChallengePart - a.cupChallengePart;
      return b.points - a.points;
    });
    
    const top = gymCandidates[0];
    winnerName = top ? top.player : 'Nenhum';
    description = 'Prêmio para o jogador mais assíduo da temporada (com maior número de participações no ranking geral), utilizando a presença em etapas de Cup/Challenge e os pontos acumulados como desempates.';
    formulaHtml = `
      <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; display:flex; flex-direction:column; gap:4px; color:var(--text-secondary); margin-top:8px;">
        <div><strong>Critérios de Ordenação:</strong></div>
        <div>1. Presença Geral = Total de participações na temporada</div>
        <div>2. Presença Especial = Total de participações em Cup/Challenge</div>
        <div>3. Pontuação Geral = Total de pontos acumulados na temporada</div>
      </div>
    `;
    if (top) {
      detailHtml = `
        <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; margin-top:8px;">
          <div style="font-weight:600; color:#fff; font-size:1rem; margin-bottom:4px;">Cálculo do Vencedor (${escapeHTML(top.player)}):</div>
          <div style="display:flex; justify-content:space-between;"><span>Presença Geral (Temporada):</span><strong style="color:var(--accent-yellow);">${top.totalPart} etapas</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Presença em Cup/Challenge:</span><strong style="color:#fff;">${top.cupChallengePart} etapas</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Pontos Totais Acumulados:</span><strong style="color:#fff;">${top.points.toFixed(0)} PTS</strong></div>
        </div>
      `;
    }

    rankingHtml = `
      <details style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; cursor: pointer;">
        <summary style="font-size: 0.85rem; font-weight: 600; color: var(--accent-yellow); outline: none; user-select: none;">
          📊 Ver Classificação Completa dos Candidatos
        </summary>
        <div style="margin-top: 10px; max-height: 180px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.78rem;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); font-size: 0.7rem; text-transform: uppercase;">
                <th style="padding: 4px 6px;">Pos</th>
                <th style="padding: 4px 6px;">Jogador</th>
                <th style="padding: 4px 6px; text-align: right;">Participações / Pontos</th>
              </tr>
            </thead>
            <tbody>
              ${gymCandidates.map((c, i) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); color: ${i === 0 ? 'var(--accent-yellow)' : '#fff'}">
                  <td style="padding: 4px 6px; font-weight: bold;">${i + 1}º</td>
                  <td style="padding: 4px 6px;">${escapeHTML(c.player)}</td>
                  <td style="padding: 4px 6px; text-align: right; font-weight: bold;">
                    ${c.totalPart} <span style="font-size:0.7rem; font-weight: normal; color:var(--text-secondary);">etapas</span>
                    <span style="font-size:0.7rem; font-weight: normal; color:var(--text-secondary);">(${c.points.toFixed(0)} pts)</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </details>
    `;
  } else if (awardKey === 'ditto') {
    title = 'Ditto Player';
    icon = '<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png" style="width:60px; height:60px; object-fit:contain; margin:-8px -4px -8px -8px;" alt="Ditto">';
    
    const dittoCandidates = [];
    (appData.Ranking || []).forEach(r => {
      if (!r) return;
      const playerName = r.Jogador || r.Player || r.Name;
      if (!playerName) return;
      
      const uniqueDecksNormalized = new Set();
      const uniqueDecksOriginal = [];
      cleanStages.forEach(stage => {
        if (!stage || !stage.data) return;
        const deck = getDeckForStage(playerName, stage.data);
        if (deck) {
          const trimmedDeck = deck.trim();
          const normDeck = trimmedDeck.toLowerCase();
          if (!uniqueDecksNormalized.has(normDeck)) {
            uniqueDecksNormalized.add(normDeck);
            uniqueDecksOriginal.push(trimmedDeck);
          }
        }
      });
      
      if (uniqueDecksNormalized.size > 0) {
        const partCount = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(playerName, stage.data) !== null).length;
        const podiums = toNumber(r.Podio);
        const mediaColocacao = toNumber(r.MediaColocacao);
        dittoCandidates.push({
          player: playerName,
          count: uniqueDecksNormalized.size,
          decks: uniqueDecksOriginal,
          participations: partCount,
          podiums: podiums,
          mediaColocacao: mediaColocacao
        });
      }
    });
    dittoCandidates.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      
      const mediaA = a.mediaColocacao > 0 ? a.mediaColocacao : 999999;
      const mediaB = b.mediaColocacao > 0 ? b.mediaColocacao : 999999;
      if (mediaA !== mediaB) return mediaA - mediaB;
      
      if (b.participations !== a.participations) return b.participations - a.participations;
      return b.podiums - a.podiums;
    });
    
    const top = dittoCandidates[0];
    winnerName = top ? top.player : 'Nenhum';
    description = `Prêmio para o jogador mais versátil da temporada, que jogou com a maior variedade de decks diferentes ao longo de todas as etapas.`;
    formulaHtml = `
      <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; display:flex; flex-direction:column; gap:4px; color:var(--text-secondary); margin-top:8px;">
        <div><strong>Critérios de Ordenação:</strong></div>
        <div>1. Variedade = Total de decks únicos jogados na temporada (todas as etapas)</div>
        <div>2. Desempenho = Menor média de colocação geral (Desempate 1)</div>
        <div>3. Presença = Participações nas etapas de Cup/Challenge (Desempate 2)</div>
        <div>4. Pódios = Total de pódios conquistados na temporada (Desempate 3)</div>
      </div>
    `;
    if (top) {
      detailHtml = `
        <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; margin-top:8px;">
          <div style="font-weight:600; color:#fff; font-size:1rem; margin-bottom:4px;">Cálculo do Vencedor (${escapeHTML(top.player)}):</div>
          <div style="display:flex; justify-content:space-between;"><span>Variedade de Decks (Temporada):</span><strong style="color:var(--accent-yellow);">${top.count} decks distintos</strong></div>
          <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
            <span style="font-size:0.75rem; color:var(--text-secondary);">Decks jogados na temporada:</span>
            <div style="display:flex; flex-wrap:wrap; gap:4px; padding-left:5px;">
              ${top.decks.map(d => `<span class="ved-badge" style="${window.getDeckGradientStyle(d)} color:#fff; font-size:0.65rem; padding: 2px 6px; border-radius: 10px; display:inline-block;">${escapeHTML(d)}</span>`).join('')}
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:4px;"><span>Média de Colocação:</span><strong style="color:#fff;">${top.mediaColocacao > 0 ? top.mediaColocacao.toFixed(1) + 'º' : '-'}</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Presença em Cup/Challenge:</span><strong style="color:#fff;">${top.participations} etapas</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Pódios Conquistados:</span><strong style="color:#fff;">${top.podiums}</strong></div>
        </div>
      `;
    }

    rankingHtml = `
      <details style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; cursor: pointer;">
        <summary style="font-size: 0.85rem; font-weight: 600; color: var(--accent-yellow); outline: none; user-select: none;">
          📊 Ver Classificação Completa dos Candidatos
        </summary>
        <div style="margin-top: 10px; max-height: 180px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.78rem;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); font-size: 0.7rem; text-transform: uppercase;">
                <th style="padding: 4px 6px;">Pos</th>
                <th style="padding: 4px 6px;">Jogador</th>
                <th style="padding: 4px 6px; text-align: right;">Decks / Média</th>
              </tr>
            </thead>
            <tbody>
              ${dittoCandidates.map((c, i) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); color: ${i === 0 ? 'var(--accent-yellow)' : '#fff'}">
                  <td style="padding: 4px 6px; font-weight: bold;">${i + 1}º</td>
                  <td style="padding: 4px 6px;">${escapeHTML(c.player)}</td>
                  <td style="padding: 4px 6px; text-align: right; font-weight: bold;">
                    ${c.count} <span style="font-size:0.7rem; font-weight: normal; color:var(--text-secondary);">decks</span>
                    <span style="font-size:0.7rem; font-weight: normal; color:var(--text-secondary);">(${c.mediaColocacao > 0 ? c.mediaColocacao.toFixed(1) + 'º' : '-'})</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </details>
    `;
  } else if (awardKey === 'murcha') {
    title = 'Pokébola Murcha';
    icon = '<img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/129.png" style="width:60px; height:60px; object-fit:contain; margin:-8px -4px -8px -8px;" alt="Magikarp">';
    const murchaCandidates = (appData.Ranking || []).filter(r => r && toNumber(r.Participacoes) > 0).map(r => {
      const playerName = r.Jogador || r.Player || r.Name;
      const ratio = toNumber(r.Derrotas) / toNumber(r.Participacoes);
      const assiduidade = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(playerName, stage.data) !== null).length;
      return {
        player: playerName || 'Desconhecido',
        ratio: ratio,
        defeats: toNumber(r.Derrotas),
        participations: toNumber(r.Participacoes),
        assiduidade: assiduidade
      };
    });
    murchaCandidates.sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return b.assiduidade - a.assiduidade;
    });
    
    const top = murchaCandidates[0];
    winnerName = top ? top.player : 'Nenhum';
    description = 'Prêmio de consolação para o jogador com a maior proporção de derrotas por etapa jogada na temporada, com desempate pela assiduidade em etapas de Cup/Challenge.';
    formulaHtml = `
      <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; display:flex; flex-direction:column; gap:4px; color:var(--text-secondary); margin-top:8px;">
        <div><strong>Critérios de Ordenação:</strong></div>
        <div>1. Razão Murcha = Total de Derrotas / Total de Participações</div>
        <div>2. Assiduidade = Participações nas etapas de Cup/Challenge</div>
      </div>
    `;
    if (top) {
      detailHtml = `
        <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; margin-top:8px;">
          <div style="font-weight:600; color:#fff; font-size:1rem; margin-bottom:4px;">Cálculo do Vencedor (${escapeHTML(top.player)}):</div>
          <div style="display:flex; justify-content:space-between;"><span>Derrotas/Etapa (Proporção):</span><strong style="color:var(--accent-yellow);">${top.ratio.toFixed(2)}</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Derrotas Totais:</span><strong style="color:#fff;">${top.defeats} derrotas em ${top.participations} et.</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Presença em Cup/Challenge:</span><strong style="color:#fff;">${top.assiduidade} etapas</strong></div>
        </div>
      `;
    }

    rankingHtml = `
      <details style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; cursor: pointer;">
        <summary style="font-size: 0.85rem; font-weight: 600; color: var(--accent-yellow); outline: none; user-select: none;">
          📊 Ver Classificação Completa dos Candidatos
        </summary>
        <div style="margin-top: 10px; max-height: 180px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.78rem;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); font-size: 0.7rem; text-transform: uppercase;">
                <th style="padding: 4px 6px;">Pos</th>
                <th style="padding: 4px 6px;">Jogador</th>
                <th style="padding: 4px 6px; text-align: right;">Derrotas por Etapa</th>
              </tr>
            </thead>
            <tbody>
              ${murchaCandidates.map((c, i) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); color: ${i === 0 ? 'var(--accent-yellow)' : '#fff'}">
                  <td style="padding: 4px 6px; font-weight: bold;">${i + 1}º</td>
                  <td style="padding: 4px 6px;">${escapeHTML(c.player)}</td>
                  <td style="padding: 4px 6px; text-align: right; font-weight: bold;">
                    ${c.ratio.toFixed(2)} 
                    <span style="font-size:0.7rem; font-weight: normal; color:var(--text-secondary);">(${c.defeats}/${c.participations})</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }
  
  contentContainer.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:12px;">
      ${icon}
      <div>
        <h3 style="font-weight:700; color:#fff; font-size:1.2rem; margin:0;">${escapeHTML(title)}</h3>
        <div style="font-size:0.75rem; color:var(--accent-yellow); margin-top:2px;">Detalhamento de Cálculo do Prêmio</div>
      </div>
    </div>
    
    <div style="font-size:0.85rem; color:var(--text-secondary); line-height:1.4; margin-top:8px;">
      ${description}
    </div>
    
    ${formulaHtml}
    
    ${detailHtml}
    
    ${rankingHtml}
    
    <div style="display:flex; justify-content:flex-end; margin-top:16px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px;">
      <button class="btn" onclick="window.closeAwardModal()" style="padding:6px 16px; font-size:0.8rem; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:20px; color:#fff; cursor:pointer; transition:background 0.2s;">Fechar Detalhes</button>
    </div>
  `;
  
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeAwardModal = function() {
  const modal = document.getElementById('award-detail-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

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


function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const logoBtn = document.getElementById('logo-btn');
  const menuToggle = document.getElementById('menu-toggle');
  const navMenu = document.getElementById('nav-menu');

  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
      menuToggle.classList.toggle('active');
    });
  }

  function navigateTo(targetId) {

    document.querySelectorAll('.section').forEach(section => {
      section.classList.remove('active');
    });

    const activeSection = document.getElementById(targetId);
    if (activeSection) {
      activeSection.classList.add('active');
      window.scrollTo(0, 0);
    }

    navLinks.forEach(link => {
      if (link.getAttribute('data-target') === targetId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    if (navMenu && navMenu.classList.contains('active')) {
      navMenu.classList.remove('active');
      if (menuToggle) {
        menuToggle.classList.remove('active');
      }
    }
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-target');
      window.location.hash = target;
      navigateTo(target);
    });
  });

  if (logoBtn) {
    logoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = 'dashboard';
      navigateTo('dashboard');
    });
  }

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
  handleHashRoute(); 
}


function initEvents() {

  const searchInput = document.getElementById('search-ranking');
  const catSelector = document.getElementById('ranking-category-selector');

  function applyRankingFilters() {
    const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedCat = catSelector ? catSelector.value : 'all';
    
    const filtered = currentRankingList.filter(player => {
      let searchMatch = true;
      if (searchVal) {
        const nameMatch = player.Jogador && player.Jogador.toLowerCase().includes(searchVal);
        const deckMatch = player.Deck && player.Deck.toLowerCase().includes(searchVal);
        searchMatch = nameMatch || deckMatch;
      }
      
      let catMatch = true;
      if (selectedCat !== 'all') {
        const playerCat = String(player.Categoria || player.Category || '').toUpperCase().trim();
        // Trata acentuação "Sênior" no value contra "SENIOR" no dado
        const normalizedSelCat = selectedCat.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        const normalizedPlayerCat = playerCat.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        catMatch = normalizedPlayerCat === normalizedSelCat;
      }
      
      return searchMatch && catMatch;
    });
    
    renderRankingTable(filtered, 1);
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyRankingFilters);
  }

  if (catSelector) {
    catSelector.addEventListener('change', applyRankingFilters);
  }

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
        renderRankingTable(appData.Ranking, 1);

        if (searchInput) searchInput.value = '';
        if (catSelector) catSelector.value = 'all';
        return;
      }

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
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalHost) {
        stageTdfUrl = `etapas/${selectedValue}.tdf?v=${new Date().getTime()}`;
      } else if (dataSource === "github" && githubSources.Ranking) {
        let baseRankingUrl = githubSources.Ranking;
        if (window.latestCommitSha) {
          baseRankingUrl = baseRankingUrl.replace(/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)/, `/raw.githubusercontent.com/$1/$2/${window.latestCommitSha}`);
        }
        stageTdfUrl = baseRankingUrl.replace('ranking.tdf', `etapas/${selectedValue}.tdf`);
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
        renderRankingTable(normalized, 1);

        if (searchInput) searchInput.value = '';
        if (catSelector) catSelector.value = 'all';

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

  const historicalSeason = document.getElementById('historical-season-selector');
  const historicalSearch = document.getElementById('historical-player-search');
  
  if (historicalSeason) {
    historicalSeason.addEventListener('change', () => { renderHistoricalScores(1); });
  }
  if (historicalSearch) {
    historicalSearch.addEventListener('input', () => { renderHistoricalScores(1); });
  }

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

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
      closePlayerModal();
      closeChampionDeckModal();
    }
  });

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

document.addEventListener('DOMContentLoaded', () => {

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

      if (typeof updateMetagameDisplay === 'function') {
        updateMetagameDisplay();
      }
    });
  }

  initNavigation();
  initEvents();

  loadData();
});

let metagameChartHome = null;
let metagameChartPage = null;

function renderMetagame() {
  const configVal = (appData.Configuracoes && appData.Configuracoes.ExibirMetagame) ? appData.Configuracoes.ExibirMetagame.toLowerCase().trim() : '';
  
  const navLink = document.getElementById('nav-metagame');
  const homeContainer = document.getElementById('metagame-home-container');

  if (configVal === 'offline' || configVal === 'desativado') {
    if (navLink) navLink.style.display = 'none';
    if (homeContainer) homeContainer.style.display = 'none';
    return;
  }

  if (navLink) navLink.style.display = '';

  if (configVal === 'pagina' || configVal === 'page') {
    if (homeContainer) homeContainer.style.display = 'none';
  } else {
    if (homeContainer) homeContainer.style.display = '';
  }
  
  populateMetagameSeasonSelector(configVal);
  updateMetagameDisplay();
}

function getMetagameSessions() {
  const rows = appData.Metagame || [];
  if (rows.length === 0) return [];
  
  const ignoreKeys = ['id', 'popid', 'playid', 'play! pokemon id', 'jogador', 'player', 'nome', '', 'posicaofinal', 'pontos', 'deck', 'categoria'];
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

function formatDateDDMMYY(dateStr) {
  if (!dateStr || dateStr.length !== 6) return dateStr;
  const dd = dateStr.substring(0, 2);
  const mm = dateStr.substring(2, 4);
  const yy = dateStr.substring(4, 6);
  return `${dd}/${mm}/20${yy}`;
}

function formatSessionName(sessionRaw) {
  if (!sessionRaw) return '';
  
  // League Cup: CUP(\d+)T(\d+)\s+(\d{6})
  const cupMatch = sessionRaw.match(/^CUP(\d+)T(\d+)\s+(\d{6})$/i);
  if (cupMatch) {
    const cupNum = cupMatch[1];
    const tempNum = cupMatch[2];
    const dateStr = cupMatch[3];
    const formattedDate = formatDateDDMMYY(dateStr);
    return `League Cup ${cupNum} - Temporada ${tempNum} (${formattedDate})`;
  }

  // League Challenge: CH(\d+)T(\d+)\s+(\d{6})
  const chMatch = sessionRaw.match(/^CH(\d+)T(\d+)\s+(\d{6})$/i);
  if (chMatch) {
    const chNum = chMatch[1];
    const tempNum = chMatch[2];
    const dateStr = chMatch[3];
    const formattedDate = formatDateDDMMYY(dateStr);
    return `League Challenge ${chNum} - Temporada ${tempNum} (${formattedDate})`;
  }

  // Sessão de Liga: S(\d+)T(\d+)\s+(\d{6})
  const sMatch = sessionRaw.match(/^S(\d+)T(\d+)\s+(\d{6})$/i);
  if (sMatch) {
    const sNum = sMatch[1];
    const tempNum = sMatch[2];
    const dateStr = sMatch[3];
    const formattedDate = formatDateDDMMYY(dateStr);
    return `Sessão de Liga ${sNum} - Temporada ${tempNum} (${formattedDate})`;
  }

  // Retorno padrão caso não case com o modelo abreviado
  return sessionRaw;
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
  optionsHTML += sessions.map(s => `<option value="${escapeHTML(s)}">${escapeHTML(formatSessionName(s))}</option>`).join('');
  
  selector.innerHTML = optionsHTML;
  
  if (currentValue === 'all' || sessions.includes(currentValue)) {
    selector.value = currentValue;
  } else {
    selector.value = 'all';
  }
  selector.removeEventListener('change', handleMetagameSelectorChange);
  selector.addEventListener('change', handleMetagameSelectorChange);
  
  const chartTypeSelector = document.getElementById('metagame-chart-type');
  if (chartTypeSelector && !chartTypeSelector.hasAttribute('data-listener')) {
    chartTypeSelector.addEventListener('change', handleMetagameSelectorChange);
    chartTypeSelector.setAttribute('data-listener', 'true');
  }
}

window.setMetagameChartType = function(type) {
  window.currentMetagameChartType = type;
  document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id.includes(type));
  });
  updateMetagameDisplay();
};

function handleMetagameSelectorChange() {
  updateMetagameDisplay();
}

function updateMetagameDisplay() {
  const homeContent = document.getElementById('metagame-home-content');
  const pageContent = document.getElementById('metagame-page-content');
  const selector = document.getElementById('metagame-season-selector');
  const selectedSession = selector ? selector.value : 'all';
  
  const sessions = getMetagameSessions();
  const deckCounts = {};
  
  if (sessions.length > 0) {
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
  }
  
  const decksTab = appData.Decks || [];
  const sortedDecks = Object.keys(deckCounts).map(deckName => {
    const deckInfo = decksTab.find(d => (d.Deck || '').trim().toLowerCase() === deckName.toLowerCase());
    return {
      deck: deckName,
      count: deckCounts[deckName],
      image: deckInfo ? deckInfo.Imagem : null,
      icone: deckInfo ? deckInfo.Icone : null,
      energia: deckInfo ? deckInfo.TipoEnergia : '',
      limitless: deckInfo ? (deckInfo.Limitless || deckInfo.Link || deckInfo.URL || '#') : '#'
    };
  }).sort((a, b) => b.count - a.count);
  
  const chartType = 'doughnut';
  
  if (!window.outrosExpandedState) window.outrosExpandedState = {};
  
  let chartDecks = [];
  let accordionDecks = sortedDecks; // Accordion always shows all
  
  // Doughnut Grouping logic
  if (chartType === 'doughnut') {
    let outrosCount = 0;
    let outrosDecksList = [];
    let mainDecksCount = 0;
    const isExpanded = window.outrosExpandedState[selectedSession];
    
    // Categorize decks into main and outros decks
    sortedDecks.forEach(d => {
      const isOutrosVal = d.deck.toLowerCase() === 'outros' || d.deck.toLowerCase() === 'outros decks';
      if (d.count === 1 || isOutrosVal) {
        outrosCount += d.count;
        outrosDecksList.push(d);
      } else {
        mainDecksCount += d.count;
      }
    });

    if (isExpanded) {
      // DRILL-DOWN MODE: Show all minor decks (which are in outrosDecksList)
      chartDecks = [...outrosDecksList];
      // Plus a slice for the rest of the decks named "Voltar para visão geral"
      if (mainDecksCount > 0) {
        // Size of "Voltar para visão geral" slice is scaled down to ~10% of the chart sum to leave room for minor decks
        const sizeCount = Math.max(1, Math.round(outrosCount * 0.11));
        chartDecks.push({
          deck: 'Voltar para visão geral',
          count: sizeCount,
          realCount: mainDecksCount,
          image: null, icone: null, energia: '', limitless: '#'
        });
      }
    } else {
      // MAIN MODE: Show main decks, group minor into "Outros Decks"
      sortedDecks.forEach(d => {
        const isOutrosVal = d.deck.toLowerCase() === 'outros' || d.deck.toLowerCase() === 'outros decks';
        if (d.count > 1 && !isOutrosVal) {
          chartDecks.push(d);
        }
      });
      if (outrosCount > 0) {
        chartDecks.push({
          deck: 'Outros Decks',
          count: outrosCount,
          image: null, icone: null, energia: '', limitless: '#'
        });
      }
    }
  } else {
    chartDecks = sortedDecks;
  }
  
  const labels = chartDecks.map(d => d.deck);
  const data = chartDecks.map(d => d.count);
  const colors = ['#FF4216', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e', '#14b8a6'];
  
  const getOrCreateTooltip = (chart) => {
    let tooltipEl = chart.canvas.parentNode.querySelector('div.chartjs-tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'chartjs-tooltip glass-card';
      tooltipEl.style.background = 'rgba(15, 23, 42, 0.9)';
      tooltipEl.style.borderRadius = 'var(--radius)';
      tooltipEl.style.color = 'white';
      tooltipEl.style.opacity = 1;
      tooltipEl.style.pointerEvents = 'none';
      tooltipEl.style.position = 'absolute';
      tooltipEl.style.transform = 'translate(-50%, 0)';
      tooltipEl.style.transition = 'all .1s ease';
      tooltipEl.style.zIndex = 100;
      tooltipEl.style.padding = '10px';
      tooltipEl.style.display = 'flex';
      tooltipEl.style.flexDirection = 'column';
      tooltipEl.style.alignItems = 'center';
      tooltipEl.style.gap = '8px';
      chart.canvas.parentNode.appendChild(tooltipEl);
    }
    return tooltipEl;
  };

  const externalTooltipHandler = (context) => {
    const {chart, tooltip} = context;
    const tooltipEl = getOrCreateTooltip(chart);

    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = 0;
      return;
    }

    if (tooltip.body) {
      const dataIndex = tooltip.dataPoints[0].dataIndex;
      const deckInfo = (chart._chartDecks || chartDecks)[dataIndex];
      
      let innerHtml = '';
      if (deckInfo) {
        const realCount = deckInfo.realCount !== undefined ? deckInfo.realCount : deckInfo.count;
        if (deckInfo.image) {
          innerHtml += `<img src="${safeExternalUrl(deckInfo.image)}" style="width: 100px; height: 140px; object-fit: cover; border-radius: 4px; margin-bottom: 5px;">`;
        }
        innerHtml += `<div style="font-weight: bold; text-align: center;">${escapeHTML(deckInfo.deck)}</div>`;
        innerHtml += `<div style="text-align: center; color: var(--text-secondary); font-size: 0.9rem;">${realCount} jogador(es)</div>`;
      }
      
      tooltipEl.innerHTML = innerHtml;
    }

    const position = context.chart.canvas.getBoundingClientRect();
    tooltipEl.style.opacity = 1;
    tooltipEl.style.left = tooltip.caretX + 'px';
    tooltipEl.style.top = tooltip.caretY + 'px';
  };

  const renderToContainer = (targetContainer, canvasId, chartVarName, isHome) => {
    if (!targetContainer) return;
    
    if (!appData.Metagame || appData.Metagame.length === 0) {
      targetContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Crie as abas "Jogadores" e "Decks" na planilha para ver as estatísticas!</div>';
      return;
    }
    if (sessions.length === 0) {
      targetContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Adicione colunas de sessões (ex: S1T5 210626) na aba Jogadores.</div>';
      return;
    }
    if (Object.keys(deckCounts).length === 0) {
      targetContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhum deck registrado nas sessões selecionadas.</div>';
      return;
    }
    const totalDecksCount = sortedDecks.reduce((sum, d) => sum + d.count, 0) || 1;
    const decksWithImages = sortedDecks.filter(d => d.image);
    let carouselHtml = '';
    
    window.energyHexColors = {
      grass: '#78C850', fire: '#FF4216', water: '#1593F5', lightning: '#EBC816', 
      psychic: '#D94293', fighting: '#C55E13', darkness: '#0c4a6e', metal: '#7E8E9E', 
      dragon: '#8D56FF', colorless: '#e2e8f0'
    };
    
    window.getDeckGradientStyle = (deckName) => {
      const energyStr = getDeckEnergy(deckName);
      if (!energyStr) return 'background: rgba(0,0,0,0.75);';
      const parts = energyStr.toLowerCase().split('+').map(p => p.trim());
      const hex1 = window.energyHexColors[parts[0]] || '#475569';
      if (parts.length > 1 && window.energyHexColors[parts[1]]) {
        const hex2 = window.energyHexColors[parts[1]];
        return `background: linear-gradient(135deg, ${hex1}ee 0%, ${hex2}ee 100%);`;
      }
      return `background: ${hex1}ee;`;
    };

    const carouselClass = isHome ? 'carousel-home' : 'carousel-page';
    const chartMaxWidth = isHome ? '420px' : '520px';

    if (decksWithImages.length > 0) {
      const cardsHtml = decksWithImages.map((d, i) => `
        <a href="${d.limitless}" target="_blank" rel="noopener noreferrer" class="carousel-3d-item" data-index="${i}" data-deck="${escapeHTML(d.deck)}" title="Ver ${escapeHTML(d.deck)} no Limitless" onclick="
          const isAct = this.classList.contains('active');
          if (!isAct) {
            event.preventDefault();
            if (window.syncCarouselToDeck) {
              window.syncCarouselToDeck('${canvasId}', '${d.deck.replace(/'/g, "\\'")}');
            }
          }
        ">
          <img src="${safeExternalUrl(d.image)}" alt="${escapeHTML(d.deck)}" loading="lazy">
          ${isHome ? '' : `<div class="deck-card-label" style="${window.getDeckGradientStyle(d.deck)} text-shadow: 1px 1px 3px rgba(0,0,0,0.8);">${escapeHTML(d.deck)}</div>`}
        </a>
      `).join('');
      
      carouselHtml = `
        <div class="carousel-3d-container ${carouselClass}" id="carousel-${canvasId}">
          <button class="carousel-nav-btn carousel-prev" onclick="moveCarousel('${canvasId}', -1)">&#10094;</button>
          <div class="carousel-3d-stage" id="stage-${canvasId}">
            ${cardsHtml}
          </div>
          <button class="carousel-nav-btn carousel-next" onclick="moveCarousel('${canvasId}', 1)">&#10095;</button>
        </div>
        <div style="font-size:0.75rem; color:rgba(255,255,255,0.4); text-align:center; margin-top:0.5rem; font-style:italic;">Clique na carta para ver a decklist completa</div>
      `;
    }


    const chartType = 'doughnut';
    
    let accordionHtml = '';
    if (chartType === 'bar' && accordionDecks.length > 0) {
      const maxCount = accordionDecks[0].count;
      accordionHtml = '<div class="accordion-list">';
      accordionDecks.forEach((deck, idx) => {
        const isOutrosClass = (deck.deck === 'Outros Decks' || deck.deck.toLowerCase() === 'outros') ? 'no-expand' : '';
        const relativeWidth = Math.round((deck.count / maxCount) * 100);
        const bgStyle = window.getDeckGradientStyle ? window.getDeckGradientStyle(deck.deck) : 'background: rgba(255,255,255,0.1);';
        const deckImage = deck.image ? `url('${safeExternalUrl(deck.image)}')` : 'none';
        const percentage = Math.round((deck.count / totalDecksCount) * 100);
        
        accordionHtml += `
          <div class="accordion-item ${isOutrosClass}" onclick="
            if ('${isOutrosClass}' !== '') return;
            const isExp = this.classList.contains('expanded');
            if (isExp || window.innerWidth > 768) {
              window.open('${deck.limitless}', '_blank', 'noopener,noreferrer');
            } else {
              this.parentNode.querySelectorAll('.accordion-item').forEach(el => el.classList.remove('expanded'));
              this.classList.add('expanded');
            }
          ">
            <div class="accordion-bg-image" style="background-image: ${deckImage}"></div>
            <div class="accordion-progress" style="${bgStyle} --progress: ${relativeWidth}%;"></div>
            <div class="accordion-content">
              <span class="accordion-rank">#${idx + 1}</span>
              <span class="accordion-name">${escapeHTML(deck.deck)}</span>
              <span class="accordion-percent">${percentage}%</span>
            </div>
          </div>
        `;
      });
      accordionHtml += '</div>';
    }

    const isBar = chartType === 'bar';
    const chartColumnWidth = isBar ? '100%' : (window.innerWidth <= 768 ? '100%' : chartMaxWidth);
    const chartColumnFlex = isBar ? '1 1 100%' : `1 1 ${chartColumnWidth}`;

    const toggleHtml = `
      <div class="chart-type-toggle" style="display: flex; align-self: center; margin-top: 1rem;">
        <button type="button" class="chart-toggle-btn ${chartType !== 'bar' ? 'active' : ''}" id="btn-chart-doughnut-${canvasId}" onclick="window.setMetagameChartType('doughnut')" title="Gráfico de Rosca">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
        </button>
        <button type="button" class="chart-toggle-btn ${chartType === 'bar' ? 'active' : ''}" id="btn-chart-bar-${canvasId}" onclick="window.setMetagameChartType('bar')" title="Gráfico de Barras">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
        </button>
      </div>
    `;

    // Recalcular prêmios da temporada se estiver em Home (dashboard)
    let awardsHtml = '';
    if (isHome && appData.Ranking && appData.Ranking.length > 0) {
      // Filtra estágios válidos
      const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
      
      // Filtro de etapas para Cup e Challenge (com fallback se não houver nenhuma cadastrada ainda)
      const cupChallengeStages = cleanStages.filter(s => {
        const t = String(s.tipo || '').toLowerCase();
        return t.includes('cup') || t.includes('challenge') || t.includes('copa') || t.includes('desafio');
      });
      const useFallback = cupChallengeStages.length === 0;
      const targetStages = useFallback ? cleanStages : cupChallengeStages;

      // 1. Pokébola de Ouro: Maior Winrate (desempate por pódios, depois vitórias)
      const goldCandidates = [...appData.Ranking].map(r => {
        const wins = toNumber(r.Vitorias);
        const losses = toNumber(r.Derrotas);
        const draws = toNumber(r.Empates);
        const total = wins + losses + draws;
        const winRate = total > 0 ? (wins / total) : 0;
        return {
          player: r,
          winRate: winRate,
          podiums: toNumber(r.Podio),
          wins: wins
        };
      });
      goldCandidates.sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.podiums !== a.podiums) return b.podiums - a.podiums;
        return b.wins - a.wins;
      });
      const pokebolaDeOuroPlayer = goldCandidates[0] ? goldCandidates[0].player : null;

      // 2. Líder de Ginásio: Jogador com maior número de participações (desempates: presenças Cup/Challenge, depois pontuação)
      const liderDeGinasioPlayer = [...appData.Ranking].sort((a, b) => {
        const partA = toNumber(a.Participacoes);
        const partB = toNumber(b.Participacoes);
        if (partB !== partA) return partB - partA;
        
        const cupChalA = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(a.Jogador || a.Player || a.Name, stage.data) !== null).length;
        const cupChalB = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(b.Jogador || b.Player || b.Name, stage.data) !== null).length;
        if (cupChalB !== cupChalA) return cupChalB - cupChalA;
        
        return toNumber(b.Pontos) - toNumber(a.Pontos);
      })[0];

      // 3. Ditto Player: Mais decks diferentes em toda a temporada (desempates: média de colocação, presenças Cup/Challenge, pódios)
      const dittoCandidates = [];
      (appData.Ranking || []).forEach(r => {
        if (!r) return;
        const playerName = r.Jogador || r.Player || r.Name;
        if (!playerName) return;
        
        const uniqueDecksNormalized = new Set();
        const uniqueDecksOriginal = [];
        cleanStages.forEach(stage => {
          if (!stage || !stage.data) return;
          const deck = getDeckForStage(playerName, stage.data);
          if (deck) {
            const trimmedDeck = deck.trim();
            const normDeck = trimmedDeck.toLowerCase();
            if (!uniqueDecksNormalized.has(normDeck)) {
              uniqueDecksNormalized.add(normDeck);
              uniqueDecksOriginal.push(trimmedDeck);
            }
          }
        });
        
        if (uniqueDecksNormalized.size > 0) {
          const partCount = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(playerName, stage.data) !== null).length;
          const podiums = toNumber(r.Podio);
          const mediaColocacao = toNumber(r.MediaColocacao);
          dittoCandidates.push({
            player: playerName,
            count: uniqueDecksNormalized.size,
            decks: uniqueDecksOriginal,
            participations: partCount,
            podiums: podiums,
            mediaColocacao: mediaColocacao
          });
        }
      });
      dittoCandidates.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        
        const mediaA = a.mediaColocacao > 0 ? a.mediaColocacao : 999999;
        const mediaB = b.mediaColocacao > 0 ? b.mediaColocacao : 999999;
        if (mediaA !== mediaB) return mediaA - mediaB;
        
        if (b.participations !== a.participations) return b.participations - a.participations;
        return b.podiums - a.podiums;
      });
      const dittoPlayer = dittoCandidates[0];

      // 4. Pokébola Murcha: Maior taxa de derrotas por participação (desempate por assiduidade em Cups/Challenges)
      const murchaCandidates = (appData.Ranking || []).filter(r => r && toNumber(r.Participacoes) > 0).map(r => {
        const playerName = r.Jogador || r.Player || r.Name;
        const ratio = toNumber(r.Derrotas) / toNumber(r.Participacoes);
        const assiduidade = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(playerName, stage.data) !== null).length;
        return {
          player: playerName || 'Desconhecido',
          ratio: ratio,
          defeats: toNumber(r.Derrotas),
          participations: toNumber(r.Participacoes),
          assiduidade: assiduidade
        };
      });
      murchaCandidates.sort((a, b) => {
        if (b.ratio !== a.ratio) return b.ratio - a.ratio;
        return b.assiduidade - a.assiduidade;
      });
      const murchaPlayer = murchaCandidates[0];

      const goldCardHtml = pokebolaDeOuroPlayer ? (() => {
        const wins = toNumber(pokebolaDeOuroPlayer.Vitorias);
        const losses = toNumber(pokebolaDeOuroPlayer.Derrotas);
        const draws = toNumber(pokebolaDeOuroPlayer.Empates);
        const total = wins + losses + draws;
        const winRatePct = total > 0 ? ((wins / total) * 100).toFixed(0) : '0';
        return `
        <div class="glass-card" onclick="window.openAwardModal('gold')" style="flex: 1 1 250px; padding: 1.5rem; display:flex; flex-direction:column; gap:10px; border-radius:var(--radius); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2); cursor: pointer; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-4px)'" onmouseleave="this.style.transform='none'">
          <div style="display:flex; align-items:center; gap:10px; margin-top:-5px;">
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/52.png" style="width:52px; height:52px; object-fit:contain; margin:-8px -4px -8px -8px;" alt="Meowth">
            <div>
              <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700; letter-spacing:1px;">Pokébola de Ouro</div>
              <div style="font-weight:700; color:#fff; font-size:1.1rem; line-height:1.2; margin-top:2px;">${escapeHTML(pokebolaDeOuroPlayer.Jogador)}</div>
            </div>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top: 5px;">
            Melhor desempenho geral calculado por winrate geral, pódios e total de vitórias.
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:auto; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.8rem;">
            <div>Winrate: <strong>${winRatePct}%</strong></div>
            <div>Pódios: <strong>${toNumber(pokebolaDeOuroPlayer.Podio)}</strong></div>
          </div>
          <div style="font-size:0.7rem; color:var(--accent-yellow); text-align:right; margin-top:2px;">Ver classificação e detalhes ➔</div>
        </div>
      `;
      })() : '';

      const gymLeaderCardHtml = liderDeGinasioPlayer ? `
        <div class="glass-card" onclick="window.openAwardModal('gym')" style="flex: 1 1 250px; padding: 1.5rem; display:flex; flex-direction:column; gap:10px; border-radius:var(--radius); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2); cursor: pointer; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-4px)'" onmouseleave="this.style.transform='none'">
          <div style="display:flex; align-items:center; gap:10px; margin-top:-5px;">
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/68.png" style="width:52px; height:52px; object-fit:contain; margin:-8px -4px -8px -8px;" alt="Machamp">
            <div>
              <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700; letter-spacing:1px;">Líder de Ginásio</div>
              <div style="font-weight:700; color:#fff; font-size:1.1rem; line-height:1.2; margin-top:2px;">${escapeHTML(liderDeGinasioPlayer.Jogador)}</div>
            </div>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top: 5px;">
            O treinador mais assíduo nas etapas e torneios da temporada.
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:auto; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.8rem;">
            <div>Presenças: <strong>${toNumber(liderDeGinasioPlayer.Participacoes)} etapas</strong></div>
            <div>Total Pontos: <strong>${toNumber(liderDeGinasioPlayer.Pontos).toFixed(0)} PTS</strong></div>
          </div>
          <div style="font-size:0.7rem; color:var(--accent-yellow); text-align:right; margin-top:2px;">Ver classificação e detalhes ➔</div>
        </div>
      ` : '';

      const dittoCardHtml = dittoPlayer ? `
        <div class="glass-card" onclick="window.openAwardModal('ditto')" style="flex: 1 1 250px; padding: 1.5rem; display:flex; flex-direction:column; gap:10px; border-radius:var(--radius); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2); cursor: pointer; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-4px)'" onmouseleave="this.style.transform='none'">
          <div style="display:flex; align-items:center; gap:10px; margin-top:-5px;">
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png" style="width:52px; height:52px; object-fit:contain; margin:-8px -4px -8px -8px;" alt="Ditto">
            <div>
              <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700; letter-spacing:1px;">Ditto Player</div>
              <div style="font-weight:700; color:#fff; font-size:1.1rem; line-height:1.2; margin-top:2px;">${escapeHTML(dittoPlayer.player)}</div>
            </div>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top: 5px;">
            Mais decks diferentes usados ao longo de toda a temporada.
          </div>
          <div style="margin-top:5px; display:flex; flex-wrap:wrap; gap:4px;">
            ${dittoPlayer.decks.map(d => `<span class="ved-badge" style="${window.getDeckGradientStyle(d)} color:#fff; font-size:0.65rem; padding: 2px 6px; border-radius: 10px; display:inline-block;">${escapeHTML(d)}</span>`).join('')}
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:auto; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.8rem;">
            <div>Variedade: <strong>${dittoPlayer.count} Decks</strong></div>
            <div>Média: <strong>${dittoPlayer.mediaColocacao > 0 ? dittoPlayer.mediaColocacao.toFixed(1) + 'º' : '-'}</strong></div>
          </div>
          <div style="font-size:0.7rem; color:var(--accent-yellow); text-align:right; margin-top:2px;">Ver classificação e detalhes ➔</div>
        </div>
      ` : '';

      const murchaCardHtml = murchaPlayer ? `
        <div class="glass-card" onclick="window.openAwardModal('murcha')" style="flex: 1 1 250px; padding: 1.5rem; display:flex; flex-direction:column; gap:10px; border-radius:var(--radius); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2); cursor: pointer; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-4px)'" onmouseleave="this.style.transform='none'">
          <div style="display:flex; align-items:center; gap:10px; margin-top:-5px;">
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/129.png" style="width:52px; height:52px; object-fit:contain; margin:-8px -4px -8px -8px;" alt="Magikarp">
            <div>
              <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700; letter-spacing:1px;">Pokébola Murcha</div>
              <div style="font-weight:700; color:#fff; font-size:1.1rem; line-height:1.2; margin-top:2px;">${escapeHTML(murchaPlayer.player)}</div>
            </div>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top: 5px;">
            Maior proporção de derrotas por participação na temporada (desempate por assiduidade).
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:auto; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.8rem;">
            <div>Derrotas/Etapa: <strong>${murchaPlayer.ratio.toFixed(2)}</strong></div>
            <div>Derrotas Totais: <strong>${murchaPlayer.defeats} em ${murchaPlayer.participations} et.</strong></div>
          </div>
          <div style="font-size:0.7rem; color:var(--accent-yellow); text-align:right; margin-top:2px;">Ver classificação e detalhes ➔</div>
        </div>
      ` : '';

      awardsHtml = `
        <div class="metagame-awards-section" style="width: 100%; margin-top: 3rem;">
          <h2 class="podium-title" style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px; height:24px;">
              <circle cx="12" cy="8" r="7"></circle>
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
            </svg>
            Premiações Projetadas da Temporada
          </h2>
          
          <div style="display:flex; flex-direction:row; flex-wrap:wrap; gap:1.5rem; width:100%;">
            <!-- Pokébola de Ouro -->
            ${goldCardHtml}
            
            <!-- Líder de Ginásio -->
            ${gymLeaderCardHtml}
            
            <!-- Ditto Player -->
            ${dittoCardHtml}
            
            <!-- Pokébola Murcha -->
            ${murchaCardHtml}
          </div>
        </div>
      `;
    }

    const isExpanded = !!(window.outrosExpandedState && window.outrosExpandedState[selectedSession]);
    const backButtonHtml = `
      <div id="chart-back-btn-${canvasId}" style="display: ${isExpanded ? 'flex' : 'none'}; position: absolute; top: 1.5rem; left: 1.5rem; z-index: 10; align-items: center; gap: 6px; cursor: pointer; color: var(--accent-yellow); font-weight: 600; font-size: 0.82rem; padding: 6px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 20px; backdrop-filter: blur(8px); box-shadow: 0 4px 12px rgba(0,0,0,0.25); transition: all 0.2s ease;" 
        onclick="if (window.outrosExpandedState) window.outrosExpandedState['${selectedSession}'] = false; updateMetagameDisplay();"
        onmouseenter="this.style.background='rgba(255, 255, 255, 0.08)'; this.style.borderColor='rgba(255, 255, 255, 0.15)';" 
        onmouseleave="this.style.background='rgba(255, 255, 255, 0.03)'; this.style.borderColor='rgba(255, 255, 255, 0.08)';">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Voltar
      </div>
    `;

    const htmlContent = `
      <div style="display:flex; flex-direction:column; align-items:center; width: 100%;">
        <div class="glass-card" style="width: 100%; padding: 2rem; border-radius: var(--radius); display:flex; flex-direction:row; flex-wrap: wrap; justify-content:center; align-items:center; gap: ${isBar ? '0' : '4rem'}; position:relative; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);">
          
          ${backButtonHtml}

          <div style="flex: ${chartColumnFlex}; width: 100%; max-width: ${chartColumnWidth}; display:flex; flex-direction:column; gap:1.5rem; align-items: center; justify-content: center;">
            ${chartType === 'doughnut' ? `
            <div style="position:relative; width:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;">
              <div style="position:relative; width:100%; aspect-ratio: 1; display:flex; align-items:center; justify-content:center;">
                <canvas id="${canvasId}" style="position:relative; z-index:1;"></canvas>
                <!-- Center Name Info -->
                <div id="chart-center-text-${canvasId}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; pointer-events:none; z-index:2; width: 100%; transition:opacity 0.3s;">
                   <div id="chart-center-name-${canvasId}" style="display:inline-block; font-weight: 500; font-size: 0.85rem; line-height: 1.2; color: rgba(255,255,255,0.7); background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); padding: 8px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                      Toque numa<br>fatia
                   </div>
                </div>
              </div>
              <div id="chart-drilldown-note-${canvasId}" style="position:absolute; bottom: -0.8rem; left: 50%; transform: translateX(-50%); font-size: 0.72rem; color: rgba(255, 255, 255, 0.45); font-style: italic; white-space: nowrap; pointer-events: none; z-index: 10; display: block;">
                ${isExpanded ? "Visão da fatia 'Outros' expandida." : "Clique em outros decks para expandir a lista."}
              </div>
            </div>
            ` : accordionHtml}
          </div>
          
          <div style="flex: 1 1 350px; width: 100%; max-width: 400px;">
            ${carouselHtml}
          </div>

        </div>
        ${awardsHtml}
      </div>
    `;
    
    const existingCanvas = document.getElementById(canvasId);
    const isCurrentlyBar = existingCanvas ? (window[chartVarName] && window[chartVarName].config.type === 'bar') : false;
    const isCurrentlyDoughnut = existingCanvas ? (window[chartVarName] && window[chartVarName].config.type === 'doughnut') : false;
    
    const needsHtmlReset = !existingCanvas || 
                           (chartType === 'bar' && !isCurrentlyBar) || 
                           (chartType === 'doughnut' && !isCurrentlyDoughnut);

    if (needsHtmlReset) {
      if (window[chartVarName]) {
        window[chartVarName].destroy();
        window[chartVarName] = null;
      }
      targetContainer.innerHTML = htmlContent;
    } else {
      // PRESERVE DOM AND UPDATE DATA FOR A BEAUTIFUL SMOOTH MORPH TRANSITION!
      if (window[chartVarName]) {
        const chart = window[chartVarName];
        chart._chartDecks = chartDecks;
        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        
        if (chart.config.type === 'doughnut') {
          const firstLabel = labels[0];
          const isOutros = firstLabel ? (firstLabel.toLowerCase() === 'outros' || firstLabel.toLowerCase() === 'outros decks') : false;
          const isVisaoGeral = firstLabel === 'Voltar para visão geral';
          if (!isOutros && !isVisaoGeral && data.length > 0) {
            chart._selectedIndex = 0;
            chart._selectedLabel = firstLabel;
            chart._preventHoverLoop = true;
            chart.setActiveElements([{ datasetIndex: 0, index: 0 }]);
            chart._preventHoverLoop = false;
            
            if (window.focusCarouselDeck) {
              window.focusCarouselDeck(canvasId, firstLabel, chart);
            }
          } else {
            chart._selectedIndex = null;
            chart._selectedLabel = null;
            chart._preventHoverLoop = true;
            chart.setActiveElements([]);
            chart._preventHoverLoop = false;
            if (window.focusCarouselDeck) {
              window.focusCarouselDeck(canvasId, null, chart);
            }
          }
        }
        
        chart.update();
        
        // Update back button visibility dynamically if HTML is not reset
        const backBtnEl = document.getElementById(`chart-back-btn-${canvasId}`);
        if (backBtnEl) {
          backBtnEl.style.display = isExpanded ? 'flex' : 'none';
          backBtnEl.onclick = () => {
            if (window.outrosExpandedState) window.outrosExpandedState[selectedSession] = false;
            updateMetagameDisplay();
          };
        }
        
        // Update drilldown note dynamically
        const drilldownNoteEl = document.getElementById(`chart-drilldown-note-${canvasId}`);
        if (drilldownNoteEl) {
          drilldownNoteEl.style.display = 'block';
          drilldownNoteEl.innerText = isExpanded ? "Visão da fatia 'Outros' expandida." : "Clique em outros decks para expandir a lista.";
        }
        
        if (decksWithImages.length > 0) {
          setTimeout(() => window.initCarousel(canvasId), 50);
        }
        return; // stop execution here, do not create a new chart!
      }
    }
    
    const ctx = document.getElementById(canvasId);
    if (ctx && chartType === 'doughnut') {
      if (window.Chart) {
        const energyHexColors = {
          grass: '#78C850', fire: '#FF4216', water: '#1593F5', lightning: '#EBC816', 
          psychic: '#D94293', fighting: '#C55E13', darkness: '#0c4a6e', metal: '#7E8E9E', 
          dragon: '#8D56FF', colorless: '#e2e8f0'
        };
        const chartCtx = ctx.getContext('2d');
        if (!window.chartIconCache) window.chartIconCache = {};
        
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        Chart.defaults.color = isLight ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.7)';
        Chart.defaults.font.family = "'Exo 2', sans-serif";
        const sliceLabelsPlugin = {
          id: 'sliceLabels',
          afterDraw(chart, args, options) {
            const drawCtx = chart.ctx;
            const meta = chart.getDatasetMeta(0);
            
            meta.data.forEach((element, index) => {
              const val = chart.data.datasets[0].data[index];
              const deckObj = (chart._chartDecks || chartDecks)[index];
              const realCount = deckObj ? (deckObj.realCount !== undefined ? deckObj.realCount : deckObj.count) : val;
              const percentNum = Math.round((realCount / totalDecksCount) * 100);
              
              if (val < 1) return;
              
              const percent = percentNum + '%';
              const name = chart.data.labels[index];
              const deckData = (chart._chartDecks || chartDecks).find(d => d.deck === name);
              
              const angle = (element.startAngle + element.endAngle) / 2;
              const x0 = element.x;
              const y0 = element.y;
              const outerRadius = element.outerRadius;
              const innerRadius = outerRadius * 0.50; 
              const midRadius = (innerRadius + outerRadius) / 2;
              
              const isOutros = name ? (name.toLowerCase() === 'outros' || name.toLowerCase() === 'outros decks') : false;
              const isVisaoGeral = name === 'Voltar para visão geral';

              // Removed the percentNum >= 4 constraint to allow drawing icons for 1-player/2% decks in expanded drilldown view
              if (!isOutros && !isVisaoGeral && deckData && deckData.icone) {
                // Adjust stagger radius and reduce icon size from 42px to 30px to prevent clipping
                const offset = index % 3 === 0 ? 20 : index % 3 === 1 ? 36 : 52;
                const R = outerRadius + offset;
                const drawX = x0 + Math.cos(angle) * R;
                const drawY = y0 + Math.sin(angle) * R;
                
                drawCtx.save();

                drawCtx.beginPath();
                drawCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                drawCtx.lineWidth = 1;
                const startX = x0 + Math.cos(angle) * outerRadius;
                const startY = y0 + Math.sin(angle) * outerRadius;
                // Connector line stops just outside the icon (icon radius is 15px)
                const endX = x0 + Math.cos(angle) * (R - 16);
                const endY = y0 + Math.sin(angle) * (R - 16);
                drawCtx.moveTo(startX, startY);
                drawCtx.lineTo(endX, endY);
                drawCtx.stroke();
                drawCtx.restore();

                if (!window.chartIconCache[name]) {
                  const img = new Image();
                  img.src = safeExternalUrl(deckData.icone);
                  img.onload = () => chart.update();
                  window.chartIconCache[name] = img;
                } else if (window.chartIconCache[name].complete && window.chartIconCache[name].naturalWidth > 0) {
                  const img = window.chartIconCache[name];
                  const iconSize = 30; 
                  drawCtx.save();
                  drawCtx.drawImage(img, drawX - (iconSize/2), drawY - (iconSize/2), iconSize, iconSize);
                  drawCtx.restore();
                }
              }

              const insideX = x0 + Math.cos(angle) * midRadius;
              const insideY = y0 + Math.sin(angle) * midRadius;
              
              drawCtx.save();
              drawCtx.translate(insideX, insideY);

              let textAngle = angle;
              // Normalize angle to [0, 2*PI) to accurately flip text on the left side of the circle
              let norm = textAngle % (2 * Math.PI);
              if (norm < 0) norm += 2 * Math.PI;
              if (norm > Math.PI / 2 && norm < 3 * Math.PI / 2) {
                textAngle += Math.PI;
              }
              drawCtx.rotate(textAngle);
              
              drawCtx.shadowColor = 'rgba(0, 0, 0, 0.95)';
              drawCtx.shadowBlur = 4;
              drawCtx.fillStyle = '#ffffff';
              drawCtx.textAlign = 'center';
              drawCtx.textBaseline = 'middle';
              
              if (isOutros) {
                drawCtx.font = "bold 8.5px 'Exo 2', sans-serif";
                drawCtx.fillText("Outros Decks", 0, -6);
                drawCtx.font = "700 10px 'Exo 2', sans-serif";
                drawCtx.fillText(percent, 0, 6);
              } else if (isVisaoGeral) {
                drawCtx.font = "bold 8px 'Exo 2', sans-serif";
                drawCtx.fillText("Voltar para", 0, -6);
                drawCtx.fillText("visão geral", 0, 4);
              } else {
                if (percentNum <= 3) {
                  drawCtx.font = "700 9px 'Exo 2', sans-serif";
                } else {
                  drawCtx.font = "700 11px 'Exo 2', sans-serif";
                }
                drawCtx.fillText(percent, 0, 0);
              }
              
              drawCtx.restore();
            });
          }
        };

        const chartType = 'doughnut';
        
        if (chartType === 'bar') {
          const centerWrap = document.getElementById('chart-center-text-' + canvasId);
          if (centerWrap) centerWrap.style.display = 'none';
        }

        window[chartVarName] = new Chart(ctx, {
          type: chartType,
          data: { 
            labels: labels, 
            datasets: [{ 
              data: data, 
              borderRadius: chartType === 'bar' ? 6 : 0,
              backgroundColor: function(context) {
                const chart = context.chart;
                const {ctx, chartArea} = chart;
                if (!chartArea) return '#475569';
                
                const deckName = chart.data.labels[context.dataIndex];
                
                if (deckName === 'Voltar para visão geral') {
                  const centerX = (chartArea.left + chartArea.right) / 2;
                  const centerY = (chartArea.top + chartArea.bottom) / 2;
                  const outerRadius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;
                  const innerRadius = outerRadius * 0.50; 
                  const gradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
                  gradient.addColorStop(0, 'rgba(239, 68, 68, 0.45)');
                  gradient.addColorStop(1, 'rgba(239, 68, 68, 0.18)');
                  return gradient;
                }
                
                const energyStr = getDeckEnergy(deckName);
                if (!energyStr) return 'rgba(255, 255, 255, 0.2)';
                
                const parts = energyStr.toLowerCase().split('+').map(p => p.trim());
                const hex1 = window.energyHexColors[parts[0]] || '#94a3b8';
                const opacity = 'a0'; 
                
                if (parts.length > 1 && window.energyHexColors[parts[1]]) {
                  const hex2 = window.energyHexColors[parts[1]];
                  let gradient;
                  if (chartType === 'bar') {
                    gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                  } else {
                    const centerX = (chartArea.left + chartArea.right) / 2;
                    const centerY = (chartArea.top + chartArea.bottom) / 2;
                    const outerRadius = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;
                    const innerRadius = outerRadius * 0.50; 
                    gradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
                  }
                  
                  gradient.addColorStop(0, hex1 + opacity);
                  gradient.addColorStop(1, hex2 + opacity);
                  return gradient;
                } else {
                  return hex1 + opacity;
                }
              }, 
              borderColor: 'rgba(255,255,255,0.3)', 
              borderWidth: 1.5, 
              hoverOffset: 10 
            }] 
          },
          options: chartType === 'bar' ? {
            responsive: true, 
            maintainAspectRatio: true, 
            layout: { padding: 10 },
            onHover: (event, activeElements, chart) => {
              if (activeElements && activeElements.length > 0) {
                const dataIndex = activeElements[0].index;
                const label = chart.data.labels[dataIndex];
                if (chart._lastHoveredLabel !== label) {
                  chart._lastHoveredLabel = label;
                  if (window.syncCarouselToDeck) {
                    window.syncCarouselToDeck(chart.canvas.id, label);
                  }
                }
              } else {
                chart._lastHoveredLabel = null;
              }
            },
            scales: {
              y: { display: false },
              x: {
                grid: { display: false },
                ticks: { color: isLight ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)', font: { size: 10 } }
              }
            },
            plugins: { 
              legend: { display: false }, 
              tooltip: { 
                enabled: true,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleFont: { size: 14, family: "'Exo 2', sans-serif" },
                bodyFont: { size: 13, family: "'Exo 2', sans-serif" },
                padding: 12,
                cornerRadius: 8,
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                callbacks: {
                  label: function(context) {
                    const val = context.raw;
                    const pct = Math.round((val / totalDecksCount) * 100);
                    return ` ${pct}%`;
                  }
                }
              } 
            }
          } : { 
            responsive: true, 
            maintainAspectRatio: true, 
            layout: { padding: 65 }, // Reduced from 110 to restore larger chart size
            onHover: (event, activeElements, chart) => {
              if (chart._preventHoverLoop) return;
              
              if (activeElements && activeElements.length > 0) {
                const dataIndex = activeElements[0].index;
                const label = chart.data.labels[dataIndex];
                if (chart._lastHoveredLabel !== label) {
                  chart._lastHoveredLabel = label;
                  if (window.focusCarouselDeck) {
                    window.focusCarouselDeck(chart.canvas.id, label, chart);
                  }
                  if (window.syncCarouselToDeck) {
                    window.syncCarouselToDeck(chart.canvas.id, label);
                  }
                }
              } else {
                if (chart._lastHoveredLabel !== null) {
                  chart._lastHoveredLabel = null;
                  
                  // Revert to selected label if exists, else default text
                  if (chart._selectedLabel) {
                    if (window.focusCarouselDeck) {
                      window.focusCarouselDeck(chart.canvas.id, chart._selectedLabel, chart);
                    }
                    chart._preventHoverLoop = true;
                    chart.setActiveElements([{ datasetIndex: 0, index: chart._selectedIndex }]);
                    chart.update();
                    chart._preventHoverLoop = false;
                  } else {
                    if (window.focusCarouselDeck) {
                      window.focusCarouselDeck(chart.canvas.id, null, chart);
                    }
                  }
                }
              }
            },
            onClick: (event, activeElements, chart) => {
              const selector = document.getElementById('metagame-season-selector');
              const selectedSession = selector ? selector.value : 'all';

              if (activeElements && activeElements.length > 0) {
                const dataIndex = activeElements[0].index;
                const label = chart.data.labels[dataIndex];
                
                if (label === 'Outros Decks' || (label && label.toLowerCase() === 'outros')) {
                  if (!window.outrosExpandedState) window.outrosExpandedState = {};
                  window.outrosExpandedState[selectedSession] = true;
                  updateMetagameDisplay();
                  return;
                } else if (label === 'Voltar para visão geral') {
                  if (window.outrosExpandedState) window.outrosExpandedState[selectedSession] = false;
                  updateMetagameDisplay();
                  return;
                }
                
                // Set selected state
                chart._selectedIndex = dataIndex;
                chart._selectedLabel = label;
                
                chart._preventHoverLoop = true;
                chart.setActiveElements([{ datasetIndex: 0, index: dataIndex }]);
                chart.update();
                chart._preventHoverLoop = false;
                
                if (window.syncCarouselToDeck) {
                  window.syncCarouselToDeck(chart.canvas.id, label);
                }
                if (window.focusCarouselDeck) {
                  window.focusCarouselDeck(chart.canvas.id, label, chart);
                }
              } else {
                // Clear selection
                chart._selectedIndex = null;
                chart._selectedLabel = null;
                
                chart._preventHoverLoop = true;
                chart.setActiveElements([]);
                chart.update();
                chart._preventHoverLoop = false;
                
                if (window.focusCarouselDeck) {
                  window.focusCarouselDeck(chart.canvas.id, null, chart);
                }
              }
            },
            plugins: { 
              legend: { display: false }, 
              tooltip: { enabled: false } 
            }, 
            cutout: '50%' 
          },
          plugins: [sliceLabelsPlugin]
        });
        
        if (chartType === 'doughnut' && data.length > 0) {
          const firstLabel = labels[0];
          const isOutros = firstLabel ? (firstLabel.toLowerCase() === 'outros' || firstLabel.toLowerCase() === 'outros decks') : false;
          if (!isOutros && firstLabel) {
            window[chartVarName]._selectedIndex = 0;
            window[chartVarName]._selectedLabel = firstLabel;
            window[chartVarName]._preventHoverLoop = true;
            window[chartVarName].setActiveElements([{ datasetIndex: 0, index: 0 }]);
            window[chartVarName].update();
            window[chartVarName]._preventHoverLoop = false;
            
            if (window.focusCarouselDeck) {
              window.focusCarouselDeck(canvasId, firstLabel, window[chartVarName]);
            }
          }
        }
      }
    }

    if (decksWithImages.length > 0) {
      setTimeout(() => window.initCarousel(canvasId), 50);
    }
  };

  renderToContainer(homeContent, 'metagameChartCanvas_home', 'metagameChartHome', true);
  renderToContainer(pageContent, 'metagameChartCanvas_page', 'metagameChartPage', false);
}

window.initCarousel = function(id) {
  const stage = document.getElementById('stage-' + id);
  if(!stage) return;
  const items = Array.from(stage.querySelectorAll('.carousel-3d-item'));
  if(items.length === 0) return;
  
  if(!window.carousels) window.carousels = {};
  window.carousels[id] = { index: 0, items: items, length: items.length };
  
  window.updateCarousel(id);
  
  if(!window.carouselIntervals) window.carouselIntervals = {};
  if(window.carouselIntervals[id]) clearInterval(window.carouselIntervals[id]);

  window.carouselIntervals[id] = setInterval(() => window.moveCarousel(id, 1), 4000);
  
  const container = document.getElementById('carousel-' + id);
  container.addEventListener('mouseenter', () => clearInterval(window.carouselIntervals[id]));
  container.addEventListener('mouseleave', () => {
    window.carouselIntervals[id] = setInterval(() => window.moveCarousel(id, 1), 4000);
  });
};

window.moveCarousel = function(id, dir) {
  const c = window.carousels[id];
  if(!c) return;
  c.index = (c.index + dir + c.length) % c.length;
  window.updateCarousel(id);
};

window.updateCarousel = function(id) {
  const c = window.carousels[id];
  if(!c) return;
  
  c.items.forEach((item, i) => {
    item.classList.remove('active');
    
    let diff = i - c.index;
    if (diff > Math.floor(c.length / 2)) diff -= c.length;
    if (diff < -Math.floor(c.length / 2)) diff += c.length;
    
    if (diff === 0) {
      item.style.transform = `translateX(0) translateZ(0) scale(1)`;
      item.style.opacity = '1';
      item.classList.add('active');
    } else {
      const direction = diff > 0 ? 1 : -1;
      const offset = Math.abs(diff);
      const rotate = 42 * direction;
      const translateX = (100 * direction) + (20 * diff);
      const translateZ = -110 - (offset * 35);
      
      item.style.transform = `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${-rotate}deg)`;
      item.style.opacity = offset > 2 ? '0' : String(1 - (offset * 0.25));
    }
  });

  // Highlight/select corresponding slice on chart if not currently hovered
  const activeItem = c.items[c.index];
  if (activeItem) {
    const deckName = activeItem.getAttribute('data-deck');
    if (deckName) {
      const chartVarName = id === 'metagameChartCanvas_home' ? 'metagameChartHome' : 'metagameChartPage';
      const chart = window[chartVarName];
      if (chart && (!chart._lastHoveredLabel)) {
        const dataIndex = chart.data.labels.findIndex(l => l && l.toLowerCase() === deckName.toLowerCase());
        if (dataIndex !== -1 && chart._selectedIndex !== dataIndex) {
          chart._selectedIndex = dataIndex;
          chart._selectedLabel = chart.data.labels[dataIndex];
          
          chart._preventHoverLoop = true;
          chart.setActiveElements([{ datasetIndex: 0, index: dataIndex }]);
          chart.update();
          chart._preventHoverLoop = false;
          
          if (window.focusCarouselDeck) {
            window.focusCarouselDeck(id, chart._selectedLabel, chart);
          }
        }
      }
    }
  }
};

window.syncCarouselToDeck = function(id, deckName) {
  const c = window.carousels[id];
  if (!c || !c.items) return;
  const targetIndex = c.items.findIndex(item => {
    const dAttr = item.getAttribute('data-deck');
    return dAttr && dAttr.toLowerCase() === deckName.toLowerCase();
  });
  if (targetIndex !== -1 && targetIndex !== c.index) {
    c.index = targetIndex;
    window.updateCarousel(id);
  }
};
 
window.focusCarouselDeck = function(id, deckName, chartObj = null) {
  const centerTextWrap = document.getElementById('chart-center-text-' + id);
  const centerName = document.getElementById('chart-center-name-' + id);
  
  if (!deckName) {
    if (centerName) {
      centerName.innerHTML = "Toque numa<br>fatia";
      centerName.style.cssText = "display:inline-block; font-weight: 500; font-size: 0.85rem; line-height: 1.2; color: rgba(255,255,255,0.7); background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); padding: 8px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 12px rgba(0,0,0,0.5);";
    }
    return;
  }

  if (centerTextWrap && centerName) {
    centerName.innerHTML = escapeHTML(deckName);
    
    const bgStyle = window.getDeckGradientStyle ? window.getDeckGradientStyle(deckName) : 'background: rgba(15, 23, 42, 0.7);';
    
    centerName.style.cssText = `
      display: inline-block;
      font-weight: 700; 
      font-size: 0.9rem; 
      line-height: 1.2; 
      color: #ffffff;
      ${bgStyle}
      backdrop-filter: blur(4px);
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.15);
      box-shadow: 0 4px 15px rgba(0,0,0,0.6);
      text-shadow: 0 1px 3px rgba(0,0,0,0.6);
    `;
    
    centerTextWrap.style.opacity = '1';
  }
};

function toggleHistoryCollapse() {
  const content = document.getElementById('historical-collapse-content');
  const btn = document.getElementById('historical-collapse-btn');
  if (content && btn) {
    content.classList.toggle('expanded');
    btn.classList.toggle('expanded');
  }
}

