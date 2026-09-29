/* Modo de tela (celular / tablet / TV) — seletor VISÍVEL no canto superior
   direito, em todas as páginas. Ajusta o zoom dos textos/controles e guarda
   a escolha no aparelho (localStorage). Na tela cheia do jogo 5, o seletor
   entra junto para continuar acessível. */
(function () {
    "use strict";

    var SALVA = "sbc-modo-tela";
    var MODOS = [
        { id: "celular", icone: "📱", nome: "Celular" },
        { id: "tablet", icone: "📲", nome: "Tablet" },
        { id: "tv", icone: "📺", nome: "TV" }
    ];

    function ler() {
        try { return window.localStorage.getItem(SALVA) || ""; } catch (e) { return ""; }
    }

    function aplicar(m) {
        document.body.classList.remove("modo-celular", "modo-tv");
        if (m === "celular") document.body.classList.add("modo-celular");
        if (m === "tv") document.body.classList.add("modo-tv");
        if (window.Maquete3D && typeof Maquete3D.redimensionar === "function") {
            window.setTimeout(Maquete3D.redimensionar, 80);
        }
    }

    function guardar(m) {
        try { window.localStorage.setItem(SALVA, m); } catch (e) {}
        modoAtual = m || "tablet";
        aplicar(m);
        atualizar();
    }

    var estilo = document.createElement("style");
    estilo.textContent =
        "#sbc-modos{position:fixed;top:8px;right:8px;z-index:80;display:flex;gap:2px;" +
        "background:rgba(255,255,255,0.9);border:2px solid #bcd9c2;border-radius:999px;" +
        "padding:3px;box-shadow:0 2px 0 rgba(27,77,42,0.18);font-family:inherit;}" +
        "#sbc-modos button{border:0;background:transparent;border-radius:999px;" +
        "padding:6px 12px;font:inherit;font-size:0.75em;font-weight:800;color:#2f4a23;" +
        "line-height:1.2;cursor:pointer;-webkit-appearance:none;}" +
        "#sbc-modos button.ativo{background:#2e7a3a;color:#fff;}" +
        "@media (max-width:620px),(max-height:480px){#sbc-modos .rot{display:none;}" +
        "#sbc-modos button{padding:6px 8px;}}";
    document.head.appendChild(estilo);

    var barra = document.createElement("div");
    barra.id = "sbc-modos";
    var botaoDe = {};
    MODOS.forEach(function (m) {
        var b = document.createElement("button");
        b.type = "button";
        b.title = "Ver como " + m.nome.toLowerCase();
        b.appendChild(document.createTextNode(m.icone));
        var rot = document.createElement("span");
        rot.className = "rot";
        rot.textContent = " " + m.nome;
        b.appendChild(rot);
        b.addEventListener("click", function () { guardar(m.id); });
        barra.appendChild(b);
        botaoDe[m.id] = b;
    });

    function atualizar() {
        MODOS.forEach(function (m) {
            botaoDe[m.id].classList.toggle("ativo", m.id === modoAtual);
        });
    }

    /* na tela cheia, o seletor mora dentro da cena p/ continuar visível */
    function encaixeTelaCheia() {
        var fs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        if (fs) { fs.appendChild(barra); } else { document.body.appendChild(barra); }
    }
    document.addEventListener("fullscreenchange", encaixeTelaCheia);
    document.addEventListener("webkitfullscreenchange", encaixeTelaCheia);

    var modoAtual = ler() || "tablet";
    aplicar(modoAtual);
    atualizar();
    document.body.appendChild(barra);
    encaixeTelaCheia();
})();