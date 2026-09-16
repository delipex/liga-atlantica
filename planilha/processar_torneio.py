import csv
import urllib.request
import os
import re

# Configurações
SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQrKLqAbkaLT8PoWq7NfDbsz78KLsLfT3R2bZ5Ou5iZOwQwm7YhFpfjhM1lmxQPlti4a7KeQamMqwW4/pub?output=csv&gid=711743754"
OUTPUT_FILE = "planilha/Ranking_Atualizado.csv"

# Resultados do Torneio (do print enviado)
# Formato: (Posição, Nome)
STANDINGS = [
    (1, "Gabriel Seixas"),
    (2, "Carlos Júnior"),
    (3, "LUCAS COSTA"),
    (4, "Antônio Neto"),
    (5, "Caio R"),
    (6, "Lucas Linard"),
    (7, "Carlos Paes"),
    (8, "Igor Nunes"),
    (9, "Wesllen Dias"),
    (10, "PHELIPE SANTOS"),
    (11, "João Pedro Oliveira"),
    (12, "ALDAIR REIS"),
    (13, "Fernando Ribeiro"),
    (14, "Guilherme Oliveira"),
    (15, "CARLOS MORAIS"),
    (16, "Massão F"),
    (17, "IGOR COSTA")
]

# Tabela de Pontuação da Liga (Antigo Sistema)
def calcular_pontos_por_posicao(posicao, dobrado=False):
    pontos = 0
    if posicao == 1:
        pontos = 50
    elif posicao == 2:
        pontos = 40
    elif 3 <= posicao <= 4:
        pontos = 30
    elif 5 <= posicao <= 8:
        pontos = 20
    elif 9 <= posicao <= 16:
        pontos = 15
    elif 17 <= posicao <= 32:
        pontos = 5
    
    return pontos * 2 if dobrado else pontos

def normalizar_nome(nome):
    nome = nome.lower().strip()
    # Remover acentos comuns
    substituicoes = {
        'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a',
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
        'ç': 'c'
    }
    for orig, dest in substituicoes.items():
        nome = nome.replace(orig, dest)
    return nome

# Mapeamento manual de nomes conhecidos do print para a planilha
MAPA_NOMES = {
    "caio r": "caio rios",
    "carlos morais": "carlos henrique morais",
}

def encontrar_jogador(nome_print, lista_jogadores):
    nome_norm = normalizar_nome(nome_print)
    
    # Verificar no mapa de nomes manual
    if nome_norm in MAPA_NOMES:
        nome_norm = MAPA_NOMES[nome_norm]
        
    for jogador in lista_jogadores:
        nome_planilha_norm = normalizar_nome(jogador['Jogador'])
        
        # Match exato ou parcial
        if nome_norm == nome_planilha_norm:
            return jogador
            
        # Match de primeiro nome + sobrenome abreviado (ex: "Caio Rios" com "Caio R")
        if len(nome_norm.split()) > 1 and len(nome_planilha_norm.split()) > 1:
            if nome_norm.split()[0] == nome_planilha_norm.split()[0] and nome_norm.split()[1][0] == nome_planilha_norm.split()[1][0]:
                return jogador
                
    return None

def main():
    print("Buscando Ranking atual da planilha...")
    try:
        response = urllib.request.urlopen(SHEET_CSV_URL)
        csv_text = response.read().decode('utf-8').splitlines()
    except Exception as e:
        print(f"Erro ao buscar planilha: {e}")
        return

    reader = csv.DictReader(csv_text)
    jogadores = list(reader)

    # Forçar os cabeçalhos do novo padrão de 13 colunas do site
    headers = ["Pos", "Jogador", "Categoria", "Pontos", "Vitorias", "Empates", "Derrotas", "Podio", "MediaColocacao", "Deck", "TipoEnergia", "Participacoes", "HistoricoColocacoes"]

    print(f"Carregados {len(jogadores)} jogadores da planilha.")
    
    # Processar cada colocação do torneio
    novos_jogadores = []
    jogadores_atualizados = {normalizar_nome(j['Jogador']): False for j in jogadores}
    
    # Perguntar ou assumir multiplicador (padrão: não dobrado)
    dobrado = False
    
    print("\nProcessando resultados do torneio:")
    for posicao, nome_torneio in STANDINGS:
        pontos_ganhos = calcular_pontos_por_posicao(posicao, dobrado)
        ganha_podio = 1 if posicao <= 4 else 0  # Top 4 é pódio no padrão do site
        
        jogador = encontrar_jogador(nome_torneio, jogadores)
        
        if jogador:
            # Garantir chaves básicas para evitar erros
            pts_antigos = int(jogador.get('Pontos') or 0) if jogador.get('Pontos') else 0
            podios_antigos = int(jogador.get('Podio') or 0) if jogador.get('Podio') else 0
            participacoes_antigas = int(jogador.get('Participacoes') or 0) if jogador.get('Participacoes') else 0
            if participacoes_antigas == 0:
                participacoes_antigas = 1  # Fallback caso seja o primeiro torneio registrado

            participacoes_novas = participacoes_antigas + 1
            
            # Cálculo da média ponderada de colocação
            media_antiga = float(str(jogador.get('MediaColocacao', '0')).replace(',', '.')) if jogador.get('MediaColocacao') else float(jogador.get('Pos', '0') or 1.0)
            nova_media = (media_antiga * participacoes_antigas + posicao) / participacoes_novas
            
            # Atualizar histórico de colocações
            historico_antigo = jogador.get('HistoricoColocacoes') or ""
            novo_historico = f"{historico_antigo};{posicao}" if historico_antigo else str(posicao)

            jogador['Pontos'] = str(pts_antigos + pontos_ganhos)
            jogador['Podio'] = str(podios_antigos + ganha_podio)
            jogador['Participacoes'] = str(participacoes_novas)
            jogador['MediaColocacao'] = f"{nova_media:.2f}".replace('.', ',')
            jogador['HistoricoColocacoes'] = novo_historico
            
            # Garantir outras colunas obrigatórias
            if 'Categoria' not in jogador or not jogador['Categoria']:
                jogador['Categoria'] = 'ME'
            if 'Vitorias' not in jogador or not jogador['Vitorias']:
                jogador['Vitorias'] = '0'
            if 'Empates' not in jogador or not jogador['Empates']:
                jogador['Empates'] = '0'
            if 'Derrotas' not in jogador or not jogador['Derrotas']:
                jogador['Derrotas'] = '0'
            if 'Deck' not in jogador or not jogador['Deck']:
                jogador['Deck'] = 'Outros'
            if 'TipoEnergia' not in jogador or not jogador['TipoEnergia']:
                jogador['TipoEnergia'] = 'colorless'
            
            print(f"- {nome_torneio} ({posicao}º): +{pontos_ganhos} PTS (Pódio: +{ganha_podio}) -> Novo Total: {jogador['Pontos']} PTS")
            jogadores_atualizados[normalizar_nome(jogador['Jogador'])] = True
        else:
            # Criar novo jogador no formato de 13 colunas
            novo = {
                'Pos': '',
                'Jogador': nome_torneio,
                'Categoria': 'ME', # Padrão Master
                'Pontos': str(pontos_ganhos),
                'Vitorias': '0',
                'Empates': '0',
                'Derrotas': '0',
                'Podio': str(ganha_podio),
                'MediaColocacao': f"{posicao:.2f}".replace('.', ','),
                'Deck': 'Outros',
                'TipoEnergia': 'colorless',
                'Participacoes': '1',
                'HistoricoColocacoes': str(posicao)
            }
            novos_jogadores.append(novo)
            print(f"- [NOVO JOGADOR] {nome_torneio} ({posicao}º): +{pontos_ganhos} PTS (Pódio: +{ganha_podio})")

    # Juntar novos jogadores
    todos_jogadores = jogadores + novos_jogadores

    # Preencher colunas faltantes para jogadores que não jogaram este torneio
    for jogador in todos_jogadores:
        for header in headers:
            if header not in jogador:
                if header in ['Vitorias', 'Empates', 'Derrotas', 'Podio', 'Pontos']:
                    jogador[header] = '0'
                elif header == 'MediaColocacao':
                    jogador[header] = '0,00'
                elif header == 'Participacoes':
                    jogador[header] = '1'
                elif header == 'Deck':
                    jogador[header] = 'Outros'
                elif header == 'TipoEnergia':
                    jogador[header] = 'colorless'
                elif header == 'Categoria':
                    jogador[header] = 'ME'
                else:
                    jogador[header] = ''

    # Ordenar ranking
    def obter_pontos(j):
        try:
            return int(j['Pontos'])
        except:
            return 0
            
    todos_jogadores.sort(key=obter_pontos, reverse=True)

    # Reatribuir posições
    for idx, jogador in enumerate(todos_jogadores):
        jogador['Pos'] = str(idx + 1)

    # Criar pasta planilha se não existir
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    # Escrever no arquivo CSV
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(todos_jogadores)

    print(f"\n[SUCESSO] Planilha de Ranking atualizada salva em: {OUTPUT_FILE}")
    print(f"Total de jogadores no Ranking atualizado: {len(todos_jogadores)}")

if __name__ == '__main__':
    main()
