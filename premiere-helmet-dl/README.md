# Helmet DL

Extensão CEP para o Adobe Premiere Pro que baixa vídeos do YouTube, TikTok, X, Instagram, Twitch e de [mais de mil sites suportados pelo yt-dlp](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md), salva numa pasta `Helmet DL` ao lado do projeto e importa o arquivo direto na aba **Project** (nunca na timeline).

Mesma identidade visual do Helmet Desk, tema Clássico (Violet Terminal com degradês sutis), com Geo em caixa alta no nome e Roboto no resto. O tema Frutiger Aero está guardado em `../_backup/tema-frutiger-aero` (veja o `COMO_RESTAURAR.md` de lá).

### Créditos das fontes

Embutidas em `client/fonts/` (com o texto da licença), copiadas do Helmet Desk. O painel não acessa a internet para usá-las.

| Fonte | Uso | Autor | Licença |
|---|---|---|---|
| [Geo](https://fonts.google.com/specimen/Geo) (Regular) | Nome "HELMET DL" | Ben Weiner | SIL Open Font License 1.1 |
| [Roboto](https://fonts.google.com/specimen/Roboto) (Regular, Medium, SemiBold, Bold) | Todo o resto | The Roboto Project Authors | SIL Open Font License 1.1 |

## Instalação

1. Feche o Premiere.
2. Rode `instalar.bat` (fica uma pasta acima desta). Ele copia a extensão para `%APPDATA%\Adobe\CEP\extensions\` e libera extensões não assinadas (`PlayerDebugMode`).
   Alternativa manual: copiar esta pasta para `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\` e rodar `Add Keys.reg`.
3. No Premiere: **Window › Extensions › Helmet DL**.

Não é preciso instalar Python, yt-dlp ou FFmpeg manualmente. No primeiro download a extensão baixa:

| Ferramenta | Para quê | Origem |
|---|---|---|
| yt-dlp | o download em si (o `.exe` oficial já traz o Python embutido) | github.com/yt-dlp/yt-dlp |
| FFmpeg + FFprobe | juntar áudio e vídeo, remux, reencode, extrair áudio | github.com/yt-dlp/FFmpeg-Builds |
| Deno | runtime JavaScript que o yt-dlp exige para ler o YouTube | github.com/denoland/deno |

Tudo fica em `%APPDATA%\Helmet DL\bin`. Se já existir um FFmpeg/Deno/yt-dlp no PATH (winget, scoop, choco, pip), ele é usado. O yt-dlp gerenciado pela extensão é atualizado sozinho uma vez por dia (desligável em **Ferramentas**).

## Como usar

1. Salve o projeto (a pasta `Helmet DL` é criada ao lado do `.prproj`).
2. Cole o link (ou use o botão de colar) — aparece uma prévia com título, duração e resolução máxima.
3. Escolha as opções e clique em **Download** (ou Enter). Dá para colar vários links de uma vez, separados por espaço: todos entram na fila.

### Opções

- **Baixar:** Vídeo + áudio, Só vídeo ou Só áudio.
- **Qualidade:** Original (máxima), 8K, 4K, 2K, 1080p, 720p, 480p, 360p, 240p, 144p. Usa a menor dimensão, então "1080p" também funciona para vídeos em pé (Shorts, TikTok, Reels). Se o vídeo não tiver a qualidade pedida, baixa a mais próxima abaixo.
- **Processamento:**
  - *Original* — como o site entrega, sem converter.
  - *Remux* — troca só o container (MP4, MOV ou MKV), sem perder qualidade.
  - *Reencode* — converte para H.264, H.265 ou ProRes 422, com frame rate constante (evita dessincronia de vídeos de celular/TikTok/Twitch no Premiere). O arquivo intermediário é apagado.
  - *Ambos* — faz o remux **e** uma cópia reencodada; os dois vão para o Project.
  - *Reencodar usando CPU ou GPU* — na GPU o encode usa NVIDIA NVENC, AMD AMF ou Intel Quick Sync (detectado sozinho). É mais rápido e libera a CPU, com arquivo um pouco maior. Se a GPU falhar, o reencode é refeito na CPU. ProRes sempre usa a CPU.
- **Priorizar formatos do Premiere:** prefere H.264 + AAC quando o site oferece (YouTube até 1080p, normalmente). Acima disso o YouTube só tem VP9/AV1 — use Reencode.
- **Formato do áudio** (Só áudio): WAV, MP3 320k, M4A ou original.
- **Importar numa bin "Helmet DL":** desligado, importa na raiz do Project.
- **Baixar a playlist inteira.**
- **Baixar só um trecho:** início/fim em segundos ou `hh:mm:ss`. O corte cai no keyframe mais próximo.
- **Cookies do navegador:** para Instagram, vídeos privados ou com restrição de idade. O Firefox é o mais confiável; o Chrome/Edge precisam estar fechados.

Se o arquivo final tiver um codec que o Premiere costuma não abrir (VP9, AV1, Opus…), o item fica amarelo na lista com um aviso.

## Estrutura

```
premiere-helmet-dl/
  CSXS/manifest.xml       manifesto CEP (Node habilitado)
  client/index.html       painel
  client/css/style.css    identidade Violet Terminal
  client/js/tools.js      encontra/instala/atualiza yt-dlp, FFmpeg e Deno
  client/js/downloader.js argumentos do yt-dlp, progresso, reencode com FFmpeg
  client/js/main.js       interface, fila, integração com o Premiere
  host/index.jsx          ExtendScript: caminho do projeto e importação no Project
```

## Depuração

Com o painel aberto, acesse `http://localhost:8098` no Chrome (arquivo `.debug`). O card **Log** no painel mostra os comandos exatos do yt-dlp/FFmpeg e as saídas.
