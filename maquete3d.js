/* ============================================================
   maquete3d.js — Diorama Three.js da Maquete da Fazenda (SBC)
   Requer three.min.js e OrbitControls.js (builds globais r128).

   Desenho 3D-nativo: uma ilha de fazenda com corte de terra em
   camadas, terreno esculpido (morros, calhas de rio), cores por
   vértice no solo, plantio seguindo curvas de nível reais e
   iluminação de sol com sombras suaves.

   API:
     Maquete3D.init({ container, ano, aoMarcar })  → true/false
     Maquete3D.trocarAno(1|2|3)
     Maquete3D.info() → contagens para depuração
   aoMarcar(dados) recebe por quadro: { id: { x, y, visivel } }
   ============================================================ */
var Maquete3D = (function () {
    "use strict";

    /* ====================== dimensões do mundo ====================== */
    var ILHA_W = 40, ILHA_D = 26;              // extensão x e z da ilha

    /* rios: polilinhas que serpenteiam e escavam o terreno
       (extremos dentro da silhueta arredondada da ilha) */
    var RIO_ESQ_PTS = [[-17.2, -11.8], [-15.5, -7], [-17, -1], [-14.5, 4], [-16, 8.5], [-15, 11.8]];
    var RIO_DIR_PTS = [[18.4, -6.5], [17, -1.5], [18.3, 3.5], [16.8, 8], [17.6, 12.2]];

    /* caminhos de terra (polilinhas) */
    var CAMINHOS = [
        [[-1.2, 12.3], [1.5, 9], [-0.6, 4], [0.8, 0], [0, -4], [0.4, -8.6]],
        [[-4.6, 12.3], [-4.2, 6], [-4.8, 0], [-4.4, -5]],
        [[4.9, 12.3], [4.5, 6], [5.1, 0], [4.7, -5]]
    ];

    /* talhões (retângulos em x/z) */
    var T1 = { x0: -13, x1: -4.8, z0: -5.2, z1: 9.4 };
    var T2 = { x0: -4.0, x1: 4.4, z0: -5.2, z1: 9.4 };
    var T3 = { x0: 5.4, x1: 12.2, z0: -5.2, z1: 9.4 };
    var PASTO = { x0: 8.4, x1: 12.4, z0: -7.4, z1: -5.4 };
    var RL = { x0: 6.5, z0: -13, x1: 20, z1: -8 };
    var SEDE = { x: 0.6, z: -9.6 };

    /* morros do Talhão 2 (centro, altura, abertura) */
    var MORROS = [
        { cx: 0.2, cz: 0.8, a: 2.0, s: 2.6 },
        { cx: 2.2, cz: 4.2, a: 1.25, s: 2.0 }
    ];

    var NIVEL_AGUA = -0.45;

    /* ====================== utilidades ====================== */
    function rng(seed) {
        return function () {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };
    }
    function ruido(x, z) {           // hash determinístico 0..1
        var s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
        return s - Math.floor(s);
    }
    function noRect(r, x, z) { return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; }
    function dentro(p, margem, x, z) {
        return x >= p[0] - margem && x <= p[0] + margem && z >= p[1] - margem && z <= p[1] + margem;
    }

    var renderer, scene, camera, controls, container, opts;
    var gCena, gAno, gVida;
    var terreno, aguaGeoInfo = [];
    var rioCurvaEsq, rioCurvaDir;
    var rioAmoEsq = [], rioAmoDir = [], caminhoAmo = [];
    var drone, rotores = [], vacas = [], aves = [], borboletas = [], abelhas = [], nuvens = [];
    var espuma = [];                 // espuma dos rios: { mesh, t, curva, vel }
    var tGlobal = 0, relogio;
    var posFixas = {};
    var MAT = {};                     // cache de materiais por cor

    function mat(cor) {
        if (!MAT[cor]) MAT[cor] = new THREE.MeshLambertMaterial({ color: cor });
        return MAT[cor];
    }
    function matPlano(cor) {
        var chave = "p" + cor;
        if (!MAT[chave]) MAT[chave] = new THREE.MeshLambertMaterial({ color: cor, side: THREE.DoubleSide });
        return MAT[chave];
    }

    /* ====================== geometria dos rios ====================== */
    function curvaDe(pontos) {
        return new THREE.CatmullRomCurve3(pontos.map(function (p) {
            return new THREE.Vector3(p[0], 0, p[1]);
        }));
    }
    function amostrar(curva, n) {
        var pts = curva.getPoints(n), saida = [];
        for (var i = 0; i < pts.length; i++) saida.push([pts[i].x, pts[i].z]);
        return saida;
    }
    function distAte(amostras, x, z) {
        var m = 1e9;
        for (var i = 0; i < amostras.length; i++) {
            var dx = amostras[i][0] - x, dz = amostras[i][1] - z;
            var d = dx * dx + dz * dz;
            if (d < m) m = d;
        }
        return Math.sqrt(m);
    }

    /* ====================== relevo ====================== */
    function altura(x, z) {
        var y = 0.28 * Math.sin(x * 0.32 + 1.7) * Math.cos(z * 0.38 + 0.4)
              + 0.2 * Math.sin(z * 0.5 + 2.1) * Math.sin(x * 0.21 + 0.6);
        for (var i = 0; i < MORROS.length; i++) {
            var m = MORROS[i];
            var dx = x - m.cx, dz = z - m.cz;
            y += m.a * Math.exp(-(dx * dx + dz * dz) / (2 * m.s * m.s));
        }
        /* patamar da Reserva Legal */
        var rx = x - 12.5, rz = z + 10.5;
        y += 0.55 * Math.exp(-(rx * rx + rz * rz) / (2 * 5.5 * 5.5));
        /* calhas escavadas pelos rios */
        var d = Math.min(distAte(rioAmoEsq, x, z), distAte(rioAmoDir, x, z));
        y -= 1.25 * Math.exp(-(d * d) / (2 * 1.5 * 1.5));
        return y;
    }

    /* ====================== cores do solo por ano ====================== */
    var COR_T1 = [0xa3814f, 0xb3a05e, 0xc2ad66];
    var COR_T2 = [0xb28c52, 0x7ba75d, 0x5f9a52];
    var COR_T3 = 0x4f9455;

    function corSolo(x, z, ano) {
        var dE = distAte(rioAmoEsq, x, z), dD = distAte(rioAmoDir, x, z);
        var c = 0x7cae62;                                   // campo geral
        var k, dC;
        if (dE < 1.35) c = 0x6d5a3c;                        // leito do rio esquerdo
        else if (dE < 3.4) c = 0xb9a06b;                    // margem da APP degradada
        if (dD < 1.35) c = 0x57683f;                        // leito do rio direito
        else if (dD < 3.4 && c === 0x7cae62) c = 0x3e7d46;   // faixa da APP preservada
        for (k = 0; k < CAMINHOS.length; k++) {             // caminhos de terra
            dC = distAte(caminhoAmo[k], x, z);
            if (dC < 0.9) c = 0xcbb98e;
        }
        if (noRect(T1, x, z)) c = COR_T1[ano - 1];
        else if (noRect(T2, x, z)) c = COR_T2[ano - 1];
        else if (noRect(T3, x, z)) c = COR_T3;
        else if (x >= RL.x0 && z <= RL.z1 && z >= RL.z0) c = 0x2e6b35;   // Reserva Legal
        else if (noRect(PASTO, x, z)) c = 0x7fb45e;                      // pasto
        else if (dentro([SEDE.x, SEDE.z], 2.6, x, z)) c = 0x9cb56f;      // quintal da sede
        return c;
    }

    function pintarTerreno(ano) {
        var pos = terreno.geometry.attributes.position;
        var cores = terreno.geometry.attributes.color;
        var c = new THREE.Color(), v = new THREE.Color();
        for (var i = 0; i < pos.count; i++) {
            var x = pos.getX(i), z = pos.getZ(i);
            c.setHex(corSolo(x, z, ano));
            var n = (ruido(x * 3.1, z * 2.7) - 0.5) * 0.09;
            v.setRGB(
                Math.max(0, c.r + n),
                Math.max(0, c.g + n),
                Math.max(0, c.b + n * 0.8)
            );
            cores.setXYZ(i, v.r, v.g, v.b);
        }
        cores.needsUpdate = true;
    }

    /* ====================== instâncias ====================== */
    var _mtx = new THREE.Matrix4(), _q = new THREE.Quaternion();
    var _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
    var _col = new THREE.Color();

    function instanciar(geo, cor, itens, sombra) {
        var m = new THREE.InstancedMesh(geo, mat(cor), itens.length);
        for (var i = 0; i < itens.length; i++) {
            var it = itens[i];
            _e.set(it.r ? it.r[0] : 0, it.r ? it.r[1] : 0, it.r ? it.r[2] : 0);
            _q.setFromEuler(_e);
            var sc = it.s || [1, 1, 1];
            _v.set(it.p[0], it.p[1], it.p[2]);
            _s.set(sc[0], sc[1], sc[2]);
            _mtx.compose(_v, _q, _s);
            m.setMatrixAt(i, _mtx);
        }
        m.instanceMatrix.needsUpdate = true;
        m.castShadow = sombra !== false;
        m.receiveShadow = true;
        return m;
    }

    function disposeGrupo(g) {
        g.traverse(function (o) {
            /* geometrias compartilhadas (GE.*) seguem vivas entre anos */
            if (o.geometry && !o.geometry.userData.compartilhada) o.geometry.dispose();
        });
        while (g.children.length) g.remove(g.children[0]);
    }

    /* geometrias de cultivo */
    var GE = null;
    function geos() {
        if (GE) return GE;
        GE = {
            tufo: new THREE.BoxGeometry(0.16, 0.34, 0.16),   // cultura
            capim: new THREE.ConeGeometry(0.07, 0.26, 4),    // braquiária
            palha: new THREE.PlaneGeometry(0.55, 0.26),       // palhada
            flor: new THREE.SphereGeometry(0.05, 6, 5),
            haste: new THREE.CylinderGeometry(0.02, 0.03, 0.5, 5),
            tronco: new THREE.CylinderGeometry(0.09, 0.13, 0.9, 6),
            copa: new THREE.IcosahedronGeometry(0.75, 0)
        };
        Object.keys(GE).forEach(function (k) { GE[k].userData.compartilhada = true; });
        return GE;
    }

    /* ====================== plantio ====================== */
    /* fileiras retas ao longo de z (morro abaixo quando cruzam o relevo) */
    function fileirasZ(r, passoR, passoT, cor, alturaT, escalaY) {
        var itens = [];
        for (var x = r.x0 + 0.4; x <= r.x1 - 0.4; x += passoR) {
            for (var z = r.z0 + 0.4; z <= r.z1 - 0.4; z += passoT) {
                itens.push({ p: [x, altura(x, z) + alturaT, z], s: [1, escalaY || 1, 1] });
            }
        }
        return { itens: itens, cor: cor };
    }

    /* fileiras onduladas ao longo de x (curvas de nível no plano) */
    function fileirasX(r, passoR, passoT, cor, alturaT, onda) {
        var itens = [];
        for (var z = r.z0 + 0.4; z <= r.z1 - 0.4; z += passoR) {
            for (var x = r.x0 + 0.4; x <= r.x1 - 0.4; x += passoT) {
                var zz = z + Math.sin(x * 0.5 + z) * (onda || 0.3);
                itens.push({ p: [x, altura(x, zz) + alturaT, zz] });
            }
        }
        return { itens: itens, cor: cor };
    }

    /* anéis de contorno ao redor dos morros — o plantio acompanha o relevo */
    function aneisContorno(m, cor, rMax) {
        var itens = [];
        for (var raio = 0.7; raio <= rMax; raio += 0.55) {
            for (var a = 0; a < Math.PI * 2; a += 0.26) {
                var x = m.cx + Math.cos(a) * raio;
                var z = m.cz + Math.sin(a) * raio * 0.85;
                if (!noRect(T2, x, z)) continue;
                itens.push({ p: [x, altura(x, z) + 0.15, z] });
            }
        }
        return { itens: itens, cor: cor };
    }

    function espalhar(r, qtd, cor, geoTipo, alturaT, seed) {
        var r2 = rng(seed), itens = [];
        for (var i = 0; i < qtd; i++) {
            var x = r.x0 + r2() * (r.x1 - r.x0);
            var z = r.z0 + r2() * (r.z1 - r.z0);
            var rot;
            if (geoTipo === "palha") {
                /* palhada deitada no solo, girada ao acaso */
                rot = [-Math.PI / 2 + (r2() - 0.5) * 0.5, 0, r2() * Math.PI];
            } else {
                rot = [(r2() - 0.5) * 0.3, r2() * Math.PI, (r2() - 0.5) * 0.3];
            }
            itens.push({ p: [x, altura(x, z) + alturaT, z], r: rot });
        }
        return { itens: itens, cor: cor, geo: geoTipo };
    }

    /* ====================== talhões por ano ====================== */
    function talhao1(ano) {
        var g = new THREE.Group();
        var linhas = [];
        var nLinhas = 0;
        for (var x = T1.x0 + 0.5; x <= T1.x1 - 0.5; x += 0.72, nLinhas++) {
            var milho = nLinhas % 5 === 4;
            for (var z = T1.z0 + 0.4; z <= T1.z1 - 0.4; z += 0.5) {
                linhas.push({
                    p: [x, altura(x, z) + 0.16, z],
                    s: [1, milho ? 1.9 : 1 + ano * 0.06, 1]
                });
            }
        }
        var soja = instanciar(GE.tufo, [0x79b25c, 0x4ea24f, 0x2f9e42][ano - 1], linhas);
        g.add(soja);
        /* milho amarelo por cima das fileiras altas: mesma malha, cor à parte */
        var milhoIt = [];
        nLinhas = 0;
        for (var x2 = T1.x0 + 0.5 + 0.72 * 4; x2 <= T1.x1 - 0.5; x2 += 0.72 * 5) {
            for (var z2 = T1.z0 + 0.4; z2 <= T1.z1 - 0.4; z2 += 0.5) {
                milhoIt.push({ p: [x2, altura(x2, z2) + 0.42, z2], s: [0.7, 0.55, 0.7] });
            }
        }
        g.add(instanciar(GE.tufo, 0x9ccc65, milhoIt));
        g.add(instanciar(GE.palha, 0xd9c27e, espalhar(T1, [130, 400, 850][ano - 1], 0xd9c27e, "palha", 0.05, 11 + ano).itens, false));
        return g;
    }

    function talhao2(ano) {
        var g = new THREE.Group();
        if (ano === 1) {
            g.add(instanciar(GE.tufo, 0xa8a05e, fileirasZ(T2, 0.75, 0.5, 0, 0.15).itens));
            /* ravinas esculpindo o morro + leques de sedimento */
            MORROS.forEach(function (m, mi) {
                var n = mi === 0 ? 2 : 1;
                for (var k = 0; k < n; k++) {
                    var lado = k === 0 ? 1 : -0.6;
                    var pts = [];
                    for (var t = 0; t <= 1.001; t += 0.1) {
                        var x = m.cx - t * m.s * 1.15 * lado;
                        var z = m.cz + t * m.s * 1.0;
                        pts.push(new THREE.Vector3(x, altura(x, z) + 0.06, z));
                    }
                    var ravina = new THREE.Mesh(
                        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.13, 6),
                        mat(0x6e4a26));
                    ravina.castShadow = true;
                    g.add(ravina);
                    var fx = m.cx - m.s * 1.15 * lado, fz = m.cz + m.s * 1.0;
                    var leque = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 0.1, 10), mat(0x8a5a33));
                    leque.position.set(fx, altura(fx, fz) + 0.08, fz);
                    leque.scale.set(1.4, 1, 0.9);
                    leque.receiveShadow = true;
                    g.add(leque);
                }
            });
            g.add(instanciar(GE.palha, 0xcbb26a, espalhar(T2, 60, 0xcbb26a, "palha", 0.04, 221).itens, false));
        } else {
            var corAnel = ano === 2 ? 0xb8cf9a : 0x67b26a;
            var corResta = ano === 2 ? 0xd9b64e : 0x2f7d3c;
            MORROS.forEach(function (m) {
                g.add(instanciar(GE.tufo, corAnel, aneisContorno(m, corAnel, m.s * 1.05).itens));
            });
            /* fileiras onduladas fora do raio dos morros */
            var itens = [];
            for (var z = T2.z0 + 0.4; z <= T2.z1 - 0.4; z += 0.72) {
                for (var x = T2.x0 + 0.4; x <= T2.x1 - 0.4; x += 0.5) {
                    var perto = MORROS.some(function (m2) {
                        var dx = x - m2.cx, dz = z - m2.cz;
                        return (dx * dx + dz * dz) < (m2.s * m2.s * 1.35);
                    });
                    if (perto) continue;
                    var zz = z + Math.sin(x * 0.5 + z) * 0.3;
                    itens.push({ p: [x, altura(x, zz) + 0.15, zz] });
                }
            }
            g.add(instanciar(GE.tufo, corResta, itens));
            if (ano === 3) {
                g.add(instanciar(GE.capim, 0x2f7d3c, espalhar(T2, 320, 0x2f7d3c, "capim", 0.12, 223).itens));
            }
            g.add(instanciar(GE.palha, 0xd9c27e, espalhar(T2, ano === 2 ? 280 : 520, 0xd9c27e, "palha", 0.05, 22 + ano).itens, false));
        }
        return g;
    }

    function talhao3(ano) {
        var g = new THREE.Group();
        /* braquiária densa + faixas em contorno */
        g.add(instanciar(GE.capim, 0x2f7d3c, espalhar(T3, 340, 0x2f7d3c, "capim", 0.12, 331).itens));
        g.add(instanciar(GE.tufo, 0x57b05c, fileirasX(T3, 0.8, 0.5, 0, 0.15, 0.3).itens));
        if (ano === 1) {
            g.add(instanciar(GE.flor, 0xe9c937, espalhar(T3, 90, 0xe9c937, "flor", 0.42, 332).itens, false));
        } else if (ano === 2) {
            var trigo = [];
            for (var z = T3.z0 + 1.2; z <= T3.z1 - 1; z += 1.5) {
                for (var x = T3.x0 + 0.5; x <= T3.x1 - 0.5; x += 0.55) {
                    var zz = z + Math.sin(x * 0.5 + z) * 0.3;
                    trigo.push({ p: [x, altura(x, zz) + 0.3, zz], s: [1, 0.9, 1] });
                }
            }
            g.add(instanciar(GE.haste, 0xd9b64e, trigo));
            g.add(instanciar(GE.haste, 0xc7d17e, espalhar(T3, 80, 0xc7d17e, "haste", 0.3, 333).itens));
        } else {
            var milho = espalhar(T3, 70, 0x6a9a3a, "haste", 0.55, 334);
            g.add(instanciar(GE.haste, 0x6a9a3a, milho.itens));
            var espigas = espalhar(T3, 70, 0xe6c84a, "flor", 0.85, 335);
            g.add(instanciar(GE.flor, 0xe6c84a, espigas.itens, false));
        }
        g.add(instanciar(GE.palha, 0xd9c27e, espalhar(T3, ano === 1 ? 150 : 240, 0xd9c27e, "palha", 0.05, 33 + ano).itens, false));
        return g;
    }

    /* lavoura invadindo a margem da APP degradada */
    function lavouraApp(ano) {
        var itens = [];
        var curva = rioCurvaEsq;
        for (var t = 0.25; t <= 0.85; t += 0.045) {
            var p = curva.getPointAt(t);
            var x = p.x + 2.1, z = p.z;
            for (var zz = z - 1.4; zz <= z + 1.4; zz += 0.55) {
                itens.push({ p: [x, altura(x, zz) + 0.14, zz] });
            }
        }
        return instanciar(GE.tufo, [0x79b25c, 0x4ea24f, 0x2f9e42][ano - 1], itens);
    }

    /* ====================== vida na cena ====================== */
    function montarVida(ano) {
        disposeGrupo(gVida);
        borboletas = []; abelhas = [];
        var geoAsa = new THREE.PlaneGeometry(0.34, 0.26);
        if (ano >= 2) {
            var cores = [0xf2b134, 0xe8788a, 0x7ec6e8, 0xf29134, 0xe8788a];
            for (var b = 0; b < 5; b++) {
                var g = new THREE.Group();
                var mA = new THREE.MeshLambertMaterial({ color: cores[b], side: THREE.DoubleSide });
                var a1 = new THREE.Mesh(geoAsa, mA), a2 = new THREE.Mesh(geoAsa, mA);
                a1.position.x = 0.17; a2.position.x = -0.17;
                var asa1 = new THREE.Group(); asa1.add(a1);
                var asa2 = new THREE.Group(); asa2.add(a2);
                g.add(asa1); g.add(asa2);
                g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.26), mat(0x3a2a1a)));
                g.userData = { asa1: asa1, asa2: asa2, f: b * 1.7, cx: 7.5 + b * 0.6, cz: 2 + b * 0.9, h: 1 + (b % 3) * 0.4 };
                borboletas.push(g);
                gVida.add(g);
            }
        }
        if (ano === 3) {
            var geoAb = new THREE.SphereGeometry(0.07, 6, 5);
            for (var ab = 0; ab < 5; ab++) {
                var z = new THREE.Mesh(geoAb, mat(0xf4c430));
                z.userData = { f: ab * 2.1, cx: 8.5 + ab * 0.4, cz: 4 + ab * 0.5, h: 0.8 };
                abelhas.push(z);
                gVida.add(z);
            }
        }
    }

    function montarAno(ano) {
        disposeGrupo(gAno);
        gAno.add(talhao1(ano));
        gAno.add(talhao2(ano));
        gAno.add(talhao3(ano));
        gAno.add(lavouraApp(ano));
        pintarTerreno(ano);
        montarVida(ano);
    }

    /* ====================== cenário fixo ====================== */
    function arvoresEstaticas() {
        var troncos = [], copas = [];
        function addArvore(x, z, esc, paleta) {
            var y = altura(x, z);
            troncos.push({ p: [x, y + 0.45 * esc, z], s: [esc, esc, esc] });
            copas.push({ p: [x, y + 1.05 * esc, z], s: [esc, esc * 0.95, esc], c: paleta[0] });
            copas.push({ p: [x + 0.34 * esc, y + 0.8 * esc, z + 0.24 * esc], s: [esc * 0.62, esc * 0.6, esc * 0.62], c: paleta[1] });
            copas.push({ p: [x - 0.3 * esc, y + 0.86 * esc, z - 0.2 * esc], s: [esc * 0.55, esc * 0.55, esc * 0.55], c: paleta[2] });
        }
        var PAL = {
            rl: [[0x1f5c2a, 0x2e7a3a, 0x3f9448], [0x266b30, 0x357f3c, 0x4a9c50]],
            app: [[0x2a6e34, 0x38853f, 0x4c9a4e], [0x1f5c2a, 0x2e7a3a, 0x3f9448]],
            solta: [[0x2f7a3a, 0x3c9448, 0x56ad57], [0x35703a, 0x43884a, 0x58a75c]],
            seca: [[0x5d7a44, 0x6e8f52, 0x7fa05f]]
        };
        var r2 = rng(9090);
        /* Reserva Legal — floresta madura */
        for (var i = 0; i < 36; i++) {
            addArvore(7.2 + r2() * 11.5, -12.4 + r2() * 3.7, 1.0 + r2() * 0.7, PAL.rl[i % 2]);
        }
        /* APP preservada — faixa densa junto ao rio direito */
        for (var t = 0.05; t <= 1; t += 0.055) {
            var p = rioCurvaDir.getPointAt(t);
            addArvore(p.x - 2.0 - r2() * 0.8, p.z + (r2() - 0.5) * 0.8, 0.75 + r2() * 0.55, PAL.app[(i++) % 2]);
        }
        /* APP degradada — rala e sofrida */
        for (var t2 = 0.15; t2 <= 0.95; t2 += 0.16) {
            var p2 = rioCurvaEsq.getPointAt(t2);
            if (r2() < 0.5) continue;
            addArvore(p2.x + 2.3 + r2() * 0.6, p2.z + (r2() - 0.5) * 1.2, 0.5 + r2() * 0.25, PAL.seca[0]);
        }
        /* árvores soltas: sede e cantos do campo */
        [[-2.6, -8.2, 1.1], [3.4, -8.4, 0.9], [-16.5, 10.5, 1.0], [-11, 11.2, 0.9],
         [13.6, 10.8, 1.0], [-18.5, -3, 0.9], [15.2, -4.6, 1.0]].forEach(function (a, k) {
            addArvore(a[0], a[1], a[2], PAL.solta[k % 2]);
        });
        gCena.add(instanciar(GE.tronco, 0x6b4a2b, troncos));
        /* copas com cor por instância */
        var copaM = new THREE.InstancedMesh(GE.copa,
            new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 4 }),
            copas.length);
        for (var c = 0; c < copas.length; c++) {
            var it = copas[c];
            _q.setFromEuler(_e.set(0, ruido(it.p[0], it.p[2]) * 3, 0));
            _v.set(it.p[0], it.p[1], it.p[2]);
            _s.set(it.s[0], it.s[1], it.s[2]);
            _mtx.compose(_v, _q, _s);
            copaM.setMatrixAt(c, _mtx);
            copaM.setColorAt(c, _col.set(it.c));
        }
        copaM.instanceMatrix.needsUpdate = true;
        if (copaM.instanceColor) copaM.instanceColor.needsUpdate = true;
        copaM.castShadow = true; copaM.receiveShadow = true;
        gCena.add(copaM);
        return { troncos: troncos.length, copas: copas.length };
    }

    function montarAgua() {
        function fita(curva, cor, opac, largura) {
            var N = 70, posArr = [], idx = [];
            for (var i = 0; i <= N; i++) {
                var t = i / N;
                var p = curva.getPointAt(t);
                var tg = curva.getTangentAt(t);
                var nx = -tg.z, nz = tg.x;
                var l = Math.sqrt(nx * nx + nz * nz) || 1;
                nx /= l; nz /= l;
                posArr.push(p.x + nx * largura, NIVEL_AGUA, p.z + nz * largura);
                posArr.push(p.x - nx * largura, NIVEL_AGUA, p.z - nz * largura);
                if (i < N) {
                    var b = i * 2;
                    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
                }
            }
            var geo = new THREE.BufferGeometry();
            geo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
            geo.setIndex(idx);
            geo.computeVertexNormals();
            var m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
                color: cor, transparent: true, opacity: opac, shininess: 130, specular: 0xbfe3f2
            }));
            m.receiveShadow = true;
            return m;
        }
        gCena.add(fita(rioCurvaEsq, 0x8a7448, 0.92, 1.35));
        gCena.add(fita(rioCurvaDir, 0x3f96c9, 0.88, 1.2));
        /* espuma correndo rio abaixo */
        var geoEsp = new THREE.BoxGeometry(0.3, 0.03, 0.09);
        function espumas(curva, cor, n, vel) {
            for (var i = 0; i < n; i++) {
                var e = new THREE.Mesh(geoEsp, mat(cor));
                espuma.push({ mesh: e, t: i / n, curva: curva, vel: vel });
                gCena.add(e);
            }
        }
        espumas(rioCurvaEsq, 0x9a8660, 9, 0.028);
        espumas(rioCurvaDir, 0xbfe8f2, 11, 0.034);
    }

    function montarIlha() {
        /* terreno esculpido com cores por vértice */
        var geo = new THREE.PlaneGeometry(ILHA_W, ILHA_D, 104, 68);
        geo.rotateX(-Math.PI / 2);
        var pos = geo.attributes.position;
        for (var i = 0; i < pos.count; i++) {
            pos.setY(i, altura(pos.getX(i), pos.getZ(i)));
        }
        geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3));
        geo.computeVertexNormals();
        terreno = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            vertexColors: true, flatShading: true, roughness: 1, metalness: 0
        }));
        terreno.receiveShadow = true;
        terreno.castShadow = true;
        gCena.add(terreno);

        /* fatia de terra em camadas (horizonte do solo) */
        function formaArredondada(w, d, r) {
            var f = new THREE.Shape();
            var x = w / 2 - r, z = d / 2 - r;
            f.moveTo(-x, -d / 2);
            f.lineTo(x, -d / 2);
            f.absarc(x, -z, r, -Math.PI / 2, 0, false);
            f.lineTo(w / 2, z);
            f.absarc(x, z, r, 0, Math.PI / 2, false);
            f.lineTo(-x, d / 2);
            f.absarc(-x, z, r, Math.PI / 2, Math.PI, false);
            f.lineTo(-w / 2, -z);
            f.absarc(-x, -z, r, Math.PI, Math.PI * 1.5, false);
            return f;
        }
        var forma = formaArredondada(ILHA_W - 0.15, ILHA_D - 0.15, 2.2);
        [[0, -0.75, 0x4a3a28], [-0.75, -1.25, 0x8a6a44], [-2.0, -1.4, 0xa08b74]].forEach(function (L) {
            var g = new THREE.ExtrudeGeometry(forma, { depth: L[1], bevelEnabled: false });
            g.rotateX(Math.PI / 2);                  // extrusão desce para -y
            var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
                color: L[2], flatShading: true, roughness: 1, metalness: 0
            }));
            m.position.y = L[0];
            m.castShadow = true; m.receiveShadow = true;
            gCena.add(m);
        });

        /* sombra suave da ilha flutuando */
        var cv = document.createElement("canvas");
        cv.width = cv.height = 256;
        var cx = cv.getContext("2d");
        var gr = cx.createRadialGradient(128, 128, 20, 128, 128, 126);
        gr.addColorStop(0, "rgba(20,45,60,0.5)");
        gr.addColorStop(1, "rgba(20,45,60,0)");
        cx.fillStyle = gr;
        cx.fillRect(0, 0, 256, 256);
        var sombra = new THREE.Mesh(
            new THREE.CircleGeometry(23, 40),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
        sombra.rotation.x = -Math.PI / 2;
        sombra.position.y = -6.2;
        scene.add(sombra);
    }

    function montarSede() {
        var g = new THREE.Group();
        var y = altura(SEDE.x, SEDE.z);
        function b(w, h, d, cor, px, py, pz) {
            var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(cor));
            m.position.set(px, py, pz);
            m.castShadow = true; m.receiveShadow = true;
            g.add(m);
            return m;
        }
        b(2.6, 1.3, 1.9, 0xf3e3c3, 0, 0.65, 0);                       // parede
        var telhado = new THREE.Mesh(new THREE.ConeGeometry(2.05, 1.1, 4), mat(0xb3402e));
        telhado.rotation.y = Math.PI / 4;
        telhado.position.set(0, 1.85, 0);
        telhado.castShadow = true;
        g.add(telhado);
        b(0.5, 0.8, 0.1, 0x8a5a33, 0.55, 0.4, 0.96);                 // porta
        b(0.55, 0.55, 0.08, 0xffe9a8, -0.75, 0.85, 0.96);             // janelas
        b(0.55, 0.55, 0.08, 0xffe9a8, 0.75, 0.85, 0.96);
        b(0.3, 0.7, 0.3, 0xb3402e, -0.85, 2.2, -0.4);                 // chaminé
        var silo = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.3, 12), mat(0xd7dee2));
        silo.position.set(2.3, 1.15, -0.3);
        silo.castShadow = true;
        g.add(silo);
        var tampa = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.5, 12), mat(0x9aa7ad));
        tampa.position.set(2.3, 2.55, -0.3);
        tampa.castShadow = true;
        g.add(tampa);
        g.position.set(SEDE.x, y - 0.05, SEDE.z);
        g.rotation.y = 0.35;
        gCena.add(g);
    }

    function montarPasto() {
        /* cerca */
        var postes = [];
        var passo = 0.62;
        for (var x = PASTO.x0; x <= PASTO.x1 + 0.01; x += passo) {
            postes.push([x, PASTO.z0]); postes.push([x, PASTO.z1]);
        }
        for (var z = PASTO.z0; z <= PASTO.z1 + 0.01; z += passo) {
            postes.push([PASTO.x0, z]); postes.push([PASTO.x1, z]);
        }
        var itens = postes.map(function (p) {
            return { p: [p[0], altura(p[0], p[1]) + 0.28, p[1]] };
        });
        gCena.add(instanciar(new THREE.BoxGeometry(0.07, 0.56, 0.07), 0x8a5a33, itens));

        /* vacas */
        var r2 = rng(4321);
        for (var v = 0; v < 3; v++) {
            var vaca = new THREE.Group();
            function vb(w, h, d, cor, px, py, pz) {
                var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(cor));
                m.position.set(px, py, pz);
                m.castShadow = true;
                vaca.add(m);
            }
            vb(1.15, 0.55, 0.62, 0xf7f4ee, 0, 0.62, 0);                    // corpo
            vb(0.34, 0.3, 0.66, 0x3a3a3a, -0.18, 0.72, 0);                // manchas
            vb(0.28, 0.26, 0.64, 0x3a3a3a, 0.3, 0.6, 0.02);
            vb(0.34, 0.36, 0.34, 0xf7f4ee, 0.72, 0.62, 0);                // cabeça
            vb(0.14, 0.16, 0.3, 0xf2cfc9, 0.86, 0.5, 0);                  // focinho
            vb(0.1, 0.22, 0.1, 0xe8e2d8, -0.1, 0.18, 0.22);                // pernas
            vb(0.1, 0.22, 0.1, 0xe8e2d8, -0.1, 0.18, -0.22);
            vb(0.1, 0.22, 0.1, 0xe8e2d8, 0.42, 0.18, 0.2);
            vb(0.1, 0.22, 0.1, 0xe8e2d8, 0.42, 0.18, -0.2);
            var x = PASTO.x0 + 0.8 + r2() * (PASTO.x1 - PASTO.x0 - 1.6);
            var z = PASTO.z0 + 0.5 + r2() * (PASTO.z1 - PASTO.z0 - 1);
            vaca.position.set(x, altura(x, z), z);
            vaca.rotation.y = r2() * Math.PI * 2;
            vaca.userData.fase = v * 1.3;
            vacas.push(vaca);
            gCena.add(vaca);
        }
    }

    function montarTrator(x, z, rot) {
        var g = new THREE.Group();
        function tb(w, h, d, cor, px, py, pz) {
            var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(cor));
            m.position.set(px, py, pz);
            m.castShadow = true;
            g.add(m);
        }
        tb(1.5, 0.55, 0.8, 0xc23b22, -0.2, 0.62, 0);                     // corpo
        tb(0.7, 0.42, 0.74, 0xa92f1a, 0.75, 0.68, 0);                    // capô
        tb(0.7, 0.62, 0.6, 0xc23b22, -0.5, 1.2, 0);                      // cabine
        tb(0.06, 0.42, 0.42, 0xbfe3f2, -0.14, 1.24, 0);                  // janela
        var geoRoda = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12);
        var geoRodaP = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12);
        [[-0.55, 0.36, geoRoda], [0.55, 0.24, geoRodaP]].forEach(function (r) {
            [0.42, -0.42].forEach(function (lz) {
                var roda = new THREE.Mesh(r[2], mat(0x2f2f2f));
                roda.rotation.x = Math.PI / 2;
                roda.position.set(r[0], r[1], lz);
                roda.castShadow = true;
                g.add(roda);
            });
        });
        g.position.set(x, altura(x, z), z);
        g.rotation.y = rot;
        gCena.add(g);
    }

    function montarDrone() {
        drone = new THREE.Group();
        function db(w, h, d, cor, px, py, pz) {
            var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(cor));
            m.position.set(px, py, pz);
            m.castShadow = true;
            drone.add(m);
        }
        db(0.6, 0.22, 0.6, 0x37474f, 0, 0, 0);
        db(2.0, 0.07, 0.14, 0x37474f, 0, 0.02, 0);
        db(0.14, 0.07, 2.0, 0x37474f, 0, 0.02, 0);
        var geoDisco = new THREE.CylinderGeometry(0.34, 0.34, 0.04, 10);
        [[0.95, 0.95], [-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95]].forEach(function (p) {
            var d = new THREE.Mesh(geoDisco, mat(0x8aa0ac));
            d.position.set(p[0], 0.16, p[1]);
            drone.add(d);
            rotores.push(d);
        });
        var cam = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0x263238));
        cam.position.y = -0.18;
        drone.add(cam);
        gCena.add(drone);
    }

    function montarAvesNuvensSol() {
        /* aves em círculos altos */
        var geoAsa = new THREE.PlaneGeometry(0.8, 0.22);
        for (var i = 0; i < 3; i++) {
            var g = new THREE.Group();
            var mA = new THREE.MeshLambertMaterial({ color: 0x44555f, side: THREE.DoubleSide });
            var a1 = new THREE.Mesh(geoAsa, mA); a1.position.x = 0.4;
            var a2 = new THREE.Mesh(geoAsa, mA); a2.position.x = -0.4;
            var asa1 = new THREE.Group(); asa1.add(a1);
            var asa2 = new THREE.Group(); asa2.add(a2);
            g.add(asa1); g.add(asa2);
            g.userData = { asa1: asa1, asa2: asa2, f: i * 2.4, r: 14 + i * 4, h: 10 + i * 1.6, vel: 0.1 + i * 0.03 };
            aves.push(g);
            gCena.add(g);
        }
        /* nuvens volumétricas */
        var matNuvem = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x8a95a0, flatShading: true, shininess: 0 });
        var geoNuvem = new THREE.IcosahedronGeometry(1, 0);
        [[-14, 13, -6, 2.2], [4, 15.5, -9, 1.6], [16, 12.5, -3, 1.9], [-2, 14, 8, 1.4]].forEach(function (n, k) {
            var g = new THREE.Group();
            for (var j = 0; j < 5; j++) {
                var m = new THREE.Mesh(geoNuvem, matNuvem);
                m.scale.set(1.5 + j * 0.25, 0.55 + (j % 2) * 0.2, 0.9 + j * 0.12);
                m.position.set(j * 1.1 - 2.2, (j % 2) * 0.5, (j % 2) * 0.6);
                g.add(m);
            }
            g.position.set(n[0], n[1], n[2]);
            g.scale.setScalar(n[3]);
            g.userData.vel = 0.25 + k * 0.07;
            nuvens.push(g);
            gCena.add(g);
        });
        /* sol com halo */
        var sol = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
        sol.position.set(22, 17, -26);
        scene.add(sol);
        var cv = document.createElement("canvas");
        cv.width = cv.height = 128;
        var c2 = cv.getContext("2d");
        var gr = c2.createRadialGradient(64, 64, 6, 64, 64, 64);
        gr.addColorStop(0, "rgba(255,240,190,0.9)");
        gr.addColorStop(1, "rgba(255,240,190,0)");
        c2.fillStyle = gr;
        c2.fillRect(0, 0, 128, 128);
        var halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false
        }));
        halo.scale.setScalar(11);
        halo.position.copy(sol.position);
        scene.add(halo);
    }

    /* ====================== marcadores ====================== */
    var POS = {
        t1: { x: -8.7, z: 2, h: 1.4 },
        t2: { x: -1.6, z: 0.2, h: 1.6 },
        t3: { x: 8.8, z: 2, h: 1.4 },
        appd: { x: -12.8, z: 3, h: 1.2 },
        appp: { x: 15.2, z: 4, h: 3.2 },
        rl: { x: 12.5, z: -10.3, h: 3.6 },
        vacas: { x: 10.4, z: -6.4, h: 1.8 },
        bio: { x: 9.3, z: 5.8, h: 1.6 },
        sede: { x: 0.6, z: -9.6, h: 3.2 },
        drone: { segue: true }
    };

    function atualizarMarcadores() {
        if (!opts.aoMarcar) return;
        var w = container.clientWidth, h = container.clientHeight;
        var dados = {};
        Object.keys(POS).forEach(function (id) {
            var p = POS[id].segue && drone
                ? drone.position.clone().add(new THREE.Vector3(0, 0.6, 0))
                : posFixas[id];
            var v = p.clone().project(camera);
            dados[id] = { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visivel: v.z < 1 };
        });
        opts.aoMarcar(dados);
    }

    /* ====================== animação ====================== */
    function animar() {
        requestAnimationFrame(animar);
        var dt = Math.min(relogio.getDelta(), 0.05);
        tGlobal += dt;
        controls.update();

        if (drone) {
            drone.position.x = Math.sin(tGlobal * 0.3) * 6.5 + 1;
            drone.position.z = Math.cos(tGlobal * 0.42) * 4 + 1.5;
            drone.position.y = 4.4 + Math.sin(tGlobal * 1.1) * 0.35;
            drone.rotation.z = -Math.cos(tGlobal * 0.3) * 0.08;
            drone.rotation.y = Math.sin(tGlobal * 0.42) * 0.5;
            for (var h = 0; h < rotores.length; h++) rotores[h].rotation.y += dt * 45;
        }
        espuma.forEach(function (e) {
            e.t += e.vel * dt * 10;
            if (e.t > 1) e.t -= 1;
            var p = e.curva.getPointAt(e.t);
            e.mesh.position.set(p.x, NIVEL_AGUA + 0.03, p.z);
            var tg = e.curva.getTangentAt(e.t);
            e.mesh.rotation.y = Math.atan2(tg.x, tg.z);
        });
        vacas.forEach(function (v) {
            v.position.y = altura(v.position.x, v.position.z) + Math.abs(Math.sin(tGlobal * 1.1 + v.userData.fase)) * 0.03;
        });
        aves.forEach(function (a) {
            var f = tGlobal * a.userData.vel + a.userData.f;
            a.position.set(Math.cos(f) * a.userData.r, a.userData.h + Math.sin(f * 2) * 0.6, Math.sin(f) * a.userData.r);
            a.rotation.y = -f + Math.PI / 2;
            var flap = Math.sin(tGlobal * 6 + a.userData.f) * 0.55;
            a.userData.asa1.rotation.z = 0.25 + flap;
            a.userData.asa2.rotation.z = -0.25 - flap;
        });
        nuvens.forEach(function (n) {
            n.position.x += n.userData.vel * dt;
            if (n.position.x > 34) n.position.x = -34;
        });
        borboletas.forEach(function (b) {
            var f = tGlobal * 0.9 + b.userData.f;
            var x = b.userData.cx + Math.sin(f) * 1.2;
            var z = b.userData.cz + Math.cos(f * 0.8) * 1;
            b.position.set(x, altura(x, z) + b.userData.h + Math.sin(f * 2.3) * 0.3, z);
            var flap = Math.sin(tGlobal * 14 + b.userData.f) * 0.85;
            b.userData.asa1.rotation.z = 0.3 + flap;
            b.userData.asa2.rotation.z = -0.3 - flap;
        });
        abelhas.forEach(function (a) {
            var f = tGlobal * 1.6 + a.userData.f;
            a.position.set(
                a.userData.cx + Math.sin(f) * 0.5,
                altura(a.userData.cx, a.userData.cz) + a.userData.h + Math.sin(f * 3) * 0.2,
                a.userData.cz + Math.cos(f * 1.3) * 0.45);
        });

        renderer.render(scene, camera);
        atualizarMarcadores();
    }

    function aoRedimensionar() {
        var w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    /* ====================== céu e luz ====================== */
    function ceuTextura() {
        var cv = document.createElement("canvas");
        cv.width = 2; cv.height = 256;
        var c = cv.getContext("2d");
        var g = c.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, "#4f9bd8");
        g.addColorStop(0.45, "#8ec4ea");
        g.addColorStop(0.75, "#c8e4f2");
        g.addColorStop(1, "#f2e8c8");
        c.fillStyle = g;
        c.fillRect(0, 0, 2, 256);
        return new THREE.CanvasTexture(cv);
    }

    function luzes() {
        scene.add(new THREE.HemisphereLight(0xbfdfff, 0x7a9a5f, 0.62));
        scene.add(new THREE.AmbientLight(0xffffff, 0.22));
        var sol = new THREE.DirectionalLight(0xfff1d6, 1.15);
        sol.position.set(24, 26, -14);
        sol.castShadow = true;
        sol.shadow.mapSize.set(2048, 2048);
        sol.shadow.camera.left = -24; sol.shadow.camera.right = 24;
        sol.shadow.camera.top = 20; sol.shadow.camera.bottom = -18;
        sol.shadow.camera.near = 4; sol.shadow.camera.far = 90;
        sol.shadow.bias = -0.0006;
        scene.add(sol);
    }

    /* ====================== init ====================== */
    function init(config) {
        opts = config || {};
        container = opts.container;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch (e) {
            return false;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        scene = new THREE.Scene();
        scene.background = ceuTextura();

        camera = new THREE.PerspectiveCamera(40, 1.55, 0.1, 400);
        camera.position.set(24, 14.5, 29);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0.2, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.enablePan = false;
        controls.minDistance = 14;
        controls.maxDistance = 70;
        controls.minPolarAngle = 0.18;
        controls.maxPolarAngle = 1.42;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.45;
        renderer.domElement.addEventListener("pointerdown", function () { controls.autoRotate = false; });

        gCena = new THREE.Group(); gAno = new THREE.Group(); gVida = new THREE.Group();
        scene.add(gCena); scene.add(gAno); scene.add(gVida);

        /* curvas de rio e amostragens para distância/altura */
        rioCurvaEsq = curvaDe(RIO_ESQ_PTS);
        rioCurvaDir = curvaDe(RIO_DIR_PTS);
        rioAmoEsq = amostrar(rioCurvaEsq, 64);
        rioAmoDir = amostrar(rioCurvaDir, 64);
        caminhoAmo = CAMINHOS.map(function (pts) {
            return amostrar(curvaDe(pts), 40);
        });

        geos();
        luzes();
        montarIlha();
        montarAgua();
        arvoresEstaticas();
        montarSede();
        montarPasto();
        montarTrator(1.6, 11.2, 1.2);
        montarTrator(-5.2, 6.5, 0.2);
        montarDrone();
        montarAvesNuvensSol();

        Object.keys(POS).forEach(function (id) {
            if (!POS[id].segue) posFixas[id] = new THREE.Vector3(POS[id].x, altura(POS[id].x, POS[id].z) + POS[id].h, POS[id].z);
        });

        montarAno(opts.ano || 1);

        container.appendChild(renderer.domElement);
        aoRedimensionar();
        window.addEventListener("resize", aoRedimensionar);

        relogio = new THREE.Clock();
        animar();
        return true;
    }

    return {
        init: init,
        trocarAno: montarAno,
        info: function () {
            return {
                fixos: gCena.children.length,
                ano: gAno.children.length,
                vida: gVida.children.length,
                marcadores: Object.keys(POS).length
            };
        }
    };
})();