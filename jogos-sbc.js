/* ============================================================
   Utilidades compartilhadas dos jogos SBC – Soja Baixo Carbono
   Ranking em localStorage (kiosk do estande), modal touch,
   confete e sons simples via WebAudio. 100% offline.
   ============================================================ */

var SBCH = (function () {
    "use strict";

    /* ---------- Ranking (por dispositivo, no kiosk) ---------- */

    function chave(jogo) {
        return "sbc_ranking_" + jogo;
    }

    function carregarRanking(jogo) {
        try {
            return JSON.parse(localStorage.getItem(chave(jogo))) || [];
        } catch (e) {
            return [];
        }
    }

    /* Adiciona uma pontuação e devolve a posição (1 = melhor). */
    function registrar(jogo, nome, valor, melhorMaior) {
        var lista = carregarRanking(jogo);
        lista.push({ nome: nome || "Visitante", valor: valor });
        lista.sort(function (a, b) {
            return melhorMaior ? b.valor - a.valor : a.valor - b.valor;
        });
        lista = lista.slice(0, 5);
        try {
            localStorage.setItem(chave(jogo), JSON.stringify(lista));
        } catch (e) { /* kiosk sem storage: ranking só na sessão */ }
        var pos = lista.findIndex(function (e2) {
            return e2.valor === valor && e2.nome === (nome || "Visitante");
        });
        return pos + 1;
    }

    function desenharRanking(el, jogo, sufixo) {
        var lista = carregarRanking(jogo);
        if (!lista.length) {
            el.innerHTML = '<li class="vazio-rank">Seja o primeiro a pontuar!</li>';
            return;
        }
        el.innerHTML = "";
        var medalhas = ["🥇", "🥈", "🥉", "4º", "5º"];
        lista.forEach(function (item, i) {
            var li = document.createElement("li");
            if (i === 0) li.className = "primeiro";
            li.innerHTML =
                '<span class="nome-rank">' + medalhas[i] + " " + escapar(item.nome) + "</span>" +
                '<span class="valor-rank">' + item.valor + (sufixo || "") + "</span>";
            el.appendChild(li);
        });
    }

    function escapar(t) {
        var d = document.createElement("div");
        d.textContent = t;
        return d.innerHTML;
    }

    /* Modal touch para pedir o nome do visitante. */
    function pedirNomeESalvar(jogo, valor, melhorMaior, aoSalvar) {
        var fundo = document.createElement("div");
        fundo.className = "modal-fundo";
        fundo.innerHTML =
            '<div class="modal-caixa">' +
            "<h3>🏅 Registrado no ranking!</h3>" +
            '<p class="sub">Deixe seu nome ou o nome da fazenda:</p>' +
            '<input id="sbc-nome" maxlength="22" placeholder="Seu nome / fazenda">' +
            '<button class="botao" id="sbc-nome-ok">Salvar</button>' +
            "</div>";
        document.body.appendChild(fundo);
        var campo = fundo.querySelector("#sbc-nome");
        campo.focus();
        function confirmar() {
            var nome = campo.value.trim() || "Visitante";
            fundo.remove();
            var pos = registrar(jogo, nome, valor, melhorMaior);
            if (aoSalvar) aoSalvar(pos);
        }
        fundo.querySelector("#sbc-nome-ok").addEventListener("click", confirmar);
        campo.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") confirmar();
        });
    }

    /* ---------- Efeitos ---------- */

    function confete(cores) {
        cores = cores || ["#2e7d32", "#e5a812", "#43a047", "#123a5f"];
        var dourado = ["🎉", "🌱", "⭐"];
        for (var i = 0; i < 28; i++) {
            var p = document.createElement("div");
            p.className = "confete";
            p.style.left = Math.random() * 100 + "vw";
            p.style.background = cores[i % cores.length];
            p.style.animationDelay = (Math.random() * 0.4) + "s";
            if (i % 7 === 0) {
                p.style.background = "transparent";
                p.textContent = dourado[i % 3];
                p.style.fontSize = "1.3em";
            }
            document.body.appendChild(p);
            setTimeout(function (n) { return function () { n.remove(); }; }(p), 2400);
        }
    }

    var ctxAudio = null;
    function som(tipo) {
        try {
            ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
            var osc = ctxAudio.createOscillator();
            var ganho = ctxAudio.createGain();
            osc.connect(ganho);
            ganho.connect(ctxAudio.destination);
            var t = ctxAudio.currentTime;
            if (tipo === "acerto") {
                osc.frequency.setValueAtTime(660, t);
                osc.frequency.setValueAtTime(880, t + 0.12);
            } else if (tipo === "erro") {
                osc.frequency.setValueAtTime(220, t);
                osc.frequency.setValueAtTime(170, t + 0.14);
            } else {
                osc.frequency.setValueAtTime(520, t);
                osc.frequency.setValueAtTime(780, t + 0.18);
            }
            ganho.gain.setValueAtTime(0.08, t);
            ganho.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.32);
        } catch (e) { /* audio indisponível: segue sem som */ }
    }

    /* ---------- Extras ---------- */

    function embaralhar(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    /* Anima um número de um valor a outro (ease-out) com sufixo opcional. */
    function animarNumero(el, de, para, duracao, sufixo) {
        sufixo = sufixo || "";
        var inicio = null;
        duracao = duracao || 700;
        function passo(ts) {
            if (!inicio) inicio = ts;
            var f = Math.min(1, (ts - inicio) / duracao);
            var e = 1 - Math.pow(1 - f, 3); // ease-out cúbico
            var v = Math.round(de + (para - de) * e);
            el.textContent = v.toLocaleString("pt-BR") + sufixo;
            if (f < 1) requestAnimationFrame(passo);
        }
        requestAnimationFrame(passo);
    }

    return {
        carregarRanking: carregarRanking,
        registrar: registrar,
        desenharRanking: desenharRanking,
        pedirNomeESalvar: pedirNomeESalvar,
        confete: confete,
        som: som,
        embaralhar: embaralhar,
        animarNumero: animarNumero
    };
})();