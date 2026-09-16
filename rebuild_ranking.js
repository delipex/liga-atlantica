const fs = require('fs');
const path = require('path');

function parseTDF(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n');
  const headers = lines[0].split('\t').map(h => h.trim());
  
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split('\t');
    const row = {};
    headers.forEach((h, index) => {
      row[h] = values[index] !== undefined ? values[index].trim() : '';
    });
    result.push(row);
  }
  return result;
}

function getVED(player) {
  const v = player.Vitorias || player.Vitórias || player.Wins || player.Win || 0;
  const e = player.Empates || player.Draws || player.Draw || 0;
  const d = player.Derrotas || player.Losses || player.Loss || 0;
  return { v: Number(v) || 0, e: Number(e) || 0, d: Number(d) || 0 };
}

console.log("⚙️ Iniciando recálculo do ranking a partir de todas as etapas locais...");

const siteDir = path.join(__dirname, 'site');
const etapasJsonPath = path.join(siteDir, 'etapas.json');
const rankingTdfPath = path.join(siteDir, 'ranking.tdf');
const etapasDir = path.join(siteDir, 'etapas');

if (!fs.existsSync(etapasJsonPath)) {
  console.error("❌ Arquivo 'site/etapas.json' não foi encontrado!");
  process.exit(1);
}
if (!fs.existsSync(etapasDir)) {
  console.error("❌ Diretório 'site/etapas' não foi encontrado!");
  process.exit(1);
}

let stagesList = [];
try {
  stagesList = JSON.parse(fs.readFileSync(etapasJsonPath, 'utf8'));
} catch (e) {
  console.error(`❌ Falha ao carregar 'etapas.json': ${e.message}`);
  process.exit(1);
}

const calculatedPlayers = new Map();

stagesList.forEach((stage, stageIndex) => {
  const filename = `${stage.data}.tdf`;
  const filePath = path.join(etapasDir, filename);
  
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Etapa [${stage.data}] está no etapas.json mas o arquivo '${filename}' não existe na pasta site/etapas/. Ignorando esta etapa.`);
    return;
  }
  
  const text = fs.readFileSync(filePath, 'utf8');
  const stagePlayers = parseTDF(text);
  const mult = Number(stage.multiplicador) || 1.0;
  
  stagePlayers.forEach(sp => {
    const nameStr = String(sp.Jogador || '');
    if (!nameStr) return;
    const key = nameStr.trim().toLowerCase();
    
    if (!calculatedPlayers.has(key)) {
      calculatedPlayers.set(key, {
        Jogador: nameStr.trim(),
        ID: sp.ID || '',
        Categoria: sp.Categoria || 'MASTER',
        Pontos: 0,
        Vitorias: 0,
        Empates: 0,
        Derrotas: 0,
        HistoryPlacements: Array(stagesList.length).fill('-')
      });
    }
    
    const cp = calculatedPlayers.get(key);
    const { v, e, d } = getVED(sp);
    const pts = Number(sp.Pontos) || 0;
    
    cp.Pontos += (pts * mult);
    cp.Vitorias += v;
    cp.Empates += e;
    cp.Derrotas += d;
    cp.HistoryPlacements[stageIndex] = sp.HistoricoColocacoes || sp.Pos || '-';
  });
});

const finalCalculated = [];
calculatedPlayers.forEach(p => {
  const historyStr = p.HistoryPlacements.join(';');
  const placements = p.HistoryPlacements
    .map(x => String(x).trim())
    .filter(x => x !== '-' && x !== '' && !isNaN(Number(x)))
    .map(Number);
    
  const participacoes = placements.length;
  const podios = placements.filter(pos => pos <= 4).length;
  const media = participacoes > 0 ? (placements.reduce((sum, val) => sum + val, 0) / participacoes) : 0;
  
  finalCalculated.push({
    Jogador: p.Jogador,
    ID: p.ID,
    Categoria: p.Categoria,
    Pontos: p.Pontos,
    Vitorias: p.Vitorias,
    Empates: p.Empates,
    Derrotas: p.Derrotas,
    Podio: podios,
    MediaColocacao: media,
    Participacoes: participacoes,
    HistoricoColocacoes: historyStr
  });
});

// Ordenar ranking recalculado
finalCalculated.sort((a, b) => {
  if (b.Pontos !== a.Pontos) return b.Pontos - a.Pontos;
  if (b.Podio !== a.Podio) return b.Podio - a.Podio;
  if (a.MediaColocacao !== b.MediaColocacao) return a.MediaColocacao - b.MediaColocacao;
  return String(a.Jogador).localeCompare(String(b.Jogador), 'pt-BR');
});

// Montar TDF consolidado
const headers = ['Pos', 'ID', 'Jogador', 'Categoria', 'Pontos', 'Vitorias', 'Empates', 'Derrotas', 'Podio', 'MediaColocacao', 'Participacoes', 'HistoricoColocacoes'];
let tdfString = headers.join('\t') + '\n';

finalCalculated.forEach((p, index) => {
  const row = [
    index + 1,
    p.ID || '',
    p.Jogador,
    p.Categoria,
    p.Pontos,
    p.Vitorias,
    p.Empates,
    p.Derrotas,
    p.Podio,
    Number(p.MediaColocacao).toFixed(2),
    p.Participacoes,
    p.HistoricoColocacoes || ''
  ];
  tdfString += row.join('\t') + '\n';
});

try {
  fs.writeFileSync(rankingTdfPath, tdfString, 'utf8');
  console.log(`\n🎉 SUCESSO! O arquivo 'site/ranking.tdf' foi recalculado do zero e atualizado com sucesso!`);
  console.log(`   Total de Jogadores: ${finalCalculated.length}`);
} catch (err) {
  console.error(`❌ Erro ao salvar 'site/ranking.tdf': ${err.message}`);
  process.exit(1);
}
