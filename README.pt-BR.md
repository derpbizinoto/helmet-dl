# Helmet DL

[English](README.md) · **Português**

Extensão CEP para o Adobe Premiere Pro que baixa vídeos do YouTube, TikTok, X, Instagram, Twitch e de [mais de mil sites suportados pelo yt-dlp](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md), salva numa pasta `Helmet DL` ao lado do projeto e importa o arquivo direto na aba **Project** (nunca na timeline).

Mesma identidade visual do Helmet Desk, tema Clássico (Violet Terminal com degradês sutis), com Geo em caixa alta no nome e Roboto no resto. O tema Frutiger Aero antigo ficou guardado no histórico do git (commit `3328d34`, pasta `_backup/tema-frutiger-aero`, com um `COMO_RESTAURAR.md`).

### Créditos das fontes

Embutidas em `client/fonts/` (com o texto da licença), copiadas do Helmet Desk. O painel não acessa a internet para usá-las.

| Fonte | Uso | Autor | Licença |
|---|---|---|---|
| [Geo](https://fonts.google.com/specimen/Geo) (Regular) | Nome "HELMET DL" | Ben Weiner | SIL Open Font License 1.1 |
| [Roboto](https://fonts.google.com/specimen/Roboto) (Regular, Medium, SemiBold, Bold) | Todo o resto | The Roboto Project Authors | SIL Open Font License 1.1 |

Grátis e de código aberto ([licença MIT](LICENSE)).

**[⬇ Baixar a versão mais recente](https://github.com/derpbizinoto/helmet-dl/releases/latest)**: Premiere Pro no Windows.

## Instalação

1. Baixe o `HelmetDL-<versão>.zip` na [página de versões](https://github.com/derpbizinoto/helmet-dl/releases/latest) e extraia.
2. Feche o Premiere.
3. Rode `instalar.bat` (dois cliques; não precisa de administrador). Ele copia a extensão para `%APPDATA%\Adobe\CEP\extensions\` e libera extensões não assinadas (`PlayerDebugMode`).
   Alternativa manual: copiar esta pasta para `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\` e rodar `Add Keys.reg`.
4. No Premiere: **Window › Extensions › Helmet DL**.

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
- **Language / Idioma:** inglês (padrão) ou português. Troca na hora e fica salvo. Itens da lista que já terminaram e o Log continuam no idioma em que foram escritos.

Se o arquivo final tiver um codec que o Premiere costuma não abrir (VP9, AV1, Opus…), o item fica amarelo na lista com um aviso.

## Estrutura

```
instalar.bat              instala para o usuário atual (sem administrador)
Add Keys.reg              alternativa manual: libera extensões não assinadas (CSXS 9 a 16)
empacotar.ps1             gera dist\HelmetDL-<versão>.zip para distribuir
tests/                    testes automáticos (node tests\run-tests.js)
AUDITORIA.md              auditoria de segurança e limpeza (o que foi achado e corrigido)
CHANGELOG.md              o que mudou em cada versão

premiere-helmet-dl/
  CSXS/manifest.xml       manifesto CEP (Node habilitado; ver "Segurança")
  host/index.jsx          ExtendScript: caminho do projeto e importação no Project
  client/index.html       painel
  client/css/style.css    identidade Violet Terminal
  client/js/
    config.js             tudo que é configurável: versão, nomes, tempos limite,
                          endereços das ferramentas; liga/desliga o log de depuração
    i18n.js               idioma do painel e o dicionário de tradução para o inglês
    bridge.js             única porta de conversa com o Premiere (ExtendScript)
    tools.js              encontra/instala/atualiza yt-dlp, FFmpeg e Deno; roda processos
    downloader.js         argumentos do yt-dlp, progresso, reencode com FFmpeg, nomes de arquivo
    ui.js                 elementos da tela, opções, configurações salvas, log
    project.js            projeto aberto e pasta "Helmet DL"
    preview.js            validação dos links e prévia (título, miniatura, duração)
    tools-ui.js           card "Ferramentas" e atualização automática do yt-dlp
    clipboard.js          botão de colar
    queue.js              fila de downloads e barra de progresso do rodapé
    main.js               liga os botões aos módulos e inicia o painel
```

Os arquivos de `client/js/` são carregados pelo `index.html` nessa ordem (cada um usa os de cima).

### Traduções

O texto continua escrito em português no código (dentro de `tr("…")`) e no `index.html`. A tradução para o inglês fica no dicionário `EN` de `client/js/i18n.js`, com a frase em português como chave. Frase nova na tela precisa de uma entrada nova lá — os testes automáticos falham se faltar alguma.

## Segurança

O painel roda com o Node.js liberado (`--enable-nodejs` e `--mixed-context` no `manifest.xml`), porque precisa rodar o yt-dlp e o FFmpeg e gravar arquivos. Por isso:

- **Links:** só `http://` e `https://`. O link vai para o yt-dlp depois de um `--`, então nunca é lido como opção.
- **Programas:** sempre chamados com a lista de argumentos separada (sem montar comando de texto). Programas do Windows (PowerShell, taskkill, tar, explorer) são chamados pelo caminho completo. Todos têm tempo limite e são encerrados quando o painel fecha.
- **Ferramentas baixadas:** só do GitHub, por HTTPS, e só são instaladas se o SHA-256 bater com o publicado na página oficial. Se não bater, o arquivo é apagado e a versão anterior continua.
- **Arquivos:** os nomes são limpos (sem barras, caracteres proibidos ou nomes reservados do Windows), ficam sempre dentro da pasta `Helmet DL` e nunca sobrescrevem um arquivo existente (ganham "(2)", "(3)"…). Downloads cancelados, com erro ou interrompidos pelo fechamento do painel têm as sobras (`.part`, fragmentos, reencode incompleto e, no modo Reencode, o original intermediário) apagadas.
- **Tela:** textos que vêm da internet (títulos, mensagens) entram como texto, nunca como HTML. Nenhum código é carregado de fora (sem CDN, sem `eval`).
- **Cookies:** a opção "Cookies do navegador" só passa o **nome** do navegador para o yt-dlp (`--cookies-from-browser firefox`). Quem lê os cookies é o próprio yt-dlp, na hora; a extensão nunca vê, grava nem registra o conteúdo deles.
- **Assinatura:** a extensão ainda não é assinada, por isso o instalador liga o `PlayerDebugMode` (que permite extensões não assinadas). Assinar com certificado é uma pendência (decisão D2 da auditoria).

## Desenvolvimento

### Testes

```
node tests\run-tests.js
```

Testa sem Premiere e sem internet: limpeza de nomes, links aceitos/recusados, conferência de SHA-256, argumentos do yt-dlp, mensagens de erro e a conversa com o Premiere (sobre uma imitação da API em `tests/premiere-mock.js`). O que só dá para ver no Premiere precisa de teste manual: o roteiro usado na 1.1.0 continua no histórico do git (`git show dd621c3:TESTES.md`).

### Depuração

O arquivo `.debug` **não** faz parte do repositório nem do pacote (ele abre uma porta de depuração no computador). Na máquina de desenvolvimento, crie `premiere-helmet-dl\.debug` com:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
    <Extension Id="com.seuestudio.helmetdl.panel">
        <HostList>
            <Host Name="PPRO" Port="8098" />
        </HostList>
    </Extension>
</ExtensionList>
```

Com o painel aberto, acesse `http://localhost:8098` no Chrome. Para mensagens técnicas extras, mude `DEBUG: false` para `true` em `client/js/config.js` (nunca distribua assim). O card **Log** do painel mostra os comandos exatos do yt-dlp/FFmpeg e as saídas.

Para ver o visual fora do Premiere, sirva a pasta `client` num servidor local (por exemplo `py -3 -m http.server` dentro dela) e abra `index.html?demo`: a fila aparece preenchida com exemplos.

### Nova versão

1. Mude a versão nos três lugares: `CSXS/manifest.xml` (`ExtensionBundleVersion` e `Extension Version`), `client/js/config.js` (`CLIENT_VERSION`) e `host/index.jsx` (`HDL_HOST_VERSION`).
2. Anote no `CHANGELOG.md`.
3. Rode `node tests\run-tests.js` e teste no Premiere (roteiro da 1.1.0: `git show dd621c3:TESTES.md`).
4. Rode `powershell -ExecutionPolicy Bypass -File empacotar.ps1`. Ele confere se as três versões batem, monta `dist\HelmetDL-<versão>.zip` só com o necessário e **para com erro** se achar `.debug`, certificado, chave ou arquivo de cookies.

## Licença

[MIT](LICENSE). As fontes Geo e Roboto têm a própria licença (SIL Open Font License 1.1, ver `client/fonts/`). yt-dlp, FFmpeg e Deno não vêm junto: são baixados dos projetos oficiais e seguem as licenças deles.
