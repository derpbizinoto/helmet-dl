# Backup — tema Frutiger Aero do Helmet DL

Cópia do visual "Frutiger Aero" (igual ao tema Frutiger Aero do Helmet Desk), guardada em 14/11/2026,
quando o Helmet DL passou a usar o tema Clássico.

O que tem aqui:

- `client/css/style.css` — CSS completo do tema (céu com aurora, vidro, botões em gel).
- `client/index.html` — o painel com o fundo da aurora (o bloco `<div class="backdrop">` com o SVG).

Logo (`client/img/logo.png`) e fontes (`client/fonts/`) são os mesmos nos dois temas e continuam na extensão.

## Como restaurar

1. Copie `client/css/style.css` deste backup para `premiere-helmet-dl/client/css/style.css`.
2. Em `premiere-helmet-dl/client/index.html`, cole o bloco `<div class="backdrop" ...> ... </div>`
   deste backup logo depois de `<body>` (ou copie o `index.html` inteiro, se não tiver mudado mais nada nele).
3. Reinstale (`instalar.bat`) e reinicie o Premiere.
