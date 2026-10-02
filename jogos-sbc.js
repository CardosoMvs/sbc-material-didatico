/* ============================================================
   Utilidades compartilhadas dos jogos SBC – Soja Baixo Carbono
   Ranking em localStorage (kiosk do estande), modal touch,
   confete, sons arcade via WebAudio e juice (+pts flutuante).
   100% offline.
   ============================================================ */

var SBCH = (function () {
    "use strict";

    /* ---------- Ranking (por dispositivo e POR EVENTO, no kiosk) ----------

       A equipe nomeia cada evento (feira, curso, oficina...); o ranking é
       guardado em "sbc_ranking_<evento>_<jogo>", então em tela só aparece a
       informação do evento atual. Sem evento nomeado, vale o ranking antigo
       (legado, "sbc_ranking_<jogo>"). */

    var K_EVT = "sbc_evento_atual"; // nome bonito do evento atual
    var K_EVTS = "sbc_eventos";     // lista de eventos deste aparelho

    function slug(t) {
        try {
            t = (t || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        } catch (e) {
            t = (t || "").trim().toLowerCase();
        }
        return t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28);
    }

    function eventoAtual() {
        try { return localStorage.getItem(K_EVT) || ""; } catch (e) { return ""; }
    }

    function listaEventos() {
        try { return JSON.parse(localStorage.getItem(K_EVTS)) || []; } catch (e) { return []; }
    }

    function chave(jogo) {
        var e = slug(eventoAtual());
        if (!e) return "sbc_ranking_" + jogo; // sem evento: ranking legado
        return "sbc_ranking_" + e + "_" + jogo;
    }

    /* Equipe: define o evento atual (nome novo cria um ranking novo; nome
       em branco volta ao ranking legado). Sem tela: apagarEvento remove. */
    function definirEvento(nome) {
        nome = (nome || "").trim();
        var s = slug(nome);
        try {
            if (s) {
                localStorage.setItem(K_EVT, nome);
                var l = listaEventos();
                if (l.indexOf(nome) < 0) {
                    l.push(nome);
                    localStorage.setItem(K_EVTS, JSON.stringify(l));
                }
            } else {
                localStorage.removeItem(K_EVT);
            }
        } catch (e) { /* kiosk sem storage: ranking só na sessão */ }
        return eventoAtual();
    }

    /* Apaga um evento E TODO o ranking dele. */
    function apagarEvento(nome) {
        var s = slug(nome), rem = [];
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (s && k.indexOf("sbc_ranking_" + s + "_") === 0) rem.push(k);
            }
            rem.forEach(function (k) { localStorage.removeItem(k); });
            if (rem.length) { // limpa lembrança só se tinha ranking
                localStorage.setItem(K_EVTS, JSON.stringify(listaEventos().filter(function (x) { return slug(x) !== s; })));
                if (slug(eventoAtual()) === s) localStorage.removeItem(K_EVT);
            }
        } catch (e) { /* kiosk sem storage: ranking só na sessão */ }
        return true;
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
        var medalhas = ["1º", "2º", "3º", "4º", "5º"];
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

    /* Modal touch para pedir o nome do visitante — o X fecha SEM informar
       (a pontuação só entra no ranking se o visitante salvar). */
    function pedirNomeESalvar(jogo, valor, melhorMaior, aoSalvar) {
        var fundo = document.createElement("div");
        fundo.className = "modal-fundo";
        fundo.innerHTML =
            '<div class="modal-caixa">' +
            '<button type="button" class="btn-fechar-x" id="sbc-nome-x" ' +
            'title="Não informar o nome" aria-label="Fechar sem informar o nome">✕</button>' +
            "<h3>Registrado no ranking!</h3>" +
            '<p class="sub">Deixe seu nome ou o nome da fazenda (opcional):</p>' +
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
        fundo.querySelector("#sbc-nome-x").addEventListener("click", function () {
            fundo.remove(); // não informou o nome: fecha sem salvar nada
        });
        campo.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") confirmar();
        });
    }

    /* ---------- Efeitos ---------- */

    function confete(cores) {
        cores = cores || ["#003c17", "#ffcc31", "#007f47", "#4495d1"];
        for (var i = 0; i < 40; i++) {
            var p = document.createElement("div");
            p.className = "confete";
            p.style.left = Math.random() * 100 + "vw";
            p.style.background = cores[i % cores.length];
            p.style.animationDelay = (Math.random() * 0.5) + "s";
            p.style.animationDuration = (1.5 + Math.random() * 0.9) + "s";
            document.body.appendChild(p);
            setTimeout(function (n) { return function () { n.remove(); }; }(p), 2600);
        }
    }

    var ctxAudio = null;

    /* Sons arcade: acerto (arpejo sobe), erro (buzz desce),
       clique (tique curto) e vitoria (fanfarra de 4 notas). */
    function som(tipo) {
        try {
            ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
            if (ctxAudio.state === "suspended") ctxAudio.resume();
            var notas;
            var durNota = 0.22;
            var volume = 0.07;
            var pausa = 0.09;
            if (tipo === "acerto") notas = [660, 880];
            else if (tipo === "erro") notas = [220, 170];
            else if (tipo === "clique") { notas = [480]; durNota = 0.06; volume = 0.03; pausa = 0; }
            else notas = [523, 659, 784, 1047]; // vitoria
            var t = ctxAudio.currentTime;
            notas.forEach(function (freq, i) {
                var osc = ctxAudio.createOscillator();
                var ganho = ctxAudio.createGain();
                osc.connect(ganho);
                ganho.connect(ctxAudio.destination);
                var t0 = t + i * pausa;
                osc.frequency.setValueAtTime(freq, t0);
                ganho.gain.setValueAtTime(volume, t0);
                ganho.gain.exponentialRampToValueAtTime(0.001, t0 + durNota);
                osc.start(t0);
                osc.stop(t0 + durNota + 0.02);
            });
        } catch (e) { /* audio indisponível: segue sem som */ }
    }

    /* Clique com som em qualquer controle de jogo — vale para
       todos os jogos, sem editar a lógica de cada um. */
    document.addEventListener("click", function (ev) {
        var alvo = ev.target.closest(".botao, .opcao, .carta, .menu-item, .voltar, .btn-5050, .btn-dica");
        if (alvo && !alvo.disabled) som("clique");
    }, true);

    /* "+X pts" flutuando a partir de um elemento do placar. */
    function popupPontos(el, texto) {
        try {
            var r = el.getBoundingClientRect();
            var s = document.createElement("div");
            s.className = "pontos-flutuante";
            s.textContent = texto;
            s.style.left = (r.left + r.width / 2) + "px";
            s.style.top = (r.top + r.height / 2) + "px";
            document.body.appendChild(s);
            setTimeout(function () { s.remove(); }, 1100);
        } catch (e) { /* sem layout: ignora */ }
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
        slug: slug,
        eventoAtual: eventoAtual,
        listaEventos: listaEventos,
        definirEvento: definirEvento,
        apagarEvento: apagarEvento,
        confete: confete,
        som: som,
        popupPontos: popupPontos,
        embaralhar: embaralhar,
        animarNumero: animarNumero
    };
})();