/* ============================================================
   maquete3d.v4.js — Diorama Three.js da Maquete da Fazenda (SBC)
   Requer three.min.js e OrbitControls.js (builds globais r128).

   Desenho 3D-nativo: uma ilha de fazenda com corte de terra em
   camadas, terreno esculpido (morros, calhas de rio), cores por
   vértice no solo, plantio seguindo curvas de nível reais e
   iluminação de sol com sombras suaves.

   Versão refinada: malha de terreno densa, relevo acentuado,
   vegetação com troncos/copas irregulares e suaves, culturas e
   palhada volumétricas com formas arredondadas, margens de rio com
   pedras e areia, placas 3D do briefing, céu gradiente e névoa de
   profundidade.

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

    /* rios: polilinhas que serpenteiam e escavam o terreno */
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

    /* morros do Talhão 2: crista alongada com sela entre eles */
    var MORROS = [
        { cx: 0.2, cz: 0.8, a: 2.7, sx: 3.3, sz: 2.6 },
        { cx: 2.2, cz: 4.2, a: 1.75, sx: 2.5, sz: 2.1 }
    ];

    /* vala de drenagem */
    var VALE_PTS = [[-3.4, 3.4], [-7, 3.6], [-10.5, 4.2], [-13.8, 4.8]];

    /* lagoa do gado */
    var LAGOA = { x: 6.3, z: -6.9, p: 1.3, s: 0.85 };

    var NIVEL_AGUA = -0.45;

    /* ====================== utilidades ====================== */
    function rng(seed) {
        return function () {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };
    }
    function ruido(x, z) {
        var s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
        return s - Math.floor(s);
    }
    function vRuido(x, z) {
        var xi = Math.floor(x), zi = Math.floor(z);
        var xf = x - xi, zf = z - zi;
        var u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
        var a = ruido(xi, zi), b = ruido(xi + 1, zi);
        var c = ruido(xi, zi + 1), d = ruido(xi + 1, zi + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function noRect(r, x, z) { return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; }
    function dentro(p, margem, x, z) {
        return x >= p[0] - margem && x <= p[0] + margem && z >= p[1] - margem && z <= p[1] + margem;
    }

    var renderer, scene, camera, controls, container, opts;
    var gCena, gAno, gVida;
    var terreno;
    var rioCurvaEsq, rioCurvaDir;
    var rioAmoEsq = [], rioAmoDir = [], caminhoAmo = [], valeAmo = [];
    var drone, rotores = [], vacas = [], aves = [], borboletas = [], abelhas = [], nuvens = [];
    var espuma = [];
    var aguaMatEsq = null, espumaMatEsq = null;
    var aguas = [];
    var tGlobal = 0, relogio;
    var posFixas = {};
    var MAT = {};

    function mat(cor, transparente) {
        var chave = (transparente ? "t" : "") + cor;
        if (!MAT[chave]) {
            MAT[chave] = new THREE.MeshLambertMaterial({ color: cor, transparent: !!transparente, opacity: transparente || 1 });
        }
        return MAT[chave];
    }
    function matStandard(cor) {
        var chave = "s" + cor;
        if (!MAT[chave]) MAT[chave] = new THREE.MeshStandardMaterial({ color: cor, roughness: 1, metalness: 0 });
        return MAT[chave];
    }
    function matPlano(cor) {
        var chave = "p" + cor;
        if (!MAT[chave]) MAT[chave] = new THREE.MeshLambertMaterial({ color: cor, side: THREE.DoubleSide });
        return MAT[chave];
    }

    /* carregamento assíncrono de modelos GLB */
    var gltfLoader = null;
    var cacheGLB = {};
    function carregarGLB(url, cb) {
        if (cacheGLB[url]) { cb(cacheGLB[url]); return; }
        if (!gltfLoader) gltfLoader = new THREE.GLTFLoader();
        gltfLoader.load(url, function (gltf) {
            cacheGLB[url] = gltf;
            cb(gltf);
        });
    }

    /* perturba vértices de uma geometria com noise para deixar orgânica */
    function perturbarGeo(geo, amp, seed) {
        var r2 = rng(seed || 1);
        var pos = geo.attributes.position;
        for (var i = 0; i < pos.count; i++) {
            var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            var n = (r2() - 0.5) * amp;
            pos.setXYZ(i, x + n, y + n * 0.7, z + n);
        }
        geo.computeVertexNormals();
        return geo;
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
        var y = (vRuido(x * 0.16 + 5, z * 0.16 + 9) - 0.5) * 0.62
              + (vRuido(x * 0.42 + 2, z * 0.42 + 7) - 0.5) * 0.26
              + (ruido(x * 1.6, z * 1.6) - 0.5) * 0.06
              + (ruido(x * 4.3 + 1, z * 4.3 + 3) - 0.5) * 0.025; // micro-relevo
        for (var i = 0; i < MORROS.length; i++) {
            var m = MORROS[i];
            var dx = x - m.cx, dz = z - m.cz;
            y += m.a * Math.exp(-(dx * dx / (2 * m.sx * m.sx) + dz * dz / (2 * m.sz * m.sz)));
        }
        var rx = x - 12.5, rz = z + 10.5;
        y += 0.55 * Math.exp(-(rx * rx + rz * rz) / (2 * 5.5 * 5.5));
        var dv = distAte(valeAmo, x, z);
        y -= 0.5 * Math.exp(-(dv * dv) / (2 * 1.15 * 1.15));
        var lx = x - LAGOA.x, lz = z - LAGOA.z;
        y -= LAGOA.p * Math.exp(-(lx * lx + lz * lz) / (2 * LAGOA.s * LAGOA.s));
        var d = Math.min(distAte(rioAmoEsq, x, z), distAte(rioAmoDir, x, z));
        y -= 1.35 * Math.exp(-(d * d) / (2 * 0.95 * 0.95));
        return y;
    }

    /* ====================== cores do solo por ano ====================== */
    var COR_T1 = [0x9c8a62, 0xa89b6e, 0xb8a97a];
    var COR_T2 = [0xa88a5a, 0x79a86a, 0x5fa85a];
    var COR_T3 = 0x4f9455;
    var COR_LEITO_ESQ = [0x5a7a62, 0x5c8a6a, 0x5f9f7e];
    var COR_RIO_ESQ = [0x9c9b6a, 0x8fb080, 0x74b287];
    var COR_RIO_DIR = 0x5ab4e8;

    function corSolo(x, z, ano, h) {
        var dE = distAte(rioAmoEsq, x, z), dD = distAte(rioAmoDir, x, z);
        var lx = x - LAGOA.x, lz = z - LAGOA.z;
        var naAgua = h < NIVEL_AGUA - 0.03 || (lx * lx + lz * lz) < 2.2 && h < NIVEL_AGUA;
        var c = 0x79ab5e;
        var k, dC;
        // leito do rio: só aparece se a margem estiver acima da água
        if (dE < 1.35) c = naAgua ? COR_RIO_ESQ[ano - 1] : COR_LEITO_ESQ[ano - 1];
        else if (dE < 2.8) c = 0x8fa878;
        if (dD < 1.35) c = naAgua ? COR_RIO_DIR : 0x6a9a8a;
        else if (dD < 2.8 && c === 0x79ab5e) c = 0x4e9a6a;
        for (k = 0; k < CAMINHOS.length; k++) {
            dC = distAte(caminhoAmo[k], x, z);
            if (dC < 0.9) c = 0xbfab85;
        }
        if (noRect(T1, x, z)) c = COR_T1[ano - 1];
        else if (noRect(T2, x, z)) c = COR_T2[ano - 1];
        else if (noRect(T3, x, z)) c = COR_T3;
        else if (x >= RL.x0 && z <= RL.z1 && z >= RL.z0) c = 0x2e6b35;
        else if (noRect(PASTO, x, z)) c = 0x7fb45e;
        else if (dentro([SEDE.x, SEDE.z], 2.6, x, z)) c = 0x9cb56f;
        return c;
    }

    function pintarTerreno(ano) {
        var pos = terreno.geometry.attributes.position;
        var cores = terreno.geometry.attributes.color;
        var c = new THREE.Color(), _cAgua = new THREE.Color();
        for (var i = 0; i < pos.count; i++) {
            var x = pos.getX(i), z = pos.getZ(i);
            var h = pos.getY(i);
            c.setHex(corSolo(x, z, ano, h));
            if (h < NIVEL_AGUA + 0.06) {
                var dE = distAte(rioAmoEsq, x, z), dD = distAte(rioAmoDir, x, z);
                var lx = x - LAGOA.x, lz = z - LAGOA.z;
                var dentroRio = dE < 3.2 || dD < 3.2 || (lx * lx + lz * lz) < 5.0;
                if (dentroRio) {
                    if (h < NIVEL_AGUA - 0.015) {
                        var prof = Math.min(1, (NIVEL_AGUA - h) / 1.0);
                        var corAgua = (lx * lx + lz * lz) < 5.0 ? 0x4b9ecb :
                            (dE <= dD ? COR_RIO_ESQ[ano - 1] : COR_RIO_DIR);
                        c.lerp(_cAgua.setHex(corAgua), 0.55 + prof * 0.25);
                        c.offsetHSL(0, 0, -prof * 0.05);
                    } else {
                        // faixa de margem molhada com tom verde-acinzentado, não marrom
                        c.lerp(_cAgua.setHex(0x7fa080), 0.42);
                    }
                }
            }
            var n1 = ruido(x * 0.9 + 11, z * 0.8 + 7);
            var n2 = ruido(x * 3.1, z * 2.7);
            c.offsetHSL((n1 - 0.5) * 0.03, (n1 - 0.5) * 0.06,
                (n1 - 0.5) * 0.07 + (n2 - 0.5) * 0.05);
            cores.setXYZ(i, c.r, c.g, c.b);
        }
        cores.needsUpdate = true;
    }

    /* ====================== instâncias ====================== */
    var _mtx = new THREE.Matrix4(), _q = new THREE.Quaternion();
    var _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
    var _col = new THREE.Color();

    function instanciar(geo, cor, itens, sombra) {
        if (!itens.length) return null;
        var m = new THREE.InstancedMesh(geo, typeof cor === "number" ? mat(cor) : cor, itens.length);
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
            if (o.geometry && !o.geometry.userData.compartilhada) o.geometry.dispose();
        });
        while (g.children.length) g.remove(g.children[0]);
    }

    /* geometrias refinadas de cultivo, palhada e natureza */
    var GE = null;
    function geos() {
        if (GE) return GE;
        GE = {
            tufo: perturbarGeo(new THREE.SphereGeometry(0.15, 7, 6), 0.04, 41),
            capim: perturbarGeo(new THREE.ConeGeometry(0.09, 0.34, 7), 0.03, 42),
            palha: perturbarGeo(new THREE.CylinderGeometry(0.018, 0.022, 0.46, 7), 0.02, 43),
            palhaCurta: perturbarGeo(new THREE.CylinderGeometry(0.015, 0.018, 0.28, 7), 0.02, 44),
            flor: perturbarGeo(new THREE.SphereGeometry(0.055, 7, 6), 0.02, 45),
            haste: new THREE.CylinderGeometry(0.018, 0.028, 0.58, 7),
            tronco: new THREE.CylinderGeometry(0.09, 0.14, 1.0, 10),
            copa: perturbarGeo(new THREE.SphereGeometry(0.72, 11, 9), 0.09, 46),
            pedra: perturbarGeo(new THREE.SphereGeometry(0.18, 8, 6), 0.12, 47),
            poste: new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6),
            arvoreSeca: new THREE.CylinderGeometry(0.05, 0.09, 1.0, 8)
        };
        Object.keys(GE).forEach(function (k) { GE[k].userData.compartilhada = true; });
        return GE;
    }

    /* ====================== plantio ====================== */
    function fileirasZ(r, passoR, passoT, alturaT, escalaY) {
        var itens = [];
        for (var x = r.x0 + 0.4; x <= r.x1 - 0.4; x += passoR) {
            for (var z = r.z0 + 0.4; z <= r.z1 - 0.4; z += passoT) {
                itens.push({ p: [x, altura(x, z) + alturaT, z], s: [1, escalaY || 1, 1] });
            }
        }
        return itens;
    }

    function fileirasX(r, passoR, passoT, alturaT, onda) {
        var itens = [];
        for (var z = r.z0 + 0.4; z <= r.z1 - 0.4; z += passoR) {
            for (var x = r.x0 + 0.4; x <= r.x1 - 0.4; x += passoT) {
                var zz = z + Math.sin(x * 0.5 + z) * (onda || 0.3);
                itens.push({ p: [x, altura(x, zz) + alturaT, zz] });
            }
        }
        return itens;
    }

    function aneisContorno(m, rMax) {
        var itens = [];
        var kx = m.sx / 2.2, kz = m.sz / 2.2;
        for (var raio = 0.6; raio <= rMax; raio += 0.5) {
            for (var a = 0; a < Math.PI * 2; a += 0.24) {
                var x = m.cx + Math.cos(a) * raio * kx;
                var z = m.cz + Math.sin(a) * raio * kz;
                if (!noRect(T2, x, z)) continue;
                itens.push({ p: [x, altura(x, z) + 0.16, z] });
            }
        }
        return itens;
    }

    function espalhar(r, qtd, alturaT, seed, escalaExtra) {
        var r2 = rng(seed), itens = [];
        for (var i = 0; i < qtd; i++) {
            var x = r.x0 + r2() * (r.x1 - r.x0);
            var z = r.z0 + r2() * (r.z1 - r.z0);
            var rot = [(r2() - 0.5) * 0.4, r2() * Math.PI, (r2() - 0.5) * 0.4];
            var sx = 1 + (r2() - 0.5) * 0.4;
            var sz = escalaExtra ? 1 + (r2() - 0.5) * 0.5 : sx;
            itens.push({ p: [x, altura(x, z) + alturaT, z], r: rot, s: [sx, 1, sz] });
        }
        return itens;
    }

    function espalharEmArea(areaFn, qtd, alturaT, seed) {
        var r2 = rng(seed), itens = [];
        var tentativas = 0;
        while (itens.length < qtd && tentativas < qtd * 6) {
            var x = (r2() - 0.5) * ILHA_W * 0.96;
            var z = (r2() - 0.5) * ILHA_D * 0.96;
            if (areaFn(x, z)) {
                itens.push({ p: [x, altura(x, z) + alturaT, z], r: [0, r2() * Math.PI, 0] });
            }
            tentativas++;
        }
        return itens;
    }

    /* ====================== talhões por ano ====================== */
    function talhao1(ano) {
        var g = new THREE.Group();
        var sojaItens = [], milhoItens = [];
        var nLinhas = 0;
        for (var x = T1.x0 + 0.5; x <= T1.x1 - 0.5; x += 0.72, nLinhas++) {
            var ehMilho = nLinhas % 5 === 4;
            for (var z = T1.z0 + 0.4; z <= T1.z1 - 0.4; z += 0.5) {
                if (ehMilho) {
                    milhoItens.push({ p: [x, altura(x, z) + 0.45, z], s: [0.75, 1.2 + ano * 0.15, 0.75] });
                } else {
                    sojaItens.push({ p: [x, altura(x, z) + 0.14, z], s: [1, 1 + ano * 0.08, 1] });
                }
            }
        }
        g.add(instanciar(GE.tufo, [0x79b25c, 0x4ea24f, 0x2f9e42][ano - 1], sojaItens));
        g.add(instanciar(GE.capim, 0x9ccc65, milhoItens));
        // palhada volumétrica progressiva
        var densPalha = [120, 420, 950][ano - 1];
        g.add(instanciar(GE.palha, 0xd9c27e, espalhar(T1, densPalha, 0.04, 11 + ano, true), false));
        return g;
    }

    function talhao2(ano) {
        var g = new THREE.Group();
        if (ano === 1) {
            // linhas retas descendo o morro, solo mais exposto
            g.add(instanciar(GE.tufo, 0xa8a05e, fileirasZ(T2, 0.75, 0.5, 0.14), true));
            // ravinas + leques de sedimento
            MORROS.forEach(function (m, mi) {
                var n = mi === 0 ? 2 : 1;
                for (var k = 0; k < n; k++) {
                    var lado = k === 0 ? 1 : -0.6;
                    var pts = [];
                    for (var t = 0; t <= 1.001; t += 0.08) {
                        var x = m.cx - t * m.sx * 1.05 * lado;
                        var z = m.cz + t * m.sz * 0.95;
                        pts.push(new THREE.Vector3(x, altura(x, z) + 0.06, z));
                    }
                    var ravina = new THREE.Mesh(
                        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.07, 7),
                        mat(0x5c3f22));
                    ravina.castShadow = true;
                    g.add(ravina);
                    var fx = m.cx - m.sx * 1.05 * lado, fz = m.cz + m.sz * 0.95;
                    var leque = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 0.08, 12), mat(0x8a5a33));
                    leque.position.set(fx, altura(fx, fz) + 0.08, fz);
                    leque.scale.set(1.6, 1, 1.0);
                    leque.receiveShadow = true;
                    g.add(leque);
                }
            });
            g.add(instanciar(GE.palha, 0xcbb26a, espalhar(T2, 70, 0.04, 221, true), false));
        } else {
            // contorno: anéis seguindo as curvas de nível dos morros
            var corAnel = ano === 2 ? 0xb8cf9a : 0x67b26a;
            var corResta = ano === 2 ? 0xd9b64e : 0x2f7d3c;
            MORROS.forEach(function (m) {
                g.add(instanciar(GE.tufo, corAnel, aneisContorno(m, m.sz * 1.5)));
            });
            // fileiras onduladas fora do raio dos morros
            var itens = [];
            for (var z = T2.z0 + 0.4; z <= T2.z1 - 0.4; z += 0.72) {
                for (var x = T2.x0 + 0.4; x <= T2.x1 - 0.4; x += 0.5) {
                    var perto = MORROS.some(function (m2) {
                        var dx = x - m2.cx, dz = z - m2.cz;
                        return (dx * dx / (m2.sx * m2.sx) + dz * dz / (m2.sz * m2.sz)) < 1.5;
                    });
                    if (perto) continue;
                    var zz = z + Math.sin(x * 0.5 + z) * 0.35;
                    itens.push({ p: [x, altura(x, zz) + 0.16, zz] });
                }
            }
            g.add(instanciar(GE.tufo, corResta, itens));
            if (ano === 3) {
                g.add(instanciar(GE.capim, 0x2f7d3c, espalhar(T2, 360, 0.12, 223, true)));
            }
            var dens = ano === 2 ? 320 : 620;
            g.add(instanciar(GE.palha, 0xd9c27e, espalhar(T2, dens, 0.04, 22 + ano, true), false));
        }
        return g;
    }

    function talhao3(ano) {
        var g = new THREE.Group();
        // base de braquiária densa + soja em contorno
        g.add(instanciar(GE.capim, 0x2f7d3c, espalhar(T3, 420, 0.12, 331, true)));
        g.add(instanciar(GE.tufo, 0x57b05c, fileirasX(T3, 0.8, 0.5, 0.15, 0.3)));
        if (ano === 1) {
            // crotalária em flor
            g.add(instanciar(GE.flor, 0xe9c937, espalhar(T3, 110, 0.40, 332)));
        } else if (ano === 2) {
            // trigo + milheto em fileiras
            var trigo = [];
            for (var z = T3.z0 + 1.2; z <= T3.z1 - 1; z += 1.5) {
                for (var x = T3.x0 + 0.5; x <= T3.x1 - 0.5; x += 0.55) {
                    var zz = z + Math.sin(x * 0.5 + z) * 0.3;
                    trigo.push({ p: [x, altura(x, zz) + 0.32, zz], s: [1, 0.95, 1] });
                }
            }
            g.add(instanciar(GE.haste, 0xd9b64e, trigo));
            g.add(instanciar(GE.haste, 0xc7d17e, espalhar(T3, 100, 0.30, 333)));
        } else {
            // consórcio braquiária-milho
            var milho = espalhar(T3, 90, 0.55, 334);
            g.add(instanciar(GE.haste, 0x6a9a3a, milho));
            var espigas = espalhar(T3, 90, 0.85, 335);
            g.add(instanciar(GE.flor, 0xe6c84a, espigas, false));
        }
        var dens = ano === 1 ? 180 : 300;
        g.add(instanciar(GE.palha, 0xd9c27e, espalhar(T3, dens, 0.04, 33 + ano, true), false));
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
        var geoAsa = new THREE.PlaneGeometry(0.36, 0.28);
        if (ano >= 2) {
            var cores = [0xf2b134, 0xe8788a, 0x7ec6e8, 0xf29134, 0xe8788a];
            for (var b = 0; b < 6; b++) {
                var g = new THREE.Group();
                var mA = new THREE.MeshLambertMaterial({ color: cores[b % cores.length], side: THREE.DoubleSide });
                var a1 = new THREE.Mesh(geoAsa, mA), a2 = new THREE.Mesh(geoAsa, mA);
                a1.position.x = 0.18; a2.position.x = -0.18;
                a1.scale.y = 0.85; a2.scale.y = 0.85;
                var asa1 = new THREE.Group(); asa1.add(a1);
                var asa2 = new THREE.Group(); asa2.add(a2);
                g.add(asa1); g.add(asa2);
                g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.26, 6), mat(0x3a2a1a)));
                g.userData = { asa1: asa1, asa2: asa2, f: b * 1.7, cx: 7.5 + b * 0.6, cz: 2 + b * 0.9, h: 1 + (b % 3) * 0.4 };
                borboletas.push(g);
                gVida.add(g);
            }
        }
        if (ano === 3) {
            // abelhas com listras pretas/amarelas
            var geoAb = new THREE.SphereGeometry(0.06, 7, 6);
            for (var ab = 0; ab < 6; ab++) {
                var z = new THREE.Mesh(geoAb, mat(0xf4c430));
                var listra = new THREE.Mesh(new THREE.SphereGeometry(0.062, 7, 6, 0, Math.PI * 2, 0, 0.6), mat(0x2a2a2a));
                listra.rotation.z = Math.PI / 2;
                z.add(listra);
                z.userData = { f: ab * 2.1, cx: 8.5 + ab * 0.4, cz: 4 + ab * 0.5, h: 0.9 };
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
        if (aguaMatEsq) aguaMatEsq.color.setHex(COR_RIO_ESQ[ano - 1]);
        if (espumaMatEsq) espumaMatEsq.color.setHex([0x8f7f52, 0x867f5e, 0x8fae9a][ano - 1]);
    }

    /* ====================== cenário fixo ====================== */
    function arvoresEstaticas() {
        var troncos = [], copas = [], galhosSecos = [], arbustos = [];
        function addArvore(x, z, esc, paleta, tipo) {
            var y = altura(x, z);
            if (tipo === "seca") {
                galhosSecos.push({ p: [x, y + 0.5 * esc, z], s: [esc * 0.65, esc, esc * 0.65], r: [(Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2] });
                copas.push({ p: [x, y + 1.05 * esc, z], s: [esc * 0.5, esc * 0.4, esc * 0.5], c: paleta[0] });
            } else {
                troncos.push({ p: [x, y + 0.5 * esc, z], s: [esc, esc, esc] });
                copas.push({ p: [x, y + 1.12 * esc, z], s: [esc * 1.0, esc * 0.9, esc * 1.0], c: paleta[0] });
                copas.push({ p: [x + 0.32 * esc, y + 0.85 * esc, z + 0.22 * esc], s: [esc * 0.55, esc * 0.5, esc * 0.55], c: paleta[1] });
                copas.push({ p: [x - 0.28 * esc, y + 0.92 * esc, z - 0.18 * esc], s: [esc * 0.48, esc * 0.45, esc * 0.48], c: paleta[2] });
            }
        }
        function addArbusto(x, z, esc, cor) {
            arbustos.push({ p: [x, altura(x, z) + 0.16 * esc, z], s: [esc, esc * 0.65, esc], c: cor });
        }

        var PAL = {
            rl: [[0x1f5c2a, 0x2e7a3a, 0x3f9448], [0x266b30, 0x357f3c, 0x4a9c50], [0x1e5228, 0x2c7035, 0x3a8540]],
            app: [[0x2a6e34, 0x38853f, 0x4c9a4e], [0x1f5c2a, 0x2e7a3a, 0x3f9448], [0x247232, 0x35803c, 0x46944d]],
            solta: [[0x2f7a3a, 0x3c9448, 0x56ad57], [0x35703a, 0x43884a, 0x58a75c]],
            seca: [[0x6e7a44, 0x7e8b50, 0x8c985a]]
        };
        var r2 = rng(9090);

        // Reserva Legal — floresta madura e densa
        for (var i = 0; i < 44; i++) {
            var ax = 7.2 + r2() * 11.5;
            var az = -12.4 + r2() * 3.7;
            addArvore(ax, az, 0.9 + r2() * 0.7, PAL.rl[i % 3]);
            if (r2() < 0.35) addArbusto(ax + (r2() - 0.5) * 1.2, az + (r2() - 0.5) * 1.2, 0.5 + r2() * 0.3, 0x4a8f4f);
        }

        // APP preservada — faixa densa junto ao rio direito
        var palIdx = 0;
        for (var t = 0.05; t <= 1; t += 0.045) {
            var p = rioCurvaDir.getPointAt(t);
            for (var k = 0; k < 2; k++) {
                var off = 1.9 + k * 0.9 + r2() * 0.5;
                addArvore(p.x - off, p.z + (r2() - 0.5) * 1.0, 0.65 + r2() * 0.5, PAL.app[palIdx % 3]);
                palIdx++;
            }
            if (r2() < 0.4) addArbusto(p.x - 1.5, p.z + (r2() - 0.5) * 0.8, 0.45, 0x3f8f45);
        }

        // APP degradada — rala e sofrida
        for (var t2 = 0.15; t2 <= 0.95; t2 += 0.14) {
            var p2 = rioCurvaEsq.getPointAt(t2);
            if (r2() < 0.55) continue;
            addArvore(p2.x + 2.4 + r2() * 0.7, p2.z + (r2() - 0.5) * 1.3, 0.45 + r2() * 0.2, PAL.seca[0], "seca");
        }

        // árvores soltas: sede e cantos do campo
        [[-2.6, -8.2, 1.1], [3.4, -8.4, 0.9], [-16.5, 10.5, 1.0], [-11, 11.2, 0.9],
         [13.6, 10.8, 1.0], [-18.5, -3, 0.9], [15.2, -4.6, 1.0]].forEach(function (a, k) {
            addArvore(a[0], a[1], a[2], PAL.solta[k % 2]);
        });

        gCena.add(instanciar(GE.tronco, 0x6b4a2b, troncos));
        if (galhosSecos.length) gCena.add(instanciar(GE.arvoreSeca, 0x8a6a44, galhosSecos));

        var copaM = new THREE.InstancedMesh(GE.copa,
            new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: false, shininess: 6 }),
            copas.length);
        for (var c = 0; c < copas.length; c++) {
            var it = copas[c];
            _q.setFromEuler(_e.set((ruido(it.p[0], it.p[2]) - 0.5) * 0.3, ruido(it.p[0], it.p[2]) * 3, 0));
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

        if (arbustos.length) {
            var arbM = new THREE.InstancedMesh(GE.copa,
                new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: false, shininess: 4 }),
                arbustos.length);
            for (var a2 = 0; a2 < arbustos.length; a2++) {
                var ab = arbustos[a2];
                _q.setFromEuler(_e.set(0, ruido(ab.p[0], ab.p[2]) * 2, 0));
                _v.set(ab.p[0], ab.p[1], ab.p[2]);
                _s.set(ab.s[0], ab.s[1], ab.s[2]);
                _mtx.compose(_v, _q, _s);
                arbM.setMatrixAt(a2, _mtx);
                arbM.setColorAt(a2, _col.set(ab.c));
            }
            arbM.instanceMatrix.needsUpdate = true;
            if (arbM.instanceColor) arbM.instanceColor.needsUpdate = true;
            arbM.castShadow = true; arbM.receiveShadow = true;
            gCena.add(arbM);
        }

        return { troncos: troncos.length, copas: copas.length, arbustos: arbustos.length };
    }

    function montarAgua() {
        function margem(curva, t, sinal) {
            var p = curva.getPointAt(t);
            var tg = curva.getTangentAt(t);
            var l = Math.sqrt(tg.x * tg.x + tg.z * tg.z) || 1;
            var nx = -tg.z / l, nz = tg.x / l;
            for (var d = 0.5; d <= 2.8; d += 0.12) {
                var x = p.x + sinal * nx * d, z = p.z + sinal * nz * d;
                if (altura(x, z) > NIVEL_AGUA) return Math.max(0.85, d - 0.08);
            }
            return 2.8;
        }
        function fita(curva, cor, opac) {
            var N = 120, posArr = [], idx = [], fases = [];
            for (var i = 0; i <= N; i++) {
                var t = i / N;
                var p = curva.getPointAt(t);
                var tg = curva.getTangentAt(t);
                var l = Math.sqrt(tg.x * tg.x + tg.z * tg.z) || 1;
                var nx = -tg.z / l, nz = tg.x / l;
                var rampa = Math.min(1, t * 6, (1 - t) * 6);
                var wE = margem(curva, t, 1) * rampa;
                var wD = margem(curva, t, -1) * rampa;
                posArr.push(p.x + nx * wE, NIVEL_AGUA, p.z + nz * wE);
                posArr.push(p.x - nx * wD, NIVEL_AGUA, p.z - nz * wD);
                fases.push(i * 0.55, i * 0.55 + 1.7);
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
                color: cor, transparent: true, opacity: opac, shininess: 100, specular: 0xbfe8f5
            }));
            m.receiveShadow = true;
            aguas.push({ mesh: m, fases: fases });
            return m;
        }
        var fitaEsq = fita(rioCurvaEsq, COR_RIO_ESQ[0], 0.95);
        aguaMatEsq = fitaEsq.material;
        gCena.add(fitaEsq);
        gCena.add(fita(rioCurvaDir, COR_RIO_DIR, 0.93));

        var NA = 40, posL = [LAGOA.x, NIVEL_AGUA, LAGOA.z], idxL = [];
        for (var a = 0; a < NA; a++) {
            var ang = (a / NA) * Math.PI * 2;
            var rr = 0.35;
            while (rr < 2.4) {
                var ax = LAGOA.x + Math.cos(ang) * rr, az = LAGOA.z + Math.sin(ang) * rr;
                if (altura(ax, az) > NIVEL_AGUA) break;
                rr += 0.08;
            }
            var re = Math.max(0.35, rr - 0.07);
            posL.push(LAGOA.x + Math.cos(ang) * re, NIVEL_AGUA, LAGOA.z + Math.sin(ang) * re);
        }
        for (var a2 = 0; a2 < NA; a2++) idxL.push(0, a2 + 1, ((a2 + 1) % NA) + 1);
        var geoL = new THREE.BufferGeometry();
        geoL.setAttribute("position", new THREE.Float32BufferAttribute(posL, 3));
        geoL.setIndex(idxL);
        geoL.computeVertexNormals();
        var lagoa = new THREE.Mesh(geoL, new THREE.MeshPhongMaterial({
            color: 0x4b9ecb, transparent: true, opacity: 0.88, shininess: 100,
            specular: 0xbfe8f5, side: THREE.DoubleSide
        }));
        lagoa.receiveShadow = true;
        gCena.add(lagoa);

        var geoEsp = new THREE.BoxGeometry(0.22, 0.025, 0.07);
        function espumas(curva, cor, n, vel) {
            var m = mat(cor);
            for (var i = 0; i < n; i++) {
                var e = new THREE.Mesh(geoEsp, m);
                e.scale.setScalar(0.8 + Math.random() * 0.4);
                espuma.push({ mesh: e, t: i / n, curva: curva, vel: vel });
                gCena.add(e);
            }
            return m;
        }
        espumaMatEsq = espumas(rioCurvaEsq, 0x8f7f52, 12, 0.026);
        espumas(rioCurvaDir, 0xeaf7fa, 14, 0.032);

        // pedras e seixos nas margens (apenas fora da água)
        var pedras = [];
        [rioCurvaEsq, rioCurvaDir].forEach(function (curva) {
            for (var t3 = 0.05; t3 <= 0.95; t3 += 0.06) {
                var p = curva.getPointAt(t3);
                var tg = curva.getTangentAt(t3);
                var l = Math.sqrt(tg.x * tg.x + tg.z * tg.z) || 1;
                var nx = -tg.z / l, nz = tg.x / l;
                for (var lado = -1; lado <= 1; lado += 2) {
                    if (Math.random() < 0.35) continue;
                    var d = 1.25 + Math.random() * 0.7;
                    var px = p.x + nx * d * lado + (Math.random() - 0.5) * 0.4;
                    var pz = p.z + nz * d * lado + (Math.random() - 0.5) * 0.4;
                    if (altura(px, pz) < NIVEL_AGUA + 0.05) continue;
                    var s = 0.35 + Math.random() * 0.45;
                    pedras.push({
                        p: [px, altura(px, pz) + 0.05 * s, pz],
                        s: [s, s * 0.7, s * 1.1],
                        r: [(Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5]
                    });
                }
            }
        });
        var coresPedra = [0x8a8a8a, 0x9e9e9e, 0x7a7a7a, 0x858585];
        var pedraM = new THREE.InstancedMesh(GE.pedra,
            new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: false, roughness: 0.9 }),
            pedras.length);
        for (var p2 = 0; p2 < pedras.length; p2++) {
            var it = pedras[p2];
            _q.setFromEuler(_e.set(it.r[0], it.r[1], it.r[2]));
            _v.set(it.p[0], it.p[1], it.p[2]);
            _s.set(it.s[0], it.s[1], it.s[2]);
            _mtx.compose(_v, _q, _s);
            pedraM.setMatrixAt(p2, _mtx);
            pedraM.setColorAt(p2, _col.setHex(coresPedra[p2 % coresPedra.length]));
        }
        pedraM.instanceMatrix.needsUpdate = true;
        if (pedraM.instanceColor) pedraM.instanceColor.needsUpdate = true;
        pedraM.castShadow = true; pedraM.receiveShadow = true;
        gCena.add(pedraM);
    }

    function montarIlha() {
        var geo = new THREE.PlaneGeometry(ILHA_W, ILHA_D, 220, 150);
        geo.rotateX(-Math.PI / 2);
        var pos = geo.attributes.position;
        for (var i = 0; i < pos.count; i++) {
            pos.setY(i, altura(pos.getX(i), pos.getZ(i)));
        }
        geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3));
        geo.computeVertexNormals();
        terreno = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            vertexColors: true, flatShading: false, roughness: 1, metalness: 0
        }));
        terreno.receiveShadow = true;
        terreno.castShadow = true;
        gCena.add(terreno);

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
        // camadas abaixo do terreno: topo bem abaixo do nível da água para não sobrepor
        [[-0.85, -0.75, 0x6e5a48], [-1.6, -1.25, 0x9a7a5a], [-2.85, -1.4, 0xb89b7a]].forEach(function (L) {
            var g = new THREE.ExtrudeGeometry(forma, { depth: L[1], bevelEnabled: false });
            g.rotateX(Math.PI / 2);
            var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
                color: L[2], flatShading: true, roughness: 1, metalness: 0
            }));
            m.position.y = L[0];
            m.castShadow = true; m.receiveShadow = true;
            gCena.add(m);
        });

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
        function b(w, h, d, cor, px, py, pz, arred) {
            var geo = arred ? new THREE.CylinderGeometry(w / 2, w / 2, h, 14) : new THREE.BoxGeometry(w, h, d);
            var m = new THREE.Mesh(geo, mat(cor));
            m.position.set(px, py, pz);
            m.castShadow = true; m.receiveShadow = true;
            g.add(m);
            return m;
        }
        // casa principal com base arredondada e alpendre
        b(2.6, 1.3, 1.9, 0xf3e3c3, 0, 0.65, 0);
        // alpendre frontal
        var alpendre = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.08, 0.55), mat(0xe8d8b8));
        alpendre.position.set(0, 1.32, 1.12);
        alpendre.castShadow = true; alpendre.receiveShadow = true;
        g.add(alpendre);
        // colunas do alpendre
        for (var cx = -1.0; cx <= 1.0; cx += 0.67) {
            var col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.32, 8), mat(0xffffff));
            col.position.set(cx, 0.66, 1.35);
            col.castShadow = true;
            g.add(col);
        }
        // telhado com mais segmentos
        var telhado = new THREE.Mesh(new THREE.ConeGeometry(2.05, 1.1, 4, 1, true), mat(0xb3402e));
        telhado.rotation.y = Math.PI / 4;
        telhado.position.set(0, 1.85, 0);
        telhado.castShadow = true;
        g.add(telhado);
        // beiral
        var beiral = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.08, 2.25), mat(0x9a3525));
        beiral.position.set(0, 1.35, 0);
        beiral.castShadow = true;
        g.add(beiral);
        // porta e janelas com molduras
        b(0.5, 0.8, 0.12, 0x8a5a33, 0.55, 0.4, 0.98);
        var moldJ1 = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.61, 0.06), mat(0xffffff));
        moldJ1.position.set(-0.75, 0.85, 0.98);
        g.add(moldJ1);
        b(0.55, 0.55, 0.12, 0xffe9a8, -0.75, 0.85, 0.99);
        var moldJ2 = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.61, 0.06), mat(0xffffff));
        moldJ2.position.set(0.75, 0.85, 0.98);
        g.add(moldJ2);
        b(0.55, 0.55, 0.12, 0xffe9a8, 0.75, 0.85, 0.99);
        // chaminé
        var chim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 10), mat(0xb3402e));
        chim.position.set(-0.85, 2.2, -0.4);
        chim.castShadow = true;
        g.add(chim);
        var fumaca = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xdddddd, true));
        fumaca.position.set(-0.85, 2.7, -0.4);
        fumaca.material.opacity = 0.35;
        g.add(fumaca);
        g.userData.fumaca = fumaca;
        // silo
        var silo = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.3, 16), mat(0xd7dee2));
        silo.position.set(2.3, 1.15, -0.3);
        silo.castShadow = true;
        g.add(silo);
        var tampa = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.5, 16), mat(0x9aa7ad));
        tampa.position.set(2.3, 2.55, -0.3);
        tampa.castShadow = true;
        g.add(tampa);
        // silo menor ao lado
        var silo2 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.6, 14), mat(0xcfd6da));
        silo2.position.set(3.1, 0.8, -0.8);
        silo2.castShadow = true;
        g.add(silo2);
        // cercado simples
        for (var fx = -2.4; fx <= 2.4; fx += 0.7) {
            var rip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 5), mat(0x8a5a33));
            rip.position.set(fx, 0.27, 1.9);
            g.add(rip);
        }
        g.position.set(SEDE.x, y - 0.05, SEDE.z);
        g.rotation.y = 0.35;
        gCena.add(g);
    }

    function montarPasto() {
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
        gCena.add(instanciar(GE.poste, 0x8a5a33, itens));

        var r2 = rng(4321);
        for (var v = 0; v < 3; v++) {
            (function (idx) {
                var x = PASTO.x0 + 0.8 + r2() * (PASTO.x1 - PASTO.x0 - 1.6);
                var z = PASTO.z0 + 0.5 + r2() * (PASTO.z1 - PASTO.z0 - 1);
                var rot = r2() * Math.PI * 2;
                carregarGLB('modelos/cow_poly.glb', function (gltf) {
                    var vaca = gltf.scene;
                    vaca.scale.setScalar(0.018);
                    var box = new THREE.Box3().setFromObject(vaca);
                    var h = box.max.y - box.min.y;
                    vaca.position.set(x, altura(x, z) - h * 0.02, z);
                    vaca.rotation.y = rot;
                    vaca.traverse(function (o) {
                        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
                    });
                    vaca.userData.fase = idx * 1.3;
                    vacas.push(vaca);
                    gCena.add(vaca);
                });
            })(v);
        }
    }

    function montarTrator(x, z, rot) {
        carregarGLB('modelos/tractor_scaled.glb', function (gltf) {
            var trator = gltf.scene;
            trator.scale.setScalar(0.35);
            var box = new THREE.Box3().setFromObject(trator);
            var h = box.max.y - box.min.y;
            trator.position.set(x, altura(x, z) - h * 0.05, z);
            trator.rotation.y = rot;
            trator.traverse(function (o) {
                if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
            });
            gCena.add(trator);
        });
    }

    function montarDrone() {
        drone = new THREE.Group();
        // corpo arredondado
        var corpo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), mat(0x37474f));
        corpo.scale.set(1.2, 0.45, 0.8);
        corpo.castShadow = true;
        drone.add(corpo);
        // braços arredondados
        var bracoX = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8), mat(0x37474f));
        bracoX.rotation.z = Math.PI / 2;
        bracoX.position.y = 0.02;
        drone.add(bracoX);
        var bracoZ = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8), mat(0x37474f));
        bracoZ.rotation.x = Math.PI / 2;
        bracoZ.position.y = 0.02;
        drone.add(bracoZ);
        var geoDisco = new THREE.CylinderGeometry(0.34, 0.34, 0.04, 12);
        [[0.95, 0.95], [-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95]].forEach(function (p) {
            var d = new THREE.Mesh(geoDisco, mat(0x8aa0ac));
            d.position.set(p[0], 0.16, p[1]);
            drone.add(d);
            rotores.push(d);
        });
        var cam = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0x263238));
        cam.position.y = -0.18;
        drone.add(cam);
        // luzes piscantes
        var luzV = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0x00ff00, true));
        luzV.position.set(0.85, 0.04, 0.85);
        drone.add(luzV);
        var luzR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0xff0000, true));
        luzR.position.set(-0.85, 0.04, -0.85);
        drone.add(luzR);
        drone.userData.luzes = [luzV, luzR];
        gCena.add(drone);
    }

    function montarAvesNuvensSol() {
        var geoAsa = new THREE.PlaneGeometry(0.8, 0.22);
        for (var i = 0; i < 4; i++) {
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
        var matNuvem = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x8a95a0, flatShading: false, shininess: 0 });
        var geoNuvem = new THREE.SphereGeometry(1, 10, 8);
        [[-14, 13, -6, 2.2], [4, 15.5, -9, 1.6], [16, 12.5, -3, 1.9], [-2, 14, 8, 1.4], [10, 16, -12, 1.2]].forEach(function (n, k) {
            var g = new THREE.Group();
            for (var j = 0; j < 6; j++) {
                var m = new THREE.Mesh(geoNuvem, matNuvem);
                var sx = 1.2 + j * 0.22 + Math.random() * 0.2;
                m.scale.set(sx, 0.45 + (j % 2) * 0.18, 0.75 + j * 0.1);
                m.position.set(j * 1.0 - 2.5, (j % 2) * 0.4 + Math.random() * 0.15, (j % 2) * 0.5);
                g.add(m);
            }
            g.position.set(n[0], n[1], n[2]);
            g.scale.setScalar(n[3]);
            g.userData.vel = 0.25 + k * 0.07;
            nuvens.push(g);
            gCena.add(g);
        });
        var sol = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 14),
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

    function montarPlacas() {
        function placa(texto, x, z, rot, esc) {
            var g = new THREE.Group();
            var h = altura(x, z);
            var poste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), mat(0x6b4a2b));
            poste.position.set(0, 0.55, 0);
            poste.castShadow = true;
            g.add(poste);

            var cv = document.createElement("canvas");
            cv.width = 512; cv.height = 160;
            var cx = cv.getContext("2d");
            cx.fillStyle = "#f3ead9";
            cx.fillRect(0, 0, 512, 160);
            cx.strokeStyle = "#6b4a2b";
            cx.lineWidth = 10;
            cx.strokeRect(5, 5, 502, 150);
            cx.fillStyle = "#3e2b18";
            cx.font = "bold 42px Arial";
            cx.textAlign = "center";
            cx.textBaseline = "middle";
            cx.fillText(texto, 256, 80);

            var tex = new THREE.CanvasTexture(cv);
            var m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
            m.position.set(0, 1.15, 0.02);
            g.add(m);
            var verso = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ color: 0xf3ead9, side: THREE.DoubleSide }));
            verso.position.set(0, 1.15, -0.02);
            g.add(verso);

            g.position.set(x, h, z);
            g.rotation.y = rot || 0;
            g.scale.setScalar(esc || 1);
            gCena.add(g);
        }
        placa("Talhão 1 · Evolução da palhada", (T1.x0 + T1.x1) / 2, T1.z1 + 1.4, 0, 1.1);
        placa("Talhão 2 · Plantio em contorno", (T2.x0 + T2.x1) / 2, T2.z1 + 1.4, 0, 1.1);
        placa("Talhão 3 · Manejo avançado", (T3.x0 + T3.x1) / 2, T3.z1 + 1.4, 0, 1.1);
        placa("APP degradada", -14.5, 6.5, 0.4, 0.9);
        placa("APP preservada", 15.8, 7.0, -0.35, 0.9);
        placa("RL preservada e excedente", 13.5, -9.5, -0.2, 0.95);
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
            if (drone.userData.luzes) {
                drone.userData.luzes[0].material.emissive.setHex(Math.sin(tGlobal * 6) > 0 ? 0x00ff00 : 0x002200);
                drone.userData.luzes[1].material.emissive.setHex(Math.sin(tGlobal * 6 + Math.PI) > 0 ? 0xff0000 : 0x220000);
            }
        }
        espuma.forEach(function (e) {
            e.t += e.vel * dt * 10;
            if (e.t > 1) e.t -= 1;
            var p = e.curva.getPointAt(e.t);
            e.mesh.position.set(p.x, NIVEL_AGUA + 0.05, p.z);
            var tg = e.curva.getTangentAt(e.t);
            e.mesh.rotation.y = Math.atan2(tg.x, tg.z);
        });
        aguas.forEach(function (a) {
            var pos = a.mesh.geometry.attributes.position;
            for (var i = 0; i < pos.count; i++) {
                pos.setY(i, NIVEL_AGUA + Math.sin(tGlobal * 1.8 + a.fases[i]) * 0.02);
            }
            pos.needsUpdate = true;
        });
        vacas.forEach(function (v) {
            v.position.y = altura(v.position.x, v.position.z) + Math.abs(Math.sin(tGlobal * 1.1 + v.userData.fase)) * 0.03;
        });
        // fumaça da chaminé
        gCena.traverse(function (o) {
            if (o.userData && o.userData.fumaca) {
                var f = o.userData.fumaca;
                f.position.y = 2.7 + Math.sin(tGlobal * 0.8) * 0.08;
                f.scale.setScalar(1 + Math.sin(tGlobal * 1.2) * 0.15);
                f.material.opacity = 0.25 + Math.sin(tGlobal * 0.5) * 0.1;
            }
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
        cv.width = 2; cv.height = 512;
        var c = cv.getContext("2d");
        var g = c.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0, "#3b7ab8");
        g.addColorStop(0.35, "#5fa3d4");
        g.addColorStop(0.6, "#9fd0ec");
        g.addColorStop(0.85, "#d6ecf5");
        g.addColorStop(1, "#f5ecd0");
        c.fillStyle = g;
        c.fillRect(0, 0, 2, 512);
        return new THREE.CanvasTexture(cv);
    }

    function luzes() {
        scene.add(new THREE.HemisphereLight(0xbfdfff, 0x7a9a5f, 0.62));
        scene.add(new THREE.AmbientLight(0xffffff, 0.24));
        var sol = new THREE.DirectionalLight(0xfff1d6, 1.2);
        sol.position.set(24, 26, -14);
        sol.castShadow = true;
        sol.shadow.mapSize.set(2048, 2048);
        sol.shadow.camera.left = -24; sol.shadow.camera.right = 24;
        sol.shadow.camera.top = 20; sol.shadow.camera.bottom = -18;
        sol.shadow.camera.near = 4; sol.shadow.camera.far = 90;
        sol.shadow.bias = -0.0006;
        scene.add(sol);
        // névoa sutil de profundidade
        scene.fog = new THREE.Fog(0xd6ecf5, 35, 95);
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
        camera.position.set(28, 18.5, 34);

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

        rioCurvaEsq = curvaDe(RIO_ESQ_PTS);
        rioCurvaDir = curvaDe(RIO_DIR_PTS);
        rioAmoEsq = amostrar(rioCurvaEsq, 64);
        rioAmoDir = amostrar(rioCurvaDir, 64);
        caminhoAmo = CAMINHOS.map(function (pts) {
            return amostrar(curvaDe(pts), 40);
        });
        valeAmo = amostrar(curvaDe(VALE_PTS), 24);

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
        montarPlacas();

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
