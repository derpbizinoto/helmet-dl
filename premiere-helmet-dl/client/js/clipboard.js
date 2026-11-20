// client/js/clipboard.js — Helmet DL
// Botão de colar. O painel do CEP nem sempre libera a API de área de transferência
// do navegador, então tenta três caminhos, do mais rápido ao mais garantido; o
// último é o próprio sistema (PowerShell pelo caminho completo, ou pbpaste no Mac).

var HDLClipboard = (function () {
    var C = HDL_CONFIG;
    var U = HDLUi;
    var tr = HDLI18n.t;

    function withTimeout(promise, ms) {
        return new Promise(function (resolve, reject) {
            var t = setTimeout(function () { reject(new Error("sem resposta")); }, ms);
            promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
        });
    }

    function viaApi() {
        if (!navigator.clipboard || !navigator.clipboard.readText) return Promise.reject(new Error("indisponível"));
        return withTimeout(navigator.clipboard.readText(), C.TIMEOUT.clipboardApi).then(function (t) {
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
        if (!U.hasNode) return Promise.reject(new Error("sem Node"));
        return HDLTools.readClipboardSystem().then(function (r) {
            if (r.code !== 0) throw new Error("código " + r.code + (r.stderr ? ": " + r.stderr.trim().slice(0, 200) : ""));
            return r.stdout || "";
        });
    }

    // Resolve com o texto; rejeita se nenhum dos três caminhos funcionou.
    function read() {
        var reasons = [];
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
            U.els.urlInput.focus();
            if (text === null) {
                U.appendLog(tr("Não deu para ler a área de transferência — {0}", reasons.join(" | ")));
                throw new Error("clipboard");
            }
            return text;
        });
    }

    return { read: read };
})();
