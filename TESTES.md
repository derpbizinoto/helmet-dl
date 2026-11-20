# Roteiro de testes manuais — Helmet DL

Os testes automáticos (`node tests\run-tests.js`) cobrem o que dá para testar sem o Premiere. Este roteiro cobre o resto e deve ser feito **no Premiere** antes de distribuir uma versão nova.

Marque cada item. Se algo der errado, abra o card **Log** do painel e copie as últimas linhas.

## Preparação

- [x] Feche o Premiere, rode `instalar.bat` e abra o Premiere.
- [x] **Window › Extensions › Helmet DL** abre o painel, e o rodapé mostra a versão certa (ex.: `v1.0.1`).
- [x] Confira que **não** existe `.debug` em `%APPDATA%\Adobe\CEP\extensions\premiere-helmet-dl\`.
- [x] Crie um projeto novo e salve numa pasta **com espaços e acentos**, por exemplo `Área de Trabalho\Projeto Ação Teste\teste.prproj`.
- [x] O topo do painel mostra "Salvando em teste › Helmet DL".

## Primeira instalação das ferramentas

- [x] Renomeie `%APPDATA%\Helmet DL\bin` para `bin-velho` (força baixar tudo de novo).
- [x] Cole um link do YouTube e clique em **Download**: o item mostra "Instalando yt-dlp… / FFmpeg… / Deno…" e depois baixa.
- [x] No Log aparecem "yt-dlp pronto", "FFmpeg pronto" e "Deno pronto", sem aviso de SHA-256.
- [x] Apague `bin` e volte o nome de `bin-velho` para `bin`.

## Casos difíceis

### Título com emoji, acentos e barras

- [x] Baixe um vídeo cujo título tenha emoji, acentos e `/` ou `:` (procure no YouTube por algo como "Ação / Reação 🎬").
- [x] O arquivo aparece na pasta `Helmet DL` com o nome legível (barras e dois-pontos trocados), **e** foi importado no Project.
- [x] Clique no ícone de pasta do item: o Explorer abre com o arquivo selecionado.

### Link inválido

- [x] Digite `isso não é link` e clique em Download → "Isso não parece um link…". Nada entra na fila.
- [x] Cole `file:///C:/Windows/win.ini` → mesma mensagem.
- [x] Cole `--exec calc` → mesma mensagem; nenhum programa abre.
- [x] Cole `https://example.com/` → o item termina em erro com "Este site não é suportado…".

### Pasta de destino com espaços e acentos

- [x] (Já coberto pela preparação.) Confira na pasta do projeto que `Helmet DL` foi criada ao lado do `.prproj` e que os arquivos estão lá.

### Cancelar no meio

- [x] Comece o download de um vídeo longo em 1080p (ex.: um vídeo de 10 min ou mais).
- [x] Com a barra em uns 30%, clique no **X** do item → "Cancelado".
- [x] Espere 2 segundos: na pasta `Helmet DL` **não** sobra `.part`, `.ytdl` nem `.part-Frag…`.
- [ ] Repita com **Reencode** ligado e cancele durante "Reencodando…": não sobra o arquivo `[H.264]` pela metade **nem o original `.mkv`** (no modo Reencode ele é só intermediário). *(Corrigido depois do 1º teste, que deixava o `.mkv`: testar de novo.)*
- [ ] Feche o painel no meio de um download: no Gerenciador de Tarefas não sobra `yt-dlp.exe` nem `ffmpeg.exe`, **e** na pasta `Helmet DL` não sobra `.part`. *(Corrigido depois do 1º teste, que deixava um `.f137.mp4.part`: testar de novo.)*

### Arquivo com o mesmo nome já existente

- [x] Baixe um vídeo com **Reencode** (H.264). Baixe o **mesmo** link de novo com Reencode.
- [x] O segundo reencode vira `… [H.264] (2).mp4`; o primeiro continua intacto.
- [ ] Baixe um link em **Remux** e depois o **mesmo** link de novo em **Remux**: o segundo diz "Já estava no Project" e nada é baixado de novo. *(Passo corrigido: no 1º teste o Remux veio depois de um Reencode, e o Reencode apaga o original — então baixar de novo era o certo.)*

### Sem internet

- [ ] Desligue o Wi-Fi/cabo. Cole um link e clique em Download.
- [ ] O item termina em erro com "Sem conexão com a internet (ou o site não respondeu)…".
- [ ] Ainda sem internet, em **Ferramentas** clique em **Atualizar** do yt-dlp → mensagem "Não deu para instalar o yt-dlp. Sem conexão…", e o yt-dlp anterior continua funcionando (religue a internet e baixe algo).

## Funções principais (para garantir que nada quebrou)

- [x] **Vídeo + áudio**, 1080p, Remux MP4 → importado e abre na timeline com som.
- [x] **Só áudio**, WAV → importado; toca.
- [x] **Só vídeo** → importado sem trilha de áudio.
- [x] **Reencode** H.264 com **GPU** (se tiver placa NVIDIA/AMD/Intel) → o Log mostra o encoder da GPU.
- [x] **Ambos** → dois arquivos no Project (remux e `[H.264]`).
- [x] **Baixar só um trecho** (ex.: 10 a 20) → arquivo com ~10 s, nome terminando em `10-20s`.
- [ ] **Playlist** ligada com um link de playlist pequena → todos os vídeos na fila do yt-dlp, numerados.
- [x] **Importar numa bin "Helmet DL"** desligado → importa na raiz do Project.
- [x] Vários links colados de uma vez (separados por espaço) → todos entram na fila, um de cada vez.
- [ ] **Cookies do navegador** = Firefox (com o Firefox logado no Instagram) → um Reel baixa. No Log aparece só `--cookies-from-browser firefox`, nunca o conteúdo dos cookies.
- [ ] **Nenhum projeto aberto** (Arquivo › Fechar Projeto, com o painel aberto) → o topo do painel muda para algo como "Salve o projeto para poder baixar" ou "Nenhum projeto aberto", e o Download termina em erro pedindo para salvar/abrir um projeto. *(Passo corrigido: nas versões atuais o Premiere já pede a pasta ao criar o projeto, então "projeto não salvo" não acontece.)*
- [x] Feche e reabra o painel → as opções escolhidas continuam marcadas.
- [x] Role a lista até esconder o item em andamento → aparece a barra de progresso no rodapé; clicar no título rola até o item.
