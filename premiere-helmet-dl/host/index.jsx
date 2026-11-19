// host/index.jsx — Helmet DL
// Lado ExtendScript: informa onde o projeto está salvo e importa os arquivos
// baixados na aba Project (nunca na timeline).
// As respostas são JSON montado à mão (o ExtendScript do Premiere não tem JSON nativo).

var HDL_HOST_VERSION = "1.0.0";

function hdl_esc(s) {
    var str = String(s);
    var out = "";
    for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i);
        var code = str.charCodeAt(i);
        if (c === "\\") out += "\\\\";
        else if (c === '"') out += '\\"';
        else if (c === "\n") out += "\\n";
        else if (c === "\r") out += "\\r";
        else if (c === "\t") out += "\\t";
        else if (code < 32) out += "\\u" + ("0000" + code.toString(16)).slice(-4);
        else out += c;
    }
    return out;
}

function hdl_ok(fieldsJson) {
    return '{"ok":true,"data":{' + fieldsJson + '}}';
}

function hdl_fail(msg) {
    return '{"ok":false,"error":"' + hdl_esc(msg) + '"}';
}

function hdl_getHostVersion() {
    return HDL_HOST_VERSION;
}

// Caminho do .prproj ativo (vazio se o projeto nunca foi salvo).
function hdl_getProjectInfo() {
    try {
        if (!app.project) return hdl_fail("Nenhum projeto aberto.");
        var p = "";
        try { p = app.project.path || ""; } catch (e1) { p = ""; }
        var n = "";
        try { n = app.project.name || ""; } catch (e2) { n = ""; }
        // (não usar "native" como nome: é palavra reservada no ExtendScript)
        var fullPath = p;
        try { if (p) fullPath = new File(p).fsName; } catch (e3) { fullPath = p; }
        return hdl_ok('"path":"' + hdl_esc(fullPath) + '","name":"' + hdl_esc(n) + '"');
    } catch (e) {
        return hdl_fail("Erro ao ler o projeto: " + e);
    }
}

function hdl_binType() {
    try { if (typeof ProjectItemType !== "undefined" && ProjectItemType.BIN !== undefined) return ProjectItemType.BIN; } catch (e) { /* ignora */ }
    return 2;
}

function hdl_findBin(parent, name) {
    var binType = hdl_binType();
    try {
        for (var i = 0; i < parent.children.numItems; i++) {
            var c = parent.children[i];
            if (c && c.type === binType && c.name === name) return c;
        }
    } catch (e) { /* ignora */ }
    return null;
}

function hdl_normPath(p) {
    var s = String(p || "");
    try { s = new File(s).fsName; } catch (e) { /* mantém */ }
    s = s.replace(/\//g, "\\");
    if ($.os.indexOf("Windows") >= 0) s = s.toLowerCase();
    return s;
}

// Coleta os caminhos de mídia já presentes numa bin (e sub-bins), para não
// importar o mesmo arquivo duas vezes.
function hdl_collectMedia(item, out, depth) {
    if (depth > 6) return;
    var binType = hdl_binType();
    try {
        for (var i = 0; i < item.children.numItems; i++) {
            var c = item.children[i];
            if (!c) continue;
            if (c.type === binType) {
                hdl_collectMedia(c, out, depth + 1);
            } else {
                try {
                    var mp = c.getMediaPath();
                    if (mp) out[hdl_normPath(mp)] = true;
                } catch (e) { /* não é mídia */ }
            }
        }
    } catch (e2) { /* ignora */ }
}

// encodedList: caminhos com encodeURIComponent, separados por vírgula.
// binName: nome da bin de destino ("" = raiz do Project).
function hdl_importFiles(encodedList, binName) {
    try {
        if (!app.project) return hdl_fail("Nenhum projeto aberto.");
        var raw = String(encodedList || "").split(",");
        var paths = [];
        for (var i = 0; i < raw.length; i++) {
            if (!raw[i]) continue;
            var p = decodeURIComponent(raw[i]);
            if (new File(p).exists) paths.push(new File(p).fsName);
        }
        if (!paths.length) return hdl_fail("Nenhum arquivo encontrado para importar.");

        var root = app.project.rootItem;
        var target = root;
        if (binName) {
            target = hdl_findBin(root, binName);
            if (!target) {
                var created = null;
                try { created = root.createBin(binName); } catch (eb) { created = null; }
                target = (created && created.children) ? created : hdl_findBin(root, binName);
                if (!target) target = root;
            }
        }

        var existing = {};
        hdl_collectMedia(target, existing, 0);

        var toImport = [];
        var skipped = 0;
        for (var j = 0; j < paths.length; j++) {
            if (existing[hdl_normPath(paths[j])]) skipped++;
            else toImport.push(paths[j]);
        }

        var ok = true;
        if (toImport.length) {
            // suppressUI = true, importAsNumberedStills = false. Só Project, nada na timeline.
            // (algumas versões retornam undefined em vez de true)
            ok = app.project.importFiles(toImport, true, target, false) !== false;
        }

        return hdl_ok('"imported":' + toImport.length + ',"skipped":' + skipped +
            ',"result":' + (ok ? "true" : "false") +
            ',"bin":"' + hdl_esc(target === root ? "" : target.name) + '"');
    } catch (e) {
        return hdl_fail("Erro ao importar no Premiere: " + e);
    }
}
