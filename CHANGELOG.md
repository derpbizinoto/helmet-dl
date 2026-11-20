# Changelog — Helmet DL

## 1.0.1 — limpeza e segurança

Nenhum recurso novo e nenhuma mudança visual. O painel funciona igual; por baixo ficou mais seguro e organizado. Detalhes de cada item em `AUDITORIA.md`.

### Segurança

- yt-dlp, FFmpeg e Deno só são baixados do GitHub, por HTTPS, e só são instalados se o SHA-256 bater com o publicado na página oficial. Arquivo que não bate é apagado e a versão anterior continua funcionando.
- O arquivo `.debug` (que abria uma porta de depuração) não vai mais para o computador do usuário: saiu do git, o `instalar.bat` o remove e o `empacotar.ps1` se recusa a empacotá-lo.
- Programas do Windows (PowerShell, taskkill, tar, explorer) são chamados pelo caminho completo; o PowerShell recebe endereços e caminhos por variável, sem montar comando de texto.
- Ao fechar o painel ou o Premiere, nenhum yt-dlp/FFmpeg fica rodando sozinho.
- Pastas relativas do PATH (como `.`) são ignoradas na busca das ferramentas.
- O reencode nunca grava por cima de um arquivo existente (ganha "(2)", "(3)"…), e o painel só mexe em arquivos dentro da pasta `Helmet DL`.
- Downloads cancelados, **com erro** ou interrompidos porque o painel foi **fechado** têm as sobras apagadas (no caso do painel fechado, na hora ou, se o Premiere não der tempo, na próxima vez que o painel abrir) (`.part`, fragmentos, reencode incompleto). No modo Reencode, o original (`.mkv`) também é apagado nesses casos, como já era quando tudo dá certo; os demais arquivos já baixados nunca são apagados.
- Nomes de arquivo com caracteres de qualquer idioma e emoji chegam certos ao painel (o yt-dlp agora fala UTF-8 com ele).
- Miniatura da prévia só de endereços http(s); a fila é montada sem `innerHTML`; links validados de verdade (só http/https com nome de site).
- Uma única porta de conversa com o Premiere, com lista das funções permitidas; `host/index.jsx` salvo em UTF-8 com BOM.
- Configurações salvas com valor estranho são ignoradas em vez de usadas.

### Mensagens de erro

- "Sem conexão com a internet (ou o site não respondeu)" no lugar de `getaddrinfo failed`, `ENOTFOUND`, `WinError 10061` etc.
- "Este site não é suportado" para links que o yt-dlp não reconhece.
- Se a parte da extensão que roda no Premiere não carregar, o painel pede para reinstalar (antes: "Resposta inválida do ExtendScript").
- A dica "escolha um navegador em Cookies do navegador" deixou de aparecer em erros que não têm nada a ver com login.

### Organização

- `main.js` (1.100 linhas) dividido em módulos: `config.js`, `bridge.js`, `ui.js`, `project.js`, `preview.js`, `tools-ui.js`, `clipboard.js`, `queue.js` e um `main.js` curto.
- Configurações (versão, tempos limite, endereços) num só lugar: `config.js`, com chave para ligar mensagens de depuração.
- Código repetido e sem uso removido.
- Pasta `_backup/` (tema antigo) e `como instalar.txt` removidos; ficam no histórico do git (commit `3328d34`).
- `Add Keys.reg` igual ao do Helmet Cutter (CSXS 9 a 16, só `PlayerDebugMode`).
- Novos: `.gitignore`, `empacotar.ps1`, testes automáticos (`node tests\run-tests.js`), roteiro manual `TESTES.md`, este `CHANGELOG.md`.

### Pendente

- A extensão ainda não é assinada; o instalador continua ligando o `PlayerDebugMode` (decisão D2 da auditoria).

## 1.0.0

Primeira versão.
