// ==================== JARVIS - VERSÃO FINAL COMPLETA ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('JARVIS iniciado');

    // ==================== ELEMENTOS DOM ====================
    const chatBox = document.getElementById('chatBox');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const fileInput = document.getElementById('fileInput');
    const pdfStatusDiv = document.getElementById('pdfStatus');

    if (!sendBtn || !userInput || !chatBox) return;

    // ==================== ESTADO GLOBAL ====================
    let modoSilencio = false;
    let historicoConversa = [];
    let reconhecimento = null;
    let gravando = false;
    
    let pdfDoc = null;
    let pdfPaginaAtual = 1;
    let pdfNumPaginas = 0;
    let pdfFatias = [];
    let indiceFatiaAtual = 0;
    let estaLendoPdf = false;
    let modoEspecialista = false;
    let modoAviao = false;  // modo avião (sem backend)

    const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ? 'http://localhost:5000/'
        : 'https://jarvis-backend-pm7w.onrender.com/';  // substitua pela sua URL real

    // ==================== BANCO DE MEMÓRIA OFFLINE ====================
    let dbMemoriaLocal = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || {
        "geografia": ["Brasil: Brasília. População ~214M.", "EUA: Washington D.C.", "França: Paris.", "Japão: Tóquio."],
        "historia": ["Independência do Brasil: 1822.", "Revolução Francesa: 1789.", "1ª Guerra: 1914-1918.", "2ª Guerra: 1939-1945."],
        "quimica": ["Água: H2O - 18g/mol.", "Sal: NaCl - 58,44g/mol."],
        "fisica": ["Velocidade média = Δs/Δt.", "Força = m·a.", "Energia cinética = (m·v²)/2."],
        "matematica": ["Pitágoras: a²=b²+c².", "Área círculo: πr².", "Regra de três."],
        "programacao": ["Python, JS, Java, C++.", "HTML/CSS."],
        "filosofia": ["Sócrates: 'Conhece-te a ti mesmo'.", "Platão, Aristóteles."],
        "portugues": ["Mas x Mais.", "Por que/Porque."],
        "diario": [],
        "flashcards": [{ q: "Capital do Brasil?", r: "Brasília" }]
    };

    const piadas = [
        "Por que o programador foi ao mercado? Porque precisava de um par de bytes!",
        "O que o zero disse para o oito? Bonito cinto!",
        "Qual o cúmulo do preguiçoso? Ser enterrado numa montanha de documentos.",
        "Por que o livro de matemática é triste? Porque tem muitos problemas."
    ];

    let aguardandoAprenderPDF = false;
    let nomeMateriaPDF = '';

    // ==================== FUNÇÕES UI ====================
    function exibirMensagemUsuario(texto) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'balao user-msg';
        msgDiv.innerHTML = `<div class="avatar"><i class="fas fa-user"></i></div>
                            <div class="message-content">
                                <span class="sender-name">Você</span>
                                <p>${texto.replace(/</g, '&lt;')}</p>
                            </div>`;
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        historicoConversa.push({ role: "user", content: texto });
        localStorage.setItem('jarvis_historico', JSON.stringify(historicoConversa));
    }

    function exibirRespostaJarvis(resposta, falarTexto = true, isHtml = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'balao jarvis-msg';
        const conteudo = isHtml ? resposta : resposta.replace(/\n/g, '<br>');
        msgDiv.innerHTML = `<div class="avatar"><i class="fas fa-robot"></i></div>
                            <div class="message-content">
                                <span class="sender-name">JARVIS</span>
                                <p>${conteudo}</p>
                            </div>`;
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        historicoConversa.push({ role: "assistant", content: resposta });
        localStorage.setItem('jarvis_historico', JSON.stringify(historicoConversa));
        if (falarTexto && !modoSilencio) {
            const utterance = new SpeechSynthesisUtterance(resposta.replace(/<[^>]*>/g, ''));
            utterance.lang = 'pt-BR';
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        }
    }

    function atualizarStatusPDF(texto) {
        if (pdfStatusDiv) pdfStatusDiv.innerHTML = `<i class="fas fa-file-pdf"></i> ${texto}`;
    }

    window.inserirComando = function(cmd) {
        userInput.value = cmd;
        enviarMensagem();
    };

    function adicionarConhecimentoOffline(materia, conteudo) {
        if (!dbMemoriaLocal[materia]) dbMemoriaLocal[materia] = [];
        dbMemoriaLocal[materia].push(conteudo);
        localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
        return `✅ Aprendi: "${materia}" -> "${conteudo.substring(0, 50)}..."`;
    }

    // ==================== PDF FUNCTIONS ====================
    async function carregarPDFCompleto(arrayBuffer) {
        try {
            pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            pdfNumPaginas = pdfDoc.numPages;
            pdfPaginaAtual = 1;
            estaLendoPdf = true;
            atualizarStatusPDF(`Carregado: ${pdfNumPaginas} páginas`);
            let textoCompleto = "";
            for (let i = 1; i <= pdfNumPaginas; i++) {
                const pagina = await pdfDoc.getPage(i);
                const conteudo = await pagina.getTextContent();
                textoCompleto += conteudo.items.map(item => item.str).join(" ") + "\n";
            }
            pdfFatias = fatiarTexto(textoCompleto, 30000);
            indiceFatiaAtual = 0;
            atualizarStatusPDF(`${pdfNumPaginas} páginas, ${pdfFatias.length} fatias`);
            return textoCompleto;
        } catch(e) {
            console.error(e);
            return null;
        }
    }

    function fatiarTexto(texto, tamanhoMax) {
        const palavras = texto.split(' ');
        const fatias = [];
        let atual = '';
        for (let p of palavras) {
            if ((atual + p).length > tamanhoMax) {
                fatias.push(atual.trim());
                atual = p + ' ';
            } else {
                atual += p + ' ';
            }
        }
        if (atual.trim()) fatias.push(atual.trim());
        return fatias;
    }

    async function lerPaginaPDF(paginaNum, modo = 'leitura') {
        if (!pdfDoc || paginaNum < 1 || paginaNum > pdfNumPaginas) return false;
        const pagina = await pdfDoc.getPage(paginaNum);
        const conteudo = await pagina.getTextContent();
        const texto = conteudo.items.map(item => item.str).join(' ');
        let prompt;
        if (modo === 'especialista')
            prompt = `[LEITURA_ESPECIALISTA] Página ${paginaNum}:\n${texto}\nNarre como documentário dramático.`;
        else if (modo === 'leitura')
            prompt = `[LEITURA_PURA_DO_PDF] Página ${paginaNum}:\n${texto}`;
        else
            prompt = `[CONTINUAÇÃO DO PDF] Página ${paginaNum}:\n${texto}\nFaça análise detalhada.`;
        exibirRespostaJarvis(`📄 Lendo página ${paginaNum}...`, false);
        historicoConversa.push({ role: "user", content: prompt });
        await chamarIA();
        return true;
    }

    async function enviarFatiaPDF(modoLeitura = false) {
        if (indiceFatiaAtual >= pdfFatias.length) {
            exibirRespostaJarvis("Fim do documento.");
            estaLendoPdf = false;
            atualizarStatusPDF("Finalizado");
            return;
        }
        const textoFatia = pdfFatias[indiceFatiaAtual];
        indiceFatiaAtual++;
        atualizarStatusPDF(`Fatia ${indiceFatiaAtual}/${pdfFatias.length}`);
        let prompt = modoLeitura
            ? `[LEITURA_PURA_DO_PDF] Fatia ${indiceFatiaAtual}: ${textoFatia}`
            : `[CONTINUAÇÃO DO PDF] Fatia ${indiceFatiaAtual}: ${textoFatia}\nFaça análise detalhada.`;
        historicoConversa.push({ role: "user", content: prompt });
        await chamarIA();
    }

    // ==================== COMANDOS OFFLINE BÁSICOS ====================
    function processarComandoOffline(texto) {
        const cmd = texto.toLowerCase();
        if (cmd.includes('que horas são')) {
            const agora = new Date();
            return `${agora.getHours()}:${String(agora.getMinutes()).padStart(2,'0')}`;
        }
        if (cmd.includes('que dia é hoje')) {
            const hoje = new Date();
            return `${hoje.getDate()}/${hoje.getMonth()+1}/${hoje.getFullYear()}`;
        }
        if (cmd === 'conte uma piada') return piadas[Math.floor(Math.random() * piadas.length)];
        if (cmd.startsWith('registrar diário')) {
            let nota = texto.replace(/registrar diário/i, '').trim();
            if (!nota) return "Escreva algo.";
            dbMemoriaLocal.diario.push(`${new Date().toLocaleDateString()}: ${nota}`);
            localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
            return "Diário registrado.";
        }
        if (cmd === 'ler diário') {
            if (!dbMemoriaLocal.diario.length) return "Diário vazio.";
            return "<b>Diário:</b><br>" + dbMemoriaLocal.diario.join("<br>");
        }
        if (cmd === 'flashcard') {
            const card = dbMemoriaLocal.flashcards[Math.floor(Math.random() * dbMemoriaLocal.flashcards.length)];
            return `<b>Flashcard:</b> ${card.q}`;
        }
        for (let materia in dbMemoriaLocal) {
            if (cmd === materia && dbMemoriaLocal[materia].length)
                return `<b>${materia.toUpperCase()}</b><br>${dbMemoriaLocal[materia].slice(0,5).join('<br>')}`;
        }
        try {
            const mathMatch = texto.match(/[\d\s\+\-\*\/\(\)\.\,\^\%]+/);
            if (mathMatch && !/[a-zA-Z]/.test(mathMatch[0])) {
                let expr = mathMatch[0].replace(/,/g, '.').replace(/\^/g, '**');
                let result = eval(expr);
                if (!isNaN(result)) return `Resultado: ${result}`;
            }
        } catch(e) {}
        return null;
    }

    // ==================== IA (BACKEND) ====================
    async function chamarIA() {
        if (modoAviao) {
            exibirRespostaJarvis("✈️ Modo avião ativo. Use comandos offline.");
            return;
        }
        const typingDiv = document.getElementById('typingIndicator');
        if (typingDiv) typingDiv.style.display = 'flex';
        try {
            const response = await fetch(`${BACKEND_URL}api/comando`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ historico: historicoConversa.slice(-20), modo_especialista: modoEspecialista })
            });
            const data = await response.json();
            if (typingDiv) typingDiv.style.display = 'none';
            exibirRespostaJarvis(data.resposta || "Sem resposta da IA.");
        } catch (error) {
            if (typingDiv) typingDiv.style.display = 'none';
            exibirRespostaJarvis("Erro ao conectar com o servidor. Verifique o backend ou use comandos offline.");
        }
    }

    // ==================== ENVIO PRINCIPAL (TODOS OS COMANDOS) ====================
    async function enviarMensagem() {
        const texto = userInput.value.trim();
        if (!texto) return;

        exibirMensagemUsuario(texto);
        userInput.value = '';
        const cmd = texto.toLowerCase();

        // ---------- APRENDER (OFFLINE) ----------
        if (cmd.startsWith('aprender ')) {
            let resto = texto.substring(9).trim();
            let doisPontos = resto.indexOf(':');
            if (doisPontos > 0) {
                let materia = resto.substring(0, doisPontos).trim().toLowerCase();
                let conteudo = resto.substring(doisPontos + 1).trim();
                if (materia && conteudo) exibirRespostaJarvis(adicionarConhecimentoOffline(materia, conteudo));
                else exibirRespostaJarvis("Use: aprender [matéria] : [conteúdo]");
            } else exibirRespostaJarvis("Use: aprender [matéria] : [conteúdo]");
            return;
        }

        // ---------- APRENDER PDF ----------
        if (cmd.startsWith('aprender pdf')) {
            let nome = cmd.replace('aprender pdf', '').trim();
            if (!nome) exibirRespostaJarvis("Especifique o nome da matéria: aprender pdf [nome]");
            else {
                aguardandoAprenderPDF = true;
                nomeMateriaPDF = nome;
                exibirRespostaJarvis(`📖 Ok, envie um PDF e ele será adicionado à matéria "${nome}".`);
            }
            return;
        }

        // ---------- CONTROLE DE PDF (navegação, continue, leia) ----------
        if (estaLendoPdf) {
            if (cmd === 'próxima página') {
                if (pdfDoc && pdfPaginaAtual < pdfNumPaginas) {
                    pdfPaginaAtual++;
                    await lerPaginaPDF(pdfPaginaAtual, 'analise');
                    atualizarStatusPDF(`Página ${pdfPaginaAtual}/${pdfNumPaginas}`);
                } else exibirRespostaJarvis("Já está na última página.");
                return;
            }
            if (cmd === 'página anterior') {
                if (pdfDoc && pdfPaginaAtual > 1) {
                    pdfPaginaAtual--;
                    await lerPaginaPDF(pdfPaginaAtual, 'analise');
                    atualizarStatusPDF(`Página ${pdfPaginaAtual}/${pdfNumPaginas}`);
                } else exibirRespostaJarvis("Já está na primeira página.");
                return;
            }
            if (cmd === 'modo especialista') {
                modoEspecialista = true;
                if (pdfDoc) await lerPaginaPDF(pdfPaginaAtual, 'especialista');
                else exibirRespostaJarvis("Nenhum PDF carregado.");
                return;
            }
            if (cmd === 'continue' || cmd === 'continuar') { await enviarFatiaPDF(false); return; }
            if (cmd === 'leia') { await enviarFatiaPDF(true); return; }
        }

        // ---------- EXPORTAR DIÁRIO (TXT) ----------
        if (cmd === 'exportar diario') {
            let db = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || { diario: [] };
            let conteudo = db.diario.join("\n");
            if (!conteudo) conteudo = "Diário vazio.";
            const blob = new Blob([conteudo], { type: "text/plain" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = "diario_jarvis.txt";
            link.click();
            exibirRespostaJarvis("✅ Diário exportado como 'diario_jarvis.txt'");
            return;
        }

        // ---------- EXPORTAR FLASHCARDS (CSV) ----------
        if (cmd === 'exportar flashcards') {
            let db = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || { flashcards: [] };
            let linhas = ["pergunta,resposta"];
            db.flashcards.forEach(card => {
                linhas.push(`"${card.q}","${card.r}"`);
            });
            const csv = linhas.join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = "flashcards_jarvis.csv";
            link.click();
            exibirRespostaJarvis("✅ Flashcards exportados como 'flashcards_jarvis.csv'");
            return;
        }

        // ---------- GERAR ÁUDIO (MP3) ----------
        if (cmd.startsWith('criar audio sobre ')) {
            let tema = texto.replace(/criar audio sobre /i, "").trim();
            if (!tema) {
                exibirRespostaJarvis("Especifique um tema. Ex: 'criar audio sobre Revolução Francesa'");
                return;
            }
            exibirRespostaJarvis(`🎧 Gerando áudio sobre *${tema}*...`, false);
            const promptIA = `Escreva um resumo curto (máximo 1500 caracteres) sobre: ${tema}.`;
            const respIA = await fetch(`${BACKEND_URL}api/comando`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ historico: [{ role: "user", content: promptIA }] })
            });
            const dataIA = await respIA.json();
            const textoAudio = dataIA.resposta || "Conteúdo não gerado.";
            const respAudio = await fetch(`${BACKEND_URL}api/gerar_audio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto: textoAudio })
            });
            if (respAudio.ok) {
                const blob = await respAudio.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "audio.mp3";
                a.click();
                exibirRespostaJarvis("✅ Áudio gerado! O download deve começar.");
            } else {
                exibirRespostaJarvis("❌ Erro ao gerar áudio.");
            }
            return;
        }

        // ---------- CRIAR SLIDES (PPTX) ----------
        if (cmd.startsWith('criar slides sobre ')) {
            let tema = texto.replace(/criar slides sobre /i, "").trim();
            if (!tema) {
                exibirRespostaJarvis("Especifique um tema. Ex: 'criar slides sobre SGBD'");
                return;
            }
            exibirRespostaJarvis(`📊 Gerando slides sobre *${tema}*...`, false);
            const promptIA = `Crie um conteúdo estruturado (use <h1>, <h2>, <p>, <ul>) para uma apresentação de slides sobre: ${tema}. Máximo 5 tópicos.`;
            const respIA = await fetch(`${BACKEND_URL}api/comando`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ historico: [{ role: "user", content: promptIA }] })
            });
            const dataIA = await respIA.json();
            const conteudo = dataIA.resposta || "Conteúdo não gerado.";
            const respSlides = await fetch(`${BACKEND_URL}api/gerar_slides`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ titulo: tema, conteudo: conteudo })
            });
            if (respSlides.ok) {
                const blob = await respSlides.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "slides.pptx";
                a.click();
                exibirRespostaJarvis("✅ Slides gerados! Download iniciado.");
            } else {
                exibirRespostaJarvis("❌ Erro ao gerar slides.");
            }
            return;
        }

        // ---------- CLIMA ----------
        if (cmd.startsWith('clima em ')) {
            let cidade = texto.replace(/clima em /i, "").trim();
            if (!cidade) {
                exibirRespostaJarvis("Informe a cidade. Ex: 'clima em São Paulo'");
                return;
            }
            exibirRespostaJarvis(`🌡️ Consultando clima em ${cidade}...`, false);
            const resp = await fetch(`${BACKEND_URL}api/clima`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cidade: cidade })
            });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }

        // ---------- MASSA MOLAR ----------
        if (cmd.startsWith('massa molar de ')) {
            let formula = texto.replace(/massa molar de /i, "").trim();
            if (!formula) {
                exibirRespostaJarvis("Informe a fórmula. Ex: 'massa molar de H2O'");
                return;
            }
            const resp = await fetch(`${BACKEND_URL}api/massa_molar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formula: formula })
            });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }

        // ---------- EXECUTAR CÓDIGO ----------
        if (cmd.startsWith('rode python:')) {
            let codigo = texto.replace(/rode python:/i, "").trim();
            if (!codigo) {
                exibirRespostaJarvis("Digite o código após 'rode python:'");
                return;
            }
            exibirRespostaJarvis("🐍 Executando código...", false);
            const resp = await fetch(`${BACKEND_URL}api/executar_codigo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ linguagem: "python", codigo: codigo })
            });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('rode js:')) {
            let codigo = texto.replace(/rode js:/i, "").trim();
            if (!codigo) return exibirRespostaJarvis("Código vazio.");
            const resp = await fetch(`${BACKEND_URL}api/executar_codigo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ linguagem: "javascript", codigo: codigo })
            });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }

        // ---------- ENCURTAR LINK ----------
        if (cmd.startsWith('encurtar ')) {
            let link = texto.replace(/encurtar /i, "").trim();
            if (!link) return exibirRespostaJarvis("Forneça o link.");
            const resp = await fetch(`${BACKEND_URL}api/encurtar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: link })
            });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }

        // ---------- LER PDF EM VOZ ALTA (contínuo) ----------
        if (cmd === 'ler tudo em voz alta' && estaLendoPdf && pdfDoc) {
            exibirRespostaJarvis("🔊 Iniciando leitura contínua em voz alta...", false);
            let pagina = pdfPaginaAtual;
            const falarPagina = async () => {
                if (pagina > pdfNumPaginas) {
                    exibirRespostaJarvis("Leitura finalizada.");
                    return;
                }
                const pg = await pdfDoc.getPage(pagina);
                const conteudo = await pg.getTextContent();
                const texto = conteudo.items.map(i => i.str).join(' ');
                const utterance = new SpeechSynthesisUtterance(texto);
                utterance.lang = 'pt-BR';
                utterance.onend = () => {
                    pagina++;
                    falarPagina();
                };
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
                exibirRespostaJarvis(`📖 Lendo página ${pagina}...`, false);
            };
            falarPagina();
            return;
        }

        // ---------- LEMBRETE (notificação) ----------
        if (cmd.startsWith('lembre-me de ')) {
            let resto = texto.replace(/lembre-me de /i, "").trim();
            let match = resto.match(/(.+?)\s+às\s+(\d{1,2}):(\d{2})/);
            if (match) {
                let tarefa = match[1];
                let hora = parseInt(match[2]);
                let minuto = parseInt(match[3]);
                let agora = new Date();
                let dataAlvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, minuto, 0);
                if (dataAlvo < agora) dataAlvo.setDate(dataAlvo.getDate() + 1);
                let ms = dataAlvo - agora;
                if (ms > 0) {
                    setTimeout(() => {
                        new Notification("🔔 JARVIS", { body: tarefa });
                        exibirRespostaJarvis(`🔔 Lembrete: ${tarefa}`);
                    }, ms);
                    exibirRespostaJarvis(`✅ Lembrete criado para ${dataAlvo.toLocaleTimeString()}`);
                } else {
                    exibirRespostaJarvis("Horário inválido.");
                }
            } else {
                exibirRespostaJarvis("Use: lembre-me de [tarefa] às [hh:mm]");
            }
            return;
        }

        // ---------- CONVERSÃO DE UNIDADES (offline) ----------
        if (cmd.startsWith('converter ')) {
            let partes = texto.match(/converter (\d+(?:\.\d+)?)\s+(\w+)\s+para\s+(\w+)/i);
            if (partes) {
                let valor = parseFloat(partes[1]);
                let de = partes[2].toLowerCase();
                let para = partes[3].toLowerCase();
                const resp = await fetch(`${BACKEND_URL}api/converter`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ valor: valor, de: de, para: para })
                });
                const data = await resp.json();
                exibirRespostaJarvis(data.resposta || data.erro);
            } else {
                exibirRespostaJarvis("Formato: converter [valor] [unidade] para [unidade]. Ex: converter 10 km para milhas");
            }
            return;
        }

        // ---------- GERAR SENHA (offline) ----------
        if (cmd.startsWith('gerar senha')) {
            let tamanho = parseInt(cmd.match(/\d+/)?.[0]) || 12;
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
            let senha = "";
            for (let i = 0; i < tamanho; i++) {
                senha += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            exibirRespostaJarvis(`🔐 Senha gerada (${tamanho} caracteres): \`${senha}\``);
            return;
        }

        // ---------- TRADUTOR OFFLINE (dicionário simples) ----------
        const dicionario = {
            "hello": "olá", "world": "mundo", "good": "bom", "bad": "ruim",
            "house": "casa", "car": "carro", "dog": "cachorro", "cat": "gato",
            "sun": "sol", "moon": "lua", "star": "estrela", "water": "água",
            "fire": "fogo", "earth": "terra", "air": "ar"
        };
        if (cmd.startsWith('traduzir ')) {
            let palavra = texto.replace(/traduzir /i, "").trim().toLowerCase();
            if (dicionario[palavra]) {
                exibirRespostaJarvis(`📖 Tradução de "${palavra}" → "${dicionario[palavra]}"`);
            } else {
                exibirRespostaJarvis(`Tradução para "${palavra}" não encontrada. Você pode ensinar: aprender traducao_${palavra} : [tradução]`);
            }
            return;
        }

        // ---------- CONTROLE DE GASTOS (localStorage) ----------
        if (cmd.startsWith('adicionar gasto ')) {
            let resto = texto.replace(/adicionar gasto /i, "").trim();
            let partes = resto.match(/(.+?)\s+(\d+(?:\.\d+)?)/);
            if (partes) {
                let categoria = partes[1].trim();
                let valor = parseFloat(partes[2]);
                let gastos = JSON.parse(localStorage.getItem('jarvis_gastos')) || [];
                gastos.push({ categoria, valor, data: new Date().toISOString() });
                localStorage.setItem('jarvis_gastos', JSON.stringify(gastos));
                exibirRespostaJarvis(`💰 Gasto adicionado: ${categoria} - R$ ${valor.toFixed(2)}`);
            } else {
                exibirRespostaJarvis("Formato: adicionar gasto [categoria] [valor]. Ex: adicionar gasto mercado 50.00");
            }
            return;
        }
        if (cmd === 'resumo gastos') {
            let gastos = JSON.parse(localStorage.getItem('jarvis_gastos')) || [];
            if (gastos.length === 0) {
                exibirRespostaJarvis("Nenhum gasto registrado.");
            } else {
                let total = gastos.reduce((s, g) => s + g.valor, 0);
                let porCategoria = {};
                gastos.forEach(g => { porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.valor; });
                let resumo = `💰 Total de gastos: R$ ${total.toFixed(2)}\nPor categoria:\n`;
                for (let cat in porCategoria) {
                    resumo += `   ${cat}: R$ ${porCategoria[cat].toFixed(2)}\n`;
                }
                exibirRespostaJarvis(resumo);
            }
            return;
        }

        // ---------- NOTÍCIAS (RSS) ----------
        if (cmd === 'últimas notícias' || cmd === 'notícias') {
            exibirRespostaJarvis("📰 Buscando as últimas notícias...", false);
            const resp = await fetch(`${BACKEND_URL}api/noticias`);
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }

        // ---------- HORÓSCOPO ----------
        if (cmd.startsWith('horóscopo ')) {
            let signo = texto.replace(/horóscopo /i, "").trim().toLowerCase();
            const signos = ["aries", "touro", "gemeos", "cancer", "leao", "virgem", "libra", "escorpiao", "sagitario", "capricornio", "aquario", "peixes"];
            if (!signos.includes(signo)) {
                exibirRespostaJarvis("Signo inválido. Escolha: aries, touro, gemeos, cancer, leao, virgem, libra, escorpiao, sagitario, capricornio, aquario, peixes.");
                return;
            }
            exibirRespostaJarvis(`🔮 Buscando horóscopo para ${signo}...`, false);
            try {
                const resp = await fetch(`https://horoscope-api.herokuapp.com/horoscope/${signo}/today`);
                const data = await resp.json();
                exibirRespostaJarvis(`🔮 Horóscopo de ${signo}: ${data.horoscope || "Não disponível"}`);
            } catch {
                exibirRespostaJarvis("Erro ao buscar horóscopo. Tente novamente.");
            }
            return;
        }

        // ---------- TABUADA ----------
        if (cmd.startsWith('tabuada do ')) {
            let num = parseInt(cmd.replace('tabuada do', '').trim());
            if (!isNaN(num)) {
                let resultado = `📐 Tabuada do ${num}:\n`;
                for (let i = 1; i <= 10; i++) {
                    resultado += `${num} x ${i} = ${num * i}\n`;
                }
                exibirRespostaJarvis(resultado);
            } else {
                exibirRespostaJarvis("Digite: tabuada do [número]");
            }
            return;
        }

        // ---------- IMC ----------
        if (cmd.startsWith('imc ')) {
            let match = texto.match(/imc\s+peso\s+(\d+(?:\.\d+)?)\s+altura\s+(\d+(?:\.\d+)?)/i);
            if (match) {
                let peso = parseFloat(match[1]);
                let altura = parseFloat(match[2]);
                let imc = peso / (altura * altura);
                let classificacao = "";
                if (imc < 18.5) classificacao = "Abaixo do peso";
                else if (imc < 25) classificacao = "Peso normal";
                else if (imc < 30) classificacao = "Sobrepeso";
                else if (imc < 35) classificacao = "Obesidade grau I";
                else if (imc < 40) classificacao = "Obesidade grau II";
                else classificacao = "Obesidade grau III";
                exibirRespostaJarvis(`📊 IMC = ${imc.toFixed(2)} - ${classificacao}`);
            } else {
                exibirRespostaJarvis("Formato: imc peso [kg] altura [m]. Ex: imc peso 70 altura 1.75");
            }
            return;
        }

        // ---------- JUROS COMPOSTOS ----------
        if (cmd.startsWith('juros compostos ')) {
            let match = texto.match(/juros compostos\s+capital\s+(\d+(?:\.\d+)?)\s+taxa\s+(\d+(?:\.\d+)?)%?\s+meses\s+(\d+)/i);
            if (match) {
                let capital = parseFloat(match[1]);
                let taxa = parseFloat(match[2]) / 100;
                let meses = parseInt(match[3]);
                let montante = capital * Math.pow(1 + taxa, meses);
                let juros = montante - capital;
                exibirRespostaJarvis(`📈 Montante: R$ ${montante.toFixed(2)}\nJuros: R$ ${juros.toFixed(2)}`);
            } else {
                exibirRespostaJarvis("Formato: juros compostos capital [valor] taxa [%] meses [n]. Ex: juros compostos capital 1000 taxa 5 meses 12");
            }
            return;
        }

        // ---------- POMODORO (timer) ----------
        if (cmd.startsWith('pomodoro ')) {
            let minutos = parseInt(cmd.replace('pomodoro', '').trim());
            if (!isNaN(minutos) && minutos > 0) {
                exibirRespostaJarvis(`🍅 Pomodoro de ${minutos} minutos iniciado!`);
                setTimeout(() => {
                    exibirRespostaJarvis(`⏰ Pomodoro de ${minutos} minutos finalizado!`);
                    if (Notification.permission === "granted") {
                        new Notification("Pomodoro", { body: "Tempo finalizado!" });
                    }
                }, minutos * 60 * 1000);
            } else {
                exibirRespostaJarvis("Digite: pomodoro [minutos]. Ex: pomodoro 25");
            }
            return;
        }

        // ---------- TELA CHEIA ----------
        if (cmd === 'tela cheia') {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
                exibirRespostaJarvis("🖥️ Tela cheia ativada.");
            } else {
                exibirRespostaJarvis("Tela cheia não suportada neste navegador.");
            }
            return;
        }

        // ---------- VIBRAR ----------
        if (cmd === 'vibrar') {
            if (navigator.vibrate) {
                navigator.vibrate(200);
                exibirRespostaJarvis("📳 Vibração acionada.");
            } else {
                exibirRespostaJarvis("Vibração não suportada.");
            }
            return;
        }

        // ---------- BUSCA NO HISTÓRICO ----------
        if (cmd.startsWith('buscar no histórico ')) {
            let termo = cmd.replace('buscar no histórico', '').trim();
            let historicoCompleto = JSON.parse(localStorage.getItem('jarvis_historico')) || [];
            let resultados = historicoCompleto.filter(msg => msg.content.toLowerCase().includes(termo));
            if (resultados.length === 0) {
                exibirRespostaJarvis(`Nenhuma mensagem encontrada com "${termo}".`);
            } else {
                let resp = `🔍 Resultados para "${termo}":\n` + resultados.slice(-5).map(m => `${m.role}: ${m.content.substring(0, 100)}...`).join("\n");
                exibirRespostaJarvis(resp);
            }
            return;
        }

        // ---------- MODO AVIÃO ----------
        if (cmd === 'modo avião') {
            modoAviao = true;
            exibirRespostaJarvis("✈️ Modo avião ativado. Comandos offline apenas.");
            return;
        }
        if (cmd === 'modo normal') {
            modoAviao = false;
            exibirRespostaJarvis("📡 Modo normal ativado. IA reconectada.");
            return;
        }

        // ---------- COMANDOS OFFLINE GERAIS ----------
        let respostaOffline = processarComandoOffline(texto);
        if (respostaOffline) {
            exibirRespostaJarvis(respostaOffline, true, true);
            return;
        }

        // ---------- SE NADA DISSO, CHAMA IA (se modo avião não estiver ativo) ----------
        if (modoAviao) {
            exibirRespostaJarvis("✈️ Modo avião ativo. Use comandos offline.");
        } else {
            historicoConversa.push({ role: "user", content: texto });
            await chamarIA();
        }
    }

    // ==================== UPLOAD DE PDF (com aprender pdf) ====================
    async function arquivoSelecionado() {
        if (!fileInput || !fileInput.files.length) return;
        const arquivo = fileInput.files[0];
        if (arquivo.type !== 'application/pdf') {
            exibirRespostaJarvis("Envie um arquivo PDF válido.");
            fileInput.value = '';
            return;
        }
        exibirMensagemUsuario(`📎 Enviou o PDF: ${arquivo.name}`);
        const arrayBuffer = await arquivo.arrayBuffer();
        const textoCompleto = await carregarPDFCompleto(arrayBuffer);
        if (aguardandoAprenderPDF && nomeMateriaPDF && textoCompleto) {
            adicionarConhecimentoOffline(nomeMateriaPDF, textoCompleto);
            exibirRespostaJarvis(`📚 PDF aprendido como matéria "${nomeMateriaPDF}". Agora consulte digitando "${nomeMateriaPDF}".`);
            aguardandoAprenderPDF = false;
            nomeMateriaPDF = '';
            fileInput.value = '';
            return;
        }
        if (textoCompleto) {
            exibirRespostaJarvis(`✅ PDF carregado: ${pdfNumPaginas} páginas, ${pdfFatias.length} fatias.\nUse "continue" para análise ou "leia" para texto puro.\nNavegue com "próxima página".`);
        } else {
            exibirRespostaJarvis("Falha ao processar o PDF.");
        }
        fileInput.value = '';
    }

    // ==================== OCR, QR, SALVAR CONVERSA ====================
    async function realizarOCR(arquivo) {
        exibirRespostaJarvis("🔍 Processando imagem com OCR... aguarde.", false);
        try {
            const { data: { text } } = await Tesseract.recognize(arquivo, 'por', { logger: m => console.log(m) });
            const resultado = text.trim() || "Nenhum texto encontrado.";
            exibirRespostaJarvis(`📷 **Texto extraído:**\n${resultado}`, true);
            historicoConversa.push({ role: "user", content: `[OCR] ${resultado}` });
        } catch (err) {
            exibirRespostaJarvis(`❌ Erro no OCR: ${err.message}`);
        }
    }
    function abrirCameraOCR() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => { if (e.target.files.length) await realizarOCR(e.target.files[0]); };
        input.click();
    }

    async function abrirCameraQR() {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content"><h3>📱 Aponte para o QR Code</h3><video id="qrVideo" autoplay playsinline></video><br><button id="closeQRModal">Fechar</button></div>`;
        document.body.appendChild(modal);
        const videoElement = modal.querySelector('#qrVideo');
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            videoElement.srcObject = stream;
            await videoElement.play();
            const tick = () => {
                if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
                    canvas.width = videoElement.videoWidth;
                    canvas.height = videoElement.videoHeight;
                    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, canvas.width, canvas.height);
                    if (code) {
                        if (stream) stream.getTracks().forEach(t => t.stop());
                        modal.remove();
                        if (code.data.startsWith('http')) window.open(code.data, '_blank');
                        else exibirRespostaJarvis(`📲 QR Code: ${code.data}`);
                        return;
                    }
                }
                requestAnimationFrame(tick);
            };
            tick();
            modal.querySelector('#closeQRModal').onclick = () => { if(stream) stream.getTracks().forEach(t=>t.stop()); modal.remove(); };
        } catch (err) {
            modal.innerHTML = `<div class="modal-content"><p>❌ Erro câmera: ${err.message}</p><button id="closeQRModal">Fechar</button></div>`;
            modal.querySelector('#closeQRModal').onclick = () => modal.remove();
        }
    }

    function salvarConversaPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 10;
        doc.text("Conversa com JARVIS", 10, y);
        y += 7;
        historicoConversa.slice(-30).forEach(msg => {
            let role = msg.role === "user" ? "Você" : "JARVIS";
            let linhas = doc.splitTextToSize(`${role}: ${msg.content.substring(0, 500)}`, 180);
            linhas.forEach(l => {
                if (y > 280) { doc.addPage(); y = 10; }
                doc.text(l, 10, y);
                y += 6;
            });
            y += 3;
        });
        doc.save(`jarvis_${Date.now()}.pdf`);
        exibirRespostaJarvis("Conversa salva em PDF.", false);
    }

    // ==================== EVENTOS E UI ====================
    sendBtn.addEventListener('click', enviarMensagem);
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') enviarMensagem(); });
    fileInput.addEventListener('change', arquivoSelecionado);

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const closeSidebar = document.getElementById('closeSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.add('open');
            if (overlay) overlay.classList.add('active');
        });
    }
    if (closeSidebar && sidebar) {
        closeSidebar.addEventListener('click', () => {
            sidebar.classList.remove('open');
            if (overlay) overlay.classList.remove('active');
        });
    }
    if (overlay) {
        overlay.addEventListener('click', () => {
            if (sidebar) sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    document.getElementById('clearChatBtn')?.addEventListener('click', () => {
        if (confirm("Limpar conversa?")) {
            historicoConversa = [];
            localStorage.removeItem('jarvis_historico');
            chatBox.innerHTML = `<div class="balao jarvis-msg"><div class="avatar"><i class="fas fa-robot"></i></div><div class="message-content"><span class="sender-name">JARVIS</span><p>Conversa reiniciada.</p></div></div>`;
        }
    });
    document.getElementById('saveChatBtn')?.addEventListener('click', salvarConversaPDF);
    document.getElementById('ocrImageBtn')?.addEventListener('click', abrirCameraOCR);
    document.getElementById('qrScanBtn')?.addEventListener('click', abrirCameraQR);

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isDark = !document.body.classList.contains('light-mode');
            themeToggle.innerHTML = isDark ? '<i class="fas fa-moon"></i> Modo escuro' : '<i class="fas fa-sun"></i> Modo claro';
        });
    }

    if (document.getElementById('batteryStatus')) {
        if ('getBattery' in navigator) {
            navigator.getBattery().then(b => {
                document.getElementById('batteryStatus').innerHTML = `<i class="fas fa-battery-full"></i> Bateria: ${Math.round(b.level*100)}%`;
            });
        } else {
            document.getElementById('batteryStatus').innerHTML = `<i class="fas fa-battery-slash"></i> Bateria: N/D`;
        }
    }

    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        reconhecimento = new SpeechRecognitionAPI();
        reconhecimento.lang = 'pt-BR';
        reconhecimento.continuous = false;
        reconhecimento.onresult = (event) => {
            userInput.value = event.results[0][0].transcript.trim();
            enviarMensagem();
        };
        reconhecimento.onend = () => {
            if (micBtn) {
                micBtn.classList.remove('gravando');
                micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            }
            gravando = false;
        };
        micBtn.addEventListener('click', () => {
            if (gravando) reconhecimento.stop();
            else {
                reconhecimento.start();
                micBtn.classList.add('gravando');
                micBtn.innerHTML = '<i class="fas fa-stop"></i>';
                gravando = true;
            }
        });
    }

    // Carregar histórico salvo
    const savedHistorico = localStorage.getItem('jarvis_historico');
    if (savedHistorico) {
        try {
            historicoConversa = JSON.parse(savedHistorico);
        } catch(e) {}
    }

    exibirRespostaJarvis("✅ JARVIS ativado com todas as funcionalidades: PDF, imagens, áudio, slides, clima, código, conversões, senhas, tradutor, gastos, notícias, horóscopo, tabuada, IMC, juros, pomodoro, tela cheia, vibrar, busca no histórico, modo avião e muito mais!", false);
});
