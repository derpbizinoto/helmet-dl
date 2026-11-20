// client/js/main.js — Helmet DL
// Ponto de partida do painel: liga os botões e campos aos módulos e faz a
// verificação inicial. A lógica fica nos outros arquivos (ver o mapa em config.js).

(function () {
    var C = HDL_CONFIG;
    var U = HDLUi;
    var tr = HDLI18n.t;
    var els = U.els;

    function bindEvents() {
        els.btnDownload.addEventListener("click", HDLQueue.enqueue);
        els.urlInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); HDLQueue.enqueue(); }
        });
        els.urlInput.addEventListener("input", function () { U.setStatus(""); HDLPreview.schedule(); });
        els.urlInput.addEventListener("paste", function () {
            setTimeout(function () { HDLPreview.cancel(); HDLPreview.update(); }, 0);
        });

        els.btnPaste.addEventListener("click", function () {
            HDLClipboard.read().then(function (t) {
                t = String(t || "").trim();
                if (!t) { U.setStatus(tr("A área de transferência está vazia."), "warning"); return; }
                els.urlInput.value = t;
                U.setStatus("");
                HDLPreview.cancel();
                HDLPreview.update();
            }, function () {
                U.setStatus(tr("Não consegui ler a área de transferência. Use Ctrl+V no campo."), "warning");
                els.urlInput.focus();
            });
        });

        var settingInputs = [els.qualitySelect, els.containerSelect, els.codecSelect, els.compatCheckbox, els.audioFormatSelect,
            els.binCheckbox, els.playlistCheckbox, els.trimCheckbox, els.trimStart, els.trimEnd, els.cookiesSelect, els.autoUpdateCheckbox];
        Array.prototype.slice.call(els.contentRadios).concat(Array.prototype.slice.call(els.modeRadios),
            Array.prototype.slice.call(els.encoderRadios), settingInputs)
            .forEach(function (input) {
                input.addEventListener("change", function () { U.updateVisibility(); U.saveSettings(); });
            });
        // playlist/cookies mudam o que o yt-dlp enxerga: atualiza a prévia
        [els.playlistCheckbox, els.cookiesSelect].forEach(function (input) {
            input.addEventListener("change", function () { if (els.urlInput.value.trim()) HDLPreview.update(); });
        });

        els.queue.addEventListener("click", HDLQueue.onListClick);
        els.btnClearDone.addEventListener("click", HDLQueue.clearDone);

        els.btnOpenFolder.addEventListener("click", HDLProject.openFolder);
        els.projectInfo.addEventListener("click", HDLProject.refresh);
        window.addEventListener("focus", HDLProject.refresh);

        els.langSelect.addEventListener("change", function () { HDLI18n.setLang(els.langSelect.value); });
        HDLI18n.onChange(relabel);

        [["btnYtdlp", "ytdlp"], ["btnFfmpeg", "ffmpeg"], ["btnDeno", "deno"]].forEach(function (p) {
            els[p[0]].addEventListener("click", function () { HDLToolsUI.onButton(p[1]); });
        });
    }

    // Idioma trocado: o texto fixo da tela já foi trocado pelo HDLI18n; aqui são
    // redesenhadas as partes montadas pelo código. (O Log fica como estava.)
    function relabel() {
        els.langSelect.value = HDLI18n.lang();
        U.setStatus("");
        U.updateVisibility();
        HDLToolsUI.render();
        HDLPreview.relabel();
        HDLQueue.relabel();
        if (U.hasNode) HDLProject.refresh();
        else els.projectInfo.textContent = tr("Prévia fora do Premiere");
    }

    function init() {
        HDLI18n.apply(document.body);
        els.langSelect.value = HDLI18n.lang();
        els.versionNote.textContent = "v" + C.CLIENT_VERSION;
        U.loadSettings();
        U.updateVisibility();
        bindEvents();
        HDLQueue.bindDock();
        HDLToolsUI.render();

        if (!U.hasNode) {
            els.projectInfo.textContent = tr("Prévia fora do Premiere");
            if (/demo/.test(location.search)) HDLQueue.demo();
            return;
        }

        HDLBridge.setLogger(U.appendLog);
        els.binDirNote.textContent = HDLTools.binDir;
        // Ao fechar o painel (ou o Premiere), nenhum yt-dlp/FFmpeg fica rodando sozinho
        // e as sobras do download interrompido são apagadas (agora ou na próxima abertura).
        var onClose = function () { HDLQueue.cleanupOnClose(HDLTools.killAll); };
        window.addEventListener("beforeunload", onClose);
        window.addEventListener("unload", onClose);
        HDLQueue.cleanupLastSession();
        HDLProject.refresh();
        if (HDLBridge.available) {
            HDLBridge.hostVersion().then(function (v) {
                if (v !== C.CLIENT_VERSION) U.appendLog(tr("Aviso: host {0} ≠ painel {1} (reinstale a extensão inteira).", v, C.CLIENT_VERSION));
            });
        }
        HDLTools.detectAll().then(function (st) {
            HDLToolsUI.render();
            U.updateEncoderHint();
            U.appendLog("yt-dlp: " + (st.ytdlp ? st.ytdlp.version + " (" + st.ytdlp.cmd + ")" : tr("não encontrado")));
            U.appendLog("FFmpeg: " + (st.ffmpeg ? st.ffmpeg.version + " (" + st.ffmpeg.cmd + ")" : tr("não encontrado")));
            U.appendLog("Deno: " + (st.deno ? st.deno.version + " (" + st.deno.cmd + ")" : tr("não encontrado")));
            if (!st.ytdlp || !st.ffmpeg) {
                els.toolsDetails.open = true;
                U.setStatus(tr("Na primeira vez, as ferramentas (yt-dlp, FFmpeg e Deno) são baixadas automaticamente quando você clicar em Download."), "");
            }
            HDLToolsUI.maybeAutoUpdate();
            if (els.urlInput.value.trim()) HDLPreview.update();
        });
    }

    init();
})();
