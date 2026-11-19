// tests/run-tests.js — Helmet DL
// Testes automáticos das partes que não dependem do Premiere nem da internet.
// Como rodar (na pasta do repositório):   node tests\run-tests.js
//
// Carrega os arquivos do painel do mesmo jeito que o Premiere carrega (scripts
// soltos, sem módulos), dentro de um "vm" do Node. O que depende do Premiere de
// verdade está no roteiro manual TESTES.md.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");
const { PassThrough } = require("stream");
const mock = require("./premiere-mock.js");

const ROOT = path.join(__dirname, "..");
const EXT = path.join(ROOT, "premiere-helmet-dl");
const JS = path.join(EXT, "client", "js");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "helmet-dl-tests-"));

let passed = 0, failed = 0;
const queue = [];
function test(name, fn) { queue.push([name, fn]); }
function eq(actual, expected, what) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) throw new Error((what ? what + ": " : "") + "esperava " + e + ", veio " + a);
}
function ok(cond, what) { if (!cond) throw new Error(what || "condição falsa"); }

// --- carrega config, tools e downloader (APPDATA temporário: nada toca o real) ---
process.env.APPDATA = path.join(TMP, "appdata");
const ctx = { require, process, Buffer, console, setTimeout, clearTimeout, Promise, URL };
vm.createContext(ctx);
["config.js", "tools.js", "downloader.js"].forEach((f) =>
    vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), ctx, { filename: f }));
const T = ctx.HDLTools, D = ctx.HDLDownloader;

// preview.js só precisa do HDLUi para a parte de URLs
const pctx = { HDL_CONFIG: ctx.HDL_CONFIG, HDLUi: { els: {} }, URL, setTimeout, clearTimeout };
vm.createContext(pctx);
vm.runInContext(fs.readFileSync(path.join(JS, "preview.js"), "utf8"), pctx, { filename: "preview.js" });
const P = pctx.HDLPreview;

// ---------------------------------------------------------------------------------
// Nomes de arquivo

test("safeName: título com emoji, acentos e barras", () => {
    eq(D.safeName("Ação / Reação: \"teste\" 🎬 <1|2>?*"), "Ação _ Reação_ _teste_ 🎬 _1_2___");
});
test("safeName: sem pontos/espaços no fim, nem '..'", () => {
    eq(D.safeName("nome final... "), "nome final");
    eq(D.safeName("a..b"), "a.b");
});
test("safeName: nomes reservados do Windows ganham '_'", () => {
    eq(D.safeName("CON"), "_CON");
    eq(D.safeName("com1.mp4"), "_com1.mp4");
    eq(D.safeName("console"), "console");
});
test("safeName: vazio vira 'download'", () => {
    eq(D.safeName(""), "download");
    eq(D.safeName("..."), "download");
});
test("safeName: corta pelo tamanho em bytes sem quebrar emoji", () => {
    const s = D.safeName("🎬".repeat(100), 10);   // cada 🎬 tem 4 bytes
    eq(s, "🎬🎬");
    ok(Buffer.byteLength(D.safeName("á".repeat(300)), "utf8") <= 180, "passou de 180 bytes");
});

test("isInside: só aceita o que está dentro da pasta", () => {
    const dir = path.join(TMP, "Projeto", "Helmet DL");
    ok(D.isInside(dir, path.join(dir, "video.mp4")), "arquivo dentro");
    ok(D.isInside(dir, path.join(dir, "sub", "video.mp4")), "subpasta");
    ok(!D.isInside(dir, path.join(dir, "..", "fora.mp4")), "com ..");
    ok(!D.isInside(dir, dir + " 2" + path.sep + "x.mp4"), "pasta vizinha com nome parecido");
    ok(!D.isInside(dir, dir), "a própria pasta");
    ok(!D.isInside(dir, path.join(TMP, "outro.mp4")), "outra pasta");
});

test("uniquePath: nunca grava por cima (sufixo (2), (3)…)", () => {
    const dir = path.join(TMP, "Pasta com espaço e acentuação ção 🎬");
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, "vídeo.mp4");
    eq(D.uniquePath(p), p, "livre");
    fs.writeFileSync(p, "x");
    eq(D.uniquePath(p), path.join(dir, "vídeo (2).mp4"));
    fs.writeFileSync(path.join(dir, "vídeo (2).mp4"), "x");
    eq(D.uniquePath(p), path.join(dir, "vídeo (3).mp4"));
});

test("reencodeOutput: nome limpo e único ao lado do original", () => {
    const dir = path.join(TMP, "reenc");
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(dir, "Clipe [abc].webm");
    const out1 = D.reencodeOutput(src, "h264");
    eq(path.dirname(out1), dir);
    fs.writeFileSync(out1, "x");
    const out2 = D.reencodeOutput(src, "h264");
    ok(out2 !== out1 && /\(2\)\.\w+$/.test(out2), "segundo reencode deveria ganhar (2): " + out2);
});

// ---------------------------------------------------------------------------------
// Links

test("normalizeUrl: aceita http/https e completa 'site.com/…'", () => {
    eq(P.normalizeUrl("https://www.youtube.com/watch?v=abc"), "https://www.youtube.com/watch?v=abc");
    eq(P.normalizeUrl("http://exemplo.com/v"), "http://exemplo.com/v");
    eq(P.normalizeUrl("youtu.be/abc"), "https://youtu.be/abc");
});
test("normalizeUrl: recusa outros esquemas e opções disfarçadas", () => {
    ["file:///C:/Windows/win.ini", "javascript:alert(1)", "data:text/html,x", "ftp://x.com/a",
        "-o", "--exec", "--exec=calc", "-x.com/a", "https://", "\\\\servidor\\pasta", "C:\\video.mp4", "texto qualquer"]
        .forEach((u) => eq(P.normalizeUrl(u), null, u));
});
test("parseUrls: separa válidos e inválidos", () => {
    const r = P.parseUrls("  https://a.com/1\nlixo  youtu.be/x --exec  ");
    eq(r.valid, ["https://a.com/1", "https://youtu.be/x"]);
    eq(r.invalid, ["lixo", "--exec"]);
});

// ---------------------------------------------------------------------------------
// Download das ferramentas

test("isAllowedUrl: só HTTPS do GitHub", () => {
    ok(T._isAllowedUrl("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"));
    ok(T._isAllowedUrl("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"));
    ok(T._isAllowedUrl("https://objects.githubusercontent.com/x"));
    ok(T._isAllowedUrl("https://release-assets.githubusercontent.com/x"));
    ["http://github.com/x", "https://github.com.evil.com/x", "https://evilgithub.com/x",
        "https://githubusercontent.com.evil.com/x", "file:///C:/x", "nada"]
        .forEach((u) => ok(!T._isAllowedUrl(u), "deveria recusar " + u));
});
test("expectedHash: lista de SHA-256 (yt-dlp / FFmpeg-Builds)", () => {
    const h1 = "a".repeat(64), h2 = "B".repeat(64);
    const text = h1 + "  yt-dlp\n" + h2 + " *yt-dlp.exe\n" + "c".repeat(64) + "  yt-dlp.exe.zip\n";
    eq(T._expectedHash(text, "yt-dlp.exe"), "b".repeat(64));
    eq(T._expectedHash(text, "outro.exe"), null);
});
test("expectedHash: arquivo de um pacote só (Deno, formato do Get-FileHash)", () => {
    const h = "0123456789ABCDEF".repeat(4);
    const text = "\r\nAlgorithm : SHA256\r\nHash      : " + h + "\r\nPath      : C:\\a\\deno.zip\r\n";
    eq(T._expectedHash(text, "deno-x86_64-pc-windows-msvc.zip", true), h.toLowerCase());
    eq(T._expectedHash(text, "deno.zip", false), null, "sem singleHash não aceita");
    eq(T._expectedHash(h + "\n" + h.replace("0", "1"), "x", true), null, "dois hashes: ambíguo");
});
test("config: toda ferramenta tem download e SHA-256 no GitHub", () => {
    Object.keys(ctx.HDL_CONFIG.TOOLS).forEach((k) => {
        const t = ctx.HDL_CONFIG.TOOLS[k];
        ok(T._isAllowedUrl(t.url), k + " url");
        ok(T._isAllowedUrl(t.sumsUrl), k + " sumsUrl");
    });
});
test("searchDirs: ignora entradas relativas do PATH", () => {
    const old = process.env.PATH;
    try {
        process.env.PATH = [".", "relativo\\pasta", "C:\\Windows\\System32"].join(path.delimiter);
        const dirs = T._searchDirs();
        ok(!dirs.some((d) => d === "." || d.indexOf("relativo") === 0), JSON.stringify(dirs));
        ok(dirs.indexOf("C:\\Windows\\System32") >= 0, "a absoluta fica");
    } finally {
        process.env.PATH = old;
    }
});

// ---------------------------------------------------------------------------------
// Argumentos do yt-dlp (sem rodar nada: o spawn é trocado por um falso)

function fakeSpawn(record) {
    return function (cmd, args) {
        record.push({ cmd, args });
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = () => {};
        setTimeout(() => { child.stdout.end(); child.stderr.end(); child.emit("close", 1); }, 5);
        return child;
    };
}

test("download: '--' antes da URL e opções de segurança", () => {
    const calls = [];
    const realSpawn = T.spawnTool, realY = T.state.ytdlp;
    T.spawnTool = fakeSpawn(calls);
    T.state.ytdlp = { cmd: "yt-dlp.exe", base: [], version: "2025.12.01" };
    try {
        const opts = { content: "both", quality: "1080", mode: "remux", container: "mp4", cookies: "", playlist: false, trim: false };
        const h = D.download("https://exemplo.com/v?a=1&b=2", opts, path.join(TMP, "dl"), { onProgress() {}, onLog() {} });
        h.promise.catch(() => {});
        const a = calls[0].args;
        eq(a.slice(-2), ["--", "https://exemplo.com/v?a=1&b=2"], "fim dos argumentos");
        ["--ignore-config", "--windows-filenames", "--no-playlist"].forEach((x) => ok(a.indexOf(x) >= 0, "falta " + x));
        eq(a[a.indexOf("--encoding") + 1], "utf-8");
        eq(a[a.indexOf("-P") + 1], path.join(TMP, "dl"));
        const info = D.fetchInfo("https://exemplo.com/v", { cookies: "", playlist: false });
        info.promise.catch(() => {});
        eq(calls[1].args.slice(-2), ["--", "https://exemplo.com/v"], "prévia");
    } finally {
        T.spawnTool = realSpawn;
        T.state.ytdlp = realY;
    }
});
test("formatArgs: áudio em MP3", () => {
    eq(D._formatArgs({ content: "audio", audioFormat: "mp3" }), ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "320K"]);
});
test("parseTime: segundos e 00:01:30", () => {
    eq(D.parseTime("90"), 90);
    eq(D.parseTime("1:30"), 90);
    eq(D.parseTime("00:01:30"), 90);
    eq(D.parseTime(""), null);
    ok(isNaN(D.parseTime("abc")), "texto inválido");
});

// ---------------------------------------------------------------------------------
// Mensagens de erro

test("friendlyError: sem internet, site não suportado, login", () => {
    const net = T.NETWORK_MESSAGE;
    eq(D.friendlyError("Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>"), net);
    eq(D.friendlyError("Unable to download webpage: HTTPSConnection(host='x', port=443): Failed to resolve 'x'"), net);
    eq(D.friendlyError("Failed to establish a new connection: [WinError 10061] Nenhuma conexão pôde ser feita"), net);
    eq(D.friendlyError("getaddrinfo ENOTFOUND github.com"), net);
    ok(/não é suportado/.test(D.friendlyError("Unsupported URL: https://example.com/")), "não suportado");
    ok(/Cookies do navegador/.test(D.friendlyError("Sign in to confirm you're not a bot")), "login");
    eq(D.friendlyError("Unable to download webpage: HTTP Error 404: Not Found"),
        "Unable to download webpage: HTTP Error 404: Not Found", "404 não vira dica de cookies");
});

// ---------------------------------------------------------------------------------
// Ponte painel -> Premiere (host/index.jsx rodando sobre a imitação da API)

function loadBridge(host, extensionPath) {
    const logs = [];
    const bctx = {
        window: { __adobe_cep__: {} }, SystemPath: { EXTENSION: "x" }, Promise, setTimeout, JSON,
        CSInterface: function () {
            this.evalScript = (s, cb) => {
                let o;
                try { o = String(vm.runInContext(s, host)); } catch (e) { o = "EvalScript error."; }
                setTimeout(() => cb(o), 0);
            };
            this.getSystemPath = () => extensionPath;
        }
    };
    vm.createContext(bctx);
    vm.runInContext(fs.readFileSync(path.join(JS, "bridge.js"), "utf8"), bctx, { filename: "bridge.js" });
    bctx.HDLBridge.setLogger((l) => logs.push(l));
    return { B: bctx.HDLBridge, logs };
}

test("ponte: importa arquivos com nomes difíceis, sem duplicar", async () => {
    const proj = path.join(TMP, "Projeto D’Ávila 'x' 100% & ; 🎬");
    const dir = path.join(proj, "Helmet DL");
    fs.mkdirSync(dir, { recursive: true });
    const names = ["vídeo 剪辑 🎬.mp4", "a,b;c'd e.mp4", "linha\u2028sep.mp4", "${x}`); alert(1); x.mp4"];
    const files = names.map((n) => { const p = path.join(dir, n); fs.writeFileSync(p, "x"); return p; });
    const host = mock.makeContext(path.join(proj, "proj.prproj"));
    vm.createContext(host);
    vm.runInContext(fs.readFileSync(path.join(EXT, "host", "index.jsx"), "utf8").replace(/^\uFEFF/, ""), host);
    const { B } = loadBridge(host, EXT);

    const info = await B.call("hdl_getProjectInfo");
    eq(info.path, path.join(proj, "proj.prproj"));
    const list = files.map(encodeURIComponent).join(",");
    const r1 = await B.call("hdl_importFiles", [list, "Helmet DL"]);
    eq([r1.imported, r1.skipped, r1.bin], [4, 0, "Helmet DL"]);
    eq(host._imported.map((i) => i.path), files, "caminhos chegaram intactos");
    const r2 = await B.call("hdl_importFiles", [list, "Helmet DL"]);
    eq([r2.imported, r2.skipped], [0, 4], "segunda vez");
    eq(await B.hostVersion(), ctx.HDL_CONFIG.CLIENT_VERSION, "versão do host = versão do painel");
});
test("ponte: recusa função fora da lista e escapa U+2028", async () => {
    const host = mock.makeContext("");
    vm.createContext(host);
    const { B } = loadBridge(host, EXT);
    let msg = "";
    await B.call("app.quit", []).catch((e) => { msg = e.message; });
    ok(/não permitida/.test(msg), msg);
    eq(B._toScriptString("a\u2028b\u2029c\"d"), "\"a\\u2028b\\u2029c\\\"d\"");
});
test("ponte: host não carregado vira mensagem clara", async () => {
    const host = {};
    vm.createContext(host);
    const { B, logs } = loadBridge(host, path.join(TMP, "nao-existe"));
    let msg = "";
    await B.call("hdl_getProjectInfo").catch((e) => { msg = e.message; });
    ok(/reinstale a extensão/.test(msg), msg);
    ok(logs.some((l) => /EvalScript error/.test(l)), "detalhe técnico no log");
});

// ---------------------------------------------------------------------------------
// Versões e pacote

test("versão igual no manifest, no painel e no host", () => {
    const manifest = fs.readFileSync(path.join(EXT, "CSXS", "manifest.xml"), "utf8");
    const host = fs.readFileSync(path.join(EXT, "host", "index.jsx"), "utf8");
    const v = ctx.HDL_CONFIG.CLIENT_VERSION;
    eq(manifest.match(/ExtensionBundleVersion="([^"]+)"/)[1], v, "ExtensionBundleVersion");
    eq(manifest.match(/<Extension Id="[^"]+" Version="([^"]+)"/)[1], v, "Extension Version");
    eq(host.match(/HDL_HOST_VERSION = "([^"]+)"/)[1], v, "HDL_HOST_VERSION");
});
test("host/index.jsx salvo com BOM (acentos no ExtendScript)", () => {
    const b = fs.readFileSync(path.join(EXT, "host", "index.jsx"));
    eq([b[0], b[1], b[2]], [0xEF, 0xBB, 0xBF]);
});
test("nenhum innerHTML, eval ou new Function no painel", () => {
    fs.readdirSync(JS).filter((f) => f.endsWith(".js") && f !== "CSInterface.js").forEach((f) => {
        const src = fs.readFileSync(path.join(JS, f), "utf8").replace(/\/\/.*$/gm, "");
        ok(!/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|\beval\s*\(|new Function\s*\(/.test(src), f);
    });
    const html = fs.readFileSync(path.join(EXT, "client", "index.html"), "utf8");
    ok(!/<script[^>]+src="https?:/i.test(html), "script de CDN no index.html");
});

// ---------------------------------------------------------------------------------

(async () => {
    for (const [name, fn] of queue) {
        try {
            await fn();
            passed++;
            console.log("  ok   " + name);
        } catch (e) {
            failed++;
            console.log("  FALHOU " + name + "\n         " + e.message);
        }
    }
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log("\n" + passed + " passaram, " + failed + " falharam");
    process.exit(failed ? 1 : 0);
})();
