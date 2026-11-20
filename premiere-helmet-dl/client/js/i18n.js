// client/js/i18n.js — Helmet DL
// Idioma do painel: inglês (padrão) ou português, escolhido em Opções › Idioma e
// lembrado entre sessões.
//
// Como funciona: o texto continua escrito em português no código e no index.html;
// o português é a "chave". Em inglês, HDLI18n.t() troca a frase pela tradução do
// dicionário EN abaixo. Frase nova na tela = entrada nova no EN (os testes
// automáticos falham se faltar alguma).
//
//   tr("Baixando {0}", "50%")   -> "Downloading 50%"  ({0}, {1}… são trocados pelos argumentos)
//   N("frase")                  -> só marca uma frase guardada numa constante, para os testes
//                                  acharem; a tradução acontece quando ela é mostrada, com tr()
//   apply(document.body)        -> traduz o texto fixo do index.html (textos, title, placeholder)

var HDLI18n = (function () {
    var LANGS = ["en", "pt"];
    var KEY = (typeof HDL_CONFIG !== "undefined" && HDL_CONFIG.LANG_KEY) || "helmetdl.lang";

    var EN = {
        // --- index.html -------------------------------------------------------------
        "Verificando projeto…": "Checking project…",
        "Clique para atualizar": "Click to refresh",
        "Abrir a pasta Helmet DL do projeto": "Open the project's Helmet DL folder",
        "Link do vídeo": "Video link",
        "Cole o link do YouTube, TikTok, X, Instagram…": "Paste a YouTube, TikTok, X, Instagram… link",
        "Colar da área de transferência": "Paste from clipboard",
        "Formato": "Format",
        "Baixar": "Download",
        "Vídeo + áudio": "Video + audio",
        "Só vídeo": "Video only",
        "Só áudio": "Audio only",
        "Qualidade": "Quality",
        "Original (máxima)": "Original (highest)",
        "Processamento": "Processing",
        "Reencode": "Re-encode",
        "Ambos": "Both",
        "Container do remux": "Remux container",
        "Codec do reencode": "Re-encode codec",
        "Reencodar usando": "Re-encode with",
        "Priorizar formatos do Premiere": "Prefer Premiere formats",
        "Prefere H.264 + AAC quando o site oferece": "Picks H.264 + AAC when the site offers them",
        "Formato do áudio": "Audio format",
        "Original (sem converter)": "Original (no conversion)",
        "Opções": "Options",
        "Importar numa bin \"Helmet DL\"": "Import into a \"Helmet DL\" bin",
        "Desligado: vai direto para a raiz do Project": "Off: goes straight to the root of the Project panel",
        "Baixar a playlist inteira": "Download the whole playlist",
        "Quando o link fizer parte de uma playlist": "When the link is part of a playlist",
        "Baixar só um trecho": "Download only a section",
        "Economiza tempo em vídeos e lives longas": "Saves time on long videos and livestreams",
        "Início": "Start",
        "Fim": "End",
        "Cookies do navegador": "Browser cookies",
        "Necessário para Instagram, vídeos privados ou com restrição de idade": "Needed for Instagram, private or age-restricted videos",
        "Nenhum": "None",
        "Idioma": "Language",
        "Limpar concluídos da lista": "Clear finished items from the list",
        "Ferramentas": "Tools",
        "verificando…": "checking…",
        "Atualizar o yt-dlp sozinho": "Update yt-dlp automatically",
        "Confere uma vez por dia; os sites mudam com frequência": "Checks once a day; sites change often",
        "O Deno é usado pelo yt-dlp para ler o YouTube. As ferramentas ficam em": "yt-dlp uses Deno to read YouTube. The tools are stored in",
        "Ir para o item na lista": "Go to the item in the list",

        // --- painel e cabeçalho -------------------------------------------------------
        "Prévia fora do Premiere": "Preview outside Premiere",
        "Salvando em {0} › {1}": "Saving to {0} › {1}",
        "(clique para atualizar)": "(click to refresh)",
        "Salve o projeto para poder baixar": "Save the project to download",
        "A pasta Helmet DL é criada ao lado do arquivo .prproj": "The Helmet DL folder is created next to the .prproj file",
        "Nenhum projeto aberto": "No project open",
        "Projeto: {0}": "Project: {0}",
        "Não foi possível abrir a pasta: {0}": "Couldn't open the folder: {0}",
        "Salve o projeto primeiro — a pasta {0} fica ao lado do .prproj.": "Save the project first — the {0} folder sits next to the .prproj.",
        "A área de transferência está vazia.": "The clipboard is empty.",
        "Não consegui ler a área de transferência. Use Ctrl+V no campo.": "Couldn't read the clipboard. Use Ctrl+V in the field.",
        "Não deu para ler a área de transferência — {0}": "Couldn't read the clipboard — {0}",
        "Aviso: host {0} ≠ painel {1} (reinstale a extensão inteira).": "Warning: host {0} ≠ panel {1} (reinstall the whole extension).",
        "não encontrado": "not found",
        "Na primeira vez, as ferramentas (yt-dlp, FFmpeg e Deno) são baixadas automaticamente quando você clicar em Download.":
            "The first time, the tools (yt-dlp, FFmpeg and Deno) are downloaded automatically when you click Download.",

        // --- formato (dicas) -------------------------------------------------------------
        "Baixa do jeito que o site entrega, sem converter. É o mais rápido, mas pode vir em WebM/VP9/AV1.":
            "Downloads exactly what the site serves, with no conversion. Fastest, but it may come as WebM/VP9/AV1.",
        "Só troca o container, sem perder qualidade. Rápido.": "Only changes the container, with no quality loss. Fast.",
        "Converte para um codec do Premiere com frame rate constante. Mais lento, mas abre liso.":
            "Converts to a Premiere-friendly codec with a constant frame rate. Slower, but plays smoothly.",
        "Gera os dois: o arquivo com remux e uma cópia reencodada. Os dois vão para o Project.":
            "Makes both: the remuxed file and a re-encoded copy. Both go to the Project panel.",
        "O ProRes não tem encoder de GPU no FFmpeg — esse vai usar a CPU.": "ProRes has no GPU encoder in FFmpeg — this one will use the CPU.",
        "A GPU é detectada quando o FFmpeg estiver instalado.": "The GPU is detected once FFmpeg is installed.",
        "Procurando a GPU…": "Looking for the GPU…",
        "Nenhuma GPU compatível (NVIDIA, AMD ou Intel) — o reencode vai usar a CPU.": "No compatible GPU (NVIDIA, AMD or Intel) — re-encoding will use the CPU.",
        "{0} não faz H.265 nesta placa — esse vai usar a CPU.": "{0} can't do H.265 on this card — this one will use the CPU.",
        "Usando {0}: bem mais rápido, com arquivo um pouco maior que o da CPU.": "Using {0}: much faster, with a slightly larger file than the CPU's.",

        // --- prévia do link ----------------------------------------------------------------
        "{0} links — todos vão para a fila.": "{0} links — all of them go to the queue.",
        "Carregando informações…": "Loading info…",
        "Não deu para ler o link: {0}": "Couldn't read the link: {0}",
        "AO VIVO": "LIVE",
        "Playlist · {0} vídeos": "Playlist · {0} videos",
        "até {0}p": "up to {0}p",
        "Esse vídeo vai só até {0}p — vai baixar nessa qualidade.": "This video only goes up to {0}p — it will download at that quality.",
        "É uma live: o download segue até ela acabar (ou até você cancelar).": "It's a livestream: the download runs until it ends (or until you cancel).",
        "(sem título)": "(untitled)",

        // --- fila de downloads -------------------------------------------------------------
        "Trecho inválido. Use segundos ou o formato 00:01:30.": "Invalid section. Use seconds or the 00:01:30 format.",
        "Informe o início e/ou o fim do trecho.": "Enter the start and/or end of the section.",
        "O fim do trecho precisa ser depois do início.": "The end of the section must come after the start.",
        "Isso não parece um link. Cole o endereço completo do vídeo.": "That doesn't look like a link. Paste the full video address.",
        "Cole um link primeiro.": "Paste a link first.",
        "Abra o painel dentro do Premiere (Janela › Extensões › Helmet DL) para baixar.": "Open the panel inside Premiere (Window › Extensions › Helmet DL) to download.",
        "Na fila": "Queued",
        "Ignorado (não é link): {0}": "Ignored (not a link): {0}",
        "Preparando…": "Preparing…",
        "Salve o projeto do Premiere antes de baixar — a pasta \"{0}\" é criada ao lado do arquivo .prproj.":
            "Save the Premiere project before downloading — the \"{0}\" folder is created next to the .prproj file.",
        "Baixando {0} → {1}": "Downloading {0} → {1}",
        "Aviso: {0}": "Warning: {0}",
        "Importando no Project…": "Importing into the Project panel…",
        "{0} arquivos importados em {1}": "{0} files imported into {1}",
        "Importado em {0}": "Imported into {0}",
        "Baixado, mas o Premiere recusou a importação. O arquivo está na pasta {0}.": "Downloaded, but Premiere refused the import. The file is in the {0} folder.",
        "Já estava no {0}": "Already in {0}",
        "Concluído: {0}": "Done: {0}",
        "Cancelado": "Canceled",
        "Cancelado: {0}": "Canceled: {0}",
        "Cancelando…": "Canceling…",
        "ERRO: {0}": "ERROR: {0}",
        "Reencodando para {0}": "Re-encoding to {0}",
        "GPU indisponível para {0}; usando a CPU.": "GPU unavailable for {0}; using the CPU.",
        "O encode na GPU falhou ({0}). Refazendo na CPU…": "The GPU encode failed ({0}). Redoing it on the CPU…",
        "Não apaguei o original: {0}": "Didn't delete the original: {0}",
        "Removendo o áudio": "Removing the audio",
        "Apaguei as sobras do download interrompido quando o painel foi fechado ({0}).": "Deleted the leftovers of the download interrupted when the panel was closed ({0}).",
        "Cancelar": "Cancel",
        "Mostrar na pasta": "Show in folder",
        "Tirar da lista": "Remove from list",
        "Tentar de novo": "Try again",
        "+{0} na fila": "+{0} queued",

        // --- yt-dlp / FFmpeg (andamento e erros) ------------------------------------------
        "Baixando áudio": "Downloading audio",
        "Baixando vídeo": "Downloading video",
        "{0} de {1}": "{0} of {1}",
        "Já estava baixado": "Already downloaded",
        "Juntando áudio e vídeo…": "Merging audio and video…",
        "Fazendo remux…": "Remuxing…",
        "Convertendo áudio…": "Converting audio…",
        "Corrigindo o arquivo…": "Fixing the file…",
        "Lendo informações…": "Reading info…",
        "Ignorado (fora da pasta {0}): {1}": "Ignored (outside the {0} folder): {1}",
        "Arquivos demais com o mesmo nome: {0}": "Too many files with the same name: {0}",
        "yt-dlp não encontrado.": "yt-dlp not found.",
        "yt-dlp saiu com código {0}": "yt-dlp exited with code {0}",
        "Resposta inesperada do yt-dlp.": "Unexpected response from yt-dlp.",
        "O yt-dlp terminou, mas não informou o arquivo baixado.": "yt-dlp finished, but didn't report the downloaded file.",
        "FFmpeg não encontrado.": "FFmpeg not found.",
        "O FFmpeg falhou (código {0}): {1}": "FFmpeg failed (code {0}): {1}",
        "{0} — tente escolher um navegador em \"Cookies do navegador\" (onde você está logado).":
            "{0} — try choosing a browser under \"Browser cookies\" (one where you're signed in).",
        "Não deu para ler os cookies do navegador. Feche o navegador e tente de novo, ou use o Firefox. ({0})":
            "Couldn't read the browser cookies. Close the browser and try again, or use Firefox. ({0})",
        "Este site não é suportado (o yt-dlp não sabe baixar desse endereço).": "This site isn't supported (yt-dlp can't download from this address).",
        "FFmpeg não encontrado — instale em Ferramentas.": "FFmpeg not found — install it under Tools.",
        "O formato pedido não existe para esse vídeo. Tente outra qualidade.": "The requested format isn't available for this video. Try another quality.",
        "vídeo em {0}": "video in {0}",
        "áudio em {0}": "audio in {0}",
        " e ": " and ",
        "Veio com {0}, que o Premiere pode não abrir. Se der problema, baixe de novo com Reencode.":
            "It came with {0}, which Premiere may not open. If it causes trouble, download it again with Re-encode.",

        // --- card Ferramentas ----------------------------------------------------------------
        "instalado pela extensão": "installed by the extension",
        "do sistema": "from the system",
        "via Python": "via Python",
        "só dentro do Premiere": "only inside Premiere",
        "Não instalado": "Not installed",
        "Recomendado para o YouTube": "Recommended for YouTube",
        "Atualizar": "Update",
        "Instalar": "Install",
        "Reinstalar": "Reinstall",
        "instalando…": "installing…",
        "falta {0}": "missing {0}",
        "tudo pronto": "all set",
        "Instalando {0}…": "Installing {0}…",
        "Instalando {0}": "Installing {0}",
        "Baixando…": "Downloading…",
        "Baixando (modo alternativo, aguarde)…": "Downloading (fallback mode, please wait)…",
        "Baixando {0}": "Downloading {0}",
        "{0} foi baixado, mas não respondeu. Veja o log.": "{0} was downloaded but didn't respond. See the log.",
        "{0} pronto: {1}": "{0} ready: {1}",
        "Falha ao instalar {0}: {1}": "Failed to install {0}: {1}",
        "Sem conexão com a internet — ": "No internet connection — ",
        "Falhou (veja o Log) — ": "Failed (see the Log) — ",
        "a versão {0} continua": "version {0} is still in place",
        "não instalado": "not installed",
        "Não deu para instalar o {0}.": "Couldn't install {0}.",
        "FFmpeg não encontrado. No macOS, instale com: brew install ffmpeg": "FFmpeg not found. On macOS, install it with: brew install ffmpeg",
        "Deno não instalado ({0}). O YouTube pode ficar limitado.": "Deno not installed ({0}). YouTube may be limited.",
        "yt-dlp não está disponível. Veja Ferramentas.": "yt-dlp isn't available. See Tools.",
        "Nova versão do yt-dlp: {0} (atual {1})": "New yt-dlp version: {0} (current {1})",
        "Espere o download atual terminar para atualizar o yt-dlp.": "Wait for the current download to finish before updating yt-dlp.",
        "Ferramenta instalada.": "Tool installed.",

        // --- download das ferramentas ------------------------------------------------------
        "(tempo esgotado)": "(timed out)",
        "Download recusado: endereço fora do GitHub ({0}).": "Download refused: address outside GitHub ({0}).",
        "Tempo esgotado conectando em {0}": "Timed out connecting to {0}",
        "Redirecionamentos demais em {0}": "Too many redirects at {0}",
        "Sem conexão com {0}": "No connection to {0}",
        "HTTP {0} ao baixar {1}": "HTTP {0} while downloading {1}",
        "O download parou de responder.": "The download stopped responding.",
        "A conexão caiu no meio do download.": "The connection dropped during the download.",
        "Download incompleto.": "Incomplete download.",
        "Não foi possível baixar {0} ({1})": "Couldn't download {0} ({1})",
        "PowerShell falhou": "PowerShell failed",
        "Sem conexão com a internet (ou o site não respondeu). Confira a conexão e tente de novo.":
            "No internet connection (or the site didn't respond). Check your connection and try again.",
        "Não encontrei a impressão digital (SHA-256) de {0} na página oficial. Por segurança, a instalação foi cancelada. Tente de novo mais tarde.":
            "Couldn't find the fingerprint (SHA-256) of {0} on the official page. For safety, the installation was canceled. Try again later.",
        "O arquivo baixado ({0}) não confere com a impressão digital (SHA-256) publicada e foi apagado por segurança. Isso pode acontecer se uma versão nova saiu durante o download — tente de novo em alguns minutos.":
            "The downloaded file ({0}) doesn't match the published fingerprint (SHA-256) and was deleted for safety. This can happen if a new version came out during the download — try again in a few minutes.",
        "Falha ao extrair {0}: {1}": "Failed to extract {0}: {1}",
        "{0} não encontrado no pacote baixado": "{0} not found in the downloaded package",
        "No macOS, instale o FFmpeg pelo Homebrew: brew install ffmpeg": "On macOS, install FFmpeg with Homebrew: brew install ffmpeg",
        "pip falhou": "pip failed",
        "yt-dlp -U falhou": "yt-dlp -U failed",

        // --- ponte com o Premiere (bridge.js e mensagens do host/index.jsx) ----------------
        "Função do host não permitida: {0}": "Host function not allowed: {0}",
        "Fora do Premiere.": "Outside Premiere.",
        "Script do host carregado manualmente ({0}).": "Host script loaded manually ({0}).",
        "O script do host (host/index.jsx) não carregou: {0}": "The host script (host/index.jsx) didn't load: {0}",
        "Resposta inválida do ExtendScript ({0}): {1}": "Invalid ExtendScript response ({0}): {1}",
        "A parte da extensão que roda dentro do Premiere não carregou. Feche o Premiere e reinstale a extensão (instalar.bat).":
            "The part of the extension that runs inside Premiere didn't load. Close Premiere and reinstall the extension (instalar.bat).",
        "O Premiere devolveu uma resposta inesperada. Veja os detalhes no Log.": "Premiere returned an unexpected response. See the details in the Log.",
        "Erro no ExtendScript.": "ExtendScript error.",
        "Nenhum projeto aberto.": "No project open.",
        "Erro ao ler o projeto: {0}": "Error reading the project: {0}",
        "Nenhum arquivo encontrado para importar.": "No files found to import.",
        "Erro ao importar no Premiere: {0}": "Error importing into Premiere: {0}"
    };

    var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

    var lang = "en";
    try {
        var saved = localStorage.getItem(KEY);
        if (LANGS.indexOf(saved) >= 0) lang = saved;
    } catch (e) { /* sem localStorage (testes): fica o padrão */ }

    var listeners = [];

    function format(text, args) {
        return text.replace(/\{(\d)\}/g, function (m, i) {
            var v = args[+i];
            return v === undefined || v === null ? m : String(v);
        });
    }

    // tr("frase em português", arg0, arg1…)
    function t(key) {
        var text = lang === "en" && hasOwn(EN, key) ? EN[key] : key;
        return format(text, Array.prototype.slice.call(arguments, 1));
    }

    function N(key) { return key; }

    // Mensagem que já chega pronta em português (do host/index.jsx): traduz a frase
    // inteira ou, para "Erro ao …: <detalhe>", só a parte fixa.
    function tMessage(msg) {
        msg = String(msg || "");
        if (lang !== "en") return msg;
        if (hasOwn(EN, msg)) return EN[msg];
        for (var k in EN) {
            if (!hasOwn(EN, k) || k.slice(-5) !== ": {0}") continue;
            var prefix = k.slice(0, -3);
            if (msg.indexOf(prefix) === 0) return t(k, msg.slice(prefix.length));
        }
        return msg;
    }

    // Traduz o texto fixo do index.html. Guarda o original em português em cada nó
    // para poder voltar. Só mexe no que está no dicionário (o resto é do código).
    var ATTRS = ["title", "placeholder", "aria-label"];

    function apply(root) {
        if (typeof document === "undefined") return;
        root = root || document.body;
        document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
            if (node._hdlPt === undefined) {
                if (!hasOwn(EN, node.nodeValue.trim())) continue;
                node._hdlPt = node.nodeValue;
            }
            var key = node._hdlPt.trim();
            var text = t(key);
            node.nodeValue = node._hdlPt.replace(key, function () { return text; });
        }
        ATTRS.forEach(function (attr) {
            var store = "data-pt-" + attr;
            Array.prototype.forEach.call(root.querySelectorAll("[" + attr + "]"), function (el) {
                var orig = el.getAttribute(store);
                if (orig === null) {
                    orig = el.getAttribute(attr);
                    if (!hasOwn(EN, orig)) return;
                    el.setAttribute(store, orig);
                }
                el.setAttribute(attr, t(orig));
            });
        });
    }

    function setLang(next) {
        if (LANGS.indexOf(next) < 0 || next === lang) return;
        lang = next;
        try { localStorage.setItem(KEY, lang); } catch (e) { /* fica só nesta sessão */ }
        apply();
        listeners.forEach(function (fn) { fn(lang); });
    }

    return {
        t: t,
        N: N,
        tMessage: tMessage,
        apply: apply,
        setLang: setLang,
        lang: function () { return lang; },
        onChange: function (fn) { listeners.push(fn); },
        EN: EN
    };
})();
