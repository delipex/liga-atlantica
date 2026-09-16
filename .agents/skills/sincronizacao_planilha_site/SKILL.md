---
name: sincronizacao_planilha_site
description: Protocolo de impacto e sincronização entre estrutura da planilha e site.
---

# Skill: Sincronização entre Planilha e Site (Protocolo de Impacto)

Esta Skill define os padrões e procedimentos que devem ser seguidos sempre que a estrutura da planilha (colunas, nomes de abas, tipos de dados) for modificada, garantindo que o site reflita as alterações imediatamente e sem quebras.

---

## 1. Protocolo de Análise de Impacto

Sempre que uma coluna for adicionada, removida ou alterada na planilha:
1. **Mapeamento de Dependências**: Procure em `app.js` e `index.html` por referências ao nome da coluna modificada.
2. **Atualização da Camada de Dados**:
   * Atualize a definição do `MOCK_DATA` em `app.js` para garantir paridade com as colunas da planilha física.
   * Ajuste a lógica de parsing e limpeza de valores na função de parse de CSV do site.
3. **Atualização de Renderização**:
   * Atualize os cabeçalhos das tabelas no HTML (se necessário).
   * Atualize a função de renderização correspondente no JS (ex: `renderRankingTable` para o Ranking, `renderCalendar` para o Calendário) para ler a nova propriedade.
   * Se a coluna modificada for usada em modais, atualize a função correspondente (ex: `openPlayerModal`).
4. **Verificação do Histórico (Temporadas)**:
   * Considere se a alteração afeta apenas a temporada ativa ou se afeta as abas de temporadas passadas (estáticas). Caso afete apenas a ativa, implemente condicionais no código para suportar o formato legado para abas antigas.

---

## 2. Padrão de Cálculo de Estatísticas (Relacional)

Quando usarmos tabelas relacionais em vez de dados pré-calculados:
* **Entrada**: Duas fontes de dados (`Jogadores` e `Partidas`).
* **Regras de Negócio**:
   * **Pontos**: Vitória = 3 PTS, Empate = 1 PTS, Derrota = 0 PTS.
   * **Aproveitamento (Winrate)**: `(Vitórias * 3 + Empates) / (Total de Jogos * 3) * 100`.
   * **Histórico (Streak)**: Mapeie as últimas 5 partidas chronologicamente (da mais antiga para a mais recente) usando `V` para Vitória, `D` para Derrota e `E` para Empate.
   * **Ordenação**: Classifique decrescentemente por `Pontos`, depois por `Vitórias`, e finalmente por ordem alfabética do nome do jogador.
