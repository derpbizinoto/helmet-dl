// tests/premiere-mock.js
// Imitação MÍNIMA da API do Premiere (app.project, bins, importFiles, File) para
// rodar o host/index.jsx no Node, fora do Premiere. Só cobre o que os testes usam.
// Não substitui o teste manual no Premiere (roteiro: git show dd621c3:TESTES.md).

"use strict";

const fs = require("fs");
const path = require("path");

const BIN = 2;
const CLIP = 1;

function collection(arr) {
    Object.defineProperty(arr, "numItems", { get() { return arr.length; } });
    return arr;
}

class ProjectItem {
    constructor(name, type, mediaPath) {
        this.name = name;
        this.type = type;
        this.mediaPath = mediaPath || "";
        this.children = collection([]);
    }
    getMediaPath() { return this.mediaPath; }
    createBin(name) {
        const b = new ProjectItem(name, BIN);
        this.children.push(b);
        return b;
    }
}

// projectPath: caminho do .prproj ("" = projeto nunca salvo)
function makeContext(projectPath) {
    const root = new ProjectItem("root", BIN);
    const imported = [];
    const project = {
        path: projectPath || "",
        name: projectPath ? path.basename(projectPath) : "Sem título",
        rootItem: root,
        importFiles(paths, suppressUI, target, asStills) {
            paths.forEach((p) => {
                imported.push({ path: p, bin: target.name });
                target.children.push(new ProjectItem(path.basename(p), CLIP, p));
            });
            return true;
        }
    };

    class File {
        constructor(p) { this.p = String(p); }
        get exists() { return fs.existsSync(this.p); }
        get fsName() { return path.resolve(this.p); }
    }

    return {
        app: { project },
        File,
        ProjectItemType: { BIN, CLIP },
        $: { os: "Windows 10" },
        decodeURIComponent,
        encodeURIComponent,
        _imported: imported,
        _root: root
    };
}

module.exports = { makeContext };
