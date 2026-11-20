// client/js/tools-ui.js — Helmet DL
// Card "Ferramentas": mostra yt-dlp/FFmpeg/Deno, instala/atualiza pelos botões,
// instala o que faltar antes do primeiro download e faz a atualização automática
// diária do yt-dlp. (Quem baixa e confere os arquivos é o tools.js.)

var HDLToolsUI = (function () {
    var C = HDL_CONFIG;
    var U = HDLUi;
    var els = U.els;

    var busy = null; // promise de uma instalação em andamento (uma por vez)
    // Resultado de uma instalação que falhou, mostrado na linha da própria ferramenta
    // (a linha de status fica no topo do painel, longe do botão).
    var notes = {};

    var SOURCE_LABEL = { managed: "instalado pela extensão", path: "do sistema", python: "via Python" };

    function label(name) {
        return C.TOOLS[name].label;
    }

    function render(progressFor, progressText) {
        if (!U.hasNode) {
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
            } else if (notes[k]) {
                r.el.textContent = notes[k];
                if (!r.t) missing.push(label(k));
            } else if (r.t) {
                r.el.textContent = r.t.version + " · " + (SOURCE_LABEL[r.t.source] || r.t.source);
            } else {
                r.el.textContent = r.required ? "Não instalado" : "Recomendado para o YouTube";
                missing.push(label(k));
            }
            if (k === "ytdlp") r.btn.textContent = r.t ? "Atualizar" : "Instalar";
            else if (k === "ffmpeg") {
                r.btn.textContent = r.t ? "Reinstalar" : "Instalar";
                r.btn.style.display = (r.t && r.t.source !== "managed") || !HDLTools.isWin ? "none" : "";
            } else {
                r.btn.textContent = r.t ? "Reinstalar" : "Instalar";
                r.btn.style.display = r.t && r.t.source !== "managed" ? "none" : "";
            }
            r.btn.disabled = !!busy;
        });
        els.toolsSummary.textContent = progressFor ? "instalando…" : (missing.length ? "falta " + missing.join(", ") : "tudo pronto");
    }

    function pct(got, total) {
        return total ? Math.floor(got / total * 100) + "%" : U.fmtBytes(got);
    }

    // name: "ytdlp" | "ffmpeg" | "deno". onText: callback opcional para mostrar o andamento num item da fila.
    function install(name, onText) {
        var fn = name === "ytdlp" ? (HDLTools.state.ytdlp ? HDLTools.updateYtdlp : HDLTools.installYtdlp)
            : name === "ffmpeg" ? HDLTools.installFfmpeg : HDLTools.installDeno;
        var run = function () {
            delete notes[name];
            U.appendLog("Instalando " + label(name) + "…");
            render(name, "Baixando…");
            return fn(function (got, total) {
                var txt = got < 0 ? "Baixando (modo alternativo, aguarde)…" : "Baixando " + pct(got, total);
                render(name, txt);
                if (onText) onText("Instalando " + label(name) + " · " + txt);
            }).then(function (res) {
                if (!res) throw new Error(label(name) + " foi baixado, mas não respondeu. Veja o log.");
                U.appendLog(label(name) + " pronto: " + res.version);
                return res;
            }, function (e) {
                // o detalhe técnico fica no log; na tela, uma frase clara
                U.appendLog("Falha ao instalar " + label(name) + ": " + e.message);
                var network = HDLTools.isNetworkError(e.message);
                var had = HDLTools.state[name];
                notes[name] = (network ? "Sem conexão com a internet — " : "Falhou (veja o Log) — ") +
                    (had ? "a versão " + had.version + " continua" : "não instalado");
                if (network) throw new Error("Não deu para instalar o " + label(name) + ". " + HDLTools.NETWORK_MESSAGE);
                throw e;
            });
        };
        var p = (busy || Promise.resolve()).then(run, run);
        busy = p;
        var clear = function () { if (busy === p) busy = null; render(); U.updateEncoderHint(); };
        p.then(clear, clear);
        return p;
    }

    // Instala o que faltar antes do primeiro download.
    function ensureEssential(onText) {
        var st = HDLTools.state;
        var chain = busy ? busy.then(function () {}, function () {}) : Promise.resolve();
        return chain.then(function () {
            if (!st.ytdlp) return install("ytdlp", onText);
        }).then(function () {
            if (!st.ffmpeg) {
                if (!HDLTools.isWin) throw new Error("FFmpeg não encontrado. No macOS, instale com: brew install ffmpeg");
                return install("ffmpeg", onText);
            }
        }).then(function () {
            if (!st.deno) {
                return install("deno", onText).catch(function (e) {
                    U.appendLog("Deno não instalado (" + e.message + "). O YouTube pode ficar limitado.");
                });
            }
        }).then(function () {
            if (!st.ytdlp) throw new Error("yt-dlp não está disponível. Veja Ferramentas.");
        });
    }

    // Uma vez por dia (no máximo), baixa o yt-dlp novo se houver. Nunca no meio de um download.
    function maybeAutoUpdate() {
        var st = HDLTools.state;
        if (!els.autoUpdateCheckbox.checked || !st.ytdlp || st.ytdlp.source !== "managed") return;
        var last = 0;
        try { last = parseInt(localStorage.getItem(C.UPDATE_KEY) || "0", 10); } catch (e) { last = 0; }
        if (Date.now() - last < C.AUTO_UPDATE_INTERVAL_MS) return;
        HDLTools.latestYtdlpVersion().then(function (latest) {
            try { localStorage.setItem(C.UPDATE_KEY, String(Date.now())); }
            catch (e) { HDLLog.debug("não consegui gravar a data da verificação", e.message); }
            if (!latest || !st.ytdlp || latest === st.ytdlp.version) return;
            if (HDLQueue.isRunning()) return; // não troca o .exe no meio de um download
            U.appendLog("Nova versão do yt-dlp: " + latest + " (atual " + st.ytdlp.version + ")");
            install("ytdlp").catch(function () { /* já registrado no log */ });
        });
    }

    // Botões Instalar/Atualizar/Reinstalar do card.
    function onButton(name) {
        if (name === "ytdlp" && HDLQueue.isRunning()) {
            U.setStatus("Espere o download atual terminar para atualizar o yt-dlp.", "warning");
            return;
        }
        install(name).then(function () {
            U.setStatus("Ferramenta instalada.", "success");
        }, function (e) {
            U.setStatus(e.message, "error");
            els.logDetails.open = true;
        });
    }

    return {
        render: render,
        install: install,
        ensureEssential: ensureEssential,
        maybeAutoUpdate: maybeAutoUpdate,
        onButton: onButton
    };
})();
