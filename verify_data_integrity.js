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

console.log("🔍 Iniciando verificação de integridade dos dados...");

let errors = [];
let warnings = [];

// 1. Verificar caminhos básicos
const siteDir = path.join(__dirname, 'site');
const etapasJsonPath = path.join(siteDir, 'etapas.json');
const rankingTdfPath = path.join(siteDir, 'ranking.tdf');
const etapasDir = path.join(siteDir, 'etapas');

if (!fs.existsSync(etapasJsonPath)) {
  errors.push("❌ Arquivo 'site/etapas.json' não foi encontrado!");
}
if (!fs.existsSync(rankingTdfPath)) {
  errors.push("❌ Arquivo 'site/ranking.tdf' não foi encontrado!");
}
if (!fs.existsSync(etapasDir)) {
  errors.push("❌ Diretório 'site/etapas' não foi encontrado!");
}

if (errors.length > 0) {
  console.error("\n❌ FALHA NA VERIFICAÇÃO CRÍTICA:");
  errors.forEach(e => console.error(e));
  process.exit(1);
}

// 2. Carregar índice de etapas
let stagesList = [];
try {
  stagesList = JSON.parse(fs.readFileSync(etapasJsonPath, 'utf8'));
  console.log(`✅ Índice 'etapas.json' carregado com sucesso (${stagesList.length} etapas registradas).`);
} catch (e) {
  errors.push(`❌ Falha ao decodificar 'etapas.json': ${e.message}`);
}

// 3. Verificar arquivos TDF de etapas individuais
const expectedTdfFiles = new Set();
stagesList.forEach((stage, idx) => {
  if (!stage.data) {
    errors.push(`❌ Etapa no índice ${idx} não possui a propriedade 'data'.`);
    return;
  }
  const filename = `${stage.data}.tdf`;
  const filePath = path.join(etapasDir, filename);
  expectedTdfFiles.add(filename);
  
  if (!fs.existsSync(filePath)) {
    errors.push(`❌ Arquivo individual ausente (Ghost Stage): '${filePath}' está registrado em etapas.json mas não existe no repositório!`);
  } else {
    // Validar cabeçalhos do TDF da etapa
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      const lines = text.split('\n');
      if (lines.length > 0) {
        const header = lines[0].trim();
        const expectedHeader = "Pos\tID\tJogador\tCategoria\tPontos\tVitorias\tEmpates\tDerrotas\tPodio\tMediaColocacao\tParticipacoes\tHistoricoColocacoes";
        if (header !== expectedHeader) {
          warnings.push(`⚠️ Cabeçalho incomum no arquivo '${filename}':\n  Obtido:   [${header}]\n  Esperado: [${expectedHeader}]`);
        }
      }
    } catch (err) {
      errors.push(`❌ Erro ao ler arquivo '${filename}': ${err.message}`);
    }
  }
});

// 4. Verificar se há arquivos .tdf extras na pasta de etapas que não estão no etapas.json
if (fs.existsSync(etapasDir)) {
  const files = fs.readdirSync(etapasDir);
  files.forEach(file => {
    if (file.endsWith('.tdf') && !expectedTdfFiles.has(file)) {
      warnings.push(`⚠️ Arquivo órfão: '${file}' existe em 'site/etapas/', mas NÃO está listado no etapas.json (não será computado no ranking).`);
    }
  });
}

// 5. Recalcular e validar ranking consolidado a partir das etapas
if (errors.length === 0) {
  const calculatedPlayers = new Map();
  
  // Processar cada etapa na ordem cronológica
  stagesList.forEach((stage, stageIndex) => {
    const filename = `${stage.data}.tdf`;
    const filePath = path.join(etapasDir, filename);
    
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, 'utf8');
      const stagePlayers = parseTDF(text);
      const mult = Number(stage.multiplicador) || 1.0;
      
      stagePlayers.forEach(sp => {
        const name = sp.Jogador;
        if (!name) return;
        const key = name.trim().toLowerCase();
        
        if (!calculatedPlayers.has(key)) {
          calculatedPlayers.set(key, {
            Jogador: name.trim(),
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
    }
  });
  
  // Calcular média, pódios e participações finais
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
  
  // Ordenar ranking calculado
  finalCalculated.sort((a, b) => {
    if (b.Pontos !== a.Pontos) return b.Pontos - a.Pontos;
    if (b.Podio !== a.Podio) return b.Podio - a.Podio;
    if (a.MediaColocacao !== b.MediaColocacao) return a.MediaColocacao - b.MediaColocacao;
    return String(a.Jogador).localeCompare(String(b.Jogador), 'pt-BR');
  });
  
  // Comparar com ranking.tdf existente
  try {
    const savedRankText = fs.readFileSync(rankingTdfPath, 'utf8');
    const savedRanking = parseTDF(savedRankText);
    
    console.log(`... Comparando resultados recalculados com o 'ranking.tdf' existente...`);
    
    // Comparar tamanhos
    if (savedRanking.length !== finalCalculated.length) {
      warnings.push(`⚠️ Mismatch de quantidade de jogadores: ranking.tdf tem ${savedRanking.length} jogadores, mas o recálculo obteve ${finalCalculated.length}.`);
    }
    
    // Comparar dados jogador por jogador
    savedRanking.forEach((saved, index) => {
      const name = saved.Jogador;
      if (!name) return;
      const key = name.trim().toLowerCase();
      
      const calc = finalCalculated.find(c => String(c.Jogador).trim().toLowerCase() === key);
      
      if (!calc) {
        errors.push(`❌ Jogador '${name}' está no ranking.tdf mas NÃO foi encontrado nos resultados recalculados das etapas!`);
        return;
      }
      
      // Validar Pontos
      if (Math.abs(Number(saved.Pontos) - calc.Pontos) > 0.01) {
        errors.push(`❌ Divergência de Pontos para '${name}': Salvo no ranking.tdf = ${saved.Pontos} PTS, Recalculado = ${calc.Pontos} PTS.`);
      }
      // Validar Vitorias
      if (Number(saved.Vitorias || 0) !== calc.Vitorias) {
        errors.push(`❌ Divergência de Vitórias para '${name}': Salvo no ranking.tdf = ${saved.Vitorias}, Recalculado = ${calc.Vitorias}.`);
      }
      // Validar HistoricoColocacoes
      if (String(saved.HistoricoColocacoes || '').trim() !== calc.HistoricoColocacoes) {
        errors.push(`❌ Divergência de Histórico de Colocações para '${name}':\n  Salvo:      [${saved.HistoricoColocacoes}]\n  Calculado:  [${calc.HistoricoColocacoes}]`);
      }
    });
  } catch (err) {
    errors.push(`❌ Falha ao ler ou comparar 'ranking.tdf': ${err.message}`);
  }
}

// 6. Relatório Final
console.log("\n==================================================");
console.log("📊 RELATÓRIO DE INTEGRIDADE:");
console.log(`   Erros encontrados: ${errors.length}`);
console.log(`   Avisos emitidos: ${warnings.length}`);
console.log("==================================================");

if (warnings.length > 0) {
  console.log("\n⚠️ AVISOS DETALHADOS:");
  warnings.forEach(w => console.log(w));
}

if (errors.length > 0) {
  console.error("\n❌ ERROS DE INTEGRIDADE DETECTADOS:");
  errors.forEach(e => console.error(e));
  console.error("\n❌ A verificação falhou. Por favor, ajuste as discrepâncias acima!");
  process.exit(1);
} else {
  console.log("\n🎉 PARABÉNS! Todos os arquivos TDF e o etapas.json estão 100% íntegros e consistentes!");
  process.exit(0);
}
