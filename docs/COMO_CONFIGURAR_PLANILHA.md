# Como Configurar sua Planilha do Google Sheets no Site

Para atualizar os dados do seu site em tempo real (direto pelo celular ou computador), você usará uma planilha do Google Sheets. O site lerá as informações dessa planilha de forma automática e gratuita.

Siga os passos simples abaixo para configurar:

---

## Passo 1: Criar a Planilha no Google Drive

1. Acesse o seu [Google Drive](https://drive.google.com/) e crie uma **Nova Planilha**.
2. Dê um nome de sua preferência à planilha (ex: `Planilha da Liga Atlântica`).
3. Crie exatamente **6 abas (páginas)** na parte inferior da planilha, renomeando-as exatamente como descrito a seguir (respeite as maiúsculas/minúsculas e acentos):
   * `Ranking`
   * `Calendario`
   * `Campeoes`
   * `Regras`
   * `Galeria`
   * `Partidas` *(opcional para o site, mas recomendada para histórico e cálculo automático)*

---

## Passo 2: Estruturar as Colunas de Cada Aba

Escreva os nomes das colunas exatamente na **primeira linha (Linha 1)** de cada aba. As linhas abaixo dela conterão os dados dos seus jogadores e eventos.

### 1. Aba: `Ranking`
Escreva os cabeçalhos na primeira linha da seguinte forma:
* **Coluna A:** `Pos` (Posição no ranking. Ex: 1, 2, 3)
* **Coluna B:** `Jogador` (Nome do jogador - Texto)
* **Coluna C:** `Pontos` (Pontuação total - Número)
* **Coluna D:** `Vitorias` (Número de vitórias - Número)
* **Coluna E:** `Empates` (Número de empates - Número)
* **Coluna F:** `Derrotas` (Número de derrotas - Número)
* **Coluna G:** `Deck` (Deck principal do jogador - Texto)
* **Coluna H:** `TipoEnergia` (Tipo em minúsculo. Ex: `fire`, `water`, `psychic`, `lightning`, `darkness`, `metal`, `dragon`, `colorless`)
* **Coluna I:** `Historico` (Últimas 5 partidas no formato `V-D-E-V-V`)

> [!TIP]
> O site agora também consegue recalcular posição, pontos e histórico usando a aba `Partidas`, quando ela estiver preenchida. Mesmo assim, manter o `Ranking` completo deixa a planilha mais fácil de conferir manualmente.


### 2. Aba: `Partidas`
Colunas da Linha 1:
* `Data` (Data da partida no formato `AAAA-MM-DD`, ex: `2026-06-20`)
* `Jogador1` (Nome exato do primeiro jogador)
* `Jogador2` (Nome exato do segundo jogador)
* `Vencedor` (Nome exato do vencedor ou `Empate`)

> [!NOTE]
> Esta aba é usada para calcular estatísticas automaticamente quando o ranking não estiver totalmente preenchido.

### 3. Aba: `Calendario`
Colunas da Linha 1:
* `Data` (Data do evento no formato `AAAA-MM-DD`, ex: `2026-06-20`)
* `Evento` (Nome do torneio - Texto)
* `Local` (Local do torneio, ex: `Livraria Atlântica +` - Texto)
* `Horario` (Horário de início, ex: `10:00` - Texto)
* `Status` (Status do evento. Use apenas: `confirmado`, `concluido` ou `pendente`)
* `Descricao` (Uma breve descrição das regras ou formato - Texto)

### 4. Aba: `Campeoes`
Colunas da Linha 1:
* `Temporada` (Nome da temporada, ex: `Temporada de Verão 2025` - Texto)
* `Campeao` (Nome do vencedor - Texto)
* `Vice` (Nome do segundo colocado - Texto)
* `DeckCampeao` (Deck usado pelo campeão - Texto)
* `Data` (Mês/Ano do torneio final, ex: `Fevereiro/2025` - Texto)

### 5. Aba: `Regras`
Colunas da Linha 1:
* `Titulo` (Título da regra - Texto)
* `Descricao` (Texto explicativo detalhado da regra - Texto)

### 6. Aba: `Galeria`
Colunas da Linha 1:
* `Titulo` (Título da foto - Texto)
* `Descricao` (Legenda ou contexto da foto - Texto)
* `URL_Imagem` (Link direto da imagem hospedada na web, ex: no Imgur, Discord, Postimages ou outro servidor - Texto)
* `Data` (Data da foto no formato `DD/MM/AAAA` - Texto)

> [!TIP]
> **Recomendações para as Fotos da Galeria:**
> * **Proporção de Aspecto (Ratio):** **3:2** (formato paisagem / horizontal).
> * **Resolução Recomendada:** Entre **800x533 px** e **1200x800 px**.
> * **Peso do Arquivo:** Idealmente **abaixo de 300 KB** por imagem (use formatos modernos como **WebP** ou **JPEG** compactados) para que o site carregue super rápido em redes móveis.
> * **Ajuste Automático:** O site usa a propriedade `object-fit: cover`. Se você colocar uma foto em outra proporção (ex: 4:3 ou vertical), o navegador irá cortar as bordas externas automaticamente para preencher o espaço de 3:2 sem achatar nem esticar a foto. Para controlar o enquadramento, dê preferência a fotos horizontais (3:2).

---

## Passo 3: Publicar a Planilha na Web (Crucial)

Para que o site consiga ler os dados sem precisar de senhas complicadas, você deve liberar o acesso de leitura pública da planilha:

1. No Google Sheets, clique em **Arquivo** (no menu superior esquerdo).
2. Vá em **Compartilhar** e selecione **Publicar na Web**.
3. Na janela que abrir, mantenha a opção **Documento Inteiro** e **Página da web**.
4. Clique no botão azul **Publicar** e confirme.
5. Feche a janela do Compartilhar (não precisa copiar o link gerado ali).

---

## Passo 4: Conectar a Planilha ao seu Site

1. Abra a página da sua planilha normalmente no seu navegador e copie o link completo da barra de endereços. O link deve se parecer com isso:
   `https://docs.google.com/spreadsheets/d/1A2B3C4D5E6F7G8H9I0J.../edit#gid=0`
2. Abra o arquivo `config.js` (localizado dentro da pasta `site`) usando qualquer editor de texto.
3. Localize a linha que contém `googleSheetCsvUrl` e cole o seu link dentro das aspas. Exemplo:
   ```javascript
   googleSheetCsvUrl: "https://docs.google.com/spreadsheets/d/1A2B3C4D5E6F7G8H9I0J.../edit#gid=0",
   ```
4. Salve o arquivo `config.js` e recarregue o site!

> [!NOTE]
> Se o link da planilha estiver em branco ou for inválido, o site usará automaticamente os **dados fictícios de demonstração (mock data)** que criamos para garantir que o site nunca fique em branco ou quebrado.

---

## Passo 5: Como Armazenar Temporadas Passadas

Para manter o histórico de ligas antigas (ex: "Verão 2025") e permitir que as pessoas acessem isso no site:

1. Vá na sua aba atual de `Ranking` no Google Sheets.
2. Clique na setinha ao lado do nome da aba e escolha **Duplicar**.
3. Renomeie a aba duplicada para um nome sem espaços ou acentos, como `Ranking_2025_Verao`.
4. Abra o arquivo `config.js` no seu computador e adicione essa nova aba na lista de `seasons`:
   ```javascript
   seasons: [
     { value: "Ranking", label: "Temporada Atual (Ativa)" },
     { value: "Ranking_2025_Verao", label: "Temporada de Verão 2025" }
   ]
   ```
5. Pronto! O site terá automaticamente uma caixinha de seleção ("dropdown") permitindo alternar entre a temporada atual e o histórico passado.

---

## Passo 6: Como Usar a Aba de `Configuracoes` (Novo!)

Para controlar dinamicamente o comportamento, tema, comunicados e links do seu site sem precisar mexer em códigos, você pode criar uma aba chamada exatamente **`Configuracoes`** (com o Gid correspondente cadastrado em `config.js`).

Escreva os seguintes cabeçalhos na primeira linha da aba:
* **Coluna A:** `Parametro` (Nome da configuração)
* **Coluna B:** `Valor` (Valor a ser aplicado)

Abaixo dessa linha de cabeçalho, você pode cadastrar os seguintes parâmetros (respeitando a grafia):

### 1. `AvisoTopo`
* **O que faz**: Insere um banner horizontal com um ícone de megafone no topo do site para comunicados urgentes.
* **Exemplo de Valor**: `Inscrições abertas para o League Cup de Domingo (28/06)!` (deixe a célula em branco para ocultar o banner).

### 2. `LinkWhatsApp`
* **O que faz**: Atualiza automaticamente todos os links e botões de WhatsApp do site (no topo e no rodapé) para o convite do seu grupo atual.
* **Exemplo de Valor**: `https://chat.whatsapp.com/EpUEb62hq1bKs6iDtQ3ena`

### 3. `LinkInstagram`
* **O que faz**: Atualiza automaticamente todos os links e botões de Instagram do site (no topo e no rodapé) para o perfil da sua liga.
* **Exemplo de Valor**: `https://www.instagram.com/atlanticamais/`

### 4. `TemaPadrao`
* **O que faz**: Define qual tema visual o site carregará primeiro para novos visitantes que ainda não definiram sua preferência no seletor manual.
* **Valores aceitos**: `claro` (ou `light`) ou `escuro` (ou `dark`).

### 5. `StatusPodio`
* **O que faz**: Congela o ranking ou transforma a tabela em lista de elenco (roster).
* **Valores aceitos**: 
  * `offline` ou `congelado`: Oculta os pontos acumulados e exibe a tabela principal no modo **Roster (Elenco de Jogadores)**, mostrando apenas o cadastro básico e os decks favoritos dos jogadores.
  * `auto` (ou em branco): Funcionamento padrão (exibe o ranking de torneio ativo carregado do GitHub).
