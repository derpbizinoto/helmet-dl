// client/js/main.js — Helmet DL
// Fluxo de cada download (um por vez, em fila):
//   garante as ferramentas -> lê o caminho do projeto -> yt-dlp baixa para
//   <pasta do projeto>/Helmet DL -> FFmpeg (reencode / tirar áudio, se pedido)
//   -> host/index.jsx importa na aba Project (nunca na timeline).

var CLIENT_VERSION = "1.0.0";

var inCEP = typeof window.__adobe_cep__ !== "undefined";
var csInterface = inCEP ? new CSInterface() : null;
var hasNode = typeof require === "function" && !!window.HDLTools && !!window.HDLDownloader;

var nodePath = hasNode ? require("path") : null;
var nodeFs = hasNode ? require("fs") : null;

var BIN_NAME = "Helmet DL";
var FOLDER_NAME = "Helmet DL";
var SETTINGS_KEY = "helmetdl.settings.v1";
var UPDATE_KEY = "helmetdl.lastUpdateCheck";

function $(id) { return document.getElementById(id); }

var els = {
    projectInfo: $("projectInfo"),
    btnOpenFolder: $("btnOpenFolder"),
    urlInput: $("urlInput"),
    btnPaste: $("btnPaste"),
    btnDownload: $("btnDownload"),
    preview: $("preview"),
    previewThumb: $("previewThumb"),
    previewDuration: $("previewDuration"),
    previewTitle: $("previewTitle"),
    previewMeta: $("previewMeta"),
    previewNote: $("previewNote"),
    status: $("status"),
    contentRadios: document.getElementsByName("content"),
    modeRadios: document.getElementsByName("mode"),
    videoOptions: $("videoOptions"),
    audioOptions: $("audioOptions"),
    qualitySelect: $("qualitySelect"),
    modeHint: $("modeHint"),
    containerRow: $("containerRow"),
    containerSelect: $("containerSelect"),
    codecRow: $("codecRow"),
    codecSelect: $("codecSelect"),
    encoderRow: $("encoderRow"),
    encoderRadios: document.getElementsByName("encoder"),
    encoderHint: $("encoderHint"),
    compatCheckbox: $("compatCheckbox"),
    audioFormatSelect: $("audioFormatSelect"),
    binCheckbox: $("binCheckbox"),
    playlistCheckbox: $("playlistCheckbox"),
    trimCheckbox: $("trimCheckbox"),
    trimRow: $("trimRow"),
    trimStart: $("trimStart"),
    trimEnd: $("trimEnd"),
    cookiesSelect: $("cookiesSelect"),
    queue: $("queue"),
    btnClearDone: $("btnClearDone"),
    toolsDetails: $("toolsDetails"),
    toolsSummary: $("toolsSummary"),
    ytdlpInfo: $("ytdlpInfo"),
    ffmpegInfo: $("ffmpegInfo"),
    denoInfo: $("denoInfo"),
    btnYtdlp: $("btnYtdlp"),
    btnFfmpeg: $("btnFfmpeg"),
    btnDeno: $("btnDeno"),
    autoUpdateCheckbox: $("autoUpdateCheckbox"),
    binDirNote: $("binDirNote"),
    log: $("log"),
    logDetails: $("logDetails"),
    versionNote: $("versionNote")
};

// --- helpers de interface -----------------------------------------------------

function setStatus(msg, kind) {
    els.status.textContent = msg || "";
    els.status.className = "status" + (kind ? " " + kind : "");
}

function appendLog(msg) {
    var t = new Date();
    var stamp = ("0" + t.getHours()).slice(-2) + ":" + ("0" + t.getMinutes()).slice(-2) + ":" + ("0" + t.getSeconds()).slice(-2);
    els.log.textContent += "[" + stamp + "] " + msg + "\n";
    if (els.log.textContent.length > 200000) els.log.textContent = els.log.textContent.slice(-150000);
    els.log.scrollTop = els.log.scrollHeight;
}

function radioValue(radios, fallback) {
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
    return fallback;
}

function setRadio(radios, value) {
    for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === value;
}

function fmtDuration(sec) {
    sec = Math.round(sec || 0);
    if (!sec) return "";
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = h ? ("0" + m).slice(-2) : String(m);
    return (h ? h + ":" : "") + mm + ":" + ("0" + s).slice(-2);
}

function fmtBytes(n) {
    return hasNode ? HDLDownloader.fmtBytes(n) : "";
}

// --- configurações (lembradas entre sessões) ---------------------------------------

var MODE_HINTS = {
    original: "Baixa do jeito que o site entrega, sem converter. É o mais rápido, mas pode vir em WebM/VP9/AV1.",
    remux: "Só troca o container, sem perder qualidade. Rápido.",
    reencode: "Converte para um codec do Premiere com frame rate constante. Mais lento, mas abre liso.",
    both: "Gera os dois: o arquivo com remux e uma cópia reencodada. Os dois vão para o Project."
};

function readOptions() {
    return {
        content: radioValue(els.contentRadios, "both"),
        quality: els.qualitySelect.value,
        mode: radioValue(els.modeRadios, "remux"),
        container: els.containerSelect.value,
        codec: els.codecSelect.value,
        encoder: radioValue(els.encoderRadios, "cpu"),
        compat: els.compatCheckbox.checked,
        audioFormat: els.audioFormatSelect.value,
        bin: els.binCheckbox.checked,
        playlist: els.playlistCheckbox.checked,
        trim: els.trimCheckbox.checked,
        trimStartText: els.trimStart.value,
        trimEndText: els.trimEnd.value,
        cookies: els.cookiesSelect.value,
        autoUpdate: els.autoUpdateCheckbox.checked
    };
}

function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(readOptions())); } catch (e) { /* ignora */ }
}

function loadSettings() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch (e) { s = null; }
    if (!s) return;
    if (s.content) setRadio(els.contentRadios, s.content);
    if (s.mode) setRadio(els.modeRadios, s.mode);
    if (s.encoder) setRadio(els.encoderRadios, s.encoder);
    function setSel(el, v) { if (v !== undefined && el.querySelector('option[value="' + v + '"]')) el.value = v; }
    setSel(els.qualitySelect, s.quality);
    setSel(els.containerSelect, s.container);
    setSel(els.codecSelect, s.codec);
    setSel(els.audioFormatSelect, s.audioFormat);
    setSel(els.cookiesSelect, s.cookies);
    if (typeof s.compat === "boolean") els.compatCheckbox.checked = s.compat;
    if (typeof s.bin === "boolean") els.binCheckbox.checked = s.bin;
    if (typeof s.playlist === "boolean") els.playlistCheckbox.checked = s.playlist;
    if (typeof s.trim === "boolean") els.trimCheckbox.checked = s.trim;
    if (typeof s.autoUpdate === "boolean") els.autoUpdateCheckbox.checked = s.autoUpdate;
    if (s.trimStartText) els.trimStart.value = s.trimStartText;
    if (s.trimEndText) els.trimEnd.value = s.trimEndText;
}

function updateVisibility() {
    var o = readOptions();
    var audio = o.content === "audio";
    els.videoOptions.style.display = audio ? "none" : "";
    els.audioOptions.style.display = audio ? "" : "none";
    els.containerRow.style.display = (o.mode === "remux" || o.mode === "both") ? "" : "none";
    var reenc = o.mode === "reencode" || o.mode === "both";
    els.codecRow.style.display = reenc ? "" : "none";
    els.encoderRow.style.display = reenc ? "" : "none";
    els.modeHint.textContent = MODE_HINTS[o.mode] || "";
    els.trimRow.style.display = o.trim ? "" : "none";
    updateEncoderHint();
    updateQualityNote();
}

var encoderHintSeq = 0;

function showEncoderHint(text) {
    els.encoderHint.textContent = text;
    els.encoderHint.style.display = text ? "" : "none";
}

// Mostra qual GPU vai ser usada (ou por que não vai).
function updateEncoderHint() {
    var o = readOptions();
    var seq = ++encoderHintSeq;
    if (o.content === "audio" || (o.mode !== "reencode" && o.mode !== "both") || o.encoder !== "gpu") {
        showEncoderHint("");
        return;
    }
    if (o.codec === "prores") {
        showEncoderHint("O ProRes não tem encoder de GPU no FFmpeg — esse vai usar a CPU.");
        return;
    }
    if (!hasNode || !HDLTools.state.ffmpeg) {
        showEncoderHint("A GPU é detectada quando o FFmpeg estiver instalado.");
        return;
    }
    showEncoderHint("Procurando a GPU…");
    HDLDownloader.detectGpu().then(function (gpu) {
        if (seq !== encoderHintSeq) return;
        if (!gpu) showEncoderHint("Nenhuma GPU compatível (NVIDIA, AMD ou Intel) — o reencode vai usar a CPU.");
        else if (!HDLDownloader.gpuVideoArgs(gpu, o.codec)) showEncoderHint(gpu.label + " não faz H.265 nesta placa — esse vai usar a CPU.");
        else showEncoderHint("Usando " + gpu.label + ": bem mais rápido, com arquivo um pouco maior que o da CPU.");
    });
}

// --- comunicação com o Premiere ----------------------------------------------------

function evalHost(script) {
    return new Promise(function (resolve, reject) {
        if (!csInterface) { reject(new Error("Fora do Premiere.")); return; }
        csInterface.evalScript(script, function (result) { resolve(String(result)); });
    });
}

// Confere se o host/index.jsx está carregado. Se não estiver (erro ao carregar no
// início), carrega de novo com $.evalFile e registra o erro exato no log.
var hostReady = null;

function ensureHost() {
    if (!csInterface) return Promise.resolve(false);
    if (hostReady) return hostReady;
    var p = evalHost("typeof hdl_getProjectInfo").then(function (t) {
        if (t === "function") return true;
        var jsx = csInterface.getSystemPath(SystemPath.EXTENSION) + "/host/index.jsx";
        var script = "(function(){try{$.evalFile(" + JSON.stringify(jsx) + ");return typeof hdl_getProjectInfo;}" +
            "catch(e){return 'ERRO: '+e+(e.line?' (linha '+e.line+')':'');}})()";
        return evalHost(script).then(function (r) {
            if (r === "function") {
                appendLog("Script do host carregado manualmente (" + jsx + ").");
                return true;
            }
            appendLog("O script do host (host/index.jsx) não carregou: " + r);
            if (hostReady === p) hostReady = null; // tenta de novo na próxima chamada
            return false;
        });
    });
    hostReady = p;
    return p;
}

function callHost(script) {
    return ensureHost().then(function () { return evalHost(script); }).then(function (raw) {
        var parsed;
        try { parsed = JSON.parse(raw); }
        catch (e) { throw new Error("Resposta inválida do ExtendScript: " + raw); }
        if (!parsed.ok) throw new Error(parsed.error || "Erro no ExtendScript.");
        return parsed.data;
    });
}

var project = { path: "", name: "" };

function helmetDir() {
    return project.path ? nodePath.join(nodePath.dirname(project.path), FOLDER_NAME) : "";
}

function refreshProject() {
    if (!csInterface) {
        els.projectInfo.textContent = "Prévia fora do Premiere";
        return Promise.resolve(project);
    }
    return callHost("hdl_getProjectInfo()").then(function (d) {
        project.path = d.path || "";
        project.name = d.name || "";
        if (project.path) {
            els.projectInfo.textContent = "Salvando em " + project.name.replace(/\.prproj$/i, "") + " › " + FOLDER_NAME;
            els.projectInfo.title = helmetDir() + "\n(clique para atualizar)";
        } else {
            els.projectInfo.textContent = "Salve o projeto para poder baixar";
            els.projectInfo.title = "A pasta Helmet DL é criada ao lado do arquivo .prproj";
        }
        return project;
    }, function (e) {
        project.path = "";
        els.projectInfo.textContent = "Nenhum projeto aberto";
        appendLog("Projeto: " + e.message);
        return project;
    });
}

function openInExplorer(target, select) {
    if (!hasNode) return;
    try {
        HDLTools.reveal(target, select);
    } catch (e) {
        appendLog("Não foi possível abrir a pasta: " + e.message);
    }
}

// --- ferramentas (yt-dlp, FFmpeg, Deno) -----------------------------------------------

var toolBusy = null; // promise de uma instalação em andamento

var SOURCE_LABEL = { managed: "instalado pela extensão", path: "do sistema", python: "via Python" };

function renderTools(progressFor, progressText) {
    if (!hasNode) {
        els.toolsSummary.textContent = "só dentro do Premiere";
        return;
    }
    var st = HDLTools.state;
    var rows = {
        ytdlp: { el: els.ytdlpInfo, btn: els.btnYtdlp, t: st.ytdlp, required: true },
        ffmpeg: { el: els.ffmpegInfo, btn: els.btnFfmpeg, t: st.ffmpeg, required: true },
        deno: { el: els.denoInfo, btn: els.btnDeno, t: st.deno, required: false }
    };
    var missing = [];
    Object.keys(rows).forEach(function (k) {
        var r = rows[k];
        var row = r.el.closest(".tool-row");
        row.className = "tool-row " + (r.t ? "ok" : (r.required ? "missing" : "optional"));
        if (progressFor === k) {
            r.el.textContent = progressText;
        } else if (r.t) {
            r.el.textContent = r.t.version + " · " + (SOURCE_LABEL[r.t.source] || r.t.source);
        } else {
            r.el.textContent = r.required ? "Não instalado" : "Recomendado para o YouTube";
            missing.push(k === "ytdlp" ? "yt-dlp" : (k === "ffmpeg" ? "FFmpeg" : "Deno"));
        }
        if (k === "ytdlp") r.btn.textContent = r.t ? "Atualizar" : "Instalar";
        else if (k === "ffmpeg") {
            r.btn.textContent = r.t ? "Reinstalar" : "Instalar";
            r.btn.style.display = (r.t && r.t.source !== "managed") || !HDLTools.isWin ? "none" : "";
        } else {
            r.btn.textContent = r.t ? "Reinstalar" : "Instalar";
            r.btn.style.display = r.t && r.t.source !== "managed" ? "none" : "";
        }
        r.btn.disabled = !!toolBusy;
    });
    els.toolsSummary.textContent = progressFor ? "instalando…" : (missing.length ? "falta " + missing.join(", ") : "tudo pronto");
}

function pct(got, total) {
    return total ? Math.floor(got / total * 100) + "%" : fmtBytes(got);
}

// name: "ytdlp" | "ffmpeg" | "deno". onText: callback opcional para mostrar o andamento num item da fila.
function installTool(name, onText) {
    var labels = { ytdlp: "yt-dlp", ffmpeg: "FFmpeg", deno: "Deno" };
    var fn = name === "ytdlp" ? (HDLTools.state.ytdlp ? HDLTools.updateYtdlp : HDLTools.installYtdlp)
        : name === "ffmpeg" ? HDLTools.installFfmpeg : HDLTools.installDeno;
    var run = function () {
        appendLog("Instalando " + labels[name] + "…");
        renderTools(name, "Baixando…");
        return fn(function (got, total) {
            var txt = got < 0 ? "Baixando (modo alternativo, aguarde)…" : "Baixando " + pct(got, total);
            renderTools(name, txt);
            if (onText) onText("Instalando " + labels[name] + " · " + txt);
        }).then(function (res) {
            if (!res) throw new Error(labels[name] + " foi baixado, mas não respondeu. Veja o log.");
            appendLog(labels[name] + " pronto: " + res.version);
            return res;
        }, function (e) {
            appendLog("Falha ao instalar " + labels[name] + ": " + e.message);
            throw e;
        });
    };
    var p = (toolBusy || Promise.resolve()).then(run, run);
    toolBusy = p;
    var clear = function () { if (toolBusy === p) toolBusy = null; renderTools(); updateEncoderHint(); };
    p.then(clear, clear);
    return p;
}

// Instala o que faltar antes do primeiro download.
function ensureEssentialTools(onText) {
    var st = HDLTools.state;
    var chain = toolBusy ? toolBusy.then(function () {}, function () {}) : Promise.resolve();
    return chain.then(function () {
        if (!st.ytdlp) return installTool("ytdlp", onText);
    }).then(function () {
        if (!st.ffmpeg) {
            if (!HDLTools.isWin) throw new Error("FFmpeg não encontrado. No macOS, instale com: brew install ffmpeg");
            return installTool("ffmpeg", onText);
        }
    }).then(function () {
        if (!st.deno) {
            return installTool("deno", onText).catch(function (e) {
                appendLog("Deno não instalado (" + e.message + "). O YouTube pode ficar limitado.");
            });
        }
    }).then(function () {
        if (!st.ytdlp) throw new Error("yt-dlp não está disponível. Veja Ferramentas.");
    });
}

function maybeAutoUpdate() {
    var st = HDLTools.state;
    if (!els.autoUpdateCheckbox.checked || !st.ytdlp || st.ytdlp.source !== "managed") return;
    var last = 0;
    try { last = parseInt(localStorage.getItem(UPDATE_KEY) || "0", 10); } catch (e) { last = 0; }
    if (Date.now() - last < 20 * 3600 * 1000) return;
    HDLTools.latestYtdlpVersion().then(function (latest) {
        try { localStorage.setItem(UPDATE_KEY, String(Date.now())); } catch (e) { /* ignora */ }
        if (!latest || !st.ytdlp || latest === st.ytdlp.version) return;
        if (running) return; // não troca o .exe no meio de um download
        appendLog("Nova versão do yt-dlp: " + latest + " (atual " + st.ytdlp.version + ")");
        installTool("ytdlp").catch(function () { /* já registrado no log */ });
    });
}

// --- prévia do link ------------------------------------------------------------------

var previewTimer = null;
var previewHandle = null;
var previewUrl = "";
var previewInfo = null;
var infoCache = {};

function parseUrls(text) {
    var valid = [], invalid = [];
    String(text || "").split(/\s+/).forEach(function (t) {
        if (!t) return;
        if (/^https?:\/\//i.test(t)) valid.push(t);
        else if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(t)) valid.push("https://" + t);
        else invalid.push(t);
    });
    return { valid: valid, invalid: invalid };
}

function hidePreview() {
    els.preview.style.display = "none";
    els.previewNote.style.display = "none";
    previewInfo = null;
}

function cancelPreview() {
    clearTimeout(previewTimer);
    if (previewHandle) { previewHandle.cancel(); previewHandle = null; }
}

function schedulePreview() {
    cancelPreview();
    previewTimer = setTimeout(updatePreview, 650);
}

function previewKey(url) {
    var o = readOptions();
    return url + "|" + (o.playlist ? "pl" : "") + "|" + o.cookies;
}

function updatePreview() {
    var parsed = parseUrls(els.urlInput.value);
    if (parsed.valid.length !== 1) {
        previewUrl = "";
        hidePreview();
        if (parsed.valid.length > 1) {
            els.previewNote.textContent = parsed.valid.length + " links — todos vão para a fila.";
            els.previewNote.style.display = "";
        }
        return;
    }
    var url = parsed.valid[0];
    var key = previewKey(url);
    if (key === previewUrl && previewInfo) return;
    previewUrl = key;
    if (!hasNode || !HDLTools.state.ytdlp) { hidePreview(); return; }

    if (infoCache[key]) { renderPreview(infoCache[key]); return; }

    els.preview.style.display = "";
    els.preview.className = "preview loading";
    els.previewThumb.removeAttribute("src");
    els.previewDuration.textContent = "";
    els.previewTitle.textContent = "Carregando informações…";
    els.previewMeta.textContent = url;
    els.previewNote.style.display = "none";

    var handle = HDLDownloader.fetchInfo(url, { cookies: readOptions().cookies, playlist: readOptions().playlist });
    previewHandle = handle;
    handle.promise.then(function (info) {
        if (previewHandle !== handle) return;
        previewHandle = null;
        infoCache[key] = info;
        renderPreview(info);
    }, function (e) {
        if (previewHandle !== handle) return;
        previewHandle = null;
        els.preview.style.display = "none";
        els.previewNote.textContent = "Não deu para ler o link: " + HDLDownloader.friendlyError(e.message);
        els.previewNote.style.display = "";
    });
}

function renderPreview(info) {
    previewInfo = info;
    els.preview.style.display = "";
    els.preview.className = "preview";
    if (info.thumbnail) els.previewThumb.src = info.thumbnail; else els.previewThumb.removeAttribute("src");
    els.previewDuration.textContent = info.isLive ? "AO VIVO" : fmtDuration(info.duration);
    els.previewTitle.textContent = info.title;
    var meta = [];
    if (info.isPlaylist) meta.push("Playlist · " + info.count + " vídeos");
    if (info.uploader) meta.push(info.uploader);
    if (info.site) meta.push(info.site);
    if (info.maxRes) meta.push("até " + info.maxRes + "p");
    els.previewMeta.textContent = meta.join(" · ");
    updateQualityNote();
}

function updateQualityNote() {
    if (!previewInfo || previewInfo.isPlaylist) return;
    var o = readOptions();
    var q = parseInt(o.quality, 10);
    if (o.content !== "audio" && q && previewInfo.maxRes && q > previewInfo.maxRes) {
        els.previewNote.textContent = "Esse vídeo vai só até " + previewInfo.maxRes + "p — vai baixar nessa qualidade.";
        els.previewNote.style.display = "";
    } else if (previewInfo.isLive) {
        els.previewNote.textContent = "É uma live: o download segue até ela acabar (ou até você cancelar).";
        els.previewNote.style.display = "";
    } else {
        els.previewNote.style.display = "none";
    }
}

// --- fila de downloads -------------------------------------------------------------------

var jobs = [];
var nextJobId = 1;
var running = null;

var STATE_CLASS = { queued: "", running: "", done: "done", warn: "warn", error: "error", canceled: "canceled" };

function jobOptions() {
    var o = readOptions();
    if (o.trim) {
        var s = HDLDownloader.parseTime(o.trimStartText);
        var e = HDLDownloader.parseTime(o.trimEndText);
        if ((s !== null && isNaN(s)) || (e !== null && isNaN(e))) {
            throw new Error("Trecho inválido. Use segundos ou o formato 00:01:30.");
        }
        if (s === null && e === null) throw new Error("Informe o início e/ou o fim do trecho.");
        if (s !== null && e !== null && e <= s) throw new Error("O fim do trecho precisa ser depois do início.");
        o.trimStart = s || 0;
        o.trimEnd = e;
    }
    return o;
}

function enqueue() {
    setStatus("");
    var parsed = parseUrls(els.urlInput.value);
    if (!parsed.valid.length) {
        setStatus(parsed.invalid.length ? "Isso não parece um link. Cole o endereço completo do vídeo." : "Cole um link primeiro.", "warning");
        els.urlInput.focus();
        return;
    }
    if (!hasNode || !csInterface) {
        setStatus("Abra o painel dentro do Premiere (Janela › Extensões › Helmet DL) para baixar.", "warning");
        return;
    }
    var opts;
    try { opts = jobOptions(); } catch (e) { setStatus(e.message, "error"); return; }

    parsed.valid.forEach(function (url) {
        var cached = infoCache[previewKey(url)];
        var job = {
            id: nextJobId++,
            url: url,
            opts: JSON.parse(JSON.stringify(opts)),
            title: cached ? cached.title : url,
            state: "queued",
            text: "Na fila",
            nums: "",
            percent: null,
            files: [],
            handle: null,
            cancelRequested: false
        };
        jobs.push(job);
        renderJob(job);
    });
    if (parsed.invalid.length) setStatus("Ignorado (não é link): " + parsed.invalid.join(" "), "warning");

    els.urlInput.value = "";
    cancelPreview();
    previewUrl = "";
    hidePreview();
    pump();
}

function pump() {
    if (running) return;
    var next = null;
    for (var i = 0; i < jobs.length; i++) if (jobs[i].state === "queued") { next = jobs[i]; break; }
    if (!next) return;
    running = next;
    runJob(next).then(function () {
        running = null;
        pump();
    });
}

function setJob(job, patch) {
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) job[k] = patch[k];
    renderJob(job);
}

function checkCanceled(job) {
    if (job.cancelRequested) throw Object.assign(new Error("Cancelado"), { canceled: true });
}

function runJob(job) {
    var o = job.opts;
    var outDir = "";
    var startedAt = Date.now();
    job.tempOutputs = [];  // saídas de reencode ainda incompletas
    job.created = [];      // arquivos que o yt-dlp começou a baixar
    job.downloaded = [];   // arquivos finais entregues pelo yt-dlp (nunca apagados na limpeza)

    function progress(text, percent, nums) {
        setJob(job, { text: text, percent: percent === undefined ? null : percent, nums: nums || "" });
    }

    return Promise.resolve().then(function () {
        setJob(job, { state: "running", text: "Preparando…", percent: null, nums: "" });
        return ensureEssentialTools(function (t) { progress(t, null); });
    }).then(function () {
        checkCanceled(job);
        return refreshProject();
    }).then(function () {
        if (!project.path) {
            throw new Error("Salve o projeto do Premiere antes de baixar — a pasta \"" + FOLDER_NAME + "\" é criada ao lado do arquivo .prproj.");
        }
        outDir = helmetDir();
        HDLTools.ensureDir(outDir);
        appendLog("Baixando " + job.url + " → " + outDir);
        progress("Lendo informações…", null);
        job.handle = HDLDownloader.download(job.url, o, outDir, {
            onProgress: function (p) { progress(p.text, p.percent, p.nums); },
            onLog: appendLog
        });
        job.created = job.handle.created;
        return job.handle.promise;
    }).then(function (res) {
        job.downloaded = res.files.slice();
        if (res.partialError) appendLog("Aviso: " + res.partialError);
        if (res.files.length && job.title === job.url) job.title = nodePath.basename(res.files[0]);
        return postProcess(job, res.files, res.alreadyHad);
    }).then(function (finals) {
        checkCanceled(job);
        job.files = finals;
        progress("Importando no Project…", null);
        var list = finals.map(function (f) { return encodeURIComponent(f); }).join(",");
        return callHost("hdl_importFiles(" + JSON.stringify(list) + "," + JSON.stringify(o.bin ? BIN_NAME : "") + ")")
            .then(function (r) { return { r: r, finals: finals }; });
    }).then(function (x) {
        var r = x.r;
        var where = r.bin ? "Project › " + r.bin : "Project";
        var text;
        if (r.imported && r.result) text = (r.imported > 1 ? r.imported + " arquivos importados em " : "Importado em ") + where;
        else if (r.imported && !r.result) text = "Baixado, mas o Premiere recusou a importação. O arquivo está na pasta " + FOLDER_NAME + ".";
        else text = "Já estava no " + where;
        var state = job.warn ? "warn" : (r.imported && !r.result ? "warn" : "done");
        if (job.warn) text += " · " + job.warn;
        var size = 0;
        x.finals.forEach(function (f) { try { size += nodeFs.statSync(f).size; } catch (e) { /* ignora */ } });
        setJob(job, { state: state, text: text, percent: null, nums: [job.resLabel, fmtBytes(size)].filter(Boolean).join(" · ") });
        appendLog("Concluído: " + x.finals.join(" | "));
    }).catch(function (e) {
        job.handle = null;
        // cancelado ou com erro: apaga as sobras (o arquivo final já baixado fica)
        cleanupPartials(outDir, startedAt, job);
        if (e.canceled || job.cancelRequested) {
            setJob(job, { state: "canceled", text: "Cancelado", percent: null, nums: "" });
            appendLog("Cancelado: " + job.url);
        } else {
            setJob(job, { state: "error", text: e.message, percent: null, nums: "" });
            appendLog("ERRO: " + e.message);
        }
    });
}

// Reencode / remover áudio, conforme as opções. Retorna os arquivos finais.
// alreadyHad: o arquivo já existia antes deste download (pode estar em uso no projeto),
// então nunca é apagado depois do reencode.
function postProcess(job, files, alreadyHad) {
    var o = job.opts;
    var finals = [];
    var wantsReencode = o.content !== "audio" && (o.mode === "reencode" || o.mode === "both");
    var codecLabel = (HDLDownloader.CODECS[o.codec] || HDLDownloader.CODECS.h264).label;

    return files.reduce(function (chain, file, idx) {
        return chain.then(function () {
            checkCanceled(job);
            var tag = files.length > 1 ? " (" + (idx + 1) + "/" + files.length + ")" : "";
            if (o.content === "audio") { finals.push(file); return; }

            return HDLDownloader.probe(file).then(function (info) {
                if (info && info.height) job.resLabel = Math.min(info.width || info.height, info.height) + "p";

                if (wantsReencode) {
                    var out = HDLDownloader.reencodeOutput(file, o.codec);
                    job.tempOutputs.push(out);
                    var gpuStep = (o.encoder === "gpu" && o.codec !== "prores")
                        ? HDLDownloader.detectGpu().then(function (g) { return HDLDownloader.gpuVideoArgs(g, o.codec) ? g : null; })
                        : Promise.resolve(null);
                    var encodeWith = function (gpu) {
                        setJob(job, { text: "Reencodando para " + codecLabel + (gpu ? " (GPU)" : " (CPU)") + tag + "…", percent: 0, nums: "" });
                        job.handle = HDLDownloader.reencode(file, out, o.codec, o.content === "video", info, function (f) {
                            setJob(job, { percent: f, nums: Math.floor(f * 100) + "%" });
                        }, appendLog, gpu);
                        return job.handle.promise;
                    };
                    return gpuStep.then(function (gpu) {
                        if (o.encoder === "gpu" && !gpu) appendLog("GPU indisponível para " + codecLabel + "; usando a CPU.");
                        return encodeWith(gpu).catch(function (e) {
                            // a GPU falhou (driver, resolução não suportada…): refaz na CPU
                            if (!gpu || e.canceled || job.cancelRequested) throw e;
                            appendLog("O encode na GPU falhou (" + e.message + "). Refazendo na CPU…");
                            try { nodeFs.unlinkSync(out); } catch (x) { /* a GPU não chegou a criar o arquivo */ }
                            return encodeWith(null);
                        });
                    }).then(function () {
                        job.tempOutputs = [];
                        if (o.mode === "reencode") {
                            if (!alreadyHad) {
                                try { nodeFs.unlinkSync(file); } catch (e) { appendLog("Não apaguei o original: " + e.message); }
                            }
                            finals.push(out);
                        } else {
                            finals.push(file, out);
                        }
                    });
                }

                var after = Promise.resolve(info);
                if (o.content === "video" && info && info.acodec) {
                    setJob(job, { text: "Removendo o áudio" + tag + "…", percent: null, nums: "" });
                    job.handle = HDLDownloader.stripAudio(file, appendLog);
                    after = job.handle.promise.then(function () { info.acodec = null; return info; });
                }
                return after.then(function (inf) {
                    var w = HDLDownloader.compatWarning(inf);
                    if (w) { job.warn = w; appendLog("Aviso: " + w); }
                    finals.push(file);
                });
            });
        });
    }, Promise.resolve()).then(function () { return finals; });
}

// Remove sobras de um download cancelado ou com erro: .part, fragmentos, formatos
// intermediários e saída de reencode incompleta. Nunca apaga os arquivos finais
// entregues pelo yt-dlp (job.downloaded) nem nada fora da pasta de destino.
function cleanupPartials(outDir, since, job) {
    if (!hasNode) return;
    function rm(f) { try { nodeFs.unlinkSync(f); } catch (e) { /* já não existe */ } }
    (job.tempOutputs || []).forEach(rm);
    job.tempOutputs = [];
    if (!outDir) return;
    var keep = (job.downloaded || []).map(function (f) { return nodePath.resolve(f).toLowerCase(); });
    setTimeout(function () { // espera o processo soltar os arquivos
        (job.created || []).forEach(function (f) {
            if (!HDLDownloader.isInside(outDir, f) || keep.indexOf(nodePath.resolve(f).toLowerCase()) >= 0) return;
            [f, f + ".part", f + ".ytdl"].forEach(rm);
        });
        try {
            nodeFs.readdirSync(outDir).forEach(function (name) {
                if (!/\.(part|ytdl|temp)$|\.part-Frag\d+|\.temp\.\w+$/i.test(name)) return;
                var full = nodePath.join(outDir, name);
                try {
                    if (nodeFs.statSync(full).mtimeMs >= since - 2000) nodeFs.unlinkSync(full);
                } catch (e) { /* ignora */ }
            });
        } catch (e) { /* ignora */ }
    }, 1500);
}

function cancelJob(job) {
    job.cancelRequested = true;
    if (job.state === "queued") {
        setJob(job, { state: "canceled", text: "Cancelado" });
        return;
    }
    setJob(job, { text: "Cancelando…" });
    if (job.handle) job.handle.cancel();
}

function retryJob(job) {
    setJob(job, { state: "queued", text: "Na fila", percent: null, nums: "", cancelRequested: false, warn: null, files: [] });
    pump();
}

function removeJob(job) {
    jobs = jobs.filter(function (j) { return j !== job; });
    if (job.el && job.el.parentNode) job.el.parentNode.removeChild(job.el);
    updateDock();
}

// --- renderização da fila ---------------------------------------------------------------------

function iconBtn(action, icon, title) {
    return '<button class="icon-btn sm" data-action="' + action + '" title="' + title + '"><svg class="icon"><use href="#' + icon + '"/></svg></button>';
}

function renderJob(job) {
    if (!job.el) {
        job.el = document.createElement("li");
        job.el.dataset.id = job.id;
        job.el.innerHTML =
            '<div class="q-head"><span class="q-title"></span><div class="q-actions"></div></div>' +
            '<div class="progress" style="display:none"><div class="progress-bar"></div></div>' +
            '<div class="q-line"><span class="q-state"></span><span class="q-nums"></span></div>';
        els.queue.insertBefore(job.el, els.queue.firstChild);
    }
    var active = job.state === "running";
    var cls = "q-item " + (STATE_CLASS[job.state] || "");
    if (active && (job.percent === null || job.percent === undefined)) cls += " indeterminate";
    job.el.className = cls;

    var title = job.el.querySelector(".q-title");
    title.textContent = job.title;
    title.title = job.url;

    var actions = "";
    if (job.state === "queued" || job.state === "running") actions = iconBtn("cancel", "i-x", "Cancelar");
    else if (job.state === "done" || job.state === "warn") actions = iconBtn("reveal", "i-folder", "Mostrar na pasta") + iconBtn("remove", "i-x", "Tirar da lista");
    else actions = iconBtn("retry", "i-retry", "Tentar de novo") + iconBtn("remove", "i-x", "Tirar da lista");
    var actionsEl = job.el.querySelector(".q-actions");
    if (actionsEl.dataset.key !== job.state) {
        actionsEl.innerHTML = actions;
        actionsEl.dataset.key = job.state;
    }

    var prog = job.el.querySelector(".progress");
    prog.style.display = active ? "" : "none";
    if (active) job.el.querySelector(".progress-bar").style.width = Math.round((job.percent || 0) * 100) + "%";

    job.el.querySelector(".q-state").textContent = job.text;
    job.el.querySelector(".q-state").title = job.text;
    job.el.querySelector(".q-nums").textContent = job.nums || "";
    updateDock();
}

// --- progresso fixo no rodapé ---------------------------------------------------------------------
// Mostra o download em andamento enquanto a barra dele na lista está fora da área visível.
// Some quando o item aparece na rolagem ou quando o download termina.

var dock = {
    el: $("dock"),
    title: $("dockTitle"),
    cancel: $("dockCancel"),
    bar: $("dockBar"),
    state: $("dockState"),
    nums: $("dockNums"),
    content: document.querySelector(".content"),
    job: null
};

function activeJob() {
    for (var i = 0; i < jobs.length; i++) if (jobs[i].state === "running") return jobs[i];
    for (var k = 0; k < jobs.length; k++) if (jobs[k].state === "queued") return jobs[k];
    return null;
}

function isOnScreen(el) {
    if (!el || !el.offsetParent) return false;
    var r = el.getBoundingClientRect(), c = dock.content.getBoundingClientRect();
    return r.bottom > c.top && r.top < c.bottom;
}

function updateDock() {
    if (!dock.el) return;
    var job = activeJob();
    var target = job && job.el && (job.el.querySelector(".progress") || job.el);
    if (target && target.style.display === "none") target = job.el;
    var show = !!job && !isOnScreen(target);
    dock.job = show ? job : null;
    if (!show) {
        if (!dock.el.hidden) dock.el.hidden = true;
        return;
    }
    var waiting = job.state === "queued" || job.percent === null || job.percent === undefined;
    dock.el.className = "dock" + (waiting ? " indeterminate" : "");
    dock.title.textContent = job.title;
    dock.bar.style.width = Math.round((job.percent || 0) * 100) + "%";
    var queued = jobs.filter(function (j) { return j.state === "queued" && j !== job; }).length;
    dock.state.textContent = job.text + (queued ? " · +" + queued + " na fila" : "");
    dock.state.title = job.text;
    dock.nums.textContent = job.nums || "";
    if (dock.el.hidden) dock.el.hidden = false;
}

function bindDock() {
    if (!dock.el) return;
    dock.content.addEventListener("scroll", updateDock, { passive: true });
    window.addEventListener("resize", updateDock);
    dock.title.addEventListener("click", function () {
        if (dock.job && dock.job.el) dock.job.el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    dock.cancel.addEventListener("click", function () { if (dock.job) cancelJob(dock.job); });
}

function findJob(id) {
    for (var i = 0; i < jobs.length; i++) if (String(jobs[i].id) === String(id)) return jobs[i];
    return null;
}

// --- colar da área de transferência ----------------------------------------------------------------

function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error("sem resposta")); }, ms);
        promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
}

// Tenta três caminhos, do mais rápido ao mais garantido. O painel do CEP nem
// sempre libera a API de clipboard do navegador, então o último recurso é o
// próprio Windows (PowerShell, pelo caminho completo) ou o pbpaste no macOS.
function readClipboard() {
    var reasons = [];

    function viaApi() {
        if (!navigator.clipboard || !navigator.clipboard.readText) return Promise.reject(new Error("indisponível"));
        return withTimeout(navigator.clipboard.readText(), 1500).then(function (t) {
            if (!t) throw new Error("retornou vazio");
            return t;
        });
    }

    function viaExecCommand() {
        return new Promise(function (resolve, reject) {
            var ta = document.createElement("textarea");
            ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
            document.body.appendChild(ta);
            ta.focus();
            var ok = false;
            try { ok = document.execCommand("paste"); } catch (e) { ok = false; }
            var text = ta.value;
            document.body.removeChild(ta);
            if (ok && text) resolve(text); else reject(new Error("bloqueado"));
        });
    }

    function viaSystem() {
        if (!hasNode) return Promise.reject(new Error("sem Node"));
        return HDLTools.readClipboardSystem().then(function (r) {
            if (r.code !== 0) throw new Error("código " + r.code + (r.stderr ? ": " + r.stderr.trim().slice(0, 200) : ""));
            return r.stdout || "";
        });
    }

    var steps = [["API do navegador", viaApi], ["execCommand", viaExecCommand], ["sistema", viaSystem]];
    return steps.reduce(function (p, step) {
        return p.then(function (found) {
            if (found !== null) return found;
            return step[1]().catch(function (e) {
                reasons.push(step[0] + ": " + e.message);
                return null;
            });
        });
    }, Promise.resolve(null)).then(function (text) {
        els.urlInput.focus();
        if (text === null) {
            appendLog("Não deu para ler a área de transferência — " + reasons.join(" | "));
            throw new Error("clipboard");
        }
        return text;
    });
}

// --- eventos ---------------------------------------------------------------------------------------

function bindEvents() {
    els.btnDownload.addEventListener("click", enqueue);
    els.urlInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); enqueue(); }
    });
    els.urlInput.addEventListener("input", function () { setStatus(""); schedulePreview(); });
    els.urlInput.addEventListener("paste", function () { setTimeout(function () { cancelPreview(); updatePreview(); }, 0); });

    els.btnPaste.addEventListener("click", function () {
        readClipboard().then(function (t) {
            t = String(t || "").trim();
            if (!t) { setStatus("A área de transferência está vazia.", "warning"); return; }
            els.urlInput.value = t;
            setStatus("");
            cancelPreview();
            updatePreview();
        }, function () {
            setStatus("Não consegui ler a área de transferência. Use Ctrl+V no campo.", "warning");
            els.urlInput.focus();
        });
    });

    var settingInputs = [els.qualitySelect, els.containerSelect, els.codecSelect, els.compatCheckbox, els.audioFormatSelect,
        els.binCheckbox, els.playlistCheckbox, els.trimCheckbox, els.trimStart, els.trimEnd, els.cookiesSelect, els.autoUpdateCheckbox];
    Array.prototype.slice.call(els.contentRadios).concat(Array.prototype.slice.call(els.modeRadios),
        Array.prototype.slice.call(els.encoderRadios), settingInputs)
        .forEach(function (el) {
            el.addEventListener("change", function () { updateVisibility(); saveSettings(); });
        });
    // playlist/cookies mudam o que o yt-dlp enxerga: atualiza a prévia
    [els.playlistCheckbox, els.cookiesSelect].forEach(function (el) {
        el.addEventListener("change", function () { if (els.urlInput.value.trim()) updatePreview(); });
    });

    els.queue.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-action]");
        if (!btn) return;
        var li = btn.closest("li");
        var job = li && findJob(li.dataset.id);
        if (!job) return;
        var a = btn.dataset.action;
        if (a === "cancel") cancelJob(job);
        else if (a === "retry") retryJob(job);
        else if (a === "remove") removeJob(job);
        else if (a === "reveal" && job.files.length) openInExplorer(job.files[job.files.length - 1], true);
    });

    els.btnClearDone.addEventListener("click", function () {
        jobs.slice().forEach(function (j) { if (j.state !== "queued" && j.state !== "running") removeJob(j); });
    });

    els.btnOpenFolder.addEventListener("click", function () {
        if (!hasNode) return;
        refreshProject().then(function () {
            if (!project.path) { setStatus("Salve o projeto primeiro — a pasta " + FOLDER_NAME + " fica ao lado do .prproj.", "warning"); return; }
            HDLTools.ensureDir(helmetDir());
            openInExplorer(helmetDir(), false);
        });
    });
    els.projectInfo.addEventListener("click", refreshProject);
    window.addEventListener("focus", refreshProject);

    [["btnYtdlp", "ytdlp"], ["btnFfmpeg", "ffmpeg"], ["btnDeno", "deno"]].forEach(function (p) {
        els[p[0]].addEventListener("click", function () {
            if (p[1] === "ytdlp" && running) { setStatus("Espere o download atual terminar para atualizar o yt-dlp.", "warning"); return; }
            installTool(p[1]).then(function () {
                setStatus("Ferramenta instalada.", "success");
            }, function (e) {
                setStatus(e.message, "error");
                els.logDetails.open = true;
            });
        });
    });
}

// --- prévia no navegador (fora do Premiere) ---------------------------------------------------------

function demoQueue() {
    var samples = [
        { title: "Como montar um set de iluminação barato", state: "running", text: "Baixando vídeo", percent: 0.62, nums: "62% · 8.4 MB/s · 0:12" },
        { title: "Trailer oficial — 4K", state: "queued", text: "Na fila" },
        { title: "Entrevista completa (corte 10:00–12:30)", state: "done", text: "Importado em Project › Helmet DL", nums: "1080p · 54.2 MB" },
        { title: "clip_twitch_epic_moment", state: "warn", text: "Importado em Project › Helmet DL · Veio com vídeo em VP9, que o Premiere pode não abrir.", nums: "720p · 12.0 MB" },
        { title: "https://www.instagram.com/reel/xyz", state: "error", text: "Login necessário — escolha um navegador em \"Cookies do navegador\"." }
    ];
    samples.reverse().forEach(function (s) {
        var job = { id: nextJobId++, url: s.title, opts: {}, title: s.title, state: s.state, text: s.text, nums: s.nums || "", percent: s.percent, files: [] };
        jobs.push(job);
        renderJob(job);
    });
    els.preview.style.display = "";
    els.previewTitle.textContent = "Como montar um set de iluminação barato para gravar em casa";
    els.previewMeta.textContent = "Canal Exemplo · Youtube · até 2160p";
    els.previewDuration.textContent = "12:48";
}

// --- início ---------------------------------------------------------------------------------------

function init() {
    els.versionNote.textContent = "v" + CLIENT_VERSION;
    loadSettings();
    updateVisibility();
    bindEvents();
    bindDock();
    renderTools();

    if (!hasNode) {
        els.projectInfo.textContent = "Prévia fora do Premiere";
        if (/demo/.test(location.search)) demoQueue();
        return;
    }

    els.binDirNote.textContent = HDLTools.binDir;
    // Ao fechar o painel (ou o Premiere), nenhum yt-dlp/FFmpeg fica rodando sozinho.
    window.addEventListener("beforeunload", HDLTools.killAll);
    window.addEventListener("unload", HDLTools.killAll);
    refreshProject();
    if (csInterface) {
        ensureHost().then(function () { return evalHost("hdl_getHostVersion()"); }).then(function (v) {
            if (v !== CLIENT_VERSION) appendLog("Aviso: host " + v + " ≠ painel " + CLIENT_VERSION + " (reinstale a extensão inteira).");
        });
    }
    HDLTools.detectAll().then(function (st) {
        renderTools();
        updateEncoderHint();
        appendLog("yt-dlp: " + (st.ytdlp ? st.ytdlp.version + " (" + st.ytdlp.cmd + ")" : "não encontrado"));
        appendLog("FFmpeg: " + (st.ffmpeg ? st.ffmpeg.version + " (" + st.ffmpeg.cmd + ")" : "não encontrado"));
        appendLog("Deno: " + (st.deno ? st.deno.version + " (" + st.deno.cmd + ")" : "não encontrado"));
        if (!st.ytdlp || !st.ffmpeg) {
            els.toolsDetails.open = true;
            setStatus("Na primeira vez, as ferramentas (yt-dlp, FFmpeg e Deno) são baixadas automaticamente quando você clicar em Download.", "");
        }
        maybeAutoUpdate();
        if (els.urlInput.value.trim()) updatePreview();
    });
}

init();
