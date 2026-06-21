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
      
      // CORREÇÃO 1: Sincroniza a configuração global para as funções de renderização não congelarem a tabela
      if (window.CONFIG) {
        window.CONFIG.dataSource = dataSource;
      }

      const rankingTabName = "Ranking";
      const historicalScoresTab = window.CONFIG && window.CONFIG.historicalScoresTab ? window.CONFIG.historicalScoresTab : "ScoresAntigos";

      let rankingPromise;
      let stagesPromise;
      if (dataSource === "github" && githubSources.Ranking) {
        rankingPromise = (async () => {
          try {
            // CORREÇÃO 2: Cache-buster (Time) para sempre pegar a última versão do TDF atualizado
            const res = await fetch(`${githubSources.Ranking}?v=${new Date().getTime()}`);
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
