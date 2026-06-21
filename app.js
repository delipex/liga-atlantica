
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
        if (param === "fonteranking" && !sourceParam) {
          dataSource = val.toLowerCase() === "tdf" ? "github" : "sheets";
        }
        if (param === "statuspodio") {
          appData.Configuracoes.StatusPodio = val.toLowerCase();
        }
      });

      const rankingTabName = "Ranking";
      const historicalScoresTab = window.CONFIG && window.CONFIG.historicalScoresTab ? window.CONFIG.historicalScoresTab : "ScoresAntigos";

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

function renderDashboard() {
  const podiumContainer = document.getElementById('podium-cards-container');
  const eventContainer = document.getElementById('event-widget-content');

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

function renderRankingTable(players, page = 1) {
  currentRankingPage = page;
  filteredRankingList = players;
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
  if (!timeline) return;

  const events = appData.Calendario;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

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
  img.src = photo.URL_Imagem;
  caption.innerText = `${photo.Titulo} - ${photo.Descricao || ''}`;
  
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
      player = appData.Ranking.find(p => p.Jogador.trim().toLowerCase() === listPlayer.Jogador.trim().toLowerCase());
    }
  } else {
    player = appData.Ranking.find(p => p.Jogador.trim().toLowerCase() === String(playerRef).trim().toLowerCase());
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
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const value = e.target.value.toLowerCase().trim();
      
      const filtered = currentRankingList.filter(player => {
        const nameMatch = player.Jogador && player.Jogador.toLowerCase().includes(value);
        const deckMatch = player.Deck && player.Deck.toLowerCase().includes(value);
        return nameMatch || deckMatch;
      });
      
      renderRankingTable(filtered, 1);
    });
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
        renderRankingTable(normalized, 1);

        if (searchInput) searchInput.value = '';

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
  
  const chartType = window.currentMetagameChartType || 'doughnut';
  
  if (!window.outrosExpandedState) window.outrosExpandedState = {};
  
  let chartDecks = [];
  let accordionDecks = sortedDecks; // Accordion always shows all
  
  // Doughnut Grouping logic
  if (chartType === 'doughnut') {
    let outrosCount = 0;
    const isExpanded = window.outrosExpandedState[selectedSession];
    
    if (isExpanded) {
      // DRILL-DOWN MODE: Show ONLY decks with count === 1 or named 'Outros'
      sortedDecks.forEach(d => {
        const isOutros = d.deck.toLowerCase() === 'outros' || d.deck.toLowerCase() === 'outros decks';
        if (d.count === 1 || isOutros) {
          chartDecks.push(d);
        }
      });
    } else {
      // MAIN MODE: Group count === 1 and 'Outros' into "Outros"
      sortedDecks.forEach(d => {
        const isOutros = d.deck.toLowerCase() === 'outros' || d.deck.toLowerCase() === 'outros decks';
        if (d.count === 1 || isOutros) {
          outrosCount += d.count;
        } else {
          chartDecks.push(d);
        }
      });
      
      if (outrosCount > 0) {
        chartDecks.push({
          deck: 'Outros',
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
      const deckInfo = sortedDecks[dataIndex];
      
      let innerHtml = '';
      if (deckInfo.image) {
        innerHtml += `<img src="${safeExternalUrl(deckInfo.image)}" style="width: 100px; height: 140px; object-fit: cover; border-radius: 4px; margin-bottom: 5px;">`;
      }
      innerHtml += `<div style="font-weight: bold; text-align: center;">${escapeHTML(deckInfo.deck)}</div>`;
      innerHtml += `<div style="text-align: center; color: var(--text-secondary); font-size: 0.9rem;">${deckInfo.count} jogador(es)</div>`;
      
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
      targetContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Crie as abas "Metagame" e "Decks" na planilha para ver as estatísticas!</div>';
      return;
    }
    if (sessions.length === 0) {
      targetContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Adicione colunas de sessões na aba Metagame.</div>';
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
        <a href="${d.limitless}" target="_blank" rel="noopener noreferrer" class="carousel-3d-item" data-index="${i}" data-deck="${escapeHTML(d.deck)}" title="Ver ${escapeHTML(d.deck)} no Limitless">
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


    const chartType = window.currentMetagameChartType || 'doughnut';
    
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

    const backButtonHtml = (chartType === 'doughnut' && window.outrosExpandedState && window.outrosExpandedState[selectedSession])
      ? `<div onclick="window.outrosExpandedState['${selectedSession}'] = false; updateMetagameDisplay();" style="cursor:pointer; color:var(--accent-yellow); font-weight:bold; margin-bottom: 0.5rem; text-align:center; font-size: 1rem; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); transition: background 0.2s;">&#8592; Voltar para o gráfico inteiro</div>`
      : '';

    const htmlContent = `
      <div style="display:flex; flex-direction:column; align-items:center; width: 100%;">
        <div class="glass-card" style="width: 100%; padding: 2rem; border-radius: var(--radius); display:flex; flex-direction:row; flex-wrap: wrap; justify-content:center; align-items:center; gap: ${isBar ? '0' : '4rem'}; position:relative; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);">
          
          <div style="flex: ${chartColumnFlex}; width: 100%; max-width: ${chartColumnWidth}; display:flex; flex-direction:column; gap:1.5rem; align-items: center; justify-content: center;">
            ${chartType === 'doughnut' ? `
            <div style="position:relative; width:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;">
              ${backButtonHtml}
              <div style="position:relative; width:100%; aspect-ratio: 1; display:flex; align-items:center; justify-content:center;">
                <canvas id="${canvasId}" style="position:relative; z-index:1;"></canvas>
                <!-- Center Name Info -->
                <div id="chart-center-text-${canvasId}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; pointer-events:none; z-index:2; width: 100%; transition:opacity 0.3s;">
                   <div id="chart-center-name-${canvasId}" style="display:inline-block; font-weight: 500; font-size: 0.85rem; line-height: 1.2; color: rgba(255,255,255,0.7); background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); padding: 8px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                      Toque numa<br>fatia
                   </div>
                </div>
              </div>
            </div>
            ` : accordionHtml}
            ${toggleHtml}
          </div>
          
          ${isBar ? '' : `
          <div style="flex: 1 1 350px; width: 100%; max-width: 400px;">
            ${carouselHtml}
          </div>
          `}

        </div>
      </div>
    `;
    
    if (window[chartVarName]) {
      window[chartVarName].destroy();
      window[chartVarName] = null;
    }
    
    targetContainer.innerHTML = htmlContent;
    
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
        Chart.defaults.font.family = '"Inter", sans-serif';
        const sliceLabelsPlugin = {
          id: 'sliceLabels',
          afterDraw(chart, args, options) {
            const drawCtx = chart.ctx;
            const meta = chart.getDatasetMeta(0);
            const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
            
            meta.data.forEach((element, index) => {
              const val = chart.data.datasets[0].data[index];
              const percentNum = Math.round((val / total) * 100);
              
              if (val < 1) return;
              
              const percent = percentNum + '%';
              const name = chart.data.labels[index];
              const deckData = chartDecks.find(d => d.deck === name);
              
              const angle = (element.startAngle + element.endAngle) / 2;
              const x0 = element.x;
              const y0 = element.y;
              const outerRadius = element.outerRadius;
              const innerRadius = outerRadius * 0.50; 
              const midRadius = (innerRadius + outerRadius) / 2;
              
              const isOutros = name.toLowerCase() === 'outros' || name.toLowerCase() === 'outros decks';

              if (!isOutros && deckData && deckData.icone && percentNum >= 4) {

                const R = outerRadius + (index % 3 === 0 ? 22 : index % 3 === 1 ? 46 : 70);
                const drawX = x0 + Math.cos(angle) * R;
                const drawY = y0 + Math.sin(angle) * R;
                
                drawCtx.save();

                drawCtx.beginPath();
                drawCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                drawCtx.lineWidth = 1;
                const startX = x0 + Math.cos(angle) * outerRadius;
                const startY = y0 + Math.sin(angle) * outerRadius;
                const endX = x0 + Math.cos(angle) * (R - 22);
                const endY = y0 + Math.sin(angle) * (R - 22);
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
                  const iconSize = 42; 
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
              let normalizedAngle = textAngle % (2 * Math.PI);
              if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
              if (normalizedAngle > Math.PI / 2 && normalizedAngle < 1.5 * Math.PI) {
                textAngle += Math.PI;
              }
              drawCtx.rotate(textAngle);
              
              drawCtx.shadowColor = 'rgba(0, 0, 0, 0.95)';
              drawCtx.shadowBlur = 4;
              drawCtx.fillStyle = '#ffffff';
              drawCtx.textAlign = 'center';
              drawCtx.textBaseline = 'middle';
              
              if (isOutros) {

                drawCtx.font = "bold 8.5px 'Inter', sans-serif";
                drawCtx.fillText("Outros", 0, -6);
                drawCtx.font = '800 10px "Inter", sans-serif';
                drawCtx.fillText(percent, 0, 6);
              } else {

                if (percentNum <= 3) {
                  drawCtx.font = '800 9px "Inter", sans-serif';
                } else {
                  drawCtx.font = '800 11px "Inter", sans-serif';
                }
                drawCtx.fillText(percent, 0, 0);
              }
              
              drawCtx.restore();
            });
          }
        };

        const chartType = window.currentMetagameChartType || 'doughnut';
        
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
                titleFont: { size: 14, family: "'Inter', sans-serif" },
                bodyFont: { size: 13, family: "'Inter', sans-serif" },
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
            layout: { padding: { top: 110, bottom: 110, left: 110, right: 110 } },
            onHover: (event, activeElements, chart) => {
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
                  if (window.focusCarouselDeck) {
                    window.focusCarouselDeck(chart.canvas.id, null, chart);
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
                
                if (label === 'Outros Decks' || label.toLowerCase() === 'outros') {
                  if (!window.outrosExpandedState) window.outrosExpandedState = {};
                  window.outrosExpandedState[selectedSession] = true;
                  updateMetagameDisplay();
                  return;
                } else if (window.outrosExpandedState && window.outrosExpandedState[selectedSession]) {
                  window.outrosExpandedState[selectedSession] = false;
                  updateMetagameDisplay();
                  return;
                }
                
                if (window.syncCarouselToDeck) {
                  window.syncCarouselToDeck(chart.canvas.id, label);
                }
              } else {
                if (window.outrosExpandedState && window.outrosExpandedState[selectedSession]) {
                  window.outrosExpandedState[selectedSession] = false;
                  updateMetagameDisplay();
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
      font-weight: 800; 
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


