// ==================== JARVIS - VERSÃO FINAL ULTRA COMPLETA ====================
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
    let modoAviao = false;

    let cronometroInicio = null;
    let cronometroIntervalo = null;

    const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ? 'http://localhost:5000/'
        : 'https://jarvis-backend-pm7w.onrender.com/';  // substitua pela sua URL

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
        "flashcards": [{ q: "Capital do Brasil?", r: "Brasília" }],
        "tarefas": [],
        "humor": []  // para diário de humor
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

    // ==================== FUNÇÕES AUXILIARES ====================
    async function gerarQRCode(texto) {
        try {
            return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(texto)}`;
        } catch(e) { return null; }
    }

    function verificarForcaSenha(senha) {
        let forca = 0;
        if (senha.length >= 8) forca++;
        if (senha.match(/[A-Z]/)) forca++;
        if (senha.match(/[0-9]/)) forca++;
        if (senha.match(/[^A-Za-z0-9]/)) forca++;
        if (senha.length >= 12) forca++;
        if (forca <= 2) return "Fraca";
        if (forca <= 4) return "Média";
        return "Forte";
    }

    // ==================== ENVIO PRINCIPAL ====================
    async function enviarMensagem() {
        const texto = userInput.value.trim();
        if (!texto) return;

        exibirMensagemUsuario(texto);
        userInput.value = '';
        const cmd = texto.toLowerCase();

        // ---------- COMANDOS EXISTENTES (COMPACTADOS PARA ECONOMIA DE ESPAÇO) ----------
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
        if (cmd.startsWith('aprender pdf')) {
            let nome = cmd.replace('aprender pdf', '').trim();
            if (!nome) exibirRespostaJarvis("Especifique o nome da matéria");
            else { aguardandoAprenderPDF = true; nomeMateriaPDF = nome; exibirRespostaJarvis(`📖 Envie um PDF para matéria "${nome}".`); }
            return;
        }
        if (estaLendoPdf) {
            if (cmd === 'próxima página') {
                if (pdfDoc && pdfPaginaAtual < pdfNumPaginas) { pdfPaginaAtual++; await lerPaginaPDF(pdfPaginaAtual, 'analise'); atualizarStatusPDF(`Página ${pdfPaginaAtual}/${pdfNumPaginas}`); }
                else exibirRespostaJarvis("Última página.");
                return;
            }
            if (cmd === 'página anterior') {
                if (pdfDoc && pdfPaginaAtual > 1) { pdfPaginaAtual--; await lerPaginaPDF(pdfPaginaAtual, 'analise'); atualizarStatusPDF(`Página ${pdfPaginaAtual}/${pdfNumPaginas}`); }
                else exibirRespostaJarvis("Primeira página.");
                return;
            }
            if (cmd === 'modo especialista') { modoEspecialista = true; if (pdfDoc) await lerPaginaPDF(pdfPaginaAtual, 'especialista'); else exibirRespostaJarvis("Nenhum PDF carregado."); return; }
            if (cmd === 'continue' || cmd === 'continuar') { await enviarFatiaPDF(false); return; }
            if (cmd === 'leia') { await enviarFatiaPDF(true); return; }
        }
        if (cmd === 'exportar diario') {
            let db = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || { diario: [] };
            let conteudo = db.diario.join("\n") || "Diário vazio.";
            const blob = new Blob([conteudo], { type: "text/plain" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = "diario_jarvis.txt";
            link.click();
            exibirRespostaJarvis("✅ Diário exportado.");
            return;
        }
        if (cmd === 'exportar flashcards') {
            let db = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || { flashcards: [] };
            let linhas = ["pergunta,resposta"];
            db.flashcards.forEach(card => linhas.push(`"${card.q}","${card.r}"`));
            const blob = new Blob([linhas.join("\n")], { type: "text/csv" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = "flashcards_jarvis.csv";
            link.click();
            exibirRespostaJarvis("✅ Flashcards exportados.");
            return;
        }
        if (cmd.startsWith('criar audio sobre ')) {
            let tema = texto.replace(/criar audio sobre /i, "").trim();
            if (!tema) { exibirRespostaJarvis("Especifique um tema."); return; }
            exibirRespostaJarvis(`🎧 Gerando áudio sobre ${tema}...`, false);
            const respIA = await fetch(`${BACKEND_URL}api/comando`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historico: [{ role: "user", content: `Escreva um resumo curto (máximo 1500 caracteres) sobre: ${tema}.` }] }) });
            const dataIA = await respIA.json();
            const textoAudio = dataIA.resposta || "Conteúdo não gerado.";
            const respAudio = await fetch(`${BACKEND_URL}api/gerar_audio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: textoAudio }) });
            if (respAudio.ok) { const blob = await respAudio.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "audio.mp3"; a.click(); exibirRespostaJarvis("✅ Áudio gerado."); }
            else exibirRespostaJarvis("❌ Erro ao gerar áudio.");
            return;
        }
        if (cmd.startsWith('criar slides sobre ')) {
            let tema = texto.replace(/criar slides sobre /i, "").trim();
            if (!tema) { exibirRespostaJarvis("Especifique um tema."); return; }
            exibirRespostaJarvis(`📊 Gerando slides sobre ${tema}...`, false);
            const promptIA = `Crie conteúdo estruturado (use <h1>, <p>, <ul>) para slides sobre: ${tema}. Máximo 5 tópicos.`;
            const respIA = await fetch(`${BACKEND_URL}api/comando`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historico: [{ role: "user", content: promptIA }] }) });
            const dataIA = await respIA.json();
            const conteudo = dataIA.resposta || "";
            const respSlides = await fetch(`${BACKEND_URL}api/gerar_slides`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: tema, conteudo }) });
            if (respSlides.ok) { const blob = await respSlides.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "slides.pptx"; a.click(); exibirRespostaJarvis("✅ Slides gerados."); }
            else exibirRespostaJarvis("❌ Erro ao gerar slides.");
            return;
        }
        if (cmd.startsWith('clima em ')) {
            let cidade = texto.replace(/clima em /i, "").trim();
            if (!cidade) { exibirRespostaJarvis("Informe a cidade."); return; }
            exibirRespostaJarvis(`🌡️ Consultando clima em ${cidade}...`, false);
            const resp = await fetch(`${BACKEND_URL}api/clima`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cidade }) });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('massa molar de ')) {
            let formula = texto.replace(/massa molar de /i, "").trim();
            if (!formula) { exibirRespostaJarvis("Informe a fórmula."); return; }
            const resp = await fetch(`${BACKEND_URL}api/massa_molar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ formula }) });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('rode python:')) {
            let codigo = texto.replace(/rode python:/i, "").trim();
            if (!codigo) { exibirRespostaJarvis("Digite o código."); return; }
            exibirRespostaJarvis("🐍 Executando...", false);
            const resp = await fetch(`${BACKEND_URL}api/executar_codigo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linguagem: "python", codigo }) });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('rode js:')) {
            let codigo = texto.replace(/rode js:/i, "").trim();
            if (!codigo) return exibirRespostaJarvis("Código vazio.");
            const resp = await fetch(`${BACKEND_URL}api/executar_codigo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linguagem: "javascript", codigo }) });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('encurtar ')) {
            let link = texto.replace(/encurtar /i, "").trim();
            if (!link) return exibirRespostaJarvis("Forneça o link.");
            const resp = await fetch(`${BACKEND_URL}api/encurtar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link }) });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd === 'ler tudo em voz alta' && estaLendoPdf && pdfDoc) {
            exibirRespostaJarvis("🔊 Leitura contínua...", false);
            let pagina = pdfPaginaAtual;
            const falarPagina = async () => {
                if (pagina > pdfNumPaginas) { exibirRespostaJarvis("Leitura finalizada."); return; }
                const pg = await pdfDoc.getPage(pagina);
                const conteudo = await pg.getTextContent();
                const texto = conteudo.items.map(i => i.str).join(' ');
                const utterance = new SpeechSynthesisUtterance(texto);
                utterance.lang = 'pt-BR';
                utterance.onend = () => { pagina++; falarPagina(); };
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
                exibirRespostaJarvis(`📖 Página ${pagina}...`, false);
            };
            falarPagina();
            return;
        }
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
                    setTimeout(() => { new Notification("🔔 JARVIS", { body: tarefa }); exibirRespostaJarvis(`🔔 Lembrete: ${tarefa}`); }, ms);
                    exibirRespostaJarvis(`✅ Lembrete criado para ${dataAlvo.toLocaleTimeString()}`);
                } else exibirRespostaJarvis("Horário inválido.");
            } else exibirRespostaJarvis("Use: lembre-me de [tarefa] às [hh:mm]");
            return;
        }
        if (cmd.startsWith('converter ')) {
            let partes = texto.match(/converter (\d+(?:\.\d+)?)\s+(\w+)\s+para\s+(\w+)/i);
            if (partes) {
                let valor = parseFloat(partes[1]);
                let de = partes[2].toLowerCase();
                let para = partes[3].toLowerCase();
                const resp = await fetch(`${BACKEND_URL}api/converter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor, de, para }) });
                const data = await resp.json();
                exibirRespostaJarvis(data.resposta || data.erro);
            } else exibirRespostaJarvis("Formato: converter [valor] [unidade] para [unidade]");
            return;
        }
        if (cmd.startsWith('gerar senha')) {
            let tamanho = parseInt(cmd.match(/\d+/)?.[0]) || 12;
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
            let senha = "";
            for (let i = 0; i < tamanho; i++) senha += chars.charAt(Math.floor(Math.random() * chars.length));
            exibirRespostaJarvis(`🔐 Senha gerada (${tamanho} caracteres): \`${senha}\``);
            return;
        }
        const dicionario = { "hello": "olá", "world": "mundo", "good": "bom", "bad": "ruim", "house": "casa", "car": "carro", "dog": "cachorro", "cat": "gato", "sun": "sol", "moon": "lua", "star": "estrela", "water": "água", "fire": "fogo", "earth": "terra", "air": "ar" };
        if (cmd.startsWith('traduzir ')) {
            let palavra = texto.replace(/traduzir /i, "").trim().toLowerCase();
            if (dicionario[palavra]) exibirRespostaJarvis(`📖 Tradução de "${palavra}" → "${dicionario[palavra]}"`);
            else exibirRespostaJarvis(`Tradução não encontrada.`);
            return;
        }
        if (cmd.startsWith('adicionar gasto ')) {
            let resto = texto.replace(/adicionar gasto /i, "").trim();
            let partes = resto.match(/(.+?)\s+(\d+(?:\.\d+)?)/);
            if (partes) {
                let categoria = partes[1].trim();
                let valor = parseFloat(partes[2]);
                let gastos = JSON.parse(localStorage.getItem('jarvis_gastos')) || [];
                gastos.push({ categoria, valor, data: new Date().toISOString() });
                localStorage.setItem('jarvis_gastos', JSON.stringify(gastos));
                exibirRespostaJarvis(`💰 Gasto adicionado: ${categoria} R$ ${valor.toFixed(2)}`);
            } else exibirRespostaJarvis("Formato: adicionar gasto [categoria] [valor]");
            return;
        }
        if (cmd === 'resumo gastos') {
            let gastos = JSON.parse(localStorage.getItem('jarvis_gastos')) || [];
            if (gastos.length === 0) exibirRespostaJarvis("Nenhum gasto.");
            else {
                let total = gastos.reduce((s, g) => s + g.valor, 0);
                let porCategoria = {};
                gastos.forEach(g => { porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.valor; });
                let resumo = `💰 Total: R$ ${total.toFixed(2)}\nPor categoria:\n`;
                for (let cat in porCategoria) resumo += `   ${cat}: R$ ${porCategoria[cat].toFixed(2)}\n`;
                exibirRespostaJarvis(resumo);
            }
            return;
        }
        if (cmd === 'últimas notícias' || cmd === 'notícias') {
            exibirRespostaJarvis("📰 Buscando notícias...", false);
            const resp = await fetch(`${BACKEND_URL}api/noticias`);
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('horóscopo ')) {
            let signo = texto.replace(/horóscopo /i, "").trim().toLowerCase();
            const signos = ["aries", "touro", "gemeos", "cancer", "leao", "virgem", "libra", "escorpiao", "sagitario", "capricornio", "aquario", "peixes"];
            if (!signos.includes(signo)) { exibirRespostaJarvis("Signo inválido."); return; }
            exibirRespostaJarvis(`🔮 Buscando horóscopo...`, false);
            try {
                const resp = await fetch(`https://horoscope-api.herokuapp.com/horoscope/${signo}/today`);
                const data = await resp.json();
                exibirRespostaJarvis(`🔮 Horóscopo de ${signo}: ${data.horoscope || "Não disponível"}`);
            } catch { exibirRespostaJarvis("Erro ao buscar horóscopo."); }
            return;
        }
        if (cmd.startsWith('tabuada do ')) {
            let num = parseInt(cmd.replace('tabuada do', '').trim());
            if (!isNaN(num)) {
                let resultado = `📐 Tabuada do ${num}:\n` + Array(10).fill().map((_,i) => `${num} x ${i+1} = ${num*(i+1)}`).join("\n");
                exibirRespostaJarvis(resultado);
            } else exibirRespostaJarvis("Digite: tabuada do [número]");
            return;
        }
        if (cmd.startsWith('imc ')) {
            let match = texto.match(/imc\s+peso\s+(\d+(?:\.\d+)?)\s+altura\s+(\d+(?:\.\d+)?)/i);
            if (match) {
                let peso = parseFloat(match[1]);
                let altura = parseFloat(match[2]);
                let imc = peso / (altura * altura);
                let classif = "";
                if (imc < 18.5) classif = "Abaixo do peso";
                else if (imc < 25) classif = "Normal";
                else if (imc < 30) classif = "Sobrepeso";
                else if (imc < 35) classif = "Obesidade I";
                else if (imc < 40) classif = "Obesidade II";
                else classif = "Obesidade III";
                exibirRespostaJarvis(`📊 IMC = ${imc.toFixed(2)} - ${classif}`);
            } else exibirRespostaJarvis("Formato: imc peso [kg] altura [m]");
            return;
        }
        if (cmd.startsWith('juros compostos ')) {
            let match = texto.match(/juros compostos\s+capital\s+(\d+(?:\.\d+)?)\s+taxa\s+(\d+(?:\.\d+)?)%?\s+meses\s+(\d+)/i);
            if (match) {
                let capital = parseFloat(match[1]);
                let taxa = parseFloat(match[2]) / 100;
                let meses = parseInt(match[3]);
                let montante = capital * Math.pow(1 + taxa, meses);
                exibirRespostaJarvis(`📈 Montante: R$ ${montante.toFixed(2)} | Juros: R$ ${(montante-capital).toFixed(2)}`);
            } else exibirRespostaJarvis("Formato: juros compostos capital [valor] taxa [%] meses [n]");
            return;
        }
        if (cmd.startsWith('pomodoro ')) {
            let minutos = parseInt(cmd.replace('pomodoro', '').trim());
            if (!isNaN(minutos) && minutos > 0) {
                exibirRespostaJarvis(`🍅 Pomodoro de ${minutos} min iniciado!`);
                setTimeout(() => {
                    exibirRespostaJarvis(`⏰ Pomodoro de ${minutos} min finalizado!`);
                    if (Notification.permission === "granted") new Notification("Pomodoro", { body: "Tempo finalizado!" });
                }, minutos * 60 * 1000);
            } else exibirRespostaJarvis("Digite: pomodoro [minutos]");
            return;
        }
        if (cmd === 'tela cheia') {
            if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); exibirRespostaJarvis("🖥️ Tela cheia ativada."); }
            else exibirRespostaJarvis("Não suportado.");
            return;
        }
        if (cmd === 'vibrar') {
            if (navigator.vibrate) { navigator.vibrate(200); exibirRespostaJarvis("📳 Vibração acionada."); }
            else exibirRespostaJarvis("Não suportado.");
            return;
        }
        if (cmd.startsWith('buscar no histórico ')) {
            let termo = cmd.replace('buscar no histórico', '').trim();
            let historico = JSON.parse(localStorage.getItem('jarvis_historico')) || [];
            let res = historico.filter(msg => msg.content.toLowerCase().includes(termo));
            if (res.length === 0) exibirRespostaJarvis(`Nenhuma mensagem com "${termo}".`);
            else exibirRespostaJarvis(`🔍 Resultados (${res.length}):\n` + res.slice(-5).map(m => `${m.role}: ${m.content.substring(0,100)}...`).join("\n"));
            return;
        }
        if (cmd === 'modo avião') { modoAviao = true; exibirRespostaJarvis("✈️ Modo avião ativado."); return; }
        if (cmd === 'modo normal') { modoAviao = false; exibirRespostaJarvis("📡 Modo normal ativado."); return; }

        // ==================== 20 NOVAS FUNCIONALIDADES ====================
        // 1. Calculadora de média escolar
        if (cmd.startsWith('media ')) {
            let numeros = texto.match(/\d+(?:\.\d+)?/g);
            if (numeros && numeros.length > 0) {
                let soma = numeros.reduce((a,b) => a + parseFloat(b), 0);
                let media = soma / numeros.length;
                let status = media >= 7 ? "✅ Aprovado" : (media >= 5 ? "⚠️ Recuperação" : "❌ Reprovado");
                exibirRespostaJarvis(`📊 Média = ${media.toFixed(2)} - ${status}`);
            } else exibirRespostaJarvis("Forneça as notas separadas por espaço. Ex: media 7.5 8.0 6.0");
            return;
        }
        // 2. Conversor de notas (Brasil -> EUA)
        if (cmd.startsWith('nota ')) {
            let nota = parseFloat(texto.match(/\d+(?:\.\d+)?/)?.[0]);
            if (!isNaN(nota)) {
                let letra = "";
                if (nota >= 9) letra = "A (Excelente)";
                else if (nota >= 8) letra = "B (Bom)";
                else if (nota >= 7) letra = "C (Regular)";
                else if (nota >= 5) letra = "D (Insuficiente)";
                else letra = "F (Reprovado)";
                exibirRespostaJarvis(`📝 Nota ${nota} → sistema americano: ${letra}`);
            } else exibirRespostaJarvis("Use: nota [valor]");
            return;
        }
        // 3. Cronograma de estudos aleatório
        if (cmd === 'cronograma de estudos') {
            let materias = ["Matemática", "Português", "História", "Geografia", "Ciências", "Inglês", "Física", "Química"];
            let sorteio = materias.sort(() => 0.5 - Math.random()).slice(0, 4);
            let crono = "📚 Cronograma sugerido:\n" + sorteio.map((m,i) => `${i+1}. ${m}: 30 min`).join("\n");
            exibirRespostaJarvis(crono);
            return;
        }
        // 4. Verificador de força de senha
        if (cmd.startsWith('força da senha ')) {
            let senha = texto.replace(/força da senha /i, "").trim();
            let forca = verificarForcaSenha(senha);
            exibirRespostaJarvis(`🔐 Força da senha: ${forca}`);
            return;
        }
        // 5. Falar texto (apenas voz)
        if (cmd.startsWith('falar ')) {
            let txt = texto.replace(/falar /i, "").trim();
            exibirRespostaJarvis(txt, true);
            return;
        }
        // 6. Diário de humor
        if (cmd.startsWith('humor hoje ')) {
            let nota = parseInt(texto.match(/\d+/)?.[0]);
            if (nota >= 1 && nota <= 5) {
                dbMemoriaLocal.humor.push({ data: new Date().toLocaleDateString(), nota });
                localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
                exibirRespostaJarvis(`😊 Humor de hoje (${nota}/5) registrado!`);
            } else exibirRespostaJarvis("Use: humor hoje [1-5]");
            return;
        }
        // 7. Consumo de combustível
        if (cmd.startsWith('combustível ')) {
            let match = texto.match(/distancia\s+(\d+(?:\.\d+)?)\s+consumo\s+(\d+(?:\.\d+)?)\s+preco\s+(\d+(?:\.\d+)?)/i);
            if (match) {
                let dist = parseFloat(match[1]);
                let consumo = parseFloat(match[2]);
                let preco = parseFloat(match[3]);
                let litros = dist / consumo;
                let custo = litros * preco;
                exibirRespostaJarvis(`⛽ Litros: ${litros.toFixed(2)} | Custo: R$ ${custo.toFixed(2)}`);
            } else exibirRespostaJarvis("Formato: combustível distancia [km] consumo [km/l] preco [R$/l]");
            return;
        }
        // 8. Converter tempo (simples)
        if (cmd.startsWith('converter tempo ')) {
            let match = texto.match(/converter tempo (\d+(?:\.\d+)?)\s+(\w+)\s+para\s+(\w+)/i);
            if (match) {
                let valor = parseFloat(match[1]);
                let de = match[2].toLowerCase();
                let para = match[3].toLowerCase();
                let segundos = 0;
                if (de === 'segundos') segundos = valor;
                else if (de === 'minutos') segundos = valor * 60;
                else if (de === 'horas') segundos = valor * 3600;
                else if (de === 'dias') segundos = valor * 86400;
                let resultado = 0;
                if (para === 'segundos') resultado = segundos;
                else if (para === 'minutos') resultado = segundos / 60;
                else if (para === 'horas') resultado = segundos / 3600;
                else if (para === 'dias') resultado = segundos / 86400;
                exibirRespostaJarvis(`⏱️ ${valor} ${de} = ${resultado.toFixed(2)} ${para}`);
            } else exibirRespostaJarvis("Formato: converter tempo [valor] [unidade] para [unidade] (ex: 3600 segundos para horas)");
            return;
        }
        // 9. E-mail temporário (API 1secmail)
        if (cmd === 'email temporário') {
            exibirRespostaJarvis("📧 Gerando e-mail temporário...", false);
            try {
                let resp = await fetch('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
                let data = await resp.json();
                let email = data[0];
                exibirRespostaJarvis(`📧 Email temporário: ${email}\nVocê pode consultar a caixa de entrada com: ler email ${email}`);
                localStorage.setItem('temp_email', email);
            } catch { exibirRespostaJarvis("Erro ao gerar e-mail."); }
            return;
        }
        if (cmd.startsWith('ler email ')) {
            let email = cmd.replace('ler email', '').trim();
            if (!email) email = localStorage.getItem('temp_email');
            if (!email) { exibirRespostaJarvis("Nenhum email temporário ativo."); return; }
            exibirRespostaJarvis(`📬 Consultando emails de ${email}...`, false);
            try {
                let resp = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${email.split('@')[0]}&domain=${email.split('@')[1]}`);
                let msgs = await resp.json();
                if (msgs.length === 0) exibirRespostaJarvis("Nenhum email recebido.");
                else exibirRespostaJarvis(`📬 ${msgs.length} email(s) recebido(s). Último: ${msgs[msgs.length-1].subject}`);
            } catch { exibirRespostaJarvis("Erro ao ler emails."); }
            return;
        }
        // 10. Fato científico aleatório (API)
        if (cmd === 'fato científico') {
            exibirRespostaJarvis("🔬 Buscando fato científico...", false);
            try {
                let resp = await fetch('https://uselessfacts.jsph.pl/random.json?language=pt');
                let data = await resp.json();
                exibirRespostaJarvis(`🔬 ${data.text}`);
            } catch { exibirRespostaJarvis("Erro ao buscar fato."); }
            return;
        }
        // 11. IMC com peso ideal (já existe, mas adicionamos recomendação)
        // (Não precisa repetir, apenas já existe)
        // 12. Lembrete de aniversário
        if (cmd.startsWith('lembrar aniversário ')) {
            let match = texto.match(/lembrar aniversário (\d{1,2}\/\d{1,2}\/\d{4}) (.+)/i);
            if (match) {
                let data = match[1];
                let nome = match[2];
                let aniversarios = JSON.parse(localStorage.getItem('aniversarios') || '[]');
                aniversarios.push({ nome, data, proximo: new Date(data) });
                localStorage.setItem('aniversarios', JSON.stringify(aniversarios));
                exibirRespostaJarvis(`🎂 Lembrete de aniversário para ${nome} em ${data} salvo!`);
            } else exibirRespostaJarvis("Formato: lembrar aniversário dd/mm/aaaa nome");
            return;
        }
        // 13. Traduzir frase completa (API MyMemory)
        if (cmd.startsWith('traduzir frase ')) {
            let resto = texto.replace(/traduzir frase /i, "").trim();
            let match = resto.match(/(.+)\s+para\s+(\w+)/i);
            if (match) {
                let frase = match[1];
                let lang = match[2].toLowerCase();
                let langMap = { 'portugues': 'pt', 'ingles': 'en', 'espanhol': 'es', 'frances': 'fr' };
                let target = langMap[lang] || lang;
                exibirRespostaJarvis(`🌐 Traduzindo...`, false);
                try {
                    let resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(frase)}&langpair=auto|${target}`);
                    let data = await resp.json();
                    exibirRespostaJarvis(`📝 Tradução: ${data.responseData.translatedText}`);
                } catch { exibirRespostaJarvis("Erro na tradução."); }
            } else exibirRespostaJarvis("Formato: traduzir frase [texto] para [idioma]");
            return;
        }
        // 14. Palavra do dia (inglês)
        if (cmd === 'palavra do dia') {
            let palavras = [
                { palavra: "serendipity", traducao: "acaso feliz" },
                { palavra: "ephemeral", traducao: "efêmero" },
                { palavra: "resilience", traducao: "resiliência" },
                { palavra: "ubiquitous", traducao: "onipresente" }
            ];
            let escolha = palavras[Math.floor(Math.random() * palavras.length)];
            exibirRespostaJarvis(`📖 Palavra do dia: ${escolha.palavra} → ${escolha.traducao}`);
            return;
        }
        // 15. Resumir texto (usando IA)
        if (cmd.startsWith('resumir texto ')) {
            let longText = texto.replace(/resumir texto /i, "").trim();
            if (longText.length < 10) { exibirRespostaJarvis("Texto muito curto."); return; }
            exibirRespostaJarvis("📄 Resumindo...", false);
            const resp = await fetch(`${BACKEND_URL}api/comando`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historico: [{ role: "user", content: `Resuma o seguinte texto em no máximo 3 frases: ${longText}` }] }) });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta || "Erro ao resumir.");
            return;
        }
        // 16. Modo foco (já existe modo silêncio, mas podemos adicionar algo extra)
        if (cmd === 'modo foco ativar') {
            modoSilencio = true;
            exibirRespostaJarvis("🎯 Modo foco ativado. Respostas serão apenas visuais.");
            return;
        }
        if (cmd === 'modo foco desativar') {
            modoSilencio = false;
            exibirRespostaJarvis("🎯 Modo foco desativado. Voz retomada.");
            return;
        }
        // 17. Histórico por data (simplificado)
        if (cmd.startsWith('histórico de ')) {
            let dataStr = cmd.replace('histórico de', '').trim();
            let historico = JSON.parse(localStorage.getItem('jarvis_historico')) || [];
            let filtrados = historico.filter(msg => msg.content.includes(dataStr));
            if (filtrados.length) exibirRespostaJarvis(`📜 Mensagens com "${dataStr}": ${filtrados.length} registros.`);
            else exibirRespostaJarvis("Nenhuma mensagem encontrada.");
            return;
        }
        // 18. Exportar tudo (backup JSON)
        if (cmd === 'exportar tudo') {
            let backup = {
                memoria: dbMemoriaLocal,
                historico: historicoConversa,
                gastos: JSON.parse(localStorage.getItem('jarvis_gastos') || '[]'),
                aniversarios: localStorage.getItem('aniversarios')
            };
            let blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
            let link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = "jarvis_backup.json";
            link.click();
            exibirRespostaJarvis("💾 Backup completo exportado como jarvis_backup.json");
            return;
        }
        // 19. Importar backup
        if (cmd === 'importar backup') {
            let input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = async (e) => {
                let file = e.target.files[0];
                let text = await file.text();
                let data = JSON.parse(text);
                if (data.memoria) localStorage.setItem('jarvis_memoria_v3', JSON.stringify(data.memoria));
                if (data.gastos) localStorage.setItem('jarvis_gastos', JSON.stringify(data.gastos));
                if (data.aniversarios) localStorage.setItem('aniversarios', data.aniversarios);
                exibirRespostaJarvis("✅ Backup importado! Recarregue a página.");
            };
            input.click();
            return;
        }
        // 20. Tema personalizado (exemplo: tema azul)
        if (cmd === 'tema azul') {
            document.body.style.setProperty('--accent', '#1e90ff');
            document.body.style.setProperty('--accent-glow', 'rgba(30,144,255,0.2)');
            exibirRespostaJarvis("🎨 Tema azul aplicado!");
            return;
        }
        if (cmd === 'tema verde') {
            document.body.style.setProperty('--accent', '#32cd32');
            document.body.style.setProperty('--accent-glow', 'rgba(50,205,50,0.2)');
            exibirRespostaJarvis("🎨 Tema verde aplicado!");
            return;
        }
        if (cmd === 'tema padrão') {
            document.body.style.setProperty('--accent', '#00f0ff');
            document.body.style.setProperty('--accent-glow', 'rgba(0,240,255,0.2)');
            exibirRespostaJarvis("🎨 Tema padrão restaurado!");
            return;
        }

        // ---------- COMANDOS OFFLINE GERAIS ----------
        let respostaOffline = processarComandoOffline(texto);
        if (respostaOffline) {
            exibirRespostaJarvis(respostaOffline, true, true);
            return;
        }

        // ---------- IA (se nenhum comando correspondeu) ----------
        if (modoAviao) exibirRespostaJarvis("✈️ Modo avião ativo. Use comandos offline.");
        else { historicoConversa.push({ role: "user", content: texto }); await chamarIA(); }
    }

    // ==================== UPLOAD DE PDF ====================
    async function arquivoSelecionado() {
        if (!fileInput || !fileInput.files.length) return;
        const arquivo = fileInput.files[0];
        if (arquivo.type !== 'application/pdf') {
            exibirRespostaJarvis("Envie um PDF válido.");
            fileInput.value = '';
            return;
        }
        exibirMensagemUsuario(`📎 Enviou PDF: ${arquivo.name}`);
        const arrayBuffer = await arquivo.arrayBuffer();
        const textoCompleto = await carregarPDFCompleto(arrayBuffer);
        if (aguardandoAprenderPDF && nomeMateriaPDF && textoCompleto) {
            adicionarConhecimentoOffline(nomeMateriaPDF, textoCompleto);
            exibirRespostaJarvis(`📚 PDF aprendido como matéria "${nomeMateriaPDF}"`);
            aguardandoAprenderPDF = false;
            nomeMateriaPDF = '';
            fileInput.value = '';
            return;
        }
        if (textoCompleto) exibirRespostaJarvis(`✅ PDF carregado: ${pdfNumPaginas} páginas, ${pdfFatias.length} fatias.`);
        else exibirRespostaJarvis("Falha ao processar PDF.");
        fileInput.value = '';
    }

    // ==================== OCR, QR, SALVAR CONVERSA ====================
    async function realizarOCR(arquivo) {
        exibirRespostaJarvis("🔍 OCR em andamento...", false);
        try {
            const { data: { text } } = await Tesseract.recognize(arquivo, 'por');
            exibirRespostaJarvis(`📷 Texto extraído:\n${text.trim() || "Nenhum texto"}`, true);
        } catch (err) { exibirRespostaJarvis(`❌ OCR falhou: ${err.message}`); }
    }
    function abrirCameraOCR() {
        let input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => { if (e.target.files[0]) await realizarOCR(e.target.files[0]); };
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
                    const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
                    if (code) {
                        if (stream) stream.getTracks().forEach(t => t.stop());
                        modal.remove();
                        if (code.data.startsWith('http')) window.open(code.data, '_blank');
                        else exibirRespostaJarvis(`📲 QR Code: ${code.data}`);
                    } else requestAnimationFrame(tick);
                } else requestAnimationFrame(tick);
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
        menuToggle.addEventListener('click', () => { sidebar.classList.add('open'); if (overlay) overlay.classList.add('active'); });
        closeSidebar.addEventListener('click', () => { sidebar.classList.remove('open'); if (overlay) overlay.classList.remove('active'); });
        overlay.addEventListener('click', () => { if (sidebar) sidebar.classList.remove('open'); overlay.classList.remove('active'); });
    }

    document.getElementById('clearChatBtn')?.addEventListener('click', () => {
        if (confirm("Limpar conversa?")) { historicoConversa = []; localStorage.removeItem('jarvis_historico'); location.reload(); }
    });
    document.getElementById('saveChatBtn')?.addEventListener('click', salvarConversaPDF);
    document.getElementById('ocrImageBtn')?.addEventListener('click', abrirCameraOCR);
    document.getElementById('qrScanBtn')?.addEventListener('click', abrirCameraQR);

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            themeToggle.innerHTML = document.body.classList.contains('light-mode') ? '<i class="fas fa-sun"></i> Modo claro' : '<i class="fas fa-moon"></i> Modo escuro';
        });
    }

    if (document.getElementById('batteryStatus') && 'getBattery' in navigator) {
        navigator.getBattery().then(b => {
            document.getElementById('batteryStatus').innerHTML = `<i class="fas fa-battery-full"></i> Bateria: ${Math.round(b.level*100)}%`;
        });
    }

    if (window.SpeechRecognition) {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        reconhecimento = new SpeechRecognitionAPI();
        reconhecimento.lang = 'pt-BR';
        reconhecimento.continuous = false;
        reconhecimento.onresult = (event) => {
            userInput.value = event.results[0][0].transcript.trim();
            enviarMensagem();
        };
        reconhecimento.onend = () => { if (micBtn) { micBtn.classList.remove('gravando'); micBtn.innerHTML = '<i class="fas fa-microphone"></i>'; } gravando = false; };
        micBtn.addEventListener('click', () => {
            if (gravando) reconhecimento.stop();
            else { reconhecimento.start(); micBtn.classList.add('gravando'); micBtn.innerHTML = '<i class="fas fa-stop"></i>'; gravando = true; }
        });
    }

    const savedHistorico = localStorage.getItem('jarvis_historico');
    if (savedHistorico) try { historicoConversa = JSON.parse(savedHistorico); } catch(e) {}

    exibirRespostaJarvis("✅ JARVIS ULTRA COMPLETO ATIVADO! Centenas de comandos: PDF, imagens, áudio, slides, clima, código, conversões, finanças, produtividade, jogos, backup, e muito mais. Divirta-se!", false);
});
