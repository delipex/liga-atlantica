# Guia de Funcionamento do Ecossistema - Liga Atlântica TCG
*(Documento preparado para alimentar um Gemini Custom Gem ou GPT)*

Este guia descreve de forma técnica e operacional todo o ecossistema da Liga Atlântica de Pokémon TCG. Ele serve como instrução completa para que qualquer IA ou desenvolvedor possa dar manutenção, corrigir bugs e entender as regras de negócio do sistema.

---

## 1. Arquitetura Geral do Sistema
O site funciona em uma arquitetura serverless (sem banco de dados relacional clássico), baseando-se em arquivos estáticos e integrações API.

```
+----------------------------+
|  TOM - Gerenciador (XML)   |
+-------------+--------------+
              |
              v (Arraste múltiplos arquivos .tdf)
+----------------------------+
| Painel Admin (admin.html)  | <-----> [Google Sheets] (Decks, Jogadores)
+-------------+--------------+
              |
              v (Consolida e gera etapa/ranking)
+----------------------------+
|         GitHub API         |
+-------------+--------------+
              |
              v (Atualiza arquivos .tdf)
+----------------------------+
| Repositório Git (Produção) |
+-------------+--------------+
              |
              v (Deploy Netlify/GitHub Pages)
+----------------------------+
|   Site Público (index/app) |
+----------------------------+
```

### Componentes Principais:
1. **Banco de Dados (Google Sheets):** Armazena dados dinâmicos sobre Decks cadastrados, Jogadores (IDs e Categorias oficiais), Metagame histórico, Regulamento, Galeria e Calendário.
2. **Histórico de Etapas (`site/etapas/*.tdf`):** Cada etapa finalizada é salva no GitHub como um arquivo de texto limpo (formato TSV), contendo as pontuações e o histórico de colocações daquele dia.
3. **Painel do Organizador (`site/admin.html`):** Interface administrativa protegida por senha usada para ler arquivos TDF do TOM, resolver conflitos de nomes, identificar novos jogadores e fazer commits diretos no GitHub.
4. **Site Público (`site/app.js` e `site/index.html`):** Exibe a classificação geral acumulada, metagame em tempo real (gráficos interativos) e histórico de etapas.

---

## 2. Integração e Estrutura da Planilha
A planilha do Google Sheets funciona como fonte de verdade para informações que o TDF do TOM não possui (como fotos de perfil e decks dos jogadores).

### Abas Principais:
* **`Jogadores`:** Colunas obrigatórias: `ID` (POP ID oficial), `Jogador` (Nome cadastrado), `Categoria` (Mestre, Sênior, Junior).
* **`Decks`:** Associa o deck escolhido e o tipo de energia de cada jogador para as rodadas.
* **`Metagame`:** Registra as tendências de decks para montar os gráficos estatísticos do site.

*A sincronização entre o site e a planilha é baseada no **Nome do Jogador** (normalizado em letras minúsculas e sem acentos), o que garante a consistência caso o ID mude ou falte.*

---

## 3. Regras de Leitura e Importação de Arquivos do TOM (.tdf)
A importação lê os arquivos XML gerados pelo programa oficial de torneios (TOM) seguindo regras rígidas de Pokémon TCG:

### Regras de Pareamento e Pontuação:
* **Vitória Comum (3 Pontos):** Outcome `1` (vitória do Player 1) ou `2` (vitória do Player 2).
* **Empate (1 Ponto):** Outcome `3` (empate entre os jogadores).
* **Bye de Pareamento (3 Pontos):** Outcome `5` ou `8` com jogador único. O código verifica se o resultado é `5` (Bye comum) e adiciona **1 Vitória** ao histórico do jogador.
* **Entrada Tardia (Late Entry - 0 Pontos):** Se um jogador entra no torneio a partir da segunda rodada, o TOM cria uma partida fantasma com o código **`outcome="8"`** na rodada 1. O leitor identifica o código `8` e **ignora** a rodada para aquele jogador (ele não ganha vitória, derrota ou pontos).
* **Divisão de Categorias (Multi-Pods):** O leitor varre obrigatoriamente **todos** os blocos `<pod>` dentro de `<standings>`, consolidando jogadores Masters, Seniors e Juniors.
* **Tratamento de Desistentes (Drops/DNF):** Jogadores que abandonaram o torneio ficam na tag `<pod type="dnf">`. O sistema extrai suas pontuações acumuladas nas rodadas jogadas e os insere ao final da classificação da etapa com o status congelado.

---

## 4. Sistema de Consolidação de Múltiplos Arquivos
Quando o TOM executa torneios separados por idade no mesmo dia (ex: mais de 4 Seniors jogando), ele gera múltiplos arquivos `.tdf` diferentes.

O painel admin possui um **motor de consolidação inteligente** que aceita a seleção múltipla de arquivos. Ele funciona da seguinte forma:
1. O usuário seleciona ou arrasta todos os arquivos `.tdf` daquele dia juntos.
2. O sistema lê e analisa cada um individualmente.
3. Junta todos os jogadores em uma única lista e a ordena pelos seguintes critérios de desempate:
   * **1º** Pontos (Descendente)
   * **2º** Vitórias (Descendente)
   * **3º** Empates (Descendente)
   * **4º** Derrotas (Ascendente)
4. Re-calcula a classificação final geral (`Pos` única de 1 a N).
5. O ranking é gerado e publicado como uma única etapa unificada, evitando duplicidades.

---

## 5. Resolução de Nomes e Novos Jogadores
Para evitar que o ranking acumulado duplique registros de jogadores devido a abreviações ou erros de digitação no TOM, o painel executa um algoritmo de correspondência:

1. **Busca por POP ID:** Se o jogador tiver o ID cadastrado no arquivo e na planilha, ele é vinculado automaticamente.
2. **Busca por Similaridade de Nome:** Se o ID não bater, o painel compara os nomes usando algoritmo de similaridade (Fuzzy Match). Se a similaridade for superior a **70%**, o painel sugere a vinculação (ex: "Lara Tavares" associando-se a "Ivana Tavares").
3. **Novos Jogadores:** Se for um jogador novo na liga, o painel disponibiliza uma caixa de texto tabulada (TSV). O organizador clica em **Copiar** e cola diretamente na aba `Jogadores` da planilha para oficializar o cadastro dele.

---

## 6. Procedimento de Publicação e Manutenção

### Fluxo de Publicação de Etapa:
1. Subir os arquivos `.tdf` da rodada no painel administrativo.
2. Resolver os conflitos de nomes/jogadores pendentes.
3. Se houver novos jogadores, copiá-los para a planilha Google Sheets.
4. Clicar em **Publicar Ranking no Site**. O sistema envia a etapa para a pasta `site/etapas/` e reconstrói o ranking geral consolidado (`site/ranking.tdf`) na hora.

### Recálculo do Ranking Geral:
Se algum arquivo consolidado sumir ou quebrar, o organizador pode clicar em **"Recalcular Ranking Geral do Site"** na tela administrativa. Isso fará o painel reler cronologicamente todas as etapas cadastradas em `etapas.json` e reconstruir o ranking acumulado de forma limpa.
