// client/js/ui.js — Helmet DL
// Elementos da tela, mensagem de status, card Log, opções do painel (lidas da
// tela e lembradas entre sessões) e as dicas que dependem delas.
// Todo texto vindo da internet entra na tela com textContent, nunca como HTML.

var HDLUi = (function () {
    var C = HDL_CONFIG;
    var tr = HDLI18n.t, N = HDLI18n.N;
    var hasNode = typeof require === "function" && !!window.HDLTools && !!window.HDLDownloader;

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
        langSelect: $("langSelect"),
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
        versionNote: $("versionNote"),
        dock: $("dock"),
        dockTitle: $("dockTitle"),
        dockCancel: $("dockCancel"),
        dockBar: $("dockBar"),
        dockState: $("dockState"),
        dockNums: $("dockNums"),
        content: document.querySelector(".content")
    };

    // --- mensagens ------------------------------------------------------------------

    function setStatus(msg, kind) {
        els.status.textContent = msg || "";
        els.status.className = "status" + (kind ? " " + kind : "");
    }

    function appendLog(msg) {
        var t = new Date();
        var stamp = ("0" + t.getHours()).slice(-2) + ":" + ("0" + t.getMinutes()).slice(-2) + ":" + ("0" + t.getSeconds()).slice(-2);
        els.log.textContent += "[" + stamp + "] " + msg + "\n";
        if (els.log.textContent.length > C.LOG_MAX_CHARS) els.log.textContent = els.log.textContent.slice(-C.LOG_KEEP_CHARS);
        els.log.scrollTop = els.log.scrollHeight;
    }

    // --- formatação -------------------------------------------------------------------

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

    // --- opções do painel (lembradas entre sessões) -------------------------------------

    function radioValue(radios, fallback) {
        for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
        return fallback;
    }

    function setRadio(radios, value) {
        for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === value;
    }

    var MODE_HINTS = {
        original: N("Baixa do jeito que o site entrega, sem converter. É o mais rápido, mas pode vir em WebM/VP9/AV1."),
        remux: N("Só troca o container, sem perder qualidade. Rápido."),
        reencode: N("Converte para um codec do Premiere com frame rate constante. Mais lento, mas abre liso."),
        both: N("Gera os dois: o arquivo com remux e uma cópia reencodada. Os dois vão para o Project.")
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
        try { localStorage.setItem(C.SETTINGS_KEY, JSON.stringify(readOptions())); }
        catch (e) { HDLLog.debug("não consegui salvar as opções", e.message); }
    }

    // Só aceita valores que existem nas listas da tela (uma opção salva estranha é ignorada).
    function loadSettings() {
        var s = null;
        try { s = JSON.parse(localStorage.getItem(C.SETTINGS_KEY) || "null"); } catch (e) { s = null; }
        if (!s) return;
        if (s.content) setRadio(els.contentRadios, s.content);
        if (s.mode) setRadio(els.modeRadios, s.mode);
        if (s.encoder) setRadio(els.encoderRadios, s.encoder);
        function setSel(sel, v) {
            var ok = Array.prototype.some.call(sel.options, function (o) { return o.value === v; });
            if (v !== undefined && ok) sel.value = v;
        }
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
        if (typeof s.trimStartText === "string" && s.trimStartText) els.trimStart.value = s.trimStartText;
        if (typeof s.trimEndText === "string" && s.trimEndText) els.trimEnd.value = s.trimEndText;
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
        els.modeHint.textContent = MODE_HINTS[o.mode] ? tr(MODE_HINTS[o.mode]) : "";
        els.trimRow.style.display = o.trim ? "" : "none";
        updateEncoderHint();
        HDLPreview.updateQualityNote();
    }

    // --- dica da GPU ----------------------------------------------------------------------

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
            showEncoderHint(tr("O ProRes não tem encoder de GPU no FFmpeg — esse vai usar a CPU."));
            return;
        }
        if (!hasNode || !HDLTools.state.ffmpeg) {
            showEncoderHint(tr("A GPU é detectada quando o FFmpeg estiver instalado."));
            return;
        }
        showEncoderHint(tr("Procurando a GPU…"));
        HDLDownloader.detectGpu().then(function (gpu) {
            if (seq !== encoderHintSeq) return;
            if (!gpu) showEncoderHint(tr("Nenhuma GPU compatível (NVIDIA, AMD ou Intel) — o reencode vai usar a CPU."));
            else if (!HDLDownloader.gpuVideoArgs(gpu, o.codec)) showEncoderHint(tr("{0} não faz H.265 nesta placa — esse vai usar a CPU.", gpu.label));
            else showEncoderHint(tr("Usando {0}: bem mais rápido, com arquivo um pouco maior que o da CPU.", gpu.label));
        });
    }

    return {
        hasNode: hasNode,
        els: els,
        setStatus: setStatus,
        appendLog: appendLog,
        fmtDuration: fmtDuration,
        fmtBytes: fmtBytes,
        readOptions: readOptions,
        saveSettings: saveSettings,
        loadSettings: loadSettings,
        updateVisibility: updateVisibility,
        updateEncoderHint: updateEncoderHint
    };
})();
