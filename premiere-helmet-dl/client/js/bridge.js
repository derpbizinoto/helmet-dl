// client/js/bridge.js — Helmet DL
// Ponte ÚNICA entre o painel e o ExtendScript (host/index.jsx).
//
// O único canal entre os dois é o evalScript, que recebe um TEXTO de código. Para
// nenhum valor (caminho de arquivo, nome de bin…) virar código por acidente, toda
// chamada passa por aqui: só funções da lista abaixo, e cada argumento vira um
// literal de texto seguro. O host responde sempre com JSON { ok, data, error }.
//
//     HDLBridge.call("hdl_importFiles", [listaCodificada, nomeDaBin]) -> Promise(data)

var HDLBridge = (function () {

    // Funções do host que o painel pode chamar.
    var FUNCTIONS = ["hdl_getProjectInfo", "hdl_importFiles", "hdl_getHostVersion"];

    var available = typeof window !== "undefined" && typeof window.__adobe_cep__ !== "undefined" &&
        typeof CSInterface === "function";
    var cs = available ? new CSInterface() : null;
    var log = function () {};

    var LINE_SEP = new RegExp(String.fromCharCode(0x2028), "g");
    var PARA_SEP = new RegExp(String.fromCharCode(0x2029), "g");

    // Literal de string seguro para o ExtendScript. O JSON.stringify não escapa
    // U+2028/U+2029, que o ExtendScript (ES3) trata como quebra de linha dentro da
    // string — o que viraria "EvalScript error.".
    function toScriptString(text) {
        return JSON.stringify(String(text))
            .replace(LINE_SEP, "\\u2028")
            .replace(PARA_SEP, "\\u2029");
    }

    function buildScript(name, args) {
        if (FUNCTIONS.indexOf(name) < 0) throw new Error("Função do host não permitida: " + name);
        return name + "(" + (args || []).map(toScriptString).join(",") + ")";
    }

    function evalRaw(script) {
        return new Promise(function (resolve, reject) {
            if (!cs) { reject(new Error("Fora do Premiere.")); return; }
            cs.evalScript(script, function (result) { resolve(String(result)); });
        });
    }

    // Confere se o host/index.jsx está carregado. Se não estiver (erro ao carregar no
    // início), carrega de novo com $.evalFile e registra o erro exato no log.
    var hostReady = null;

    function ensureHost() {
        if (!cs) return Promise.resolve(false);
        if (hostReady) return hostReady;
        var p = evalRaw("typeof hdl_getProjectInfo").then(function (t) {
            if (t === "function") return true;
            var jsx = cs.getSystemPath(SystemPath.EXTENSION) + "/host/index.jsx";
            var script = "(function(){try{$.evalFile(" + toScriptString(jsx) + ");return typeof hdl_getProjectInfo;}" +
                "catch(e){return 'ERRO: '+e+(e.line?' (linha '+e.line+')':'');}})()";
            return evalRaw(script).then(function (r) {
                if (r === "function") {
                    log("Script do host carregado manualmente (" + jsx + ").");
                    return true;
                }
                log("O script do host (host/index.jsx) não carregou: " + r);
                if (hostReady === p) hostReady = null; // tenta de novo na próxima chamada
                return false;
            });
        });
        hostReady = p;
        return p;
    }

    // Chama uma função do host. Resolve com `data`; rejeita com um Error.
    function call(name, args) {
        var script;
        try { script = buildScript(name, args); } catch (e) { return Promise.reject(e); }
        return ensureHost().then(function () { return evalRaw(script); }).then(function (raw) {
            var parsed;
            try { parsed = JSON.parse(raw); }
            catch (e) { throw new Error("Resposta inválida do ExtendScript: " + raw); }
            if (!parsed || !parsed.ok) throw new Error((parsed && parsed.error) || "Erro no ExtendScript.");
            return parsed.data;
        });
    }

    // Versão do host (texto puro), para avisar de instalação misturada.
    function hostVersion() {
        return ensureHost().then(function () { return evalRaw(buildScript("hdl_getHostVersion", [])); });
    }

    return {
        available: available,
        call: call,
        hostVersion: hostVersion,
        setLogger: function (fn) { log = fn || function () {}; },
        // expostos para os testes automáticos
        _buildScript: buildScript,
        _toScriptString: toScriptString
    };
})();
