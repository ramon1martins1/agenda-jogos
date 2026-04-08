# Agenda de Jogos (Fluminense)

Este projeto é um sistema automatizado para rastrear e exibir a agenda de jogos do Fluminense. O sistema busca dados sobre partidas futuras, armazena essas informações e apresenta uma interface moderna, responsiva e amigável para visualizar os cronogramas esportivos, com possibilidade de adicionar eventos no Google Calendar.

## ✨ Funcionalidades
- **Busca Automatizada**: Utiliza um script Node.js (`fetch-jogos.js`) para capturar e atualizar dados das partidas.
- **Integração com OpenFootball**: Obtém informações de partidas automaticamente (suplementadas com dados locais via arquivos `.txt` como `2026_br1.txt` para competições específicas).
- **Interface Web**: Interface moderna utilizando HTML, CSS e um design responsivo (`index.html`) para listar os próximos jogos e facilitar a navegação.
- **Ações Automatizadas**: Atualização semanal/periódica e contínua dos dados integrada com GitHub Actions (`.github/workflows/update.yml`).
- **Opção de Calendário**: Permite exportação ou lembretes simplificados para o Google Calendar.

## 🛠 Tecnologias Utilizadas
- **Frontend**: HTML5, CSS e JS Vanilla.
- **Backend / Atualizador de Dados**: Node.js com Axios.
- **Automação de CI/CD**: GitHub Actions.
- **Armazenamento de Dados**: Base em arquivo JSON estático (`db.json`) gerado automaticamente.

## 🚀 Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/en/) instalado (versão 14+ recomendada).

### Passos

1. Clone o repositório:
   ```bash
   git clone <link-do-repositorio>
   cd agenda-jogos
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Atualize os dados das partidas manualmente (opcional):
   ```bash
   node fetch-jogos.js
   ```

4. Visualize no navegador:
   Você pode simplesmente abrir o arquivo `index.html` em qualquer navegador ou usar um servidor local como o Live Server do VSCode.

## 🔄 Automação com GitHub Actions
Os dados da agenda do time são mantidos em sincronia usando GitHub Actions, atualizando periodicamente o banco de dados local da aplicação `db.json` sem precisar de intervenção manual. O workflow de automação está configurado no repositório.
