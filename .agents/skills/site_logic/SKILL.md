---
name: site_logic
description: Understanding the architecture, logic, and data flow of the Liga Atlântica TCG ranking site and organizer panel.
---

# Liga Atlântica TCG - Architecture and Logic Documentation

This document describes the data flow, state management, name resolution, and calculations used by the Liga Atlântica website and its organizer panel (`admin.html`).

---

## 1. Data Sources and Flow

The application combines two main data sources: **Google Sheets** (for rosters, configurations, metagame, and deck databases) and **GitHub** (for active ranking data, individual stage files, and stage history).

### Google Sheets Configuration
The URL of the spreadsheet is configured in [config.js](file:///d:/Liga%20Atl%C3%A2ntica/site/config.js) (`googleSheetCsvUrl`). The app fetches the following tabs as CSV:
- **`Jogadores`** (GID `711743754`): Roster of registered players, their categories, official names, IDs, and deck selections per stage date.
- **`Decks`** (GID `1459968566`): Database mapping each deck archetype to its `TipoEnergia`, image URL, and description.
- **`Configuracoes`** (GID `1275325263`): Key-value pairs for global settings:
  - `statuspodio`: Controlling the ranking behavior (`auto`, `congelado`, `offline`).
  - `avisotopo`: Text display in the top banner (supports auto-URL button extraction).
  - `linkwhatsapp` / `linkinstagram`: Social links.
  - `exibirmetagame`: Flags to toggle metagame chart visibility.
- **`Metagame`**: Alternative/explicit metagame counts (optional, falls back to `Jogadores` columns).

### GitHub Data (Active Season Data)
Stored directly in the root of the GitHub repository `delipex/liga-atlantica`:
- **`ranking.tdf`**: Tab-separated consolidated ranking file containing the current active season standings.
- **`etapas.json`**: JSON array listing all registered stages (`[{ "data": "YYYY-MM-DD", "tipo": "Liga|Challenge|Cup", "multiplicador": 1.0 }]`).
- **`etapas/YYYY-MM-DD.tdf`**: Individual TDF files representing the exact standings of each single tournament stage.

---

## 2. Active Ranking State (`isFrozen` and Roster Mode)

When loading the main page, `app.js` checks the active ranking mode to determine if it should render competitive points or a static player roster:
1. **Roster Mode / Off Season**:
   - Triggered if `ranking.tdf` is empty/missing. (Note: `statuspodio` configured as `offline` or `congelado` only affects the dashboard podium, not the ranking table if TDF files are present).
   - The status badge displays `Off Season` (gray indicator).
   - The ranking table hides the **PTS** and **V/E/D** columns, and displays players sorted alphabetically by their name.
   - The dashboard top 4 cards display the previous season's podium using `PosicaoFinal` from the Google Sheet roster.
2. **Active Season Mode**:
   - Triggered when `ranking.tdf` has valid tournament data.
   - The status badge displays `Online` (green indicator).
   - The ranking table displays points, wins, draws, losses, and sorts players by:
     `Pontos` (descending) ➔ `Podio` (descending) ➔ `MediaColocacao` (ascending, lower is better) ➔ `Jogador` (alphabetical).
   - The dashboard top 4 cards behavior is controlled by the `statuspodio` setting:
     - **`auto`**: Displays the top 4 players of the overall consolidated ranking (with active points/stats).
     - **`congelado` / `offline`**: Displays the top 4 players of the **previous stage** (the latest stage with tournament data) using their placements in that stage as ranks, with trophy/badge labels (🏆 CAMPEÃO, etc.).

---

## 3. Name and ID Resolution on Organizer Panel (`admin.html`)

When the organizer uploads a stage file (`.tdf`, `.txt`, `.tsv`) representing a single tournament:
1. **Roster Match**:
   - The system reads the Google Sheets `Jogadores` tab to get the master list of registered players.
   - For each player in the uploaded file, it attempts to match them against `Jogadores`:
     - **ID Match**: If the uploaded row has a POP ID/OPID/PlayID and it matches a registered player's ID, they are automatically linked.
     - **Name Match**: If no ID is present, it compares the normalized (accent-stripped, lowercase) names.
2. **Unresolved Names**:
   - If a player is not found by ID or name, they are marked as **Unresolved**.
   - The organizer must manually map the name to an existing player or register them as a **New Player**.
   - If marked as a New Player, the system generates a tab-separated row with the player's info for copying and pasting directly into the Google Sheet to update the roster.

---

## 4. TDF Columns Schema

The consolidated `ranking.tdf` and stage TDF files have the following exact column structure:
```tsv
Pos	ID	Jogador	Categoria	Pontos	Vitorias	Empates	Derrotas	Podio	MediaColocacao	Participacoes	HistoricoColocacoes
```
- **`ID`**: The player's official tournament ID (POP ID), matched dynamically against the roster.
- **`Participacoes`**: The number of stages/sessions the player participated in.
- **`HistoricoColocacoes`**: A semicolon-separated string of placement positions achieved in each stage in chronological order (e.g. `5;-;1` means 5th in stage 1, did not play in stage 2, 1st in stage 3).

---

## 5. Merges, Rollbacks, and Deletion Logic

### Adding/Merging a Stage
When publishing a new stage:
1. It updates the stage index in `etapas.json`.
2. It appends or updates the player's placement in their `HistoricoColocacoes` string.
3. It recalculates the player's stats:
   - **`Pontos`**: Sum of points from all stages (each stage's points are multiplied by the stage's multiplier, e.g., Cup is `2.0x`).
   - **`Vitorias` / `Empates` / `Derrotas`**: Direct sum of match results.
   - **`Participacoes`**: Count of non-hyphen (`-`) entries in `HistoricoColocacoes`.
   - **`Podio`**: Count of entries in `HistoricoColocacoes` that are `≤ 4`.
   - **`MediaColocacao`**: Sum of placements divided by `Participacoes`.

### Rollback on Republish
If the organizer uploads a stage for an existing date:
1. It downloads the previous stage TDF (`etapas/YYYY-MM-DD.tdf`).
2. It subtracts that stage's points, wins, draws, and losses from each player's totals.
3. It replaces the placement at the corresponding stage index in `HistoricoColocacoes` with `-`.
4. It merges the new stage data as if it were a new addition.

### Deleting a Stage
When the organizer clicks **Excluir** on a stage:
1. Splicing: The stage is removed from `etapas.json` and the `.tdf` file is deleted from `etapas/` on GitHub.
2. Splicing History: The column index corresponding to that stage is spliced out from the `HistoricoColocacoes` string of every player.
3. Recalculation: All stats (Participações, Pódios, Média de Colocação) are computed fresh from the modified `HistoricoColocacoes`. Players who now have 0 participations are removed from the ranking.
