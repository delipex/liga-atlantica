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
  const deckInfo = appData.Decks.find(d => (d.Deck || d.deck || '').trim().toLowerCase() === dName);
  return deckInfo ? (deckInfo.TipoEnergia || deckInfo.tipoEnergia || '') : '';
}

function getEnergyDotHTML(value) {
  const allowed = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'dragon', 'colorless'];
  const rawValue = String(value || 'colorless').toLowerCase().trim();
  
  if (rawValue === 'multi' || rawValue === 'rainbow') {
    return `<span class="energy-dot multi" title="Multi-energia"></span>`;
  }

  const parts = rawValue.split('+').map(p => p.trim());
  
  if (parts.length > 1) {
    const c1 = allowed.includes(parts[0]) ? parts[0] : (parts[0] === 'electric' ? 'lightning' : 'colorless');
    const c2 = allowed.includes(parts[1]) ? parts[1] : (parts[1] === 'electric' ? 'lightning' : 'colorless');
    return `<span class="energy-dot" style="background: linear-gradient(135deg, var(--energy-${c1}) 50%, var(--energy-${c2}) 50%); box-shadow: -2px 0 6px var(--energy-${c1}), 2px 0 6px var(--energy-${c2}); border-color: rgba(255,255,255,0.4);"></span>`;
  }
  
  const normalized = allowed.includes(rawValue) ? rawValue : (rawValue === 'electric' ? 'lightning' : 'colorless');
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
  const ignore = ['id', 'jogador', 'player', 'nome', 'posicaofinal', 'deck', 'pontos', 'categoria', 'pos', 'standing', 'vitorias', 'empates', 'derrotas', 'v', 'e', 'd', 'podio', 'mediacolocacao', 'participacoes', 'historico', 'historicocolocacoes', 'popid', 'playid'];
  const keys = Object.keys(row).filter(k => !ignore.includes(k.toLowerCase().trim()));
  for (let i = keys.length - 1; i >= 0; i--) {
    const val = row[keys[i]];
    if (val && typeof val === 'string' && val.trim() !== '' && isNaN(Number(val.trim()))) {
      return val.trim();
    }
  }
  return null;
}

function getLatestDeckForPlayer(playerName, playerId = '') {
  const cleanId = String(playerId || '').trim();
  let officialName = playerName;

  if (cleanId && appData.Jogadores && appData.Jogadores.length > 0) {
    const dbP = appData.Jogadores.find(j => {
      const jId = String(j.ID || j.id || j.POPID || j['Player ID'] || j['Play! ID'] || '').trim();
      return jId && jId === cleanId;
    });
    if (dbP && (dbP.Jogador || dbP.jogador || dbP.Name)) {
      officialName = dbP.Jogador || dbP.jogador || dbP.Name;
    }
  }

  // 1. Busca no Metagame pelas etapas mais recentes (ordem cronológica decrescente)
  const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
  const reverseStages = [...cleanStages].sort((a, b) => b.data.localeCompare(a.data));

  for (const stg of reverseStages) {
    const dName = getDeckForStage(officialName, stg.data, cleanId);
    if (dName && dName.trim() !== '' && dName !== 'Sem deck registrado' && dName !== 'Não registrado' && isNaN(Number(dName))) {
      return dName.trim();
    }
  }

  // 2. Se RawMetagame estiver disponível, busca em ordem reversa de chaves de data
  if (appData.RawMetagame && typeof appData.RawMetagame === 'object') {
    const dates = Object.keys(appData.RawMetagame).sort().reverse();
    const normOfficial = normalizePlayerName(officialName);
    const normPlayer = normalizePlayerName(playerName);

    for (const d of dates) {
      const sess = appData.RawMetagame[d];
      if (sess && sess.decks) {
        if (sess.decks[officialName] && isNaN(Number(sess.decks[officialName]))) return sess.decks[officialName];
        if (sess.decks[playerName] && isNaN(Number(sess.decks[playerName]))) return sess.decks[playerName];
        for (const [pName, deckVal] of Object.entries(sess.decks)) {
          const pNorm = normalizePlayerName(pName);
          if ((pNorm === normOfficial || pNorm === normPlayer) && isNaN(Number(deckVal))) {
            return deckVal;
          }
        }
      }
    }
  }

  return 'Sem deck registrado';
}

function normalizeRanking(rankingRows, partidasRows = [], isStage = false) {
  const statusPodio = window.CONFIG?.StatusPodio || appData.Configuracoes?.StatusPodio || 'auto';
  const isFrozen = !isStage && (window.CONFIG?.dataSource === 'sheets' || 
                   (statusPodio === 'congelado' || statusPodio === 'offline') ||
                   (!rankingRows || rankingRows.length === 0));
  
  if (isFrozen && appData.Jogadores && appData.Jogadores.length > 0) {
    rankingRows = appData.Jogadores;
  }

  if (!Array.isArray(rankingRows)) return [];

  const normalized = rankingRows
    .filter(player => player && (player.Jogador || player.Name || player.jogador || player.ID || player.id))
    .map(player => {
      const playerId = String(player.ID || player.id || player.POPID || player['Player ID'] || player['Play! ID'] || player['OPID'] || player['userid'] || '').trim();
      const playerName = player.Jogador || player.Name || player.jogador || "";
      const normPlayerName = normalizePlayerName(playerName);

      // FIRMEZA DE DADOS: Prioridade 1 é o ID Play! Pokémon (chave imutável do jogador)
      let dbPlayer = null;
      if (playerId && appData.Jogadores && appData.Jogadores.length > 0) {
        dbPlayer = appData.Jogadores.find(j => {
          const jId = String(j.ID || j.id || j.POPID || j['Player ID'] || j['Play! ID'] || '').trim();
          return jId && jId === playerId;
        });
      }

      // Prioridade 2: Match por Nome normalizado (apenas como fallback se não houver ID)
      if (!dbPlayer && appData.Jogadores && appData.Jogadores.length > 0) {
        dbPlayer = appData.Jogadores.find(j => {
          return normalizePlayerName(j.Jogador || j.Name || j.jogador) === normPlayerName;
        });
      }

      dbPlayer = dbPlayer || {};

      const officialName = dbPlayer.Jogador || dbPlayer.jogador || playerName;
      const officialId = playerId || dbPlayer.ID || dbPlayer.id || '';

      const pontosRaw = player.Pontos !== undefined && player.Pontos !== '' ? player.Pontos : player['Match Points'];
      const pontos = pontosRaw !== undefined && pontosRaw !== '' ? toNumber(pontosRaw) : 0;
      const podio = getPodiumCount(player);
      const mediaColocacao = getAveragePlacement(player);
      const categoriaOverride = dbPlayer.Categoria || dbPlayer.categoria || '';
      const categoria = categoriaOverride ? normalizeCategory({ Categoria: categoriaOverride }) : normalizeCategory(player);

      const { v, e, d } = getVED(player);
      const posRaw = player.Pos || player.Posicao || player.Standing || 0;

      // FIRMEZA DE DADOS: Determina o último deck jogado na temporada
      let assignedDeck = 'Sem deck registrado';
      if (player.Deck && player.Deck !== 'Não registrado' && player.Deck !== 'Sem deck registrado' && isNaN(Number(player.Deck))) {
        assignedDeck = player.Deck;
      } else {
        assignedDeck = getLatestDeckForPlayer(officialName, officialId);
        if (assignedDeck === 'Sem deck registrado') {
          const rowDeck = getLatestDeckFromRow(dbPlayer);
          if (rowDeck) assignedDeck = rowDeck;
        }
      }

      return {
        ...player,
        ID: officialId,
        Jogador: officialName,
        OriginalPos: toNumber(posRaw, 0),
        Pos: toNumber(posRaw, 0),
        Categoria: categoria.label,
        CategoriaCodigo: categoria.code,
        Pontos: pontos,
        Podio: podio,
        MediaColocacao: mediaColocacao,
        Vitorias: v,
        Empates: e,
        Derrotas: d,
        Deck: assignedDeck,
        TipoEnergia: safeEnergyClass(player.TipoEnergia || dbPlayer.TipoEnergia),
        PosicaoFinal: dbPlayer.PosicaoFinal ? toNumber(dbPlayer.PosicaoFinal) : null
      };
    })
    .sort((a, b) => {
      if (isStage) {
        const posA = a.OriginalPos > 0 ? a.OriginalPos : 999999;
        const posB = b.OriginalPos > 0 ? b.OriginalPos : 999999;
        if (posA !== posB) return posA - posB;
        if (b.Pontos !== a.Pontos) return b.Pontos - a.Pontos;
        return Number(b.Vitorias || 0) - Number(a.Vitorias || 0);
      }

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
    player.Pos = (isStage && player.OriginalPos > 0) ? player.OriginalPos : (index + 1);
  });

  return normalized;
}

function normalizeHistoricalScores(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter(row => row && (row.Temporada || row.temporada) && (row.Jogador || row.jogador || row.Nome || row.nome))
    .map(row => {
      const temporada = String(row.Temporada || row.temporada || '').trim();
      const jogador = String(row.Jogador || row.jogador || row.Nome || row.nome || '').trim();
      const dataFechamento = row.DataFechamento || row.dataFechamento || '';
      const pos = toNumber(row.Pos || row.pos, 0);
      const rawCat = row.Categoria || row.categoria || 'MASTER';
      const categoriaObj = normalizeCategory({ Categoria: rawCat });
      const pontos = toNumber(row.Pontos || row.pontos, 0);
      const deck = row.Deck || row.deck || 'Não registrado';
      const tipoEnergia = safeEnergyClass(row.TipoEnergia || row.tipoEnergia);

      return {
        ...row,
        Temporada: temporada,
        Jogador: jogador,
        DataFechamento: dataFechamento,
        Pos: pos,
        Categoria: categoriaObj.label,
        CategoriaCodigo: categoriaObj.code,
        Pontos: pontos,
        Podio: getPodiumCount({ Podio: row.Podio || row.podio, Pos: pos }),
        MediaColocacao: getAveragePlacement({ MediaColocacao: row.MediaColocacao || row.mediaColocacao, Pos: pos }),
        Deck: deck,
        TipoEnergia: tipoEnergia
      };
    })
    .sort((a, b) => {
      const seasonCompare = String(b.DataFechamento || b.Temporada).localeCompare(String(a.DataFechamento || a.Temporada), 'pt-BR');
      if (seasonCompare !== 0) return seasonCompare;
      return toNumber(a.Pos, 9999) - toNumber(b.Pos, 9999);
    });
}

function getHistoricalScoreSeasons() {
  const rows = appData.ScoresAntigos || [];
  const uniqueSeasons = [...new Set(rows.map(row => row.Temporada || row.temporada).filter(Boolean))];

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

function getStageDisplayName(stage, allStagesList = []) {
  if (!stage || !stage.data) return '';
  const dateStr = stage.data;
  const parts = dateStr.split('-');
  const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
  
  // 1. Prioridade: busca sessionCode oficial salvo em RawMetagame (metagame.json)
  const rawMeta = (appData && appData.RawMetagame) ? appData.RawMetagame : {};
  if (rawMeta[dateStr] && rawMeta[dateStr].sessionCode) {
    const code = String(rawMeta[dateStr].sessionCode).trim();
    const cupMatch = code.match(/^CUP(\d+)T(?:\d+)?/i);
    if (cupMatch) return `Cup ${cupMatch[1]} - ${formattedDate}`;
    const chMatch = code.match(/^CH(\d+)T(?:\d+)?/i);
    if (chMatch) return `Challenge ${chMatch[1]} - ${formattedDate}`;
    const espMatch = code.match(/^ESP(\d+)T(?:\d+)?/i);
    if (espMatch) return `Sessão Especial ${espMatch[1]} - ${formattedDate}`;
    const sMatch = code.match(/^S(\d+)T(?:\d+)?/i);
    if (sMatch) return `Sessão ${sMatch[1]} - ${formattedDate}`;
  }

  // 2. Fallback ordinal inteligente baseado na categoria isolada em etapas.json
  const chronological = (allStagesList && allStagesList.length > 0 ? allStagesList : (stagesIndex || []))
    .filter(s => s && typeof s.data === 'string')
    .sort((a, b) => a.data.localeCompare(b.data));

  const type = stage.tipo || 'Liga';
  const typeStages = chronological.filter(s => (s.tipo || 'Liga') === type);
  const indexInType = typeStages.findIndex(s => s.data === dateStr);
  const num = indexInType >= 0 ? (indexInType + 1) : '';

  if (type === 'Challenge') return num ? `Challenge ${num} - ${formattedDate}` : `Challenge - ${formattedDate}`;
  if (type === 'Cup') return num ? `Cup ${num} - ${formattedDate}` : `Cup - ${formattedDate}`;
  if (type === 'Especial') return num ? `Sessão Especial ${num} - ${formattedDate}` : `Sessão Especial - ${formattedDate}`;
  if (type === 'Liga') return num ? `Sessão ${num} - ${formattedDate}` : `Sessão de Liga - ${formattedDate}`;

  return (num && !type.includes(' ')) ? `${type} ${num} - ${formattedDate}` : `${type} - ${formattedDate}`;
}

function getStageShortCode(stage, allStagesList = []) {
  if (!stage || !stage.data) return '';
  const dateStr = stage.data;
  
  const rawMeta = (appData && appData.RawMetagame) ? appData.RawMetagame : {};
  if (rawMeta[dateStr] && rawMeta[dateStr].sessionCode) {
    const code = String(rawMeta[dateStr].sessionCode).trim();
    const cupMatch = code.match(/^CUP(\d+)T/i);
    if (cupMatch) return `CUP${cupMatch[1]}`;
    const chMatch = code.match(/^CH(\d+)T/i);
    if (chMatch) return `CH${chMatch[1]}`;
    const espMatch = code.match(/^ESP(\d+)T/i);
    if (espMatch) return `ESP${espMatch[1]}`;
    const sMatch = code.match(/^S(\d+)T/i);
    if (sMatch) return `S${sMatch[1]}`;
  }

  const chronological = (allStagesList && allStagesList.length > 0 ? allStagesList : (stagesIndex || []))
    .filter(s => s && typeof s.data === 'string')
    .sort((a, b) => a.data.localeCompare(b.data));

  const type = stage.tipo || 'Liga';
  const typeStages = chronological.filter(s => (s.tipo || 'Liga') === type);
  const indexInType = typeStages.findIndex(s => s.data === dateStr);
  const num = indexInType >= 0 ? (indexInType + 1) : '';

  if (type === 'Challenge') return `CH${num}`;
  if (type === 'Cup') return `CUP${num}`;
  if (type === 'Especial') return `ESP${num}`;
  return `S${num}`;
}

function populateStageSelector() {
  const selector = document.getElementById('ranking-date-selector');
  if (!selector) return;

  const prevVal = selector.value;
  selector.innerHTML = '<option value="general">Ranking Geral</option>';

  const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
  const chronologicalStages = [...cleanStages].sort((a, b) => a.data.localeCompare(b.data));
  const sortedStages = [...cleanStages].sort((a, b) => b.data.localeCompare(a.data));

  sortedStages.forEach(stage => {
    const option = document.createElement('option');
    option.value = stage.data;
    option.textContent = stage.label || getStageDisplayName(stage, chronologicalStages);
    selector.appendChild(option);
  });

  if (prevVal && [...selector.options].some(o => o.value === prevVal)) {
    selector.value = prevVal;
  }
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
    : (window.CONFIG ? window.CONFIG.dataSource : "github");

  const githubSources = window.CONFIG && window.CONFIG.githubSources ? window.CONFIG.githubSources : {};

  appData = { ...MOCK_DATA, Configuracoes: { StatusPodio: 'auto' }, Jogadores: [] };

  if (statusBadge) {
    statusBadge.innerHTML = `<span style="width:6px;height:6px;background:#3b82f6;border-radius:50%;animation:pulse 1.5s infinite"></span> Carregando...`;
    statusBadge.className = "offline-badge";
    statusBadge.style.color = "#3b82f6";
    statusBadge.style.borderColor = "rgba(59, 130, 246, 0.3)";
  }

  try {
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const timestamp = new Date().getTime();

    // 1. Configurações gerais (config.json com fallback Sheets)
    let configObj = null;
    try {
      const confRes = await fetch(`config.json?v=${timestamp}`);
      if (confRes.ok) configObj = await confRes.json();
    } catch (e) {
      console.warn("Falha ao carregar config.json local:", e);
    }

    if (configObj) {
      appData.Configuracoes = {
        StatusPodio: (configObj.statusPodio || 'auto').toLowerCase(),
        ExibirMetagame: configObj.exibirMetagame || 'ambos',
        TemporadaAtual: configObj.temporadaAtual || 5,
        StatusTemporada: (configObj.statusTemporada || 'ativa').toLowerCase(),
        NomeLiga: configObj.leagueName || 'Liga Atlântica',
        SubtituloLiga: configObj.leagueSubtitle || 'Liga de Pokémon TCG - FSA',
        AvisoTopo: configObj.avisoTopo || '',
        LinkWhatsApp: configObj.linkWhatsApp || '',
        LinkInstagram: configObj.linkInstagram || '',
        ProximoEvento: configObj.proximoEvento || configObj.nextEvent || null,
        MinEtapasPokebolaOuro: configObj.minEtapasPokebolaOuro || 2,
        TamanhoPodio: configObj.tamanhoPodio || 4
      };
    } else if (spreadsheetId) {
      let configuracoes = [];
      try {
        const res = await fetchOptionalSheetTab(spreadsheetId, "Configuracoes", publishedSheetGids.Configuracoes);
        if (res && res.length) configuracoes = res;
      } catch(e) {}
      configuracoes.forEach(row => {
        const param = (row.Parametro || "").trim().toLowerCase();
        const val = (row.Valor || "").trim();
        if (param === "statuspodio") appData.Configuracoes.StatusPodio = val.toLowerCase();
        if (param === "avisotopo" || param === "aviso-topo" || param === "aviso_topo") appData.Configuracoes.AvisoTopo = val;
        if (param === "linkwhatsapp" || param === "link-whatsapp" || param === "link_whatsapp" || param === "whatsapp") appData.Configuracoes.LinkWhatsApp = val;
        if (param === "linkinstagram" || param === "link-instagram" || param === "link_instagram" || param === "instagram") appData.Configuracoes.LinkInstagram = val;
        if (param === "temapadrao" || param === "tema-padrao" || param === "tema_padrao" || param === "tema") appData.Configuracoes.TemaPadrao = val;
        if (param === "exibirmetagame" || param === "exibir-metagame" || param === "exibir_metagame" || param === "metagame") appData.Configuracoes.ExibirMetagame = val;
      });
    }

    // 2. Ranking e Etapas
    let rankingPromise = (async () => {
      try {
        let commitSha = "main";
        if (githubSources.Ranking && !isLocalHost) {
          try {
            const match = githubSources.Ranking.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
            if (match) {
              const shaRes = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}/commits/${match[3]}?t=${timestamp}`);
              if (shaRes.ok) {
                const shaData = await shaRes.json();
                if (shaData && shaData.sha) commitSha = shaData.sha;
              }
            }
          } catch(e) {}
        }
        let rankingUrl = isLocalHost ? `ranking.tdf?v=${timestamp}` : (githubSources.Ranking ? githubSources.Ranking.replace(/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)/, `/raw.githubusercontent.com/$1/$2/${commitSha}`) : `ranking.tdf?v=${timestamp}`);
        const res = await fetch(rankingUrl);
        if (res.ok) {
          const text = await res.text();
          return parseTDF(text);
        }
      } catch (e) {
        console.warn("Falha ao carregar ranking.tdf:", e);
      }
      if (spreadsheetId) {
        return fetchOptionalSheetTab(spreadsheetId, "Ranking", publishedSheetGids.Ranking || publishedGid);
      }
      return [];
    })();

    let stagesPromise = (async () => {
      try {
        const res = await fetch(`etapas.json?v=${timestamp}`);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn("Falha ao carregar etapas.json:", e);
      }
      return [];
    })();

    // 3. Jogadores
    let jogadoresPromise = (async () => {
      try {
        const res = await fetch(`jogadores.json?v=${timestamp}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            return data.map(j => ({
              Jogador: j.jogador || j.Jogador || j.Name || j.name || '',
              ID: j.id || j.ID || '',
              Categoria: j.categoria || j.Categoria || 'Master',
              PosicaoFinal: j.posicaoFinal || j.PosicaoFinal || ''
            }));
          }
        }
      } catch (e) {}
      if (spreadsheetId) return fetchOptionalSheetTab(spreadsheetId, "Jogadores", publishedSheetGids.Jogadores);
      return [];
    })();

    // 4. Decks
    let decksPromise = (async () => {
      try {
        const res = await fetch(`decks.json?v=${timestamp}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            return data.map(d => ({
              Deck: d.deck || d.Deck || '',
              TipoEnergia: d.tipoEnergia || d.TipoEnergia || 'colorless',
              Imagem: d.imagem || d.Imagem || '',
              Limitless: d.limitless || d.Limitless || '',
              Icone: d.icone || d.Icone || ''
            }));
          }
        }
      } catch (e) {}
      if (spreadsheetId) return fetchOptionalSheetTab(spreadsheetId, "Decks", publishedSheetGids.Decks);
      return [];
    })();

    // 5. Metagame
    let metagamePromise = (async () => {
      try {
        const res = await fetch(`metagame.json?v=${timestamp}`);
        if (res.ok) {
          const data = await res.json();
          appData.RawMetagame = data;
          if (data && typeof data === 'object') {
            const playerRowsMap = new Map();
            Object.entries(data).forEach(([isoDate, sessionObj]) => {
              const sessionCode = sessionObj.sessionCode || isoDate;
              const decksMap = sessionObj.decks || {};
              Object.entries(decksMap).forEach(([playerName, deckName]) => {
                const key = String(playerName).trim().toLowerCase();
                if (!playerRowsMap.has(key)) {
                  playerRowsMap.set(key, { Jogador: playerName });
                }
                playerRowsMap.get(key)[sessionCode] = deckName;
                playerRowsMap.get(key)[isoDate] = deckName;
              });
            });
            return Array.from(playerRowsMap.values());
          }
        }
      } catch (e) {}
      if (spreadsheetId) return fetchOptionalSheetTab(spreadsheetId, "Metagame", publishedSheetGids.Metagame);
      return null;
    })();

    // 6. Calendário
    let calendarioPromise = (async () => {
      try {
        const res = await fetch(`calendario.json?v=${timestamp}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            return data.map(ev => ({
              Data: ev.data || ev.Data || '',
              Evento: ev.evento || ev.Evento || ev.titulo || ev.Titulo || '',
              Local: ev.local || ev.Local || 'Livraria Atlântica +',
              Horario: ev.horario || ev.Horario || '',
              Status: ev.status || ev.Status || 'confirmado',
              Descricao: ev.descricao || ev.Descricao || '',
              LinkMaps: ev.linkMaps || ev.LinkMaps || '',
              LinkInscricao: ev.linkInscricao || ev.LinkInscricao || '',
              Foto: ev.foto || ev.Foto || ''
            }));
          }
        }
      } catch (e) {}
      if (spreadsheetId) return fetchOptionalSheetTab(spreadsheetId, "Calendario", publishedSheetGids.Calendario);
      return [];
    })();

    // 7. Campeões
    let campeoesPromise = (async () => {
      try {
        const res = await fetch(`campeoes.json?v=${timestamp}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) return data;
        }
      } catch (e) {}
      if (spreadsheetId) return fetchOptionalSheetTab(spreadsheetId, "Campeoes", publishedSheetGids.Campeoes);
      return [];
    })();

    // 8. Regras
    let regrasPromise = (async () => {
      try {
        const res = await fetch(`regras.json?v=${timestamp}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            return data.map(r => ({
              Titulo: r.titulo || r.Titulo || '',
              Descricao: r.descricao || r.Descricao || ''
            }));
          }
        }
      } catch (e) {}
      if (spreadsheetId) return fetchOptionalSheetTab(spreadsheetId, "Regras", publishedSheetGids.Regras);
      return [];
    })();

    // 9. Galeria
    let galeriaPromise = (async () => {
      try {
        const res = await fetch(`galeria.json?v=${timestamp}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            return data.map(g => ({
              Titulo: g.titulo || g.Titulo || '',
              Descricao: g.descricao || g.Descricao || '',
              Foto: g.urlImagem || g.url || g.Foto || g.foto || '',
              Data: g.data || g.Data || ''
            }));
          }
        }
      } catch (e) {}
      if (spreadsheetId) return fetchOptionalSheetTab(spreadsheetId, "Galeria", publishedSheetGids.Galeria);
      return [];
    })();

    // 10. Scores Antigos
    let scoresAntigosPromise = (async () => {
      try {
        const res = await fetch(`scores_antigos.json?v=${timestamp}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) return data;
        }
      } catch (e) {}
      if (spreadsheetId) {
        const historicalScoresTab = window.CONFIG && window.CONFIG.historicalScoresTab ? window.CONFIG.historicalScoresTab : "ScoresAntigos";
        return fetchOptionalSheetTab(spreadsheetId, historicalScoresTab, publishedSheetGids[historicalScoresTab]);
      }
      return [];
    })();

    let decklistsPromise = (async () => {
      try {
        const res = await fetch(`decklists.json?v=${timestamp}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) return data;
        }
      } catch (e) {}
      return [];
    })();

    const [ranking, loadedStages, jogadoresSheet, decks, metagame, calendario, campeoes, regras, galeria, scoresAntigos, decklists] = await Promise.all([
      rankingPromise,
      stagesPromise,
      jogadoresPromise,
      decksPromise,
      metagamePromise,
      calendarioPromise,
      campeoesPromise,
      regrasPromise,
      galeriaPromise,
      scoresAntigosPromise,
      decklistsPromise
    ]);

    stagesIndex = loadedStages || [];
    populateStageSelector();

    if (jogadoresSheet && jogadoresSheet.length) appData.Jogadores = jogadoresSheet;
    appData.Metagame = (metagame && metagame.length) ? metagame : (jogadoresSheet || []);
    if (decks && decks.length) appData.Decks = decks;
    if (ranking && ranking.length) appData.Ranking = normalizeRanking(ranking, []);
    appData.ScoresAntigos = normalizeHistoricalScores(scoresAntigos || []);
    if (calendario && calendario.length) appData.Calendario = calendario;
    if (campeoes && campeoes.length) appData.Campeoes = campeoes;
    if (regras && regras.length) appData.Regras = regras;
    if (galeria && galeria.length) appData.Galeria = galeria;
    appData.Decklists = decklists || [];

    isOfflineMode = false;
    
    // Pré-carregamento não bloqueante de pontos por etapa em background
    if (typeof preloadStageScores === 'function') {
      preloadStageScores().catch(e => console.warn("Preload stage scores error:", e));
    }

    if (statusBadge) {
      const statusTemporada = appData.Configuracoes?.StatusTemporada || 'ativa';
      const statusPodio = window.CONFIG?.StatusPodio || appData.Configuracoes?.StatusPodio || 'auto';
      const isFrozen = (statusTemporada === 'off-season' || statusTemporada === 'recesso' || statusTemporada === 'pausa' || statusPodio === 'congelado' || statusPodio === 'offline') ||
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
        statusBadge.title = "Temporada ativa e recebendo atualizações.";
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
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const future = events.filter(e => {
    const rawDate = e?.Data || e?.data;
    if (!rawDate) return false;
    const status = String(e.Status || e.status || '').toLowerCase().trim();
    if (status === 'concluido' || status === 'cancelado') return false;
    const d = parseDateSafe(rawDate);
    return !isNaN(d) && d >= startOfToday;
  }).sort((a,b) => parseDateSafe(a.Data || a.data) - parseDateSafe(b.Data || b.data));
  if (!future.length) return null;
  const e = future[0];
  const rawDate = e.Data || e.data;
  return {
    title: e.Evento || e.evento || 'Próximo Evento',
    date: normalizeDateISO(rawDate),
    time: e.Horario || e.horario || '14:00',
    location: e.Local || e.local || 'Livraria Atlântica +',
    locationUrl: e.LinkMaps || e.linkMaps || '',
    description: e.Descricao || e.descricao || '',
    signupLink: e.LinkInscricao || e.linkInscricao || '',
    active: true
  };
}

function renderDashboard() {
  const podiumContainer = document.getElementById('podium-cards-container');
  const eventContainer = document.getElementById('event-widget-content');

  if (podiumContainer) {
    let top4 = [];
    const statusPodio = (appData.Configuracoes && appData.Configuracoes.StatusPodio) ? appData.Configuracoes.StatusPodio : 'auto';
    const statusTemporada = (appData.Configuracoes?.StatusTemporada || 'ativa').toLowerCase();
    const podiumLimit = Number(appData.Configuracoes?.TamanhoPodio) || 4;
    
    // O modo congelado/ativo depende do status da temporada, status do pódio ou se não houver dados.
    const isFrozenLayout = window.CONFIG?.dataSource === 'sheets' || 
                           (statusTemporada === 'off-season' || statusTemporada === 'recesso' || statusTemporada === 'pausa') ||
                           (statusPodio === 'congelado' || statusPodio === 'offline') ||
                           (!appData.Ranking || appData.Ranking.length === 0);
    
    if (isFrozenLayout) {
      top4 = [...appData.Ranking]
        .filter(p => p.PosicaoFinal && p.PosicaoFinal > 0)
        .sort((a, b) => a.PosicaoFinal - b.PosicaoFinal)
        .slice(0, podiumLimit);
        
      if (top4.length === 0) {
        top4 = appData.Ranking.slice(0, podiumLimit);
      }
    } else {
      top4 = appData.Ranking.slice(0, podiumLimit);
    }

    if (top4.length === 0) {
      podiumContainer.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary)">Aguardando as informações...</div>`;
    } else {
      podiumContainer.innerHTML = top4.map(player => {
        const letter = player.Jogador ? escapeHTML(player.Jogador.charAt(0).toUpperCase()) : '?';
        const playerName = escapeHTML(player.Jogador);
        const resolvedDeck = (player.Deck && player.Deck !== 'Não registrado' && player.Deck !== 'Sem deck registrado' && isNaN(Number(player.Deck)))
          ? player.Deck
          : (getLatestDeckForPlayer(player.Jogador, player.ID) || 'Sem deck registrado');
        const playerDeck = escapeHTML(resolvedDeck);

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
          <div class="podium-card rank-${cardRank}" onclick="openPlayerModal('${escapeHTML(player.Jogador)}', '${escapeHTML(player.ID || '')}')">
            <div class="podium-badge">${cardRank}</div>
            <div class="podium-info">
              <div class="podium-player-name">${playerName}</div>
              <div class="podium-deck-info">
                ${getEnergyDotHTML(getDeckEnergy(resolvedDeck))}
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
    const jsonEvent = appData.Configuracoes?.ProximoEvento;
    const isEventActive = !jsonEvent || jsonEvent.ativo !== false;

    // Busca sempre dinamicamente o próximo torneio futuro oficial do calendário
    const eventConf = isEventActive ? getNextEventFromCalendar() : null;
    
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
          <p class="event-description">${escapeHTML(eventConf.description || 'Formato Standard. Traga seu melhor deck!')}</p>
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
    } else if (isEventActive) {
      const whatsappUrl = appData.Configuracoes?.LinkWhatsApp || '';
      eventContainer.innerHTML = `
        <div class="event-header">
          <div class="event-badge-alert" style="background: rgba(255, 203, 5, 0.12); color: var(--accent-yellow); border-color: rgba(255, 203, 5, 0.25);">
            <span></span> Agenda da Liga
          </div>
        </div>
        <div style="padding: 2.25rem 1.5rem; text-align: center; color: var(--text-secondary);">
          <div style="font-size: 2.2rem; margin-bottom: 0.6rem;">⚡</div>
          <h3 style="font-size: 1.05rem; color: #fff; margin-bottom: 0.4rem; font-weight: 700;">Nenhum torneio agendado no momento</h3>
          <p style="font-size: 0.82rem; max-width: 380px; margin: 0 auto 1.25rem auto; line-height: 1.45;">
            Estamos preparando as próximas rodadas oficiais da temporada! Acompanhe o grupo para ser avisado assim que abrirem as inscrições.
          </p>
          ${whatsappUrl ? `
            <a href="${escapeHTML(whatsappUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.1rem; font-size: 0.82rem;">
              💬 Acompanhar no WhatsApp
            </a>
          ` : ''}
        </div>
      `;
    } else {
      eventContainer.innerHTML = '';
      const parentCard = eventContainer.closest('.glass-card') || eventContainer.parentElement;
      if (parentCard && parentCard.classList.contains('dashboard-event-card')) {
        parentCard.style.display = 'none';
      }
    }
  }
}

function getDeckForStage(playerName, stageDateStr, playerId = '') {
  if ((!playerName && !playerId) || !stageDateStr || typeof stageDateStr !== 'string') return null;
  
  const cleanId = String(playerId || '').trim();
  const normPlayerName = normalizePlayerName(playerName);

  // 1. Obtém o nome oficial do jogador se tiver ID
  let officialName = playerName;
  let dbPlayer = null;
  if (cleanId && appData.Jogadores && appData.Jogadores.length > 0) {
    dbPlayer = appData.Jogadores.find(j => {
      const jId = String(j.ID || j.id || j.POPID || j['Player ID'] || j['Play! ID'] || '').trim();
      return jId && jId === cleanId;
    });
    if (dbPlayer && (dbPlayer.Jogador || dbPlayer.jogador || dbPlayer.Name)) {
      officialName = dbPlayer.Jogador || dbPlayer.jogador || dbPlayer.Name;
    }
  }

  // Se não encontrou por ID, busca por nome normalizado em Jogadores
  if (!dbPlayer && normPlayerName && appData.Jogadores && appData.Jogadores.length > 0) {
    dbPlayer = appData.Jogadores.find(j => normalizePlayerName(j.Jogador || j.Name || j.jogador) === normPlayerName);
    if (dbPlayer && (dbPlayer.Jogador || dbPlayer.jogador || dbPlayer.Name)) {
      officialName = dbPlayer.Jogador || dbPlayer.jogador || dbPlayer.Name;
    }
  }

  const normOfficial = normalizePlayerName(officialName);

  // 2. BUSCA DIRETA NO RawMetagame (metagame.json) - Fonte principal dos decks por etapa!
  if (appData.RawMetagame && typeof appData.RawMetagame === 'object') {
    const sessionObj = appData.RawMetagame[stageDateStr];
    if (sessionObj && sessionObj.decks) {
      if (sessionObj.decks[officialName]) return sessionObj.decks[officialName];
      if (sessionObj.decks[playerName]) return sessionObj.decks[playerName];
      for (const [pName, dName] of Object.entries(sessionObj.decks)) {
        const pNorm = normalizePlayerName(pName);
        if (pNorm === normOfficial || pNorm === normPlayerName) {
          return dName;
        }
      }
    }
  }

  // 3. BUSCA NA MATRIZ appData.Metagame
  if (appData.Metagame && appData.Metagame.length > 0) {
    const metaPlayer = appData.Metagame.find(j => {
      const jNameNorm = normalizePlayerName(j.Jogador || j.jogador || j.Name || '');
      return jNameNorm === normOfficial || jNameNorm === normPlayerName;
    });
    if (metaPlayer) {
      if (metaPlayer[stageDateStr]) return metaPlayer[stageDateStr];

      const parts = stageDateStr.split('-');
      const dateDDMMYY = parts.length === 3 ? `${parts[2]}${parts[1]}${parts[0].substring(2)}` : '';

      const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
      const chronologicalStages = [...cleanStages].sort((a, b) => a.data.localeCompare(b.data));
      const stageNumber = chronologicalStages.findIndex(s => s.data === stageDateStr) + 1;

      const columnKey = Object.keys(metaPlayer).find(k => {
        const normalizedKey = k.toLowerCase().trim();
        if (normalizedKey.includes(stageDateStr) || (dateDDMMYY && normalizedKey.includes(dateDDMMYY))) return true;
        if (stageNumber > 0) {
          const stagePrefix = `s${stageNumber}`;
          const regex = new RegExp(`^${stagePrefix}\\D`, 'i');
          if (regex.test(normalizedKey)) return true;
        }
        return false;
      });

      if (columnKey && metaPlayer[columnKey] && typeof metaPlayer[columnKey] === 'string') {
        return metaPlayer[columnKey].trim();
      }
    }
  }

  // 4. FALLBACK: Verifica se dbPlayer possui coluna da etapa
  if (dbPlayer) {
    const parts = stageDateStr.split('-');
    const dateDDMMYY = parts.length === 3 ? `${parts[2]}${parts[1]}${parts[0].substring(2)}` : '';
    const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
    const chronologicalStages = [...cleanStages].sort((a, b) => a.data.localeCompare(b.data));
    const stageNumber = chronologicalStages.findIndex(s => s.data === stageDateStr) + 1;

    const columnKey = Object.keys(dbPlayer).find(k => {
      const normalizedKey = k.toLowerCase().trim();
      if (normalizedKey.includes(dateDDMMYY) || normalizedKey.includes(stageDateStr)) return true;
      if (stageNumber > 0) {
        const stagePrefix = `s${stageNumber}`;
        const regex = new RegExp(`^${stagePrefix}\\D`, 'i');
        if (regex.test(normalizedKey)) return true;
      }
      return false;
    });

    if (columnKey && dbPlayer[columnKey] && typeof dbPlayer[columnKey] === 'string') {
      return dbPlayer[columnKey].trim();
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
        ${player.BasePontos !== undefined && player.BasePontos !== player.Pontos ? `
          <div style="font-size:0.72rem; color:var(--accent-yellow); font-weight:600; margin-top:2px;" title="Pontos oficiais (${player.BasePontos}) com peso ${player.Multiplicador}x">
            ${player.BasePontos} &times; ${player.Multiplicador}x
          </div>
        ` : ''}
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
      const deckName = getDeckForStage(player.Jogador, selector.value, player.ID);
      if (deckName) {
        const energy = getDeckEnergy(deckName);
        const energyDot = getEnergyDotHTML(energy);
        
        const decksTab = appData.Decks || [];
        const deckInfo = decksTab.find(d => (d.Deck || d.deck || '').trim().toLowerCase() === deckName.toLowerCase());
        const customIconUrl = deckInfo ? safeExternalUrl(deckInfo.Icone || deckInfo.icone || deckInfo.Imagem || deckInfo.imagem) : null;
        
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

        // Checa se o jogador possui decklist oficial cadastrada nesta etapa
        const hasDecklist = (appData.Decklists || []).find(dl => 
          (dl.etapaData === selector.value || dl.data === selector.value) && 
          ((dl.id && String(dl.id).trim() === String(player.ID).trim()) || 
           normalizePlayerName(dl.nome || dl.jogador) === normalizePlayerName(player.Jogador))
        );
        if (hasDecklist) {
          deckIconHtml += `
            <button type="button" class="btn" onclick="event.stopPropagation(); openDecklistViewerModal('${escapeHTML(hasDecklist.id || player.ID || '')}', '${escapeHTML(selector.value)}')" style="padding: 2px 6px; font-size: 0.68rem; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 4px; margin-left: 4px;" title="Ver lista de 60 cartas oficial deste jogador">
              📄 Lista
            </button>
          `;
        }
      }
    }

    return `
      <tr class="${rowClass}" onclick="openPlayerModal('${escapeHTML(player.Jogador)}', '${escapeHTML(player.ID || '')}')" style="cursor:pointer">
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

function detectCalendarEventType(title) {
  const t = String(title || '').toLowerCase();
  if (t.includes('final')) {
    return { label: '🏆 Final de Temporada', class: 'tag-final' };
  }
  if (t.includes('cup')) {
    return { label: '🏆 League Cup', class: 'tag-cup' };
  }
  if (t.includes('challenge')) {
    return { label: '⚡ League Challenge', class: 'tag-challenge' };
  }
  if (t.includes('pré-release') || t.includes('pre-release') || t.includes('prerelease')) {
    return { label: '🎁 Pré-Release', class: 'tag-prerelease' };
  }
  if (t.includes('especial') || t.includes('tbt') || t.includes('comemorativo')) {
    return { label: '✨ Especial', class: 'tag-special' };
  }
  if (t.includes('freeplay') || t.includes('troca')) {
    return { label: '🤝 Freeplay & Trocas', class: 'tag-freeplay' };
  }
  return { label: '⚔️ Sessão de Liga', class: 'tag-league' };
}

function formatCalendarDateBadge(dateStr) {
  const d = parseDateSafe(dateStr);
  if (isNaN(d)) return { weekday: '---', day: '--', month: '---' };
  const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const monthShorts = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  return {
    weekday: weekDays[d.getDay()],
    day: String(d.getDate()).padStart(2, '0'),
    month: monthShorts[d.getMonth()]
  };
}

function renderCalendarCard(evt, isNext = false, isPast = false) {
  const rawDate = evt.Data || evt.data;
  const iso = normalizeDateISO(rawDate);
  const parts = iso.split('-');
  const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : rawDate;
  
  const dateBadge = formatCalendarDateBadge(rawDate);
  const eventTitle = escapeHTML(evt.Evento || evt.evento || 'Sessão de Liga');
  const eventDesc = (evt.Descricao || evt.descricao || '').trim();
  const eventLocal = evt.Local || evt.local || 'Livraria Atlântica +';
  const eventMapUrl = evt.LinkMaps || evt.linkMaps || evt.URLMaps || evt.GoogleMaps || '';
  const eventLink = evt.LinkInscricao || evt.linkInscricao || '';
  const eventPhoto = evt.Foto || evt.foto || '';
  const eventHour = evt.Horario || evt.horario || '14:00';
  
  const statusKey = isPast 
    ? 'concluido' 
    : (['confirmado', 'concluido', 'pendente'].includes(String(evt.Status || evt.status || '').toLowerCase()) 
        ? String(evt.Status || evt.status).toLowerCase() 
        : 'pendente');
  const statusLabel = isPast ? 'Concluído' : getStatusLabel(statusKey);
  const eventType = detectCalendarEventType(evt.Evento || evt.evento);

  let photoHtml = '';
  if (eventPhoto) {
    const safeUrl = safeExternalUrl(normalizeImageUrl(eventPhoto));
    if (safeUrl) {
      photoHtml = `
        <div class="calendar-card-thumb" onclick="window.openGenericLightbox('${safeUrl.replace(/'/g, "\\'")}', '${eventTitle.replace(/'/g, "\\'")}')" title="Clique para ampliar">
          <img src="${escapeHTML(safeUrl)}" alt="${eventTitle}" loading="lazy">
        </div>
      `;
    }
  }

  let actionHtml = '';
  if (!isPast) {
    if (eventLink) {
      actionHtml = renderEventLinkButton(eventLink);
    } else if (appData.Configuracoes?.LinkWhatsApp) {
      actionHtml = `
        <a href="${escapeHTML(appData.Configuracoes.LinkWhatsApp)}" target="_blank" rel="noopener noreferrer" class="btn-evento btn-evento-whatsapp" style="font-size:0.8rem; padding: 0.5rem 0.9rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          <span>Grupo da Liga</span>
        </a>
      `;
    }
  }

  return `
    <div class="calendar-card ${isNext ? 'calendar-card-highlight' : ''} ${isPast ? 'calendar-card-past' : ''}">
      <div class="calendar-card-date">
        <span class="cal-weekday">${escapeHTML(dateBadge.weekday)}</span>
        <span class="cal-day">${escapeHTML(dateBadge.day)}</span>
        <span class="cal-month">${escapeHTML(dateBadge.month)}</span>
      </div>

      ${photoHtml}

      <div class="calendar-card-content">
        <div class="calendar-card-badges">
          ${isNext ? '<span class="calendar-badge-next">🔥 Próximo Torneio</span>' : ''}
          <span class="calendar-tag ${eventType.class}">${eventType.label}</span>
          <span class="calendar-status ${statusKey}">${escapeHTML(statusLabel)}</span>
          <span class="calendar-time">🕒 ${escapeHTML(eventHour)}</span>
        </div>

        <h3 class="calendar-card-title">${eventTitle}</h3>

        ${eventDesc ? `<p class="calendar-card-desc">${escapeHTML(eventDesc)}</p>` : ''}

        <div class="calendar-card-meta">
          <span class="calendar-meta-item">
            📍 <strong>Local:</strong> ${renderLocationLink(eventLocal, eventMapUrl)}
          </span>
        </div>
      </div>

      ${actionHtml ? `<div class="calendar-card-action">${actionHtml}</div>` : ''}
    </div>
  `;
}

function renderCalendar() {
  const timeline = document.getElementById('calendar-timeline');
  const tabsContainer = document.getElementById('calendar-month-tabs');
  if (!timeline) return;

  const events = appData.Calendario || [];

  // 1. Filtra eventos com data válida e ordena cronologicamente
  const validEvents = events
    .filter(e => {
      const dt = e?.Data || e?.data;
      return dt && !isNaN(parseDateSafe(dt));
    })
    .sort((a, b) => parseDateSafe(a.Data || a.data) - parseDateSafe(b.Data || b.data));

  if (validEvents.length === 0) {
    if (tabsContainer) tabsContainer.innerHTML = '';
    timeline.innerHTML = `<div class="calendar-empty-card">
      <div style="font-size:2.5rem; margin-bottom:0.75rem;">📅</div>
      <h3 style="color:#fff; margin-bottom:0.5rem;">Nenhum torneio cadastrado no calendário</h3>
      <p style="color:var(--text-secondary); max-width:480px; margin:0 auto;">Aguarde o anúncio dos próximos eventos oficiais da Liga Atlântica!</p>
    </div>`;
    return;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

  // 2. Separação de eventos futuros (ou hoje) vs passados
  const upcomingEvents = validEvents.filter(e => parseDateSafe(e.Data || e.data) >= startOfToday);
  const pastEvents = validEvents.filter(e => parseDateSafe(e.Data || e.data) < startOfToday);

  // Se não houver eventos futuros agendados
  if (upcomingEvents.length === 0) {
    if (tabsContainer) tabsContainer.innerHTML = '';
    let emptyHtml = `
      <div class="calendar-empty-card">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">✨</div>
        <h3 style="color: #fff; margin-bottom: 0.5rem;">Temporada Concluída / Sem Próximos Torneios</h3>
        <p style="color: var(--text-secondary); max-width: 500px; margin: 0 auto 1.5rem auto;">
          Todos os torneios agendados anteriormente já foram realizados. Fique atento às nossas redes sociais para o calendário da próxima temporada!
        </p>
    `;
    if (pastEvents.length > 0) {
      emptyHtml += `
        <details class="past-events-accordion">
          <summary class="past-events-summary">
            <span>📜 Ver histórico de torneios anteriores (${pastEvents.length} já realizados)</span>
            <span class="past-events-arrow">▼</span>
          </summary>
          <div class="past-events-list">
            ${pastEvents.map(evt => renderCalendarCard(evt, false, true)).join('')}
          </div>
        </details>
      `;
    }
    emptyHtml += `</div>`;
    timeline.innerHTML = emptyHtml;
    return;
  }

  // Nomes dos meses em português
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  // 3. Agrupa APENAS os eventos futuros por chave "YYYY-MM"
  const groups = {};
  upcomingEvents.forEach(evt => {
    const d = parseDateSafe(evt.Data || evt.data);
    const monthVal = String(d.getMonth() + 1).padStart(2, '0');
    const yearVal = d.getFullYear();
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

  const sortedMonthKeys = Object.keys(groups).sort();

  // 4. Seleção inicial da aba
  if (!currentCalendarMonth || (currentCalendarMonth !== 'all' && !groups[currentCalendarMonth])) {
    currentCalendarMonth = 'all';
  }

  // 5. Renderiza as abas (Apenas meses futuros + "Todos os Próximos")
  if (tabsContainer) {
    let tabsHtml = `
      <button class="month-tab-btn ${currentCalendarMonth === 'all' ? 'active' : ''}" onclick="selectCalendarMonth('all')">
        Todos os Próximos (${upcomingEvents.length})
      </button>
    `;
    sortedMonthKeys.forEach(key => {
      const activeClass = key === currentCalendarMonth ? 'active' : '';
      const count = groups[key].events.length;
      tabsHtml += `
        <button class="month-tab-btn ${activeClass}" onclick="selectCalendarMonth('${key}')">
          ${escapeHTML(groups[key].label)} (${count})
        </button>
      `;
    });
    tabsContainer.innerHTML = tabsHtml;
  }

  // 6. Eventos a serem exibidos no filtro atual
  const displayedEvents = currentCalendarMonth === 'all'
    ? upcomingEvents
    : (groups[currentCalendarMonth]?.events || []);

  let html = displayedEvents.map((evt, idx) => {
    const isNext = (currentCalendarMonth === 'all' && idx === 0) || (upcomingEvents[0] === evt);
    return renderCalendarCard(evt, isNext, false);
  }).join('');

  // 7. Arquivo Histórico de Eventos Passados (recolhido por padrão no rodapé da visão geral)
  if (pastEvents.length > 0 && currentCalendarMonth === 'all') {
    html += `
      <details class="past-events-accordion">
        <summary class="past-events-summary">
          <span>📜 Arquivo Histórico: Torneios Anteriores desta Temporada (${pastEvents.length} já realizados)</span>
          <span class="past-events-arrow">▼</span>
        </summary>
        <div class="past-events-list">
          ${pastEvents.map(evt => renderCalendarCard(evt, false, true)).join('')}
        </div>
      </details>
    `;
  }

  timeline.innerHTML = html;
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

  // 1. Calcular recordes históricos da liga
  const champWins = {};
  const deckWins = {};
  const viceCounts = {};
  
  champions.forEach(c => {
    const champ = (c.Campeao || '').trim();
    const deck = (c.DeckCampeao || '').trim();
    const vice = (c.Vice || '').trim();
    
    if (champ) champWins[champ] = (champWins[champ] || 0) + 1;
    if (deck) deckWins[deck] = (deckWins[deck] || 0) + 1;
    if (vice && vice !== '-' && vice !== '') viceCounts[vice] = (viceCounts[vice] || 0) + 1;
  });

  const topChampion = Object.entries(champWins).sort((a, b) => b[1] - a[1])[0] || ['Nenhum', 0];
  const topDeck = Object.entries(deckWins).sort((a, b) => b[1] - a[1])[0] || ['Nenhum', 0];
  const topVice = Object.entries(viceCounts).sort((a, b) => b[1] - a[1])[0] || ['-', 0];
  const totalSeasons = champions.length;

  const recordsHtml = `
    <div class="champ-records-grid">
      <div class="champ-record-card">
        <div class="champ-record-icon-wrap">👑</div>
        <div class="champ-record-info">
          <span class="champ-record-label">Maior Campeão</span>
          <span class="champ-record-value">${escapeHTML(topChampion[0])}</span>
          <span class="champ-record-sub">${topChampion[1]}x Campeão da Liga</span>
        </div>
      </div>
      
      <div class="champ-record-card">
        <div class="champ-record-icon-wrap">⚡</div>
        <div class="champ-record-info">
          <span class="champ-record-label">Deck Mais Vitorioso</span>
          <span class="champ-record-value">${escapeHTML(topDeck[0])}</span>
          <span class="champ-record-sub">${topDeck[1]} título${topDeck[1] > 1 ? 's' : ''} conquistado${topDeck[1] > 1 ? 's' : ''}</span>
        </div>
      </div>
      
      <div class="champ-record-card">
        <div class="champ-record-icon-wrap">🥈</div>
        <div class="champ-record-info">
          <span class="champ-record-label">Maior Finalista</span>
          <span class="champ-record-value">${escapeHTML(topVice[0])}</span>
          <span class="champ-record-sub">${topVice[1]} presenças em finais</span>
        </div>
      </div>
      
      <div class="champ-record-card">
        <div class="champ-record-icon-wrap">🏆</div>
        <div class="champ-record-info">
          <span class="champ-record-label">Histórico Oficial</span>
          <span class="champ-record-value">${totalSeasons} Temporadas</span>
          <span class="champ-record-sub">Edições concluídas</span>
        </div>
      </div>
    </div>
  `;

  // 2. Renderizar Acordeão do Hall da Fama
  const accordionHtml = champions.map((champ, index) => {
    const photoUrl = safeExternalUrl(champ.FotoCampeao || champ.Foto || champ.URLFoto || champ.ImagemCampeao);
    const championName = escapeHTML(champ.Campeao || 'Campeão');
    const championInitial = championName ? championName.charAt(0).toUpperCase() : '🏆';
    const hasDeckDetails = Boolean(
      safeExternalUrl(champ.URLDeck || champ.LinkDeck || champ.LinkLista) ||
      safeExternalUrl(champ.ImagemDeck || champ.FotoDeck) ||
      String(champ.ObservacaoDeck || champ.DescricaoDeck || '').trim()
    );
    const isFirstExpanded = index === 0 ? 'expanded' : '';

    // Títulos da temporada
    const pOuro = champ.PokebolaOuro || champ.PokebolaDeOuro;
    const lGinasio = champ.LiderGinasio || champ.LiderDeGinasio;
    const dPlayer = champ.DittoPlayer;
    const pMurcha = champ.PokebolaMurcha;
    const hasSeasonTitles = Boolean(pOuro || lGinasio || dPlayer || pMurcha);

    let seasonTitlesHtml = '';
    if (hasSeasonTitles) {
      seasonTitlesHtml = `
        <div style="margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.08); width:100%; max-width:280px; margin-left:auto; margin-right:auto;">
          <div style="font-weight:700; color:var(--accent-yellow); font-size:0.72rem; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.06em; text-align:center;">Títulos da Temporada</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.72rem;">
            ${pOuro ? `
              <div style="display:flex; align-items:center; gap:6px; background:rgba(255,203,5,0.08); border:1px solid rgba(255,203,5,0.25); padding:4px 8px; border-radius:12px;" title="Pokébola de Ouro">
                <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png" style="width:18px; height:18px; object-fit:contain; filter: sepia(1) saturate(10) hue-rotate(20deg) brightness(1.2);" alt="Ouro">
                <span style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><strong>${escapeHTML(pOuro)}</strong></span>
              </div>
            ` : ''}
            ${lGinasio ? `
              <div style="display:flex; align-items:center; gap:6px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); padding:4px 8px; border-radius:12px;" title="Líder de Ginásio">
                <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="width:16px; height:16px; flex-shrink:0;">
                  <path d="M32 4 L48 24 L48 44 L32 60 L16 44 L16 24 Z" fill="#dca300" stroke="#ffcb05" stroke-width="2"/>
                  <path d="M32 6 L45 24 L45 42 L32 56 L19 42 L19 24 Z" fill="#1e4620" />
                </svg>
                <span style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><strong>${escapeHTML(lGinasio)}</strong></span>
              </div>
            ` : ''}
            ${dPlayer ? `
              <div style="display:flex; align-items:center; gap:6px; background:rgba(141,86,255,0.08); border:1px solid rgba(141,86,255,0.25); padding:4px 8px; border-radius:12px;" title="Ditto Player">
                <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png" style="width:20px; height:20px; object-fit:contain; margin:-2px 0;" alt="Ditto">
                <span style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><strong>${escapeHTML(dPlayer)}</strong></span>
              </div>
            ` : ''}
            ${pMurcha ? `
              <div style="display:flex; align-items:center; gap:6px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); padding:4px 8px; border-radius:12px;" title="Pokébola Murcha">
                <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/black-sludge.png" style="width:16px; height:16px; object-fit:contain;" alt="Murcha">
                <span style="color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><strong>${escapeHTML(pMurcha)}</strong></span>
              </div>
            ` : ''}
          </div>
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

  container.className = "champions-wrapper";
  container.innerHTML = `
    ${recordsHtml}
    <div class="champions-accordion">
      ${accordionHtml}
    </div>
  `;
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

let stageScoresCache = null;
let isPreloadingScores = false;

async function preloadStageScores() {
  if (stageScoresCache) return stageScoresCache;
  if (isPreloadingScores) return null;
  isPreloadingScores = true;
  stageScoresCache = {};

  const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
  if (cleanStages.length === 0) {
    isPreloadingScores = false;
    return stageScoresCache;
  }

  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  let baseRankingUrl = (typeof githubSources !== 'undefined' && githubSources.Ranking) ? githubSources.Ranking : '';
  if (window.latestCommitSha && baseRankingUrl) {
    baseRankingUrl = baseRankingUrl.replace(/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)/, `/raw.githubusercontent.com/$1/$2/${window.latestCommitSha}`);
  }

  const promises = cleanStages.map(async stg => {
    try {
      let stageTdfUrl = '';
      if (isLocalHost) {
        stageTdfUrl = `etapas/${stg.data}.tdf?v=${new Date().getTime()}`;
      } else if (baseRankingUrl) {
        stageTdfUrl = baseRankingUrl.replace('ranking.tdf', `etapas/${stg.data}.tdf`);
      } else {
        stageTdfUrl = `etapas/${stg.data}.tdf`;
      }

      const res = await fetch(stageTdfUrl);
      if (res.ok) {
        const text = await res.text();
        const rows = parseTDF(text);
        const mult = Number(stg.multiplicador) || 1.0;
        const playerMap = new Map();

        rows.forEach(r => {
          const rawId = getPlayerId(r);
          const cleanId = rawId ? String(rawId).trim() : '';
          const rawName = r.Jogador || r.Player || r.Name || '';
          const normName = normalizePlayerName(rawName);
          const rawPts = Number(getFirstDefined(r, ['Pontos', 'Points', 'Pts'])) || 0;
          const finalPts = rawPts * mult;

          if (cleanId) playerMap.set(cleanId, finalPts);
          if (normName) playerMap.set(normName, finalPts);
        });
        stageScoresCache[stg.data] = playerMap;
      }
    } catch (e) {
      console.warn("Falha ao carregar pontuação da etapa " + stg.data, e);
    }
  });

  await Promise.allSettled(promises);
  isPreloadingScores = false;
  return stageScoresCache;
}

function renderPlayerTimeline(player) {
  const timelineContainer = document.getElementById('modal-player-timeline');
  if (!timelineContainer) return;
  timelineContainer.innerHTML = '';
  const historyStr = player.HistoricoColocacoes || '';
  if (!historyStr) {
    timelineContainer.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;padding:0.25rem 0;">Sem histórico nesta temporada.</div>';
    return;
  }

  const historyArr = String(historyStr).split(';');
  const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
  const chronologicalStages = [...cleanStages].sort((a, b) => a.data.localeCompare(b.data));

  const stepsHtml = historyArr.map((pos, index) => {
    const stageInfo = chronologicalStages[index] || stagesIndex[index];
    const stageLabel = stageInfo ? getStageShortCode(stageInfo, chronologicalStages) : `E${index + 1}`;
    let dateLabel = '-';
    if (stageInfo && stageInfo.data) {
      const parts = stageInfo.data.split('-');
      dateLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}` : stageInfo.data;
    }
    const stageTitle = stageInfo ? getStageDisplayName(stageInfo, chronologicalStages) : `Etapa ${index + 1}`;
    const isParticipating = pos !== '-' && pos !== '' && !isNaN(Number(pos));
    const isPodiumClass = isParticipating && toNumber(pos) <= 4 ? 'podium' : '';
    const emptyClass = !isParticipating ? 'step-empty' : '';
    const posText = isParticipating ? `${pos}º` : '-';

    // Obter pontuação da etapa para o jogador
    let ptsText = '-';
    let ptsVal = null;
    if (isParticipating && stageInfo && stageScoresCache && stageScoresCache[stageInfo.data]) {
      const stageMap = stageScoresCache[stageInfo.data];
      const cleanId = player.ID ? String(player.ID).trim() : '';
      const normName = normalizePlayerName(player.Jogador);
      if (cleanId && stageMap.has(cleanId)) {
        ptsVal = stageMap.get(cleanId);
      } else if (normName && stageMap.has(normName)) {
        ptsVal = stageMap.get(normName);
      }
    }

    if (ptsVal !== null && !isNaN(ptsVal)) {
      ptsText = `+${toNumber(ptsVal)} pts`;
    } else if (isParticipating) {
      ptsText = '...';
    }

    return `
      <div class="timeline-step ${isPodiumClass} ${emptyClass}" title="${escapeHTML(stageTitle)}: ${posText} ${ptsVal !== null ? '(' + ptsText + ')' : ''}">
        <span class="step-num">${escapeHTML(stageLabel)}</span>
        <span class="step-pos">${posText}</span>
        <span class="step-pts ${!isParticipating ? 'step-pts-empty' : ''}">${ptsText}</span>
        <span class="step-date">${dateLabel}</span>
      </div>
    `;
  }).join('');
  timelineContainer.innerHTML = stepsHtml;
}

window.openPlayerModal = function(playerRef, playerIdRef = '') {
  const modal = document.getElementById('player-modal');
  let player = null;
  const cleanId = String(playerIdRef || '').trim();

  // 1. FIRMEZA DE DADOS: Prioridade 1 é o ID Play! Pokémon (Chave Primária)
  if (cleanId && appData.Ranking && appData.Ranking.length > 0) {
    player = appData.Ranking.find(p => {
      const pId = String(p.ID || p.id || p.POPID || p['Player ID'] || p['Play! ID'] || '').trim();
      return pId && pId === cleanId;
    });
  }

  // 2. Se playerRef for número (posição no ranking)
  if (!player && typeof playerRef === 'number') {
    const listPlayer = currentRankingList.find(p => p.Pos === playerRef);
    if (listPlayer) {
      const listId = String(listPlayer.ID || listPlayer.id || '').trim();
      if (listId && appData.Ranking) {
        player = appData.Ranking.find(p => String(p.ID || p.id || '').trim() === listId);
      }
      if (!player) {
        player = appData.Ranking.find(p => normalizePlayerName(p.Jogador) === normalizePlayerName(listPlayer.Jogador));
      }
    }
  } else if (!player && playerRef) {
    // 3. Fallback: Match por Nome normalizado
    const normRef = normalizePlayerName(playerRef);
    player = appData.Ranking.find(p => normalizePlayerName(p.Jogador) === normRef);
  }
  
  if (!player || !modal) return;

  const letter = player.Jogador ? player.Jogador.charAt(0).toUpperCase() : '?';
  const v = player.Vitorias || 0;
  const e = player.Empates || 0;
  const d = player.Derrotas || 0;
  const total = v + e + d;
  const winRate = total > 0 ? Math.round((v / total) * 100) : 0;

  const avatarEl = document.getElementById('modal-avatar');
  if (avatarEl) avatarEl.innerText = letter;

  const medals = getPlayerMedals(player.Jogador);
  const nameEl = document.getElementById('modal-player-name');
  if (nameEl) nameEl.innerHTML = `${escapeHTML(player.Jogador)} ${medals}`;

  const deckEl = document.getElementById('modal-player-deck');
  if (deckEl) {
    deckEl.innerHTML = `
      ${getEnergyDotHTML(getDeckEnergy(player.Deck))}
      <span>Deck: <strong>${escapeHTML(player.Deck || 'Não registrado')}</strong></span>
    `;
  }

  // 4 Top Stats
  const ptsEl = document.getElementById('modal-stat-points');
  if (ptsEl) ptsEl.innerText = `${toNumber(player.Pontos)}`;

  const posEl = document.getElementById('modal-stat-placement');
  if (posEl) posEl.innerText = `${toNumber(player.Pos)}º`;

  const podEl = document.getElementById('modal-stat-podiums');
  if (podEl) podEl.innerText = `${toNumber(player.Podio)}`;

  const wrEl = document.getElementById('modal-stat-winrate');
  if (wrEl) wrEl.innerText = `${winRate}%`;

  const vedEl = document.getElementById('modal-detail-ved');
  if (vedEl) {
    vedEl.innerHTML = `
      <div class="ved-container" style="justify-content: flex-end; gap: 4px;">
        <span class="ved-badge v-badge" title="Vitórias">${v}V</span>
        <span class="ved-badge e-badge" title="Empates">${e}E</span>
        <span class="ved-badge d-badge" title="Derrotas">${d}D</span>
      </div>
    `;
  }

  const partMediaEl = document.getElementById('modal-detail-part-media');
  if (partMediaEl) {
    partMediaEl.innerText = `${toNumber(player.Participacoes)} etapas • ${formatAveragePlacement(player.MediaColocacao)}º média`;
  }

  // Títulos no Hall da Fama
  const titles = [];
  (appData.Campeoes || []).forEach(c => {
    const pNorm = normalizePlayerName(player.Jogador);
    if (normalizePlayerName(c.Campeao) === pNorm) titles.push(`🏆 Campeão (${c.Temporada})`);
    if (normalizePlayerName(c.Vice) === pNorm) titles.push(`🥈 Vice (${c.Temporada})`);
    if (normalizePlayerName(c.PokebolaOuro || c.PokebolaDeOuro) === pNorm) titles.push(`🥇 Pokébola de Ouro (${c.Temporada})`);
    if (normalizePlayerName(c.LiderGinasio || c.LiderDeGinasio) === pNorm) titles.push(`🥋 Líder de Ginásio (${c.Temporada})`);
    if (normalizePlayerName(c.DittoPlayer) === pNorm) titles.push(`🧬 Ditto Player (${c.Temporada})`);
    if (normalizePlayerName(c.PokebolaMurcha) === pNorm) titles.push(`🥀 Pokébola Murcha (${c.Temporada})`);
  });
  const titlesContainer = document.getElementById('modal-player-titles');
  if (titlesContainer) {
    if (titles.length) {
      titlesContainer.innerHTML = titles.map(t => `<span class="trainer-title-badge">${escapeHTML(t)}</span>`).join('');
      titlesContainer.style.display = 'flex';
    } else {
      titlesContainer.innerHTML = '';
      titlesContainer.style.display = 'none';
    }
  }

  // Decks Jogados na Temporada (Compact Chips)
  const playedDecksMap = {};
  (stagesIndex || []).forEach(stg => {
    const dName = getDeckForStage(player.Jogador, stg.data, player.ID);
    if (dName && dName.trim() !== '') {
      playedDecksMap[dName] = (playedDecksMap[dName] || 0) + 1;
    }
  });
  const decksSec = document.getElementById('modal-player-decks-section');
  const decksList = document.getElementById('modal-player-decks-list');
  if (decksSec && decksList) {
    const entries = Object.entries(playedDecksMap);
    if (entries.length > 0) {
      decksList.innerHTML = entries.map(([deck, count]) => {
        const energy = getDeckEnergy(deck);
        const dot = getEnergyDotHTML(energy);
        return `<span class="trainer-deck-tag">${dot} ${escapeHTML(deck)} (${count}x)</span>`;
      }).join('');
      decksSec.style.display = 'block';
    } else {
      decksSec.style.display = 'none';
    }
  }

  // Marca d'água holográfica sutil do último deck usado
  const watermarkEl = document.getElementById('modal-deck-watermark');
  if (watermarkEl) {
    let lastUsedDeck = '';
    const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
    const chronologicalStages = [...cleanStages].sort((a, b) => a.data.localeCompare(b.data));
    for (let i = chronologicalStages.length - 1; i >= 0; i--) {
      const stg = chronologicalStages[i];
      const dName = getDeckForStage(player.Jogador, stg.data, player.ID);
      if (dName && dName.trim() !== '' && dName !== 'Não registrado' && dName !== 'Sem deck registrado') {
        lastUsedDeck = dName;
        break;
      }
    }
    if (!lastUsedDeck && player.Deck && player.Deck !== 'Não registrado' && player.Deck !== 'Sem deck registrado') {
      lastUsedDeck = player.Deck;
    }

    let deckImgUrl = '';
    if (lastUsedDeck && appData.Decks && appData.Decks.length > 0) {
      const normDeck = normalizePlayerName(lastUsedDeck);
      const deckObj = appData.Decks.find(d => normalizePlayerName(d.deck || d.Deck || '') === normDeck);
      if (deckObj) {
        deckImgUrl = deckObj.imagem || deckObj.icone || '';
      }
    }

    if (deckImgUrl) {
      watermarkEl.style.backgroundImage = `url('${deckImgUrl}')`;
      watermarkEl.style.display = 'block';
    } else {
      watermarkEl.style.backgroundImage = 'none';
      watermarkEl.style.display = 'none';
    }
  }

  // Renderiza timeline com colocação e pontos conquistados por etapa
  renderPlayerTimeline(player);

  if (!stageScoresCache) {
    preloadStageScores().then(() => {
      const activeModal = document.getElementById('player-modal');
      if (activeModal && activeModal.classList.contains('active')) {
        renderPlayerTimeline(player);
      }
    });
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

function closePlayerModal() {
  const modal = document.getElementById('player-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

/* ==========================================================================
   SIMULADOR DE TOP CUT / CLASSIFICAÇÃO (MOBILE-FIRST)
   ========================================================================== */
let simCurrentMultiplier = 1.0;
let simCurrentVED = { v: 4, e: 0, d: 0 };
let simCurrentBasePoints = 12;

window.setSimMultiplier = function(mult) {
  simCurrentMultiplier = mult;
  ['sim-mult-1', 'sim-mult-15', 'sim-mult-2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  if (mult === 1.0) document.getElementById('sim-mult-1')?.classList.add('active');
  if (mult === 1.5) document.getElementById('sim-mult-15')?.classList.add('active');
  if (mult === 2.0) document.getElementById('sim-mult-2')?.classList.add('active');
  runSimulation();
};

window.setSimVED = function(v, e, d, btnEl) {
  simCurrentVED = { v: Number(v) || 0, e: Number(e) || 0, d: Number(d) || 0 };
  simCurrentBasePoints = (simCurrentVED.v * 3) + (simCurrentVED.e * 1);
  document.querySelectorAll('.sim-quick-grid .sim-quick-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  runSimulation();
};

window.setSimResult = function(basePts, btnEl) {
  simCurrentBasePoints = Number(basePts) || 0;
  const v = Math.floor(simCurrentBasePoints / 3);
  const e = simCurrentBasePoints % 3;
  simCurrentVED = { v, e, d: Math.max(0, 4 - v - e) };
  document.querySelectorAll('.sim-quick-grid .sim-quick-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  runSimulation();
};

window.openSimulatorModal = function() {
  const modal = document.getElementById('simulator-modal');
  const select = document.getElementById('sim-player-select');
  if (!modal || !select) return;

  const ranking = appData.Ranking || [];
  if (ranking.length === 0) {
    alert("Ranking ainda está carregando.");
    return;
  }

  select.innerHTML = ranking.map(p => `
    <option value="${escapeHTML(p.Jogador)}">${escapeHTML(p.Pos)}º - ${escapeHTML(p.Jogador)} (${toNumber(p.Pontos)} PTS)</option>
  `).join('');

  simCurrentMultiplier = 1.0;
  simCurrentVED = { v: 4, e: 0, d: 0 };
  simCurrentBasePoints = 12;

  // Reset visual buttons
  ['sim-mult-1', 'sim-mult-15', 'sim-mult-2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  document.getElementById('sim-mult-1')?.classList.add('active');

  document.querySelectorAll('.sim-quick-grid .sim-quick-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sim-res-4-0')?.classList.add('active');

  runSimulation();
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeSimulatorModal = function() {
  const modal = document.getElementById('simulator-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
};

window.runSimulation = function() {
  const selectPlayer = document.getElementById('sim-player-select');
  const resultsCard = document.getElementById('sim-results-card');
  const targetCard = document.getElementById('sim-target-card');
  if (!selectPlayer || !resultsCard) return;

  const playerName = selectPlayer.value;
  const multiplier = simCurrentMultiplier;
  const { v: addV, e: addE, d: addD } = simCurrentVED;
  const basePoints = (addV * 3) + (addE * 1);
  const addedPoints = basePoints * multiplier;

  const ranking = (appData.Ranking || []).map(p => ({
    ...p,
    PontosNum: toNumber(p.Pontos),
    VitoriasNum: toNumber(p.Vitorias),
    EmpatesNum: toNumber(p.Empates),
    DerrotasNum: toNumber(p.Derrotas),
    PodiosNum: toNumber(p.Podio),
    ParticipacoesNum: toNumber(p.Participacoes),
    PosNum: parseInt(p.Pos, 10) || 999
  }));

  const targetPlayer = ranking.find(p => p.Jogador === playerName);
  if (!targetPlayer) return;

  const currentPoints = targetPlayer.PontosNum;
  const currentPos = targetPlayer.PosNum;
  const projectedPoints = Number((currentPoints + addedPoints).toFixed(1));
  const newV = targetPlayer.VitoriasNum + addV;
  const newE = targetPlayer.EmpatesNum + addE;
  const newD = targetPlayer.DerrotasNum + addD;
  const newTotalMatches = newV + newE + newD;
  const newWinRate = newTotalMatches > 0 ? ((newV / newTotalMatches) * 100).toFixed(1) : '0.0';

  // Simular novo ranking com ordenação oficial
  const simulatedList = ranking.map(p => {
    if (p.Jogador === playerName) {
      return {
        ...p,
        PontosNum: projectedPoints,
        VitoriasNum: newV,
        EmpatesNum: newE,
        DerrotasNum: newD,
        ParticipacoesNum: targetPlayer.ParticipacoesNum + 1
      };
    }
    return p;
  }).sort((a, b) => {
    if (b.PontosNum !== a.PontosNum) return b.PontosNum - a.PontosNum;
    if (b.PodiosNum !== a.PodiosNum) return b.PodiosNum - a.PodiosNum;
    if (b.VitoriasNum !== a.VitoriasNum) return b.VitoriasNum - a.VitoriasNum;
    const wrA = (a.VitoriasNum + a.EmpatesNum + a.DerrotasNum) > 0 ? (a.VitoriasNum / (a.VitoriasNum + a.EmpatesNum + a.DerrotasNum)) : 0;
    const wrB = (b.VitoriasNum + b.EmpatesNum + b.DerrotasNum) > 0 ? (b.VitoriasNum / (b.VitoriasNum + b.EmpatesNum + b.DerrotasNum)) : 0;
    return wrB - wrA;
  });

  const projectedPos = simulatedList.findIndex(p => p.Jogador === playerName) + 1;
  const posDiff = currentPos - projectedPos;

  let posDiffHtml = '';
  if (posDiff > 0) {
    posDiffHtml = `<span style="color:#10b981; font-weight:700;">▲ Subiu ${posDiff} pos.</span>`;
  } else if (posDiff === 0) {
    posDiffHtml = `<span style="color:var(--text-secondary); font-weight:600;">= Manteve posição</span>`;
  } else {
    posDiffHtml = `<span style="color:#ef4444; font-weight:700;">▼ Desceu ${Math.abs(posDiff)} pos.</span>`;
  }

  let statusBadge = '';
  if (projectedPos <= 4) {
    statusBadge = `<span class="sim-status-badge sim-status-top4">🏆 Top 4 Garantido (Playoffs / Troféu)</span>`;
  } else if (projectedPos <= 8) {
    statusBadge = `<span class="sim-status-badge sim-status-top8">🎖️ Top 8 Garantido (Repescagem Top Cut)</span>`;
  } else if (projectedPos <= 12) {
    statusBadge = `<span class="sim-status-badge sim-status-bubble">⚠️ Zona de Bolha (Top 12)</span>`;
  } else {
    statusBadge = `<span class="sim-status-badge" style="background:rgba(255,255,255,0.06); color:var(--text-secondary); border:1px solid rgba(255,255,255,0.12);">⚔️ Em Disputa (${projectedPos}º Lugar)</span>`;
  }

  resultsCard.innerHTML = `
    <div style="text-align:center; margin-bottom:8px;">
      ${statusBadge}
    </div>
    <div class="sim-metric-row">
      <span style="color:var(--text-secondary);">Pontos:</span>
      <span>${currentPoints} PTS <strong style="color:var(--accent-yellow);">➔ ${projectedPoints} PTS</strong> (+${addedPoints} pts)</span>
    </div>
    <div class="sim-metric-row">
      <span style="color:var(--text-secondary);">Posição:</span>
      <span>${currentPos}º Lugar <strong style="color:#fff;">➔ ${projectedPos}º</strong> (${posDiffHtml})</span>
    </div>
    <div class="sim-metric-row">
      <span style="color:var(--text-secondary);">Cartel Simulado:</span>
      <span>${targetPlayer.VitoriasNum}V-${targetPlayer.EmpatesNum}E-${targetPlayer.DerrotasNum}D ➔ <strong>${newV}V-${newE}E-${newD}D</strong> (${newWinRate}% WR)</span>
    </div>
  `;

  // Calcular Meta Reversa Inteligente (Top 4 / Top 8)
  if (targetCard) {
    const p4 = ranking[3]; // 4º colocado
    const p8 = ranking[7]; // 8º colocado
    let metaText = '';

    if (currentPos <= 4) {
      const p1 = ranking[0];
      const diff1 = p1 ? Math.max(0, p1.PontosNum - currentPoints) : 0;
      if (currentPos === 1) {
        metaText = `👑 <strong>Você é o Líder!</strong> Com este resultado você consolida <strong>${projectedPoints} PTS</strong> e se mantém no topo da tabela.`;
      } else {
        const ptsNeededFor1st = Number((diff1 + 0.1).toFixed(1));
        metaText = `🏆 <strong>Você já está no Top 4!</strong> Para alcançar a liderança (1º lugar de ${escapeHTML(p1.Jogador)} com ${p1.PontosNum} pts), você precisa de <strong>+${ptsNeededFor1st} pts</strong>.`;
      }
    } else if (p4) {
      const diff4 = Number((p4.PontosNum - currentPoints + 0.1).toFixed(1));
      const requiredBasePts = Math.ceil(diff4 / multiplier);
      let possibleCombos = [];
      if (requiredBasePts <= 12) possibleCombos.push("4V-0D (12 pts)");
      if (requiredBasePts <= 10) possibleCombos.push("3V-1E (10 pts)");
      if (requiredBasePts <= 9) possibleCombos.push("3V-1D (9 pts)");
      if (requiredBasePts <= 7) possibleCombos.push("2V-1E (7 pts)");

      const comboHint = possibleCombos.length > 0 ? ` [Necessário: ${possibleCombos.slice(0, 2).join(' ou ')}]` : ` [Requer múltiplas vitórias em etapas consecutivas]`;
      metaText = `🎯 <strong>Meta Top 4:</strong> Faltam <strong>+${diff4} pts</strong> para ultrapassar ${escapeHTML(p4.Jogador)} (4º com ${p4.PontosNum} pts).${comboHint}`;
    } else if (p8) {
      const diff8 = Number((p8.PontosNum - currentPoints + 0.1).toFixed(1));
      metaText = `🎯 <strong>Meta Top 8 (Playoffs):</strong> Faltam <strong>+${diff8} pts</strong> para vaga na repescagem de ${escapeHTML(p8.Jogador)} (8º com ${p8.PontosNum} pts).`;
    }
    targetCard.innerHTML = metaText;
  }
};

/* ==========================================================================
   CÁLCULO DA POKÉBOLA DE OURO - SALDO LÍQUIDO DE VITÓRIAS (V - D)
   ========================================================================== */
function calculatePokebolaDeOuroCandidates(rankingData) {
  const minEtapas = appData.Configuracoes?.MinEtapasPokebolaOuro !== undefined 
    ? toNumber(appData.Configuracoes.MinEtapasPokebolaOuro) 
    : 4;
  const eligible = (rankingData || []).filter(r => r && toNumber(r.Participacoes) >= minEtapas).map(r => {
    const wins = toNumber(r.Vitorias);
    const losses = toNumber(r.Derrotas);
    const draws = toNumber(r.Empates);
    const total = wins + losses + draws;
    const winRate = total > 0 ? (wins / total) : 0;
    const participations = toNumber(r.Participacoes);
    const podiums = toNumber(r.Podio);
    const points = toNumber(r.Pontos);
    const saldo = wins - losses;
    return {
      player: r.Jogador || r.Player || r.Name || 'Desconhecido',
      raw: r,
      wins,
      losses,
      draws,
      total,
      winRate,
      participations,
      podiums,
      points,
      saldo,
      score: saldo
    };
  });

  eligible.sort((a, b) => {
    if (b.saldo !== a.saldo) return b.saldo - a.saldo; // 1º Maior Saldo Positivo (V - D)
    if (b.participations !== a.participations) return b.participations - a.participations; // 2º Etapas Disputadas (Assiduidade)
    if (b.winRate !== a.winRate) return b.winRate - a.winRate; // 3º Maior Win Rate %
    if (b.podiums !== a.podiums) return b.podiums - a.podiums; // 4º Pódios
    return b.points - a.points;
  });

  return eligible;
}

/* ==========================================================================
   CÁLCULO DA POKÉBOLA MURCHA - DÉFICIT DE VITÓRIAS (D - V) & ASSIDUIDADE
   ========================================================================== */
function calculatePokebolaMurchaCandidates(rankingData, cleanStages = []) {
  const minEtapas = appData.Configuracoes?.MinEtapasPokebolaMurcha !== undefined 
    ? toNumber(appData.Configuracoes.MinEtapasPokebolaMurcha) 
    : 4;

  const cupChallengeStages = (cleanStages || []).filter(s => {
    const t = String(s.tipo || '').toLowerCase();
    return t.includes('cup') || t.includes('challenge') || t.includes('copa') || t.includes('desafio');
  });

  // Filtra quem disputou no mínimo o corte de etapas e tem mais derrotas do que vitórias (D > V)
  let baseList = (rankingData || []).filter(r => r && toNumber(r.Participacoes) >= minEtapas && toNumber(r.Derrotas) > toNumber(r.Vitorias));
  // Fallback se ninguém tiver D > V com o corte
  if (baseList.length === 0) {
    baseList = (rankingData || []).filter(r => r && toNumber(r.Participacoes) >= minEtapas);
  }

  const eligible = baseList.map(r => {
    const playerName = r.Jogador || r.Player || r.Name || 'Desconhecido';
    const wins = toNumber(r.Vitorias);
    const losses = toNumber(r.Derrotas);
    const draws = toNumber(r.Empates);
    const total = wins + losses + draws;
    const lossRate = total > 0 ? (losses / total) : 0;
    const participations = toNumber(r.Participacoes);
    const deficit = losses - wins;
    const assiduidadeCupChal = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(playerName, stage.data, r.ID) !== null).length;

    return {
      player: playerName,
      raw: r,
      wins,
      losses,
      defeats: losses,
      draws,
      total,
      lossRate,
      participations,
      deficit,
      ratio: participations > 0 ? (losses / participations) : 0,
      assiduidade: assiduidadeCupChal
    };
  });

  eligible.sort((a, b) => {
    if (b.deficit !== a.deficit) return b.deficit - a.deficit; // 1º Maior Déficit de Vitórias (D - V)
    if (b.participations !== a.participations) return b.participations - a.participations; // 2º Etapas Disputadas (Assiduidade e Persistência)
    if (b.lossRate !== a.lossRate) return b.lossRate - a.lossRate; // 3º Maior Taxa de Derrotas %
    if (b.defeats !== a.defeats) return b.defeats - a.defeats; // 4º Total de Derrotas
    return b.assiduidade - a.assiduidade;
  });

  return eligible;
}

/* ==========================================================================
   MODO TELÃO DA LOJA (TV BROADCAST DISPLAY MODE)
   ========================================================================== */
let tvModeActive = false;
let tvCurrentSlide = 0;
let tvSlideTimer = null;
let tvClockTimer = null;
let tvProgressTimer = null;
let tvIsPaused = false;
let tvProgress = 0;
const TV_SLIDE_DURATION = 12000; // 12 segundos por slide

window.openTvMode = function() {
  const overlay = document.getElementById('tv-mode-overlay');
  if (!overlay) return;

  tvModeActive = true;
  tvIsPaused = false;
  tvCurrentSlide = 0;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Request fullscreen if supported
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  renderTvSlide(0);
  startTvTimers();
  updateTvClock();
};

window.closeTvMode = function() {
  const overlay = document.getElementById('tv-mode-overlay');
  if (overlay) overlay.style.display = 'none';

  tvModeActive = false;
  clearInterval(tvSlideTimer);
  clearInterval(tvClockTimer);
  clearInterval(tvProgressTimer);
  document.body.style.overflow = '';

  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
};

window.toggleTvPause = function() {
  tvIsPaused = !tvIsPaused;
  const btn = document.getElementById('tv-pause-btn');
  if (btn) btn.innerText = tvIsPaused ? '▶' : '⏸';
};

window.nextTvSlide = function() {
  tvProgress = 0;
  renderTvSlide((tvCurrentSlide + 1) % 4);
};

window.prevTvSlide = function() {
  tvProgress = 0;
  renderTvSlide((tvCurrentSlide - 1 + 4) % 4);
};

function startTvTimers() {
  clearInterval(tvSlideTimer);
  clearInterval(tvClockTimer);
  clearInterval(tvProgressTimer);

  tvClockTimer = setInterval(updateTvClock, 1000);

  const stepMs = 100;
  tvProgressTimer = setInterval(() => {
    if (!tvIsPaused) {
      tvProgress += (stepMs / TV_SLIDE_DURATION) * 100;
      const bar = document.getElementById('tv-progress-bar');
      if (bar) bar.style.width = Math.min(tvProgress, 100) + '%';

      if (tvProgress >= 100) {
        tvProgress = 0;
        renderTvSlide((tvCurrentSlide + 1) % 4);
      }
    }
  }, stepMs);
}

function updateTvClock() {
  const clockEl = document.getElementById('tv-clock');
  if (!clockEl) return;
  const now = new Date();
  clockEl.innerText = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderTvSlide(slideIdx) {
  tvCurrentSlide = slideIdx;
  const body = document.getElementById('tv-body');
  const titleEl = document.getElementById('tv-slide-title');
  if (!body) return;

  const ranking = appData.Ranking || [];

  if (slideIdx === 0) {
    // Slide 1: Top 4 Podium
    if (titleEl) titleEl.innerText = 'TOP 4 DA TEMPORADA';
    const top4 = ranking.slice(0, 4);
    const badges = ['🥇', '🥈', '🥉', '🎖️'];

    body.innerHTML = `
      <div class="tv-podium-grid">
        ${top4.map((player, idx) => {
          return `
            <div class="tv-podium-card rank-${idx + 1}">
              <div class="tv-podium-badge">${badges[idx]}</div>
              <div class="tv-podium-name">${escapeHTML(player.Jogador)}</div>
              <div class="tv-podium-score">${toNumber(player.Pontos)} PTS</div>
              <div class="tv-podium-deck">${escapeHTML(player.Deck || 'Deck Não Registrado')}</div>
              <div style="margin-top:10px; font-size:0.85rem; color:var(--text-secondary);">
                ${player.Vitorias || 0}V • ${player.Empates || 0}E • ${player.Derrotas || 0}D
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (slideIdx === 1) {
    // Slide 2: Top 12 Leaderboard
    if (titleEl) titleEl.innerText = 'CLASSIFICAÇÃO GERAL';
    const top12 = ranking.slice(0, 12);
    const col1 = top12.slice(0, 6);
    const col2 = top12.slice(6, 12);

    body.innerHTML = `
      <div class="tv-leaderboard-grid">
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${col1.map((p, idx) => `
            <div class="tv-leaderboard-row ${idx < 4 ? 'top-4' : ''}">
              <div style="display:flex; align-items:center; gap:12px;">
                <strong style="color:var(--accent-yellow); min-width:28px;">${idx + 1}º</strong>
                <span>${escapeHTML(p.Jogador)}</span>
              </div>
              <strong style="color:#fff;">${toNumber(p.Pontos)} PTS</strong>
            </div>
          `).join('')}
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${col2.map((p, idx) => `
            <div class="tv-leaderboard-row">
              <div style="display:flex; align-items:center; gap:12px;">
                <strong style="color:var(--text-secondary); min-width:28px;">${idx + 7}º</strong>
                <span>${escapeHTML(p.Jogador)}</span>
              </div>
              <strong style="color:#fff;">${toNumber(p.Pontos)} PTS</strong>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (slideIdx === 2) {
    // Slide 3: Premiações da Temporada
    if (titleEl) titleEl.innerText = 'PREMIAÇÕES DA TEMPORADA (EM DISPUTA)';

    const goldCandidates = calculatePokebolaDeOuroCandidates(ranking);
    const bestGold = goldCandidates[0] || null;

    const murchaCandidates = calculatePokebolaMurchaCandidates(ranking, appData.Etapas || []);
    const bestMurcha = murchaCandidates[0] || null;

    let mostActive = null;
    ranking.forEach(p => {
      const part = toNumber(p.Participacoes);
      if (!mostActive || part > mostActive.part) {
        mostActive = { player: p.Jogador, part };
      }
    });

    body.innerHTML = `
      <div class="tv-awards-grid">
        <div class="tv-award-card" style="border-color:rgba(255,203,5,0.4);">
          <div class="tv-award-icon">🥇</div>
          <div class="tv-award-title">Pokébola de Ouro</div>
          <div class="tv-award-player">${bestGold ? escapeHTML(bestGold.player) : '-'}</div>
          <div class="tv-award-stat">${bestGold ? `Saldo +${bestGold.saldo} (${bestGold.wins}V - ${bestGold.losses}D em ${bestGold.participations} et)` : 'Em disputa'}</div>
        </div>

        <div class="tv-award-card" style="border-color:rgba(16,185,129,0.4);">
          <div class="tv-award-icon">🥋</div>
          <div class="tv-award-title">Líder de Ginásio</div>
          <div class="tv-award-player">${mostActive ? escapeHTML(mostActive.player) : '-'}</div>
          <div class="tv-award-stat">${mostActive ? `${mostActive.part} participações` : 'Em disputa'}</div>
        </div>

        <div class="tv-award-card" style="border-color:rgba(141,86,255,0.4);">
          <div class="tv-award-icon">🧬</div>
          <div class="tv-award-title">Ditto Player</div>
          <div class="tv-award-player">${ranking[0] ? escapeHTML(ranking[0].Jogador) : '-'}</div>
          <div class="tv-award-stat">Maior versatilidade de decks</div>
        </div>

        <div class="tv-award-card" style="border-color:rgba(239,68,68,0.4);">
          <div class="tv-award-icon">🥀</div>
          <div class="tv-award-title">Pokébola Murcha</div>
          <div class="tv-award-player">${bestMurcha ? escapeHTML(bestMurcha.player) : '-'}</div>
          <div class="tv-award-stat">${bestMurcha ? `Déficit +${bestMurcha.deficit} (${bestMurcha.defeats}D vs ${bestMurcha.wins}V em ${bestMurcha.participations} et)` : 'Em disputa'}</div>
        </div>
      </div>
    `;
  }
}

// Fechar modo telão com tecla ESC
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && tvModeActive) {
    closeTvMode();
  }
});

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
    icon = `
      <span style="display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:50%; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.18); box-shadow:inset 0 0 6px rgba(255,255,255,0.15), 0 4px 10px rgba(0,0,0,0.3); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); position:relative; flex-shrink:0;">
        <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png" style="width:36px; height:36px; object-fit:contain; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:2; filter: sepia(1) saturate(10) hue-rotate(20deg) brightness(1.2);" alt="Golden Pokéball">
      </span>
    `;
    const goldCandidates = calculatePokebolaDeOuroCandidates(appData.Ranking || []);
    const top = goldCandidates[0];
    winnerName = top ? top.player : 'Em disputa';
    description = 'Prêmio de honra máxima individual da temporada pelo Saldo Líquido de Vitórias (V - D), consagrando o treinador mais consistente e vitorioso que mais venceu além do que perdeu.';
    formulaHtml = `
      <div style="font-size:0.75rem; background:rgba(255,203,5,0.06); border:1px solid rgba(255,203,5,0.2); padding:8px 10px; border-radius:10px; color:var(--text-secondary); margin-top:6px;">
        <div style="color:var(--accent-yellow); font-weight:700; margin-bottom:2px;">Critérios Oficiais de Performance (Saldo V - D):</div>
        <div style="color:#fff; font-size:0.75rem; margin:3px 0; line-height:1.3;">
          • <strong>1º Critério Principal:</strong> Maior Saldo Positivo (<strong>Vitórias − Derrotas</strong>).<br>
          • <strong>2º Desempate:</strong> Maior <strong>Quantidade de Etapas Disputadas</strong> (assiduidade).<br>
          • <strong>3º Desempate:</strong> Maior <strong>Win Rate %</strong> (V ÷ Total de Jogos).<br>
          • <strong>4º Desempate:</strong> Maior número de <strong>Pódios (Top 4)</strong>.
        </div>
        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">* Exige corte mínimo de 4 etapas disputadas na temporada.</div>
      </div>
    `;
    if (top) {
      detailHtml = `
        <div style="display:flex; flex-direction:column; gap:4px; font-size:0.82rem; border-top:1px solid rgba(255,255,255,0.06); padding-top:8px; margin-top:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-secondary);">Líder Atual:</span>
            <strong style="color:#fff; font-size:0.95rem;">${escapeHTML(top.player)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-secondary);">Saldo Líquido (V − D):</span>
            <strong style="color:var(--accent-yellow); font-size:1.1rem;">+${top.saldo} Vitórias</strong>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-secondary);">Assiduidade / Presença:</span>
            <span><strong>${top.participations} etapas</strong> disputadas</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-secondary);">Cartel Real:</span>
            <span>${top.wins}V - ${top.draws}E - ${top.losses}D (<strong>${(top.winRate * 100).toFixed(1)}% WR</strong>)</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-secondary);">Pódios Conquistados:</span>
            <span>${top.podiums} Top 4 (${toNumber(top.points).toFixed(0)} PTS)</span>
          </div>
        </div>
      `;
    }

    rankingHtml = `
      <details style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; cursor: pointer;">
        <summary style="font-size: 0.85rem; font-weight: 600; color: var(--accent-yellow); outline: none; user-select: none;">
          📊 Ver Classificação Completa da Pokébola de Ouro
        </summary>
        <div style="margin-top: 10px; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.78rem;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); font-size: 0.68rem; text-transform: uppercase;">
                <th style="padding: 4px 5px;">Pos</th>
                <th style="padding: 4px 5px;">Jogador</th>
                <th style="padding: 4px 5px; text-align: center;">Saldo</th>
                <th style="padding: 4px 5px; text-align: right;">Cartel (WR / Etapas)</th>
              </tr>
            </thead>
            <tbody>
              ${goldCandidates.map((c, i) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); color: ${i === 0 ? 'var(--accent-yellow)' : '#fff'}">
                  <td style="padding: 4px 5px; font-weight: bold;">${i + 1}º</td>
                  <td style="padding: 4px 5px;">${escapeHTML(c.player)}</td>
                  <td style="padding: 4px 5px; text-align: center; font-weight: bold; color:var(--accent-yellow);">+${c.saldo}</td>
                  <td style="padding: 4px 5px; text-align: right; font-size:0.72rem; color:var(--text-secondary);">
                    ${c.wins}V-${c.losses}D (${(c.winRate * 100).toFixed(1)}% WR em ${c.participations} et)
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
    icon = `
      <span style="display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:50%; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.18); box-shadow:inset 0 0 6px rgba(255,255,255,0.15), 0 4px 10px rgba(0,0,0,0.3); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); position:relative; flex-shrink:0;">
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="width:36px; height:36px; object-fit:contain; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:2;">
          <path d="M32 4 L48 24 L48 44 L32 60 L16 44 L16 24 Z" fill="#dca300" stroke="#ffcb05" stroke-width="2" stroke-linejoin="round"/>
          <path d="M32 6 L45 24 L45 42 L32 56 L19 42 L19 24 Z" fill="#1e4620" />
          <line x1="32" y1="8" x2="32" y2="54" stroke="#ffcb05" stroke-width="2" stroke-linecap="round"/>
          <line x1="32" y1="20" x2="42" y2="14" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="32" y1="20" x2="22" y2="14" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="32" y1="32" x2="42" y2="26" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="32" y1="32" x2="22" y2="26" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="32" y1="44" x2="40" y2="38" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="32" y1="44" x2="24" y2="38" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </span>
    `;
    
    const gymCandidates = [...appData.Ranking].map(r => {
      const playerName = r.Jogador || r.Player || r.Name;
      const totalPart = toNumber(r.Participacoes);
      const cupChallengePart = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(playerName, stage.data, r.ID) !== null).length;
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
    icon = `
      <span style="display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:50%; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.18); box-shadow:inset 0 0 6px rgba(255,255,255,0.15), 0 4px 10px rgba(0,0,0,0.3); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); position:relative; flex-shrink:0;">
        <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png" style="width:58px; height:58px; object-fit:contain; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:2;" alt="Ditto">
      </span>
    `;
    
    const dittoCandidates = [];
    (appData.Ranking || []).forEach(r => {
      if (!r) return;
      const playerName = r.Jogador || r.Player || r.Name;
      if (!playerName) return;
      
      const uniqueDecksNormalized = new Set();
      const uniqueDecksOriginal = [];
      cleanStages.forEach(stage => {
        if (!stage || !stage.data) return;
        const deck = getDeckForStage(playerName, stage.data, r.ID);
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
        const partCount = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(playerName, stage.data, r.ID) !== null).length;
        const mediaColocacao = toNumber(r.MediaColocacao);
        dittoCandidates.push({
          player: playerName,
          count: uniqueDecksNormalized.size,
          decks: uniqueDecksOriginal,
          participations: partCount,
          mediaColocacao: mediaColocacao
        });
      }
    });
    dittoCandidates.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      
      const mediaA = a.mediaColocacao > 0 ? a.mediaColocacao : 999999;
      const mediaB = b.mediaColocacao > 0 ? b.mediaColocacao : 999999;
      if (mediaA !== mediaB) return mediaA - mediaB;
      
      return b.participations - a.participations;
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
    icon = `
      <span style="display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:50%; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.18); box-shadow:inset 0 0 6px rgba(255,255,255,0.15), 0 4px 10px rgba(0,0,0,0.3); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); position:relative; flex-shrink:0;">
        <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/black-sludge.png" style="width:36px; height:36px; object-fit:contain; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:2;" alt="Black Sludge">
      </span>
    `;
    const murchaCandidates = calculatePokebolaMurchaCandidates(appData.Ranking || [], appData.Etapas || []);
    const top = murchaCandidates[0];
    winnerName = top ? top.player : 'Nenhum';
    description = 'Prêmio de consolação e resiliência para o treinador frequente com o maior déficit de vitórias (mais derrotas do que vitórias acumuladas), utilizando a quantidade de etapas jogadas como critério de persistência.';
    formulaHtml = `
      <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; display:flex; flex-direction:column; gap:4px; color:var(--text-secondary); margin-top:8px;">
        <div style="color:var(--accent-yellow); font-weight:700;">Critérios de Ordenação (Déficit D − V):</div>
        <div style="font-size:0.75rem; margin-top:4px; line-height:1.4;">
          • <strong>1º Critério Principal:</strong> Maior Déficit de Vitórias (<strong>Derrotas − Vitórias</strong>).<br>
          • <strong>2º Desempate:</strong> Maior <strong>Quantidade de Etapas Disputadas</strong> (persistência de quem comparece à loja).<br>
          • <strong>3º Desempate:</strong> Maior <strong>Taxa de Derrotas %</strong> (D ÷ Total de Partidas).<br>
          • <strong>4º Desempate:</strong> Maior Total Absoluto de <strong>Derrotas</strong>.
        </div>
        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">* Exige corte mínimo de 4 etapas disputadas e mais derrotas do que vitórias (D > V).</div>
      </div>
    `;
    if (top) {
      detailHtml = `
        <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; margin-top:8px;">
          <div style="font-weight:600; color:#fff; font-size:1rem; margin-bottom:4px;">Cálculo do Vencedor (${escapeHTML(top.player)}):</div>
          <div style="display:flex; justify-content:space-between;"><span>Déficit de Vitórias (D − V):</span><strong style="color:#f87171; font-size:1.05rem;">+${top.deficit} Derrotas</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Assiduidade / Presença:</span><strong style="color:var(--accent-yellow);">${top.participations} etapas disputadas</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Cartel Real:</span><strong style="color:#fff;">${top.defeats}D vs ${top.wins}V (${(top.lossRate * 100).toFixed(1)}% Derrotas)</strong></div>
          <div style="display:flex; justify-content:space-between; margin-top:4px;"><span>Presença em Cup/Challenge:</span><strong style="color:#fff;">${top.assiduidade} etapas</strong></div>
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
                <th style="padding: 4px 6px; text-align: center;">Déficit</th>
                <th style="padding: 4px 6px; text-align: right;">Cartel (Derrotas / Etapas)</th>
              </tr>
            </thead>
            <tbody>
              ${murchaCandidates.map((c, i) => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); color: ${i === 0 ? 'var(--accent-yellow)' : '#fff'}">
                  <td style="padding: 4px 6px; font-weight: bold;">${i + 1}º</td>
                  <td style="padding: 4px 6px;">${escapeHTML(c.player)}</td>
                  <td style="padding: 4px 6px; text-align: center; font-weight: bold; color:#f87171;">+${c.deficit}</td>
                  <td style="padding: 4px 6px; text-align: right; font-weight: bold;">
                    ${c.defeats}D vs ${c.wins}V 
                    <span style="font-size:0.7rem; font-weight: normal; color:var(--text-secondary);">(${(c.lossRate * 100).toFixed(1)}% em ${c.participations}et)</span>
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
    const rawHash = window.location.hash.substring(1);
    const hash = rawHash.split('?')[0];
    const urlParams = new URLSearchParams(window.location.search);

    // Suporte a link direto de inscrição / envio de decklist
    if (hash === 'inscricao' || hash === 'decklist' || urlParams.has('inscricao')) {
      setTimeout(() => {
        if (typeof openDecklistModal === 'function') {
          openDecklistModal();
        }
      }, 150);
      navigateTo('dashboard');
      return;
    }

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
        
        const stageInfo = stagesIndex.find(s => s.data === selectedValue);
        const stageMult = Number(stageInfo?.multiplicador) || 1.0;

        // Se a etapa tiver multiplicador especial (ex: 1.5x Challenge ou Cup), aplica aos pontos individuais
        if (stageMult !== 1.0) {
          stagePlayers.forEach(sp => {
            const rawPts = Number(getFirstDefined(sp, ['Pontos', 'Points', 'Pts'])) || 0;
            sp.BasePontos = rawPts;
            sp.Pontos = rawPts * stageMult;
            sp.Multiplicador = stageMult;
          });
        }
        
        const normalized = normalizeRanking(stagePlayers, [], true);
        currentRankingList = normalized;
        renderRankingTable(normalized, 1);

        if (searchInput) searchInput.value = '';
        if (catSelector) catSelector.value = 'all';

        if (stageInfo && infoBadge) {
          const parts = selectedValue.split('-');
          const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : selectedValue;
          const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
          const chronologicalStages = [...cleanStages].sort((a, b) => a.data.localeCompare(b.data));
          const stageTitle = getStageDisplayName(stageInfo, chronologicalStages);
          const eventLabel = stageTitle ? stageTitle.split(' - ')[0] : (stageInfo.tipo || 'Liga');

          document.getElementById('stage-info-date').innerText = formattedDate;
          document.getElementById('stage-info-type').innerText = eventLabel;
          document.getElementById('stage-info-multiplier').innerText = `${stageMult.toFixed(1)}x`;
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
  const sortedDecks = Object.keys(deckCounts)
    .filter(deckName => (deckCounts[deckName] || 0) > 0 && deckName && deckName.trim() !== '')
    .map(deckName => {
      const deckInfo = decksTab.find(d => (d.Deck || d.deck || '').trim().toLowerCase() === deckName.toLowerCase());
      return {
        deck: deckName,
        count: deckCounts[deckName],
        image: deckInfo ? (deckInfo.Imagem || deckInfo.imagem) : null,
        icone: deckInfo ? (deckInfo.Icone || deckInfo.icone) : null,
        energia: deckInfo ? (deckInfo.TipoEnergia || deckInfo.tipoEnergia || '') : '',
        limitless: deckInfo ? (deckInfo.Limitless || deckInfo.limitless || deckInfo.Link || deckInfo.URL || '#') : '#'
      };
    }).sort((a, b) => b.count - a.count);
  
  const chartType = 'doughnut';
  
  if (!window.outrosExpandedState) window.outrosExpandedState = {};
  
  let chartDecks = [];
  let accordionDecks = sortedDecks; // Accordion always shows all
  
  // Total decks in this session / metagame view
  const totalDecksCount = sortedDecks.reduce((sum, d) => sum + d.count, 0) || 1;

  // Doughnut Grouping logic
  if (chartType === 'doughnut') {
    let outrosCount = 0;
    let outrosDecksList = [];
    let mainDecksCount = 0;
    const isExpanded = window.outrosExpandedState[selectedSession];
    
    // Categorize decks into main and outros decks
    // Decks with count === 1, named 'outros'/'outros decks', OR whose rounded percentage is <= 1% are grouped into 'Outros Decks'
    sortedDecks.forEach(d => {
      const isOutrosVal = d.deck.toLowerCase() === 'outros' || d.deck.toLowerCase() === 'outros decks';
      const pct = (d.count / totalDecksCount) * 100;
      const isMinorDeck = d.count === 1 || isOutrosVal || pct < 1.5;
      
      if (isMinorDeck) {
        outrosCount += d.count;
        outrosDecksList.push(d);
      } else {
        mainDecksCount += d.count;
      }
    });

    if (isExpanded) {
      // DRILL-DOWN MODE: Show all minor decks (which are in outrosDecksList)
      chartDecks = outrosDecksList.filter(d => d.count > 0);
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
        const pct = (d.count / totalDecksCount) * 100;
        const isMinorDeck = d.count === 1 || isOutrosVal || pct < 1.5;
        if (!isMinorDeck && d.count > 0) {
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
    chartDecks = sortedDecks.filter(d => d.count > 0);
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
        const total = totalDecksCount || 1;
        const rawPct = (realCount / total) * 100;
        const pctStr = (rawPct < 1 && rawPct > 0) ? rawPct.toFixed(1).replace('.', ',') + '%' : Math.round(rawPct) + '%';
        if (deckInfo.image) {
          innerHtml += `<img src="${safeExternalUrl(deckInfo.image)}" style="width: 100px; height: 140px; object-fit: cover; border-radius: 4px; margin-bottom: 5px;">`;
        }
        innerHtml += `<div style="font-weight: bold; text-align: center;">${escapeHTML(deckInfo.deck)}</div>`;
        innerHtml += `<div style="text-align: center; color: var(--text-secondary); font-size: 0.9rem;">${realCount} jogador(es) (${pctStr})</div>`;
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

      // 1. Pokébola de Ouro: Treinador Mais Completo (Método 2 - Ranking Multidimensional Decatlo)
      const goldCandidates = calculatePokebolaDeOuroCandidates(appData.Ranking || []);
      const bestGoldCandidate = goldCandidates[0] || null;
      const pokebolaDeOuroPlayer = bestGoldCandidate ? bestGoldCandidate.raw : null;

      // 2. Líder de Ginásio: Jogador com maior número de participações (desempates: presenças Cup/Challenge, depois pontuação)
      const liderDeGinasioPlayer = [...appData.Ranking].sort((a, b) => {
        const partA = toNumber(a.Participacoes);
        const partB = toNumber(b.Participacoes);
        if (partB !== partA) return partB - partA;
        
        const cupChalA = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(a.Jogador || a.Player || a.Name, stage.data, a.ID) !== null).length;
        const cupChalB = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(b.Jogador || b.Player || b.Name, stage.data, b.ID) !== null).length;
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
          const deck = getDeckForStage(playerName, stage.data, r.ID);
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
          const partCount = cupChallengeStages.filter(stage => stage && stage.data && getDeckForStage(playerName, stage.data, r.ID) !== null).length;
          const mediaColocacao = toNumber(r.MediaColocacao);
          dittoCandidates.push({
            player: playerName,
            count: uniqueDecksNormalized.size,
            decks: uniqueDecksOriginal,
            participations: partCount,
            mediaColocacao: mediaColocacao
          });
        }
      });
      dittoCandidates.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        
        const mediaA = a.mediaColocacao > 0 ? a.mediaColocacao : 999999;
        const mediaB = b.mediaColocacao > 0 ? b.mediaColocacao : 999999;
        if (mediaA !== mediaB) return mediaA - mediaB;
        
        return b.participations - a.participations;
      });
      const dittoPlayer = dittoCandidates[0];

      // 4. Pokébola Murcha: Maior déficit de vitórias (D - V) com desempate por assiduidade
      const murchaCandidates = calculatePokebolaMurchaCandidates(appData.Ranking || [], appData.Etapas || []);
      const murchaPlayer = murchaCandidates[0] || null;

      const goldCardHtml = bestGoldCandidate ? `
        <div class="glass-card" onclick="window.openAwardModal('gold')" style="flex: 1 1 250px; padding: 1.5rem; display:flex; flex-direction:column; gap:10px; border-radius:var(--radius); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2); cursor: pointer; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-4px)'" onmouseleave="this.style.transform='none'">
          <div style="display:flex; align-items:center; gap:10px; margin-top:-5px;">
            <span style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:50%; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.18); box-shadow:inset 0 0 6px rgba(255,255,255,0.15), 0 4px 10px rgba(0,0,0,0.3); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); position:relative; flex-shrink:0; margin-right:4px;">
              <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png" style="width:32px; height:32px; object-fit:contain; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:2; filter: sepia(1) saturate(10) hue-rotate(20deg) brightness(1.2);" alt="Golden Pokéball">
            </span>
            <div>
              <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700; letter-spacing:1px;">Pokébola de Ouro</div>
              <div style="font-weight:700; color:#fff; font-size:1.1rem; line-height:1.2; margin-top:2px;">${escapeHTML(bestGoldCandidate.player)}</div>
            </div>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top: 5px;">
            Maior saldo líquido de vitórias (+${bestGoldCandidate.saldo}) com menor taxa de derrotas.
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:auto; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.8rem;">
            <div>Saldo: <strong style="color:var(--accent-yellow); font-size:1.05rem;">+${bestGoldCandidate.saldo}</strong></div>
            <div>Cartel: <strong>${bestGoldCandidate.wins}V - ${bestGoldCandidate.losses}D (${bestGoldCandidate.participations} et)</strong></div>
          </div>
          <div style="font-size:0.7rem; color:var(--accent-yellow); text-align:right; margin-top:2px;">Ver classificação completa ➔</div>
        </div>
      ` : '';

      const gymLeaderCardHtml = liderDeGinasioPlayer ? `
        <div class="glass-card" onclick="window.openAwardModal('gym')" style="flex: 1 1 250px; padding: 1.5rem; display:flex; flex-direction:column; gap:10px; border-radius:var(--radius); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2); cursor: pointer; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-4px)'" onmouseleave="this.style.transform='none'">
          <div style="display:flex; align-items:center; gap:10px; margin-top:-5px;">
            <span style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:50%; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.18); box-shadow:inset 0 0 6px rgba(255,255,255,0.15), 0 4px 10px rgba(0,0,0,0.3); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); position:relative; flex-shrink:0; margin-right:4px;">
              <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="width:28px; height:28px; object-fit:contain; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:2;">
                <path d="M32 4 L48 24 L48 44 L32 60 L16 44 L16 24 Z" fill="#dca300" stroke="#ffcb05" stroke-width="2" stroke-linejoin="round"/>
                <path d="M32 6 L45 24 L45 42 L32 56 L19 42 L19 24 Z" fill="#1e4620" />
                <line x1="32" y1="8" x2="32" y2="54" stroke="#ffcb05" stroke-width="2" stroke-linecap="round"/>
                <line x1="32" y1="20" x2="42" y2="14" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="32" y1="20" x2="22" y2="14" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="32" y1="32" x2="42" y2="26" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="32" y1="32" x2="22" y2="26" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="32" y1="44" x2="40" y2="38" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="32" y1="44" x2="24" y2="38" stroke="#ffcb05" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </span>
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
            <span style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:50%; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.18); box-shadow:inset 0 0 6px rgba(255,255,255,0.15), 0 4px 10px rgba(0,0,0,0.3); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); position:relative; flex-shrink:0; margin-right:4px;">
              <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png" style="width:50px; height:50px; object-fit:contain; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:2;" alt="Ditto">
            </span>
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
            <span style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:50%; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.18); box-shadow:inset 0 0 6px rgba(255,255,255,0.15), 0 4px 10px rgba(0,0,0,0.3); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); position:relative; flex-shrink:0; margin-right:4px;">
              <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/black-sludge.png" style="width:34px; height:34px; object-fit:contain; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:2;" alt="Black Sludge">
            </span>
            <div>
              <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700; letter-spacing:1px;">Pokébola Murcha</div>
              <div style="font-weight:700; color:#fff; font-size:1.1rem; line-height:1.2; margin-top:2px;">${escapeHTML(murchaPlayer.player)}</div>
            </div>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top: 5px;">
            Maior déficit de derrotas (+${murchaPlayer.deficit}) e persistência nas etapas.
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:auto; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.8rem;">
            <div>Déficit: <strong style="color:#f87171; font-size:1.05rem;">+${murchaPlayer.deficit}</strong></div>
            <div>Cartel: <strong>${murchaPlayer.defeats}D vs ${murchaPlayer.wins}V (${murchaPlayer.participations} et.)</strong></div>
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
            const drawnIcons = []; // Track drawn icon coordinates to prevent overlapping
            
            meta.data.forEach((element, index) => {
              const val = chart.data.datasets[0].data[index];
              const deckObj = (chart._chartDecks || chartDecks)[index];
              const realCount = deckObj ? (deckObj.realCount !== undefined ? deckObj.realCount : deckObj.count) : val;
              
              if (val < 1 || realCount <= 0) return;
              
              const rawPct = (realCount / totalDecksCount) * 100;
              let percent = '';
              if (rawPct < 1 && rawPct > 0) {
                // Show 0,X% (e.g. 0,4%, 0,7%) so it never shows 0% for played decks
                percent = rawPct.toFixed(1).replace('.', ',') + '%';
              } else {
                percent = Math.round(rawPct) + '%';
              }
              
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

              // Icon drawing with collision avoidance so icons NEVER overlap or clump
              if (!isOutros && !isVisaoGeral && deckData && deckData.icone) {
                const iconSize = 28;
                const possibleOffsets = [20, 38, 56, 74, 92];
                let chosenOffset = null;
                let finalDrawX = 0;
                let finalDrawY = 0;

                for (let off of possibleOffsets) {
                  const testR = outerRadius + off;
                  const testX = x0 + Math.cos(angle) * testR;
                  const testY = y0 + Math.sin(angle) * testR;
                  
                  const hasCollision = drawnIcons.some(pos => {
                    const dist = Math.hypot(testX - pos.x, testY - pos.y);
                    return dist < (iconSize + 6); // Minimum 34px distance
                  });

                  if (!hasCollision) {
                    chosenOffset = off;
                    finalDrawX = testX;
                    finalDrawY = testY;
                    break;
                  }
                }

                if (chosenOffset !== null) {
                  drawnIcons.push({ x: finalDrawX, y: finalDrawY });

                  drawCtx.save();
                  drawCtx.beginPath();
                  drawCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                  drawCtx.lineWidth = 1;
                  const startX = x0 + Math.cos(angle) * outerRadius;
                  const startY = y0 + Math.sin(angle) * outerRadius;
                  const endX = x0 + Math.cos(angle) * (outerRadius + chosenOffset - (iconSize / 2));
                  const endY = y0 + Math.sin(angle) * (outerRadius + chosenOffset - (iconSize / 2));
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
                    drawCtx.save();
                    drawCtx.drawImage(img, finalDrawX - (iconSize/2), finalDrawY - (iconSize/2), iconSize, iconSize);
                    drawCtx.restore();
                  }
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
                if (rawPct < 1) {
                  drawCtx.font = "700 7.5px 'Exo 2', sans-serif";
                } else if (rawPct <= 3) {
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
                    const rawPct = (val / totalDecksCount) * 100;
                    const pctStr = (rawPct < 1 && rawPct > 0) ? rawPct.toFixed(1).replace('.', ',') + '%' : Math.round(rawPct) + '%';
                    return ` ${pctStr}`;
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

/* ==========================================================================
   PLATAFORMA DE DECKLISTS & INSCRIÇÃO PREMIER (CUPS & CHALLENGES)
   ========================================================================== */
function parseDecklistText(rawText) {
  if (!rawText || !rawText.trim()) {
    return { valid: false, total: 0, pokemon: 0, trainer: 0, energy: 0, cards: [], archetype: '' };
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
  let currentCategory = 'pokemon';
  let pokemonCount = 0;
  let trainerCount = 0;
  let energyCount = 0;
  const cards = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('pokémon') || lower.startsWith('pokemon')) {
      currentCategory = 'pokemon';
      continue;
    }
    if (lower.startsWith('treinador') || lower.startsWith('trainer') || lower.startsWith('trainers')) {
      currentCategory = 'trainer';
      continue;
    }
    if (lower.startsWith('energia') || lower.startsWith('energy') || lower.startsWith('energies')) {
      currentCategory = 'energy';
      continue;
    }
    if (lower.startsWith('total de cartas') || lower.startsWith('total cards') || lower.startsWith('total:')) {
      continue;
    }

    const match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (match) {
      const qty = parseInt(match[1], 10);
      const rest = match[2].trim();
      cards.push({ qty, name: rest, category: currentCategory });
      if (currentCategory === 'pokemon') pokemonCount += qty;
      else if (currentCategory === 'trainer') trainerCount += qty;
      else if (currentCategory === 'energy') energyCount += qty;
    }
  }

  const total = pokemonCount + trainerCount + energyCount;

  // Sugestão inteligente de arquétipo
  let archetype = '';
  const allNames = cards.map(c => c.name.toLowerCase()).join(' ');
  if (appData.Decks && appData.Decks.length > 0) {
    for (const dk of appData.Decks) {
      const dName = dk.Deck || dk.deck || '';
      if (dName && allNames.includes(dName.toLowerCase())) {
        archetype = dName;
        break;
      }
    }
  }
  if (!archetype) {
    if (allNames.includes('charizard ex')) archetype = 'Charizard ex';
    else if (allNames.includes('dragapult ex')) archetype = 'Dragapult ex';
    else if (allNames.includes('regidrago')) archetype = 'Regidrago VSTAR';
    else if (allNames.includes('raging bolt')) archetype = 'Raging Bolt ex';
    else if (allNames.includes('lugia')) archetype = 'Lugia VSTAR';
    else if (allNames.includes('gardevoir')) archetype = 'Gardevoir ex';
    else if (allNames.includes('gholdengo')) archetype = 'Gholdengo ex';
    else if (allNames.includes('miraidon')) archetype = 'Miraidon ex';
    else if (allNames.includes('terapagos')) archetype = 'Terapagos ex';
    else if (allNames.includes('roaring moon')) archetype = 'Roaring Moon ex';
    else if (allNames.includes('archaludon')) archetype = 'Archaludon ex';
    else if (allNames.includes('iron thorns')) archetype = 'Iron Thorns ex';
    else if (allNames.includes('pikachu ex')) archetype = 'Pikachu ex';
  }

  return {
    valid: total === 60,
    total,
    pokemon: pokemonCount,
    trainer: trainerCount,
    energy: energyCount,
    cards,
    archetype
  };
}

function getCategoryFromBirthYear(year) {
  const y = parseInt(year, 10);
  if (!y || isNaN(y)) return 'MASTER';
  if (y >= 2014) return 'JUNIOR';
  if (y >= 2010) return 'SENIOR';
  return 'MASTER';
}

function updateDecklistCategoryBadge() {
  const yearInput = document.getElementById('decklist-player-birthyear');
  const badge = document.getElementById('decklist-category-badge');
  const note = document.getElementById('decklist-category-note');
  if (!yearInput || !badge) return;

  const cat = getCategoryFromBirthYear(yearInput.value);
  badge.innerText = cat;
  badge.className = `badge-cat badge-cat-${cat === 'JUNIOR' ? 'jr' : (cat === 'SENIOR' ? 'sr' : 'me')}`;
  if (note) {
    if (cat === 'JUNIOR') note.innerText = 'Até 11 anos';
    else if (cat === 'SENIOR') note.innerText = '12 a 15 anos';
    else note.innerText = 'A partir de 16 anos';
  }
}

function onDecklistPlayerNameInput() {
  const nameInput = document.getElementById('decklist-player-name');
  const popInput = document.getElementById('decklist-player-popid');
  const datalist = document.getElementById('decklist-players-suggest');
  if (!nameInput || !popInput) return;

  const typed = nameInput.value.trim().toLowerCase();
  const pool = appData.Jogadores || [];

  if (datalist && pool.length > 0 && datalist.children.length === 0) {
    datalist.innerHTML = pool.map(p => {
      const pName = p.Jogador || p.Name || '';
      const pId = p.ID || p.id || '';
      return `<option value="${escapeHTML(pName)}">${pId ? 'POP ID: ' + pId : ''}</option>`;
    }).join('');
  }

  if (typed.length >= 3 && pool.length > 0) {
    const match = pool.find(p => (p.Jogador || p.Name || '').toLowerCase() === typed);
    if (match && (match.ID || match.id) && !popInput.value) {
      popInput.value = match.ID || match.id;
    }
  }
}

function onDecklistCardsChanged() {
  const textarea = document.getElementById('decklist-cards-text');
  const countBadge = document.getElementById('decklist-count-badge');
  const breakdownEl = document.getElementById('decklist-breakdown-text');
  const statusEl = document.getElementById('decklist-validity-status');
  const deckNameInput = document.getElementById('decklist-deck-name');
  if (!textarea) return;

  const parsed = parseDecklistText(textarea.value);

  if (countBadge) {
    countBadge.innerText = `${parsed.total} / 60 Cartas`;
    countBadge.style.color = parsed.total === 60 ? '#10b981' : (parsed.total > 60 ? '#ef4444' : '#f59e0b');
    countBadge.style.background = parsed.total === 60 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)';
  }

  if (breakdownEl) {
    if (parsed.total === 0) {
      breakdownEl.innerHTML = 'Aguardando colagem da lista de 60 cartas...';
    } else {
      breakdownEl.innerHTML = `
        <span style="color:#60a5fa;">${parsed.pokemon} Pokémon</span> &bull; 
        <span style="color:#a78bfa;">${parsed.trainer} Treinadores</span> &bull; 
        <span style="color:#facc15;">${parsed.energy} Energias</span>
        ${parsed.archetype ? `<span style="margin-left:6px; color:#fff; font-weight:600;">(✨ ${escapeHTML(parsed.archetype)})</span>` : ''}
      `;
    }
  }

  if (statusEl) {
    if (parsed.total === 60) {
      statusEl.innerHTML = '✅ Válida (60 Cartas)';
      statusEl.style.color = '#10b981';
    } else if (parsed.total > 60) {
      statusEl.innerHTML = `⚠️ Excesso (${parsed.total - 60} a mais)`;
      statusEl.style.color = '#ef4444';
    } else if (parsed.total > 0) {
      statusEl.innerHTML = `⚠️ Faltam ${60 - parsed.total} cartas`;
      statusEl.style.color = '#f59e0b';
    } else {
      statusEl.innerHTML = 'Pendente';
      statusEl.style.color = 'var(--text-muted)';
    }
  }

  if (deckNameInput && !deckNameInput.value && parsed.archetype) {
    deckNameInput.value = parsed.archetype;
  }
}

window.openDecklistModal = function(defaultStageDate = '') {
  const modal = document.getElementById('decklist-modal');
  if (!modal) return;

  const premierConfig = appData.Configuracoes?.inscricoesPremier || {};
  const isAbertas = premierConfig.abertas !== false;

  // 1. Atualizar o Banner Hero do Evento
  const titleEl = document.getElementById('decklist-banner-title');
  const typeBadgeEl = document.getElementById('decklist-banner-type-badge');
  const scheduleEl = document.getElementById('decklist-banner-schedule');
  const statusEl = document.getElementById('decklist-banner-status');
  const feeEl = document.getElementById('decklist-banner-fee');
  const spotsEl = document.getElementById('decklist-banner-spots');
  const pixKeyEl = document.getElementById('decklist-banner-pix-key');
  const pixNameEl = document.getElementById('decklist-banner-pix-name');
  const closedAlert = document.getElementById('decklist-closed-alert');
  const submitBtn = document.getElementById('decklist-submit-wa-btn');

  if (titleEl) titleEl.innerText = premierConfig.eventoNome || 'League Challenge — Liga Atlântica';
  if (typeBadgeEl) typeBadgeEl.innerText = `🏆 TORNEIO PREMIER • ${premierConfig.eventoTipo || 'CHALLENGE'}`;
  
  const formattedDate = premierConfig.eventoData ? formatDateDDMMYY(premierConfig.eventoData) : '';
  const scheduleParts = [formattedDate, premierConfig.horario].filter(Boolean);
  if (scheduleEl) scheduleEl.innerText = scheduleParts.length ? `📅 ${scheduleParts.join(' • ')}` : '📅 Data e horário a definir';

  if (feeEl) feeEl.innerText = premierConfig.valor ? `R$ ${premierConfig.valor}` : 'Gratuito';

  // Contagem de inscritos para este evento
  const eventDate = premierConfig.eventoData || '';
  let countEnrolled = 0;
  if (appData.Decklists) {
    if (Array.isArray(appData.Decklists)) {
      countEnrolled = appData.Decklists.filter(d => (d.etapaData === eventDate || d.data === eventDate)).length;
    } else if (typeof appData.Decklists === 'object' && appData.Decklists[eventDate]) {
      countEnrolled = Object.keys(appData.Decklists[eventDate]).length;
    }
  }

  const cap = premierConfig.limiteVagas || 32;
  const remaining = Math.max(0, cap - countEnrolled);
  if (spotsEl) {
    spotsEl.innerHTML = `<strong>${countEnrolled}</strong> / ${cap} <span style="font-size:0.75rem; font-weight:600; color:var(--text-secondary);">(${remaining} vagas restantes)</span>`;
  }

  if (pixKeyEl) pixKeyEl.innerText = premierConfig.chavePix || 'A definir';
  if (pixNameEl) pixNameEl.innerText = premierConfig.titularPix || '';

  if (statusEl) {
    if (isAbertas) {
      statusEl.innerHTML = '🟢 Inscrições Abertas';
      statusEl.style.background = 'rgba(16, 185, 129, 0.15)';
      statusEl.style.color = '#10b981';
      statusEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    } else {
      statusEl.innerHTML = '🔴 Inscrições Fechadas';
      statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
      statusEl.style.color = '#ef4444';
      statusEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    }
  }

  if (closedAlert) closedAlert.style.display = isAbertas ? 'none' : 'block';
  if (submitBtn) {
    submitBtn.disabled = !isAbertas;
    submitBtn.style.opacity = isAbertas ? '1' : '0.5';
    submitBtn.style.cursor = isAbertas ? 'pointer' : 'not-allowed';
  }

  // 2. Preencher Select de Eventos
  const eventSelect = document.getElementById('decklist-event-select');
  if (eventSelect) {
    const cleanStages = (stagesIndex || []).filter(s => s && typeof s.data === 'string');
    const chronologicalStages = [...cleanStages].sort((a, b) => a.data.localeCompare(b.data));
    
    const options = [];
    if (premierConfig.eventoNome && premierConfig.eventoData) {
      options.push({
        data: premierConfig.eventoData,
        label: `🏆 ${premierConfig.eventoNome} (${formatDateDDMMYY(premierConfig.eventoData)})`
      });
    }

    chronologicalStages.slice(-6).reverse().forEach(stg => {
      if (!options.some(o => o.data === stg.data)) {
        options.push({
          data: stg.data,
          label: `📅 ${getStageDisplayName(stg, chronologicalStages)} (${formatDateDDMMYY(stg.data)})`
        });
      }
    });

    eventSelect.innerHTML = options.map(o => `<option value="${escapeHTML(o.data)}">${escapeHTML(o.label)}</option>`).join('');
    if (defaultStageDate && options.some(o => o.data === defaultStageDate)) {
      eventSelect.value = defaultStageDate;
    } else if (premierConfig.eventoData) {
      eventSelect.value = premierConfig.eventoData;
    }
  }

  // 3. Sugestões de Jogadores Cadastrados
  const suggestDatalist = document.getElementById('decklist-players-suggest');
  if (suggestDatalist && appData.JogadoresSheet) {
    suggestDatalist.innerHTML = appData.JogadoresSheet.map(j => {
      const name = j.Jogador || j.jogador || '';
      return name ? `<option value="${escapeHTML(name)}">` : '';
    }).join('');
  }

  updateDecklistCategoryBadge();
  onDecklistCardsChanged();

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.copyPixKey = function() {
  const pixKey = appData.Configuracoes?.inscricoesPremier?.chavePix || document.getElementById('decklist-banner-pix-key')?.innerText || '';
  if (!pixKey || pixKey === 'A definir') {
    alert("Chave PIX não configurada no momento.");
    return;
  }
  navigator.clipboard.writeText(pixKey).then(() => {
    alert(`Chave PIX copiada:\n${pixKey}\n\nEnvie o comprovante para a organização da Liga Atlântica!`);
  }).catch(() => {
    prompt("Copie a Chave PIX:", pixKey);
  });
};

window.closeDecklistModal = function() {
  const modal = document.getElementById('decklist-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
};

window.submitDecklistWhatsApp = function() {
  const name = (document.getElementById('decklist-player-name')?.value || '').trim();
  const popId = (document.getElementById('decklist-player-popid')?.value || '').trim();
  const birthYear = (document.getElementById('decklist-player-birthyear')?.value || '').trim();
  const category = document.getElementById('decklist-category-badge')?.innerText || 'MASTER';
  const deckName = (document.getElementById('decklist-deck-name')?.value || '').trim();
  const cardsText = (document.getElementById('decklist-cards-text')?.value || '').trim();
  const limitlessUrl = (document.getElementById('decklist-limitless-url')?.value || '').trim();
  const eventSelect = document.getElementById('decklist-event-select');
  const eventTitle = eventSelect ? eventSelect.options[eventSelect.selectedIndex]?.text : 'Torneio Premier';

  if (!name) {
    alert("Por favor, preencha o Nome Completo.");
    return;
  }
  if (!popId) {
    alert("Por favor, informe seu Play! Pokémon Player ID (POP ID).");
    return;
  }

  const parsed = parseDecklistText(cardsText);

  let msg = `🏆 *INSCRIÇÃO & DECKLIST - LIGA ATLÂNTICA*\n`;
  msg += `📍 *Evento:* ${eventTitle}\n`;
  msg += `👤 *Jogador:* ${name}\n`;
  msg += `🆔 *Play! Pokémon ID:* ${popId}\n`;
  msg += `🎂 *Nascimento:* ${birthYear || 'Não inf.'} (${category})\n`;
  msg += `🃏 *Deck:* ${deckName || parsed.archetype || 'Personalizado'} (${parsed.total}/60 cartas)\n`;
  if (limitlessUrl) {
    msg += `🔗 *Limitless:* ${limitlessUrl}\n`;
  }
  msg += `\n📜 *LISTA DO BARALHO (${parsed.total} cartas):*\n${cardsText || '(Lista enviada via link Limitless)'}\n`;
  msg += `\n💰 *Comprovante:* Segue anexo o comprovante de pagamento PIX da taxa de inscrição.`;

  const encodedMsg = encodeURIComponent(msg);
  const waUrl = `https://api.whatsapp.com/send?text=${encodedMsg}`;

  window.open(waUrl, '_blank');
  alert("Inscrição e decklist formatadas com sucesso! Sua mensagem foi direcionada para o WhatsApp.");
};

window.copyDecklistSubmission = function() {
  const name = (document.getElementById('decklist-player-name')?.value || '').trim();
  const popId = (document.getElementById('decklist-player-popid')?.value || '').trim();
  const birthYear = (document.getElementById('decklist-player-birthyear')?.value || '').trim();
  const category = document.getElementById('decklist-category-badge')?.innerText || 'MASTER';
  const deckName = (document.getElementById('decklist-deck-name')?.value || '').trim();
  const cardsText = (document.getElementById('decklist-cards-text')?.value || '').trim();
  const eventSelect = document.getElementById('decklist-event-select');
  const eventTitle = eventSelect ? eventSelect.options[eventSelect.selectedIndex]?.text : 'Torneio Premier';

  const parsed = parseDecklistText(cardsText);

  let msg = `🏆 INSCRIÇÃO PREMIER - LIGA ATLÂNTICA\n`;
  msg += `Evento: ${eventTitle}\n`;
  msg += `Jogador: ${name}\n`;
  msg += `Play! Pokémon ID: ${popId}\n`;
  msg += `Categoria: ${category} (${birthYear})\n`;
  msg += `Deck: ${deckName || parsed.archetype} (${parsed.total}/60 cartas)\n\n`;
  msg += `--- LISTA DO BARALHO ---\n${cardsText}\n`;

  navigator.clipboard.writeText(msg).then(() => {
    alert("Inscrição e Decklist copiadas para a área de transferência!");
  }).catch(() => {
    prompt("Copie sua inscrição:", msg);
  });
};

let currentViewerDecklistText = '';

window.openDecklistViewerModal = function(playerId, stageDate) {
  const modal = document.getElementById('decklist-viewer-modal');
  if (!modal) return;

  const decklists = appData.Decklists || [];
  const cleanId = String(playerId || '').trim();
  const found = decklists.find(dl => 
    (dl.etapaData === stageDate || dl.data === stageDate) && 
    (String(dl.id || dl.ID || '').trim() === cleanId)
  );

  if (!found) {
    alert("Decklist detalhada ainda não foi submetida por este jogador.");
    return;
  }

  currentViewerDecklistText = found.decklistTexto || found.texto || '';
  const parsed = parseDecklistText(currentViewerDecklistText);

  const tagEl = document.getElementById('viewer-event-tag');
  const titleEl = document.getElementById('viewer-deck-title');
  const infoEl = document.getElementById('viewer-player-info');
  const totalEl = document.getElementById('viewer-total-cards');
  const container = document.getElementById('viewer-cards-container');

  if (tagEl) tagEl.innerText = found.eventoNome || `Etapa ${stageDate}`;
  if (titleEl) titleEl.innerText = found.deckNome || parsed.archetype || 'Baralho Oficial';
  if (infoEl) infoEl.innerHTML = `Treinador: <strong>${escapeHTML(found.nome || found.jogador)}</strong> &bull; POP ID: <code>#${escapeHTML(found.id)}</code> &bull; ${found.categoria || 'MASTER'}`;
  if (totalEl) totalEl.innerText = `${parsed.total} / 60 Cartas ${parsed.valid ? '✅' : '⚠️'}`;

  if (container) {
    const pCards = parsed.cards.filter(c => c.category === 'pokemon');
    const tCards = parsed.cards.filter(c => c.category === 'trainer');
    const eCards = parsed.cards.filter(c => c.category === 'energy');

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
        <div style="background: rgba(255,255,255,0.02); padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
          <div style="font-weight: 700; color: #60a5fa; font-size: 0.85rem; margin-bottom: 0.5rem; border-bottom: 1px solid rgba(96,165,250,0.2); padding-bottom: 0.25rem;">
            ⚡ Pokémon (${parsed.pokemon})
          </div>
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.78rem; color: #e2e8f0; line-height: 1.5;">
            ${pCards.map(c => `<li><strong>${c.qty}x</strong> ${escapeHTML(c.name)}</li>`).join('')}
          </ul>
        </div>

        <div style="background: rgba(255,255,255,0.02); padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
          <div style="font-weight: 700; color: #a78bfa; font-size: 0.85rem; margin-bottom: 0.5rem; border-bottom: 1px solid rgba(167,139,250,0.2); padding-bottom: 0.25rem;">
            🎒 Treinadores (${parsed.trainer})
          </div>
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.78rem; color: #e2e8f0; line-height: 1.5;">
            ${tCards.map(c => `<li><strong>${c.qty}x</strong> ${escapeHTML(c.name)}</li>`).join('')}
          </ul>
        </div>

        <div style="background: rgba(255,255,255,0.02); padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
          <div style="font-weight: 700; color: #facc15; font-size: 0.85rem; margin-bottom: 0.5rem; border-bottom: 1px solid rgba(250,204,21,0.2); padding-bottom: 0.25rem;">
            🔮 Energias (${parsed.energy})
          </div>
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.78rem; color: #e2e8f0; line-height: 1.5;">
            ${eCards.map(c => `<li><strong>${c.qty}x</strong> ${escapeHTML(c.name)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeDecklistViewerModal = function() {
  const modal = document.getElementById('decklist-viewer-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
};

window.copyViewerDecklistText = function() {
  if (!currentViewerDecklistText) return;
  navigator.clipboard.writeText(currentViewerDecklistText).then(() => {
    alert("Lista de 60 cartas copiada com sucesso para a área de transferência!");
  }).catch(() => {
    prompt("Copie a lista:", currentViewerDecklistText);
  });
};


