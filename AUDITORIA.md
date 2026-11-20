# Auditoria — Helmet DL 1.0.0

Data: 19/11/2026 · Referência: Premiere Pro no Windows · Fase 1 (somente leitura).
Nenhum arquivo da extensão foi alterado. Só foram feitos: `git init`, o commit do
estado atual na branch `main` (`3328d34`) e a criação da branch `limpeza-seguranca`.

Os números de linha se referem a esse commit inicial.

**Resumo em uma frase:** o código já é cuidadoso em vários pontos (processos com
argumentos em lista, `--` antes da URL, texto da internet sempre com `textContent`),
e **não achei nada Crítico**. Os dois pontos mais sérios são: os programas baixados
(yt-dlp, FFmpeg, Deno) são executados **sem conferir se são os arquivos originais**, e
o arquivo de depuração `.debug` **vai junto na instalação** de todo mundo.

---

## 1. Tipo de projeto e mapa

**É uma extensão CEP do Premiere Pro** (tem `CSXS/manifest.xml`, `CSInterface.js` e um
`host/index.jsx` em ExtendScript). Não é UXP nem extensão de navegador, então a parte
"Se for extensão de navegador" do pedido não se aplica.

O painel roda com Node.js ligado (`--enable-nodejs` + `--mixed-context`) e usa três
programas externos: **yt-dlp** (o download), **FFmpeg/FFprobe** (juntar, converter,
analisar) e **Deno** (o yt-dlp precisa dele para ler o YouTube).

```
helmet-dl/
├─ instalar.bat              copia a extensão para %APPDATA%\Adobe\CEP\extensions e liga o PlayerDebugMode
├─ Add Keys.reg              alternativa manual: liga o PlayerDebugMode (e LogLevel) no CSXS 5 a 15
├─ como instalar.txt         instruções informais (repete o README)
├─ _backup/tema-frutiger-aero/   cópia do visual antigo (CSS + index.html), com COMO_RESTAURAR.md
└─ premiere-helmet-dl/       a extensão em si
   ├─ .debug                 abre a porta de depuração 8098 (só para desenvolvimento)
   ├─ CSXS/manifest.xml      identidade da extensão, Premiere 15+, liga o Node no painel
   ├─ README.md              documentação
   ├─ host/index.jsx         ExtendScript: diz onde o .prproj está e importa arquivos no Project
   └─ client/
      ├─ index.html          o painel (cards Link, Formato, Opções, Downloads, Ferramentas, Log)
      ├─ css/style.css       visual "Violet Terminal"; fontes locais
      ├─ fonts/, img/        Roboto, Geo (com licenças) e o logo
      └─ js/
         ├─ CSInterface.js   biblioteca oficial da Adobe (não mexer)
         ├─ tools.js         acha, instala e atualiza yt-dlp/FFmpeg/Deno; roda processos; download HTTP
         ├─ downloader.js    monta os comandos do yt-dlp e do FFmpeg, lê o progresso, reencode, GPU
         └─ main.js          todo o resto: interface, prévia, fila, ponte com o Premiere, área de transferência
```

### Fluxo de um download, do clique até o arquivo salvo

1. **Clique em Download (ou Enter)** → `enqueue()` ([main.js:552](premiere-helmet-dl/client/js/main.js)).
   `parseUrls()` (main.js:422) separa os links por espaço; aceita `http(s)://…` ou
   `dominio.com/…` (aí põe `https://` na frente). As opções são lidas e o trecho é validado
   (`jobOptions`, main.js:536). Cada link vira um item na fila.
2. **Fila** → `pump()` (main.js:594) pega um item por vez e chama `runJob()` (main.js:615).
3. **Ferramentas** → `ensureEssentialTools()` (main.js:378): se faltar yt-dlp/FFmpeg/Deno,
   baixa do GitHub (`tools.js` → `downloadFile`, tools.js:318), extrai o .zip com o `tar` do
   Windows e copia para `%APPDATA%\Helmet DL\bin`.
4. **Pasta de destino** → `refreshProject()` (main.js:265) pergunta ao Premiere o caminho do
   `.prproj` (`hdl_getProjectInfo`, index.jsx:38). Destino = `<pasta do .prproj>\Helmet DL`.
   Sem projeto salvo, para com mensagem.
5. **Download** → `HDLDownloader.download()` (downloader.js:262) roda o yt-dlp com
   `-P <destino> -o "%(title).120B [%(id)s].%(ext)s" … -- <URL>`. O yt-dlp baixa em arquivos
   `.part`, junta vídeo+áudio com o FFmpeg, faz o remux e, no fim, escreve o caminho final num
   arquivo temporário (`--print-to-file`), que o painel lê. O progresso chega linha a linha.
6. **Pós-processamento** → `postProcess()` (main.js:684): FFprobe lê os codecs; se pedido,
   reencoda (`<nome> [H.264].mp4` etc., na GPU com volta para a CPU se falhar) e apaga o
   original no modo Reencode; no "Só vídeo" tira a trilha de áudio; avisa se o codec é ruim
   para o Premiere.
7. **Importação** → `hdl_importFiles` (index.jsx:101) importa na bin "Helmet DL" (ou na raiz),
   sem importar de novo o que já está lá, e nunca na timeline.
8. Item fica verde (ou amarelo com aviso). "Mostrar na pasta" abre o Explorer no arquivo.

A **prévia** é um caminho paralelo: ao digitar/colar, depois de 0,65 s roda
`yt-dlp -J` (downloader.js:162) e mostra título, miniatura, duração, canal e resolução.

---

## 2. Funções principais — "comportamentos que não podem quebrar"

**Preciso da sua aprovação nesta lista.** Tudo aqui tem de funcionar igual depois da limpeza.

**Link e prévia**
1. Colar o link no campo (Ctrl+V) ou pelo botão de colar (tenta 3 jeitos: API do navegador, `execCommand`, PowerShell/`pbpaste`).
2. Aceitar link sem `https://` (ex.: `youtu.be/abc`).
3. Prévia com miniatura, título, duração (ou "AO VIVO"), canal, site e resolução máxima; aviso quando a qualidade pedida é maior que a do vídeo; aviso de live.
4. Vários links separados por espaço → todos entram na fila ("N links — todos vão para a fila"); textos que não são link são ignorados com aviso.

**Formato**
5. Baixar: Vídeo + áudio, Só vídeo (tira o áudio quando o site só entrega junto, como o TikTok), Só áudio (WAV, MP3 320k, M4A, original).
6. Qualidade de Original a 144p pela menor dimensão (funciona com vídeo em pé); se não existir, baixa a mais próxima abaixo.
7. Processamento: Original, Remux (MP4/MOV/MKV), Reencode (H.264, H.265, ProRes 422, frame rate constante, dimensões pares) e Ambos (os dois arquivos vão para o Project).
8. Reencode na GPU (NVIDIA, AMD ou Intel, detectada sozinha), volta para a CPU se a GPU falhar; ProRes sempre na CPU; dica dizendo qual GPU será usada.
9. "Priorizar formatos do Premiere" (H.264 + AAC quando existir).

**Opções**
10. Importar na bin "Helmet DL" ou na raiz do Project — nunca na timeline — sem importar duas vezes o mesmo arquivo.
11. Playlist inteira (arquivos numerados).
12. Baixar só um trecho (segundos ou `hh:mm:ss`; valida início < fim; nome do arquivo leva a faixa; corte exato no áudio).
13. Cookies do navegador (Firefox, Chrome, Edge, Brave, Opera, Vivaldi).

**Fila e arquivos**
14. Pasta `Helmet DL` ao lado do `.prproj`; exige projeto salvo; botão que abre a pasta; cabeçalho mostra onde salva (clique atualiza; atualiza ao focar o painel).
15. Fila de um download por vez: barra com %, velocidade e tempo restante; fases ("Juntando áudio e vídeo…", "Reencodando…" etc.); "item 2 de 5" em playlists.
16. Cancelar (inclusive itens na fila) apaga as sobras do download; Tentar de novo; Tirar da lista; Limpar concluídos; Mostrar na pasta.
17. Arquivo que já existia é reaproveitado e importado ("Já estava no Project"), e nunca é apagado depois de um reencode.
18. Item amarelo com aviso quando o codec final pode não abrir no Premiere; resolução e tamanho no fim.
19. Barra de progresso fixa no rodapé quando o item em andamento sai da área visível (clique leva até ele; dá para cancelar por ela).

**Ferramentas**
20. Detecta yt-dlp/FFmpeg/Deno da extensão, do sistema (PATH, winget, scoop, choco, `C:\ffmpeg\bin`) ou via Python (`python -m yt_dlp`).
21. Instala sozinha no primeiro download, com progresso; botões Instalar/Atualizar/Reinstalar.
22. Download resistente: tenta cada IP do GitHub com tempo curto e, se a rede falhar, usa o PowerShell como plano B.
23. Atualização automática do yt-dlp uma vez por dia (desligável), nunca no meio de um download.

**Geral**
24. Configurações lembradas entre sessões.
25. Card Log com os comandos exatos e as saídas; versão; aviso se host e painel tiverem versões diferentes; recarrega o `index.jsx` se ele não carregou.
26. `instalar.bat`: recusa se o Premiere estiver aberto, copia a extensão, libera extensões não assinadas.
27. Prévia do visual no navegador comum (`index.html?demo`) — **só para desenvolvimento** (ver D1).
28. Existe código para macOS (caminhos, `ditto`, `pbpaste`, Homebrew). **Vou mantê-lo funcionando no papel, mas não tenho como testar no Mac.**

---

## 3. Problemas de segurança

Nenhum **Crítico** encontrado.

### Alto

| ID | Onde | Risco em uma frase | Correção proposta |
|---|---|---|---|
| **A1** | tools.js:28-39, 419-483; main.js:399-412 | yt-dlp, FFmpeg e Deno são baixados e **executados** sem nenhuma conferência de que são os arquivos originais — e o yt-dlp é trocado sozinho todo dia; os redirecionamentos aceitam qualquer servidor HTTPS. | (1) Antes de usar o arquivo baixado, calcular o SHA-256 e comparar com o publicado pelo projeto oficial **na mesma release**. **Conferi hoje que os três publicam:** yt-dlp → `SHA2-256SUMS`; FFmpeg-Builds → `checksums.sha256`; Deno → `<arquivo>.zip.sha256sum`. Se não bater: apaga e mostra "o arquivo baixado não confere com o oficial". (2) Só seguir redirecionamentos para `github.com`, `api.github.com` e `*.githubusercontent.com`. Vale também para o plano B do PowerShell. |
| **A2** | premiere-helmet-dl/.debug; instalar.bat:25 | O `instalar.bat` copia a pasta inteira, então o `.debug` vai para o PC de todo usuário e abre a porta de depuração 8098; como o Node está ligado, quem conseguir se conectar nessa porta roda qualquer programa no computador. | Tirar o `.debug` da instalação e do pacote (o `instalar.bat` deixa de copiar; `empacotar.ps1` recusa), e tirar do git (`.gitignore`). No seu PC de desenvolvimento ele continua funcionando — explico no README como ligar. |

### Médio

| ID | Onde | Risco em uma frase | Correção proposta |
|---|---|---|---|
| **M1** | tools.js:167 (`taskkill`), 308 e 338 (`powershell`), 336 (`tar` no plano B); main.js:293 (`explorer`), 939 (`powershell` no plano B) | Programas do Windows chamados só pelo nome, com a pasta de trabalho no `%TEMP%`: o Windows procura primeiro na pasta atual, então um `powershell.exe` largado no TEMP seria executado no lugar do verdadeiro. | Caminho completo: `%SystemRoot%\System32\…\powershell.exe`, `taskkill.exe`, `tar.exe`, `%SystemRoot%\explorer.exe`; no Mac, `/usr/bin/ditto`, `/usr/bin/open`, `/usr/bin/pbpaste`. |
| **M2** | tools.js:305-307, 338-340 | O comando do PowerShell é montado com o endereço e os caminhos dentro do texto; a proteção atual (`'` → `''`) não cobre as aspas "curvas" (‘ ’), que o PowerShell também entende como aspas. | Passar os valores por variável de ambiente (`$env:HDL_URL`, `$env:HDL_DEST`), sem montar texto. Mesma solução do Helmet Cutter. |
| **M3** | main.js (não há tratamento de fechamento) | Se o painel ou o Premiere fechar no meio, o yt-dlp/FFmpeg continuam rodando sozinhos, escrevendo na pasta e ocupando CPU. | Registrar todo processo aberto e encerrar todos (com os filhos) quando o painel fechar ou o Premiere sair. |
| **M4** | main.js:501 | A miniatura da prévia usa o endereço que veio do site sem conferir; um endereço `file://servidor/...` faria o Windows tentar se conectar a esse servidor e mandar a identificação de login do usuário. | Só mostrar miniatura `http://` ou `https://`. |
| **M5** | downloader.js:426 (`-y`), 454-459 | O reencode grava `<nome> [H.264].mp4` **por cima** se já existir um arquivo com esse nome (por exemplo, um que já está sendo usado no projeto). | Se o nome existir, usar sufixo numérico: `<nome> [H.264] (2).mp4`. |
| **M6** | main.js:668-678 | Em caso de **erro** (não cancelamento), o arquivo de reencode incompleto fica na pasta; só o cancelamento limpa. | Apagar a saída incompleta também em erro. Os `.part` do yt-dlp: ver decisão D3. |
| **M7** | instalar.bat:32-35; Add Keys.reg | Para instalar sem assinatura, liga o `PlayerDebugMode`, que desliga a verificação de assinatura de **todas** as extensões CEP do usuário. | Igual ao Helmet Cutter: não é mudança de código; o caminho limpo é assinar a extensão (certificado fora do git). Proposta: deixar pendente e explicado no README (decisão D2). |

### Baixo

| ID | Onde | Risco em uma frase | Correção proposta |
|---|---|---|---|
| **B1** | main.js:422-431 | A URL é validada só pelo começo do texto (não confere se tem um endereço de site de verdade). | Validar com `new URL()`: só `http`/`https`, com nome de site; rejeitar o resto com "Isso não parece um link". (`file:`, `javascript:`, `data:` e textos começando com `-` **já são rejeitados** hoje, e o `--` antes da URL já existe.) |
| **B2** | downloader.js:268, 341-343; main.js:724 | O nome do arquivo vem do título do vídeo; hoje quem limpa é o próprio yt-dlp, e o painel aceita (e no Reencode **apaga**) qualquer caminho que o yt-dlp informar, sem conferir se está dentro da pasta `Helmet DL`. | (1) Passar `--windows-filenames` sempre (no Windows já é o padrão; vale também no Mac). (2) Conferir que cada arquivo informado está dentro da pasta de destino antes de importar/apagar. (3) Função própria de limpeza de nome para os nomes que o painel cria (reencode, sem áudio): remove `..`, `/`, `\`, caracteres inválidos e nomes reservados (CON, NUL…), limita o tamanho. |
| **B3** | main.js:791, 798, 819 | Usa `innerHTML` com texto fixo (nenhum dado da internet passa por ali hoje), mas basta alguém colocar um título ali no futuro para virar porta de entrada. | Montar os botões e a linha da fila com `createElement`/`textContent`. |
| **B4** | tools.js:80-106 | Entradas relativas no PATH (ex.: `.`) seriam procuradas na pasta atual. | Ignorar pastas do PATH que não sejam caminhos completos. (Observação: `C:\ffmpeg\bin` pode ser criada por qualquer usuário do PC; mantenho porque o README promete usar o FFmpeg do sistema.) |
| **B5** | main.js:216-257, 270, 653 | A ponte painel → Premiere recebe o comando já montado como texto; hoje todas as chamadas usam `JSON.stringify` corretamente, mas nada impede uma chamada futura de concatenar. | Uma função única `Host.call("hdl_importFiles", [lista, bin])` que faz a serialização sozinha e devolve `{ok, data, error}` (o host já responde nesse formato). |

### O que já está certo (não precisa mexer)

- **Processos:** todos com `spawn` e argumentos em lista; nenhum `exec` com texto nem `shell: true`. `runCapture` tem tempo limite; cancelar mata o processo e os filhos.
- **URL no yt-dlp:** sempre depois de `--` (downloader.js:166 e 288), então um link nunca vira opção. `--ignore-config` impede que um arquivo de configuração do yt-dlp no PC mude o comportamento.
- **Texto da internet na tela:** título, canal, erros e log usam `textContent`.
- **Sem `eval`, `new Function`, `setTimeout` com texto, nem nada carregado de CDN.** As fontes são locais.
- **Downloads só por HTTPS:** um redirecionamento para `http://` falha (o `https.get` recusa).
- **Extração de .zip:** o `tar` do Windows recusa caminhos com `..`.
- **Segredos:** nenhum certificado, senha, chave, token ou cookie no projeto. Não há `package.json` (então `npm audit` não se aplica).
- **Cookies do navegador** — como funcionam: quando você escolhe um navegador, a extensão só passa `--cookies-from-browser firefox` (por exemplo) para o yt-dlp. O yt-dlp lê os cookies direto do banco do navegador **na memória**, usa no pedido ao site e descarta. A extensão **nunca lê, grava ou mostra** os cookies; no log aparece só o nome do navegador. Só fica salva (no `localStorage`) a escolha do navegador. Vou manter assim e deixar registrado que nunca se deve usar `--cookies <arquivo>` nem `--verbose` (que poderia imprimir dados de login).
- **Dados pessoais:** nenhum caminho pessoal fixo no código. O log mostra caminhos com o nome do usuário do Windows e as URLs, mas só na tela; não é gravado em disco.
- **Ponte com o host:** `index.jsx` já devolve `{ok, data, error}` e escapa o texto; os caminhos vão com `encodeURIComponent`.

---

## 4. Problemas de limpeza

| ID | Onde | Problema | Proposta |
|---|---|---|---|
| **L1** | main.js (1107 linhas) | Um arquivo faz tudo: interface, prévia, fila, barra do rodapé, ferramentas, ponte com o Premiere, área de transferência; e deixa ~30 nomes soltos no escopo global. | Dividir em `config.js`, `host.js` (ponte), `tools-ui.js`, `preview.js`, `queue.js` (fila + rodapé), `clipboard.js` e `main.js` (início e eventos), tudo dentro de um nome só (`HelmetDL`). |
| **L2** | main.js:17-20; tools.js:28-39, 185; downloader.js:268-270; espalhado | Constantes espalhadas e números "mágicos" (endereços, tempos limite de 8 s/20 s/30 s/60 s/5 min, 20 h da atualização, 650 ms da prévia, 200 000 caracteres do log, modelo do nome, 4 fragmentos). | Tudo em `config.js`. |
| **L3** | tools.js:428-465, 381-411; main.js:330, 351; downloader.js:290, 427; main.js:612, downloader.js:350, 442 | Duplicações: `installFfmpeg` e `installDeno` são quase iguais; `detectFfmpeg`/`detectDeno` também; nomes das ferramentas em dois lugares; o "formatar comando para o log" duas vezes; o erro "Cancelado" montado três vezes. | Uma função para "baixar .zip, conferir, extrair e copiar"; uma para detectar; um mapa de nomes; funções auxiliares únicas. |
| **L4** | downloader.js:314-315; tools.js:501-522; manifest.xml:10 | Código sem efeito ou sem uso: a lógica do rótulo "Baixando vídeo/áudio" é sobrescrita na linha seguinte; `isMac`, `dataDir`, `detectYtdlp/Ffmpeg/Deno` e `rmrf` são exportados e ninguém usa; comentário de modelo ("Ajuste a faixa de versão conforme necessário"). | Simplificar e remover. |
| **L5** | vários | Falhas pouco claras: sem internet aparece o erro técnico ("getaddrinfo failed", "ENOTFOUND"); se o `index.jsx` não carregar, aparece "Resposta inválida do ExtendScript: EvalScript error."; vários `catch { /* ignora */ }` escondem problemas. | Mensagens claras: "Sem conexão com a internet (ou o site não respondeu)", "Este site não é suportado", "O script do Premiere não carregou — reinstale a extensão", "O arquivo baixado não confere com o oficial". |
| **L6** | — | Não há `console.log` de debug (bom). O Log do painel é para o usuário e fica. | Criar `Log.debug` (desligado por padrão em `config.js`) para mensagens técnicas que hoje são engolidas. |
| **L7** | raiz | Não há `.gitignore`. | Criar cobrindo `node_modules/`, `dist/`, `build/`, `*.zxp`, `*.zip`, `*.p12`, `*.pfx`, `*.key`, `*.pem`, `*.crt`, `.debug`, `bin/`, `*.exe`, `*.part`, `*.download`, temporários e lixo do Windows. |
| **L8** | Add Keys.reg | Liga CSXS 5 a 15 (o `instalar.bat` liga 9 a 16) e também o `LogLevel`. | Igual ao Helmet Cutter: CSXS 9 a 16, só `PlayerDebugMode`. |
| **L9** | — | Não há script de empacotamento; hoje o "pacote" é a pasta inteira (com `.debug`, `_backup`…). | `empacotar.ps1` que gera `dist\HelmetDL-<versão>.zip` só com o necessário e **para com erro** se achar `.debug`, certificado ou chave. |
| **L10** | host/index.jsx | Salvo sem BOM; o ExtendScript lê arquivos sem BOM na codificação antiga do Windows. Hoje só os comentários têm acento, mas um texto acentuado futuro sairia embaralhado. | Salvar em UTF-8 com BOM (como no Helmet Cutter). |
| **L11** | manifest.xml:3,6; main.js:7; index.jsx:6 | A versão aparece em três lugares. | Manter (o aviso "host ≠ painel" depende disso), mas o `empacotar.ps1` confere se os três batem. |
| **L12** | premiere-helmet-dl/README.md | README dentro da pasta da extensão; não há CHANGELOG nem roteiro de testes. | README na raiz, `CHANGELOG.md`, `TESTES.md` (fase final). |
| **L13** | manifest.xml:2 | O ID da extensão é `com.seuestudio.helmetdl` ("seu estúdio", texto de modelo). | **Não mudar:** trocar o ID faz o Premiere tratar como outra extensão e perder as configurações salvas. Só registro. |

### Arquivos cujo uso não está claro — preciso que você decida (D1)

- `_backup/tema-frutiger-aero/` — cópia do visual antigo. O README aponta para ela.
- `como instalar.txt` — repete o README num tom informal.
- `index.html?demo` (`demoQueue`, main.js:1050-1067) — fila de exemplo para ver o visual fora do Premiere.

---

## 5. Decisões que preciso de você

- **D1 — Arquivos acima.** Minha sugestão: apagar `_backup/` (continua guardada no histórico
  do git, e o README passa a dizer como recuperar); juntar `como instalar.txt` no README e
  apagar; **manter** o modo `?demo` (é útil para ajustar o visual e não roda dentro do Premiere).
- **D2 — PlayerDebugMode / assinatura (M7).** Sugestão: deixar pendente, como no Helmet Cutter,
  com explicação no README.
- **D3 — Downloads parciais em caso de erro.** Hoje, se o download falha (ex.: a internet cai),
  os `.part` ficam na pasta e "Tentar de novo" **continua de onde parou**. Sua regra pede para
  apagá-los. Opções: (a) apagar sempre — "Tentar de novo" recomeça do zero; (b) manter os `.part`
  para continuar e apagar só a saída do reencode. **Sugestão: (a)**, que é a sua regra; a perda
  só aparece em downloads grandes que falharam.
- **D4 — Mesmo vídeo baixado de novo com outra qualidade/formato.** Hoje o nome é o mesmo
  (`título [id].mp4`), então o yt-dlp diz "já baixado" e reaproveita o arquivo antigo — **não
  sobrescreve**, mas também não baixa a nova qualidade. Mudar isso seria mudar comportamento.
  **Sugestão: manter** nesta limpeza e registrar como melhoria futura.
- **D5 — Versões das ferramentas.** Sugestão: continuar baixando sempre a mais nova (os sites
  mudam muito e o yt-dlp antigo para de funcionar), agora **com** conferência SHA-256.

---

## 6. Plano de execução (um commit por etapa)

| # | Etapa | Itens |
|---|---|---|
| 1 | Arquivos do repositório: `.gitignore`, `.debug` fora do git, decisões D1, README na raiz, `.reg` | L7, L8, D1, parte de A2 |
| 2 | Instalação e pacote: `instalar.bat` sem `.debug`; `empacotar.ps1` | A2, L9, L11 |
| 3 | Download das ferramentas: SHA-256 oficial + só domínios do GitHub | A1 |
| 4 | Processos: caminhos completos, PowerShell sem texto montado, PATH só absoluto, encerrar tudo ao fechar o painel | M1, M2, M3, B4 |
| 5 | Arquivos baixados: reencode sem sobrescrever, limpeza em erro, arquivos sempre dentro da pasta, nomes limpos | M5, M6, B2, D3 |
| 6 | Interface: miniatura só http(s), sem `innerHTML`, validação de URL | M4, B3, B1 |
| 7 | Ponte única painel → Premiere; `index.jsx` com BOM | B5, L10 |
| 8 | Limpeza: `config.js`, dividir `main.js`, duplicações, código morto, `Log.debug` | L1-L4, L6 |
| 9 | Mensagens de erro claras | L5 |
| 10 | Fase final: README, CHANGELOG, TESTES.md (roteiro manual), versão 1.0.1, situação final neste arquivo | L12 |

Para as partes que não dependem do Premiere (limpar nome de arquivo, validar URL, ler os
arquivos de SHA-256, montar argumentos do yt-dlp) vou criar testes automáticos com Node
(`node tests\run-tests.js`), como no Helmet Cutter. O que depende do Premiere de verdade vai
para o `TESTES.md`, e **você precisará testar no Premiere**, porque eu não tenho como abri-lo.

**Fase 1 encerrada. Aguardando sua aprovação — da lista de funções (seção 2), das decisões
D1 a D5 e do plano — antes de alterar qualquer coisa.**

---

## 7. Situação final (versão 1.1.0)

Aprovado em "Aprovo, pode seguir" (lista de funções, decisões D1 a D5 como sugeridas e o plano).
Feito na branch `limpeza-seguranca`, um commit por etapa.

| Item | Situação | Etapa / commit |
|---|---|---|
| A1 | Corrigido: só HTTPS do GitHub (inclusive nos redirecionamentos) e SHA-256 conferido antes de instalar | 3 · `5b9a0bb` |
| A2 | Corrigido: `.debug` fora do git, removido pelo `instalar.bat`, recusado pelo `empacotar.ps1` | 1-2 · `02fd70b`, `a5c3831` |
| M1 | Corrigido: PowerShell, taskkill, tar e explorer pelo caminho completo | 4 · `9193c18` |
| M2 | Corrigido: PowerShell com script fixo, valores por variável de ambiente | 4 · `9193c18` |
| M3 | Corrigido: todos os processos registrados e encerrados ao fechar o painel | 4 · `9193c18` |
| M4 | Corrigido: miniatura só http(s) | 6 · `0c37b76` |
| M5 | Corrigido: FFmpeg com `-n` e nome único "(2)", "(3)"… | 5 · `14791c0` |
| M6 | Corrigido: limpeza também em erro (decisão D3) | 5 · `14791c0` |
| M7 | **Pendente** (decisão D2): falta assinar a extensão; explicado no README | — |
| B1 | Corrigido: validação com `new URL()` | 6 · `0c37b76` |
| B2 | Corrigido: `--windows-filenames`, arquivos fora da pasta ignorados, nomes do reencode limpos | 5 · `14791c0` |
| B3 | Corrigido: fila montada sem `innerHTML` (DOM idêntico ao original) | 6 · `0c37b76` |
| B4 | Corrigido: PATH só com caminhos completos | 4 · `9193c18` |
| B5 | Corrigido: `bridge.js` com lista de funções e `{ok, data, error}` | 7 · `b0dc725` |
| L1 | Corrigido: `main.js` dividido em módulos. Desvio do plano: em vez de um único nome global, cada arquivo tem um nome com prefixo `HDL` (`HDLQueue`, `HDLUi`…), o mesmo padrão que `tools.js` e `downloader.js` já usavam | 8 · `5701b01` |
| L2 | Corrigido: `config.js` | 8 · `5701b01` |
| L3 | Corrigido: `installZipTool`, `detectSimple`, `canceledError`, `commandForLog` | 8 · `5701b01` |
| L4 | Corrigido: código sem efeito e sem uso removido | 8 · `5701b01` |
| L5 | Corrigido: mensagens claras para rede, site não suportado, host não carregado | 9 · `8e29ad8` |
| L6 | Corrigido: `HDLLog.debug`, desligado por padrão | 8 · `5701b01` |
| L7 | Corrigido: `.gitignore` | 1 · `02fd70b` |
| L8 | Corrigido: `Add Keys.reg` com CSXS 9 a 16, só `PlayerDebugMode` | 1 · `02fd70b` |
| L9 | Corrigido: `empacotar.ps1` | 2 · `a5c3831` |
| L10 | Corrigido: `index.jsx` em UTF-8 com BOM | 7 · `b0dc725` |
| L11 | Mantido de propósito; `empacotar.ps1` e os testes conferem que as três versões batem | 2, 10 |
| L12 | Corrigido: README na raiz, `CHANGELOG.md`, `TESTES.md` | 1, 10 |
| L13 | Mantido de propósito (trocar o ID apagaria as configurações salvas) | — |
| D1 | `_backup/` e `como instalar.txt` removidos (no histórico, commit `3328d34`); `?demo` mantido | 1 · `02fd70b` |
| D4 | Mantido: o mesmo vídeo baixado de novo reaproveita o arquivo existente | — |
| D5 | Mantido: sempre a versão mais nova, agora com SHA-256 | 3 · `5b9a0bb` |

Coisas achadas durante a execução (fora da lista original):

- **Acentos e emoji nos caminhos:** no Windows o yt-dlp mandava a saída na codificação antiga, e o painel não reconhecia arquivos numa pasta como "Projeto Ação 🎬" (afetava a limpeza das sobras). Corrigido com `--encoding utf-8` (etapa 5).
- **Configurações salvas:** um valor estranho no armazenamento do painel virava parte de um seletor CSS; agora é comparado com as opções existentes (etapa 8).
- **Log da ponte:** a mensagem "o script do host não carregou" não chegava ao Log do painel; voltou (etapa 8).
- **Dica de cookies indevida:** o teste de "restrição de idade" casava com qualquer erro contendo "webpage" ou "message" (etapa 9).

Depois do primeiro teste manual no Premiere:

- **Fechar o painel no meio** encerrava o yt-dlp/FFmpeg, mas deixava o `.part` na pasta. Agora a
  limpeza também roda ao fechar (de forma imediata, insistindo enquanto o Windows solta o arquivo).
- **Cancelar durante o Reencode** deixava o original `.mkv` (igual à 1.0.0). Por decisão sua, agora
  ele é apagado ao cancelar ou dar erro, como já era quando o reencode dá certo — a não ser que o
  arquivo já existisse antes do download.
- Dois passos do `TESTES.md` estavam errados (Remux depois de Reencode; "projeto não salvo") e
  foram reescritos.

Depois do segundo teste manual:

- **Fechar o painel no meio** ainda deixava os `.part`: os processos eram encerrados, mas o Premiere
  fecha o painel sem dar tempo para a limpeza. Agora o download em andamento fica anotado no
  armazenamento do painel e, se a limpeza não rodar ao fechar, roda na próxima abertura (só na
  pasta "Helmet DL" anotada).
- **Reencode por GPU mais lento:** medido fora do Premiere com o mesmo arquivo, 1.0.0 e 1.0.1 levam
  o mesmo tempo (8,3 s, NVIDIA NVENC, mesmos argumentos do FFmpeg). Aguardando o Log do teste.
- **`.mkv` que sobrou de novo:** provavelmente era o que ficou do 1º teste (arquivo que já existia
  antes do download é mantido de propósito). O roteiro agora pede para apagá-lo antes de testar.

Depois do terceiro teste manual (sem internet, playlist, cookies):

- **Atualizar sem internet "não mostrava nada":** a mensagem ia para a linha de status no topo do
  painel, longe do card Ferramentas (igual à 1.0.0). Agora o motivo aparece também na linha da
  ferramenta. A mensagem do PowerShell em português chega com acentos estragados; o reconhecimento
  de "sem conexão" passou a aceitar isso.
- **Playlist cancelada deixava um vídeo pronto na pasta** (igual à 1.0.0): o yt-dlp já tinha
  terminado esse vídeo, que não ia para o Project. Agora, ao cancelar ou dar erro, os vídeos
  terminados por este download também são apagados — nunca os que já estavam na pasta antes
  (conferido pela mensagem do yt-dlp e pela data do arquivo).
- Cookies do Firefox: ok; no Log aparece só o nome do navegador.

Testes: `node tests\run-tests.js` (33 testes, todos passando). Também foram feitos testes
reais fora do Premiere: download e reencode de vídeo do YouTube numa pasta com acentos e emoji,
cancelamento no meio, instalação das três ferramentas com SHA-256 (e recusa de arquivo
adulterado), PowerShell com aspas no caminho, encerramento de processos. **Não foi testado
dentro do Premiere** — siga o `TESTES.md`.
