// client/js/config.js — Helmet DL
// Constantes do painel num lugar só. Carregado antes de todos os outros scripts.
//
// Mapa dos arquivos do painel (na ordem em que o index.html carrega):
//   config.js      este arquivo: constantes + logger de depuração (HDLLog)
//   i18n.js        idioma do painel (inglês ou português) e as traduções (HDLI18n)
//   bridge.js      ponte única painel -> Premiere (HDLBridge)
//   tools.js       acha, instala e atualiza yt-dlp/FFmpeg/Deno; roda processos (HDLTools)
//   downloader.js  comandos do yt-dlp e do FFmpeg, progresso, reencode, GPU (HDLDownloader)
//   ui.js          elementos da tela, status, log, opções salvas (HDLUi)
//   project.js     projeto do Premiere e pasta "Helmet DL" (HDLProject)
//   preview.js     validação dos links e prévia (HDLPreview)
//   tools-ui.js    card Ferramentas, instalação e atualização automática (HDLToolsUI)
//   clipboard.js   botão de colar (HDLClipboard)
//   queue.js       fila de downloads e barra fixa do rodapé (HDLQueue)
//   main.js        eventos e início

var HDL_CONFIG = (function () {
    var isWin = typeof process !== "undefined" && process.platform === "win32";
    var arm64 = typeof process !== "undefined" && process.arch === "arm64";

    var YTDLP_RELEASE = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
    var FFMPEG_RELEASE = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/";
    var DENO_RELEASE = "https://github.com/denoland/deno/releases/latest/download/";

    var ytdlpAsset = isWin ? "yt-dlp.exe" : "yt-dlp_macos";
    var ffmpegAsset = "ffmpeg-master-latest-win64-gpl.zip"; // builds recomendados pelo próprio yt-dlp
    var denoAsset = isWin ? "deno-x86_64-pc-windows-msvc.zip"
        : (arm64 ? "deno-aarch64-apple-darwin.zip" : "deno-x86_64-apple-darwin.zip");

    return {
        // Deve ser igual à versão do manifest.xml e a HDL_HOST_VERSION em host/index.jsx
        // (o empacotar.ps1 confere).
        CLIENT_VERSION: "1.2.0",

        // Liga mensagens técnicas no console do painel (DevTools). Deixe false.
        DEBUG: false,

        // --- Projeto e Premiere ---------------------------------------------------
        FOLDER_NAME: "Helmet DL",   // pasta criada ao lado do .prproj
        BIN_NAME: "Helmet DL",      // bin no Project (quando a opção está ligada)

        // --- Configurações lembradas (localStorage) ------------------------------
        SETTINGS_KEY: "helmetdl.settings.v1",
        UPDATE_KEY: "helmetdl.lastUpdateCheck",
        PENDING_CLEANUP_KEY: "helmetdl.pendingCleanup", // download em andamento (para limpar se o painel fechar)
        AUTO_UPDATE_INTERVAL_MS: 20 * 60 * 60 * 1000, // confere o yt-dlp no máximo a cada 20 h

        // --- Interface --------------------------------------------------------------
        PREVIEW_DELAY_MS: 650,        // espera depois de digitar antes de ler o link
        LOG_MAX_CHARS: 200000,        // acima disso o card Log é encurtado…
        LOG_KEEP_CHARS: 150000,       // …para este tamanho
        CLEANUP_DELAY_MS: 1500,       // espera o processo soltar os arquivos antes de limpar

        // --- yt-dlp -------------------------------------------------------------------
        // Nome do arquivo: título (até 120 bytes) + [id do vídeo].
        NAME_TEMPLATE: "%(title).120B [%(id)s]",
        CONCURRENT_FRAGMENTS: "4",

        // --- Tempos limite -----------------------------------------------------------
        TIMEOUT: {
            connect: 8 * 1000,            // conexão com cada IP do GitHub
            stalled: 60 * 1000,           // download de ferramenta parado sem receber dados
            psDownload: 30 * 60 * 1000,   // download pelo PowerShell (plano B)
            extract: 5 * 60 * 1000,       // extração do .zip
            update: 5 * 60 * 1000,        // yt-dlp -U / pip
            ytdlpVersion: 60 * 1000,      // yt-dlp --version (a 1ª execução do .exe é lenta)
            toolVersion: 20 * 1000,       // ffmpeg/deno --version
            gpuTest: 20 * 1000,           // encode de teste da GPU
            probe: 30 * 1000,             // ffprobe
            clipboard: 10 * 1000,         // ler a área de transferência pelo sistema
            clipboardApi: 1500            // API de área de transferência do navegador
        },

        // --- Ferramentas baixadas -------------------------------------------------
        // Cada uma só é usada se o SHA-256 do arquivo bater com o publicado pelo
        // projeto oficial na mesma release (sumsUrl). Downloads só por HTTPS e só de
        // servidores do GitHub (ver isAllowedUrl em tools.js).
        TOOLS: {
            ytdlp: {
                label: "yt-dlp",
                asset: ytdlpAsset,
                url: YTDLP_RELEASE + ytdlpAsset,
                sumsUrl: YTDLP_RELEASE + "SHA2-256SUMS"            // "<hash>  <arquivo>" por linha
            },
            ffmpeg: {
                label: "FFmpeg",
                asset: ffmpegAsset,
                url: FFMPEG_RELEASE + ffmpegAsset,
                sumsUrl: FFMPEG_RELEASE + "checksums.sha256"       // "<hash>  <arquivo>" por linha
            },
            deno: {
                label: "Deno",
                asset: denoAsset,
                url: DENO_RELEASE + denoAsset,
                sumsUrl: DENO_RELEASE + denoAsset + ".sha256sum",  // um arquivo por pacote
                singleHash: true
            }
        },
        YTDLP_LATEST_API: "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"
    };
})();

// Logger simples para mensagens técnicas. Desligado por padrão (HDL_CONFIG.DEBUG).
// O log que o usuário vê no painel é outro (HDLUi.appendLog).
var HDLLog = {
    debug: function () {
        if (!HDL_CONFIG.DEBUG || typeof console === "undefined") return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift("[Helmet DL]");
        console.log.apply(console, args);
    }
};
