// ==================== JARVIS - VERSÃO ULTRA COMPLETA ====================
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

    // Estado para cronômetro
    let cronometroInicio = null;
    let cronometroIntervalo = null;

    // Backend URL
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
        "tarefas": []  // para lista de tarefas
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

    // ==================== FUNÇÕES AUXILIARES PARA NOVOS COMANDOS ====================
    async function gerarQRCode(texto) {
        try {
            const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(texto)}`;
            return url;
        } catch(e) { return null; }
    }

    // ==================== ENVIO PRINCIPAL (TODOS OS COMANDOS) ====================
    async function enviarMensagem() {
        const texto = userInput.value.trim();
        if (!texto) return;

        exibirMensagemUsuario(texto);
        userInput.value = '';
        const cmd = texto.toLowerCase();

        // ---------- COMANDOS EXISTENTES (resumidos para brevidade) ----------
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
            if (!nome) exibirRespostaJarvis("Especifique o nome da matéria: aprender pdf [nome]");
            else { aguardandoAprenderPDF = true; nomeMateriaPDF = nome; exibirRespostaJarvis(`📖 Ok, envie um PDF para matéria "${nome}".`); }
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
            exibirRespostaJarvis("✅ Diário exportado como 'diario_jarvis.txt'");
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
            exibirRespostaJarvis("✅ Flashcards exportados como 'flashcards_jarvis.csv'");
            return;
        }
        if (cmd.startsWith('criar audio sobre ')) {
            let tema = texto.replace(/criar audio sobre /i, "").trim();
            if (!tema) { exibirRespostaJarvis("Especifique um tema."); return; }
            exibirRespostaJarvis(`🎧 Gerando áudio sobre *${tema}*...`, false);
            const respIA = await fetch(`${BACKEND_URL}api/comando`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historico: [{ role: "user", content: `Escreva um resumo curto (máximo 1500 caracteres) sobre: ${tema}.` }] }) });
            const dataIA = await respIA.json();
            const textoAudio = dataIA.resposta || "Conteúdo não gerado.";
            const respAudio = await fetch(`${BACKEND_URL}api/gerar_audio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: textoAudio }) });
            if (respAudio.ok) { const blob = await respAudio.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "audio.mp3"; a.click(); exibirRespostaJarvis("✅ Áudio gerado! Download iniciado."); }
            else exibirRespostaJarvis("❌ Erro ao gerar áudio.");
            return;
        }
        if (cmd.startsWith('criar slides sobre ')) {
            let tema = texto.replace(/criar slides sobre /i, "").trim();
            if (!tema) { exibirRespostaJarvis("Especifique um tema."); return; }
            exibirRespostaJarvis(`📊 Gerando slides sobre *${tema}*...`, false);
            const promptIA = `Crie um conteúdo estruturado (use <h1>, <h2>, <p>, <ul>) para uma apresentação de slides sobre: ${tema}. Máximo 5 tópicos.`;
            const respIA = await fetch(`${BACKEND_URL}api/comando`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historico: [{ role: "user", content: promptIA }] }) });
            const dataIA = await respIA.json();
            const conteudo = dataIA.resposta || "Conteúdo não gerado.";
            const respSlides = await fetch(`${BACKEND_URL}api/gerar_slides`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: tema, conteudo: conteudo }) });
            if (respSlides.ok) { const blob = await respSlides.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "slides.pptx"; a.click(); exibirRespostaJarvis("✅ Slides gerados! Download iniciado."); }
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
            if (!codigo) { exibirRespostaJarvis("Digite o código após 'rode python:'"); return; }
            exibirRespostaJarvis("🐍 Executando código...", false);
            const resp = await fetch(`${BACKEND_URL}api/executar_codigo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linguagem: "python", codigo }) });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('rode js:')) {
            let codigo = texto.replace(/rode js:/i, "").trim();
            if (!codigo) { exibirRespostaJarvis("Código vazio."); return; }
            const resp = await fetch(`${BACKEND_URL}api/executar_codigo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linguagem: "javascript", codigo }) });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('encurtar ')) {
            let link = texto.replace(/encurtar /i, "").trim();
            if (!link) { exibirRespostaJarvis("Forneça o link."); return; }
            const resp = await fetch(`${BACKEND_URL}api/encurtar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link }) });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd === 'ler tudo em voz alta' && estaLendoPdf && pdfDoc) {
            exibirRespostaJarvis("🔊 Iniciando leitura contínua...", false);
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
                exibirRespostaJarvis(`📖 Lendo página ${pagina}...`, false);
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
            else exibirRespostaJarvis(`Tradução para "${palavra}" não encontrada.`);
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
                exibirRespostaJarvis(`💰 Gasto adicionado: ${categoria} - R$ ${valor.toFixed(2)}`);
            } else exibirRespostaJarvis("Formato: adicionar gasto [categoria] [valor]");
            return;
        }
        if (cmd === 'resumo gastos') {
            let gastos = JSON.parse(localStorage.getItem('jarvis_gastos')) || [];
            if (gastos.length === 0) exibirRespostaJarvis("Nenhum gasto registrado.");
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
            exibirRespostaJarvis(`🔮 Buscando horóscopo para ${signo}...`, false);
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
                let resultado = `📐 Tabuada do ${num}:\n`;
                for (let i = 1; i <= 10; i++) resultado += `${num} x ${i} = ${num * i}\n`;
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
                let classificacao = "";
                if (imc < 18.5) classificacao = "Abaixo do peso";
                else if (imc < 25) classificacao = "Peso normal";
                else if (imc < 30) classificacao = "Sobrepeso";
                else if (imc < 35) classificacao = "Obesidade grau I";
                else if (imc < 40) classificacao = "Obesidade grau II";
                else classificacao = "Obesidade grau III";
                exibirRespostaJarvis(`📊 IMC = ${imc.toFixed(2)} - ${classificacao}`);
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
                let juros = montante - capital;
                exibirRespostaJarvis(`📈 Montante: R$ ${montante.toFixed(2)}\nJuros: R$ ${juros.toFixed(2)}`);
            } else exibirRespostaJarvis("Formato: juros compostos capital [valor] taxa [%] meses [n]");
            return;
        }
        if (cmd.startsWith('pomodoro ')) {
            let minutos = parseInt(cmd.replace('pomodoro', '').trim());
            if (!isNaN(minutos) && minutos > 0) {
                exibirRespostaJarvis(`🍅 Pomodoro de ${minutos} minutos iniciado!`);
                setTimeout(() => {
                    exibirRespostaJarvis(`⏰ Pomodoro de ${minutos} minutos finalizado!`);
                    if (Notification.permission === "granted") new Notification("Pomodoro", { body: "Tempo finalizado!" });
                }, minutos * 60 * 1000);
            } else exibirRespostaJarvis("Digite: pomodoro [minutos]");
            return;
        }
        if (cmd === 'tela cheia') {
            if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); exibirRespostaJarvis("🖥️ Tela cheia ativada."); }
            else exibirRespostaJarvis("Tela cheia não suportada.");
            return;
        }
        if (cmd === 'vibrar') {
            if (navigator.vibrate) { navigator.vibrate(200); exibirRespostaJarvis("📳 Vibração acionada."); }
            else exibirRespostaJarvis("Vibração não suportada.");
            return;
        }
        if (cmd.startsWith('buscar no histórico ')) {
            let termo = cmd.replace('buscar no histórico', '').trim();
            let historicoCompleto = JSON.parse(localStorage.getItem('jarvis_historico')) || [];
            let resultados = historicoCompleto.filter(msg => msg.content.toLowerCase().includes(termo));
            if (resultados.length === 0) exibirRespostaJarvis(`Nenhuma mensagem com "${termo}".`);
            else exibirRespostaJarvis(`🔍 Resultados para "${termo}":\n` + resultados.slice(-5).map(m => `${m.role}: ${m.content.substring(0, 100)}...`).join("\n"));
            return;
        }
        if (cmd === 'modo avião') { modoAviao = true; exibirRespostaJarvis("✈️ Modo avião ativado."); return; }
        if (cmd === 'modo normal') { modoAviao = false; exibirRespostaJarvis("📡 Modo normal ativado."); return; }

        // ==================== 20 NOVAS FUNCIONALIDADES ====================
        // 1. Gorjeta
        if (cmd.startsWith('gorjeta ')) {
            let match = texto.match(/gorjeta\s+conta\s+(\d+(?:\.\d+)?)\s+taxa\s+(\d+(?:\.\d+)?)/i);
            if (match) {
                let conta = parseFloat(match[1]);
                let taxa = parseFloat(match[2]);
                let gorjeta = conta * (taxa / 100);
                let total = conta + gorjeta;
                exibirRespostaJarvis(`🧾 Conta: R$ ${conta.toFixed(2)}\nGorjeta (${taxa}%): R$ ${gorjeta.toFixed(2)}\nTotal: R$ ${total.toFixed(2)}`);
            } else exibirRespostaJarvis("Formato: gorjeta conta [valor] taxa [%]");
            return;
        }
        // 2. Câmbio (conversão de moeda) - API gratuita
        if (cmd.startsWith('cambio ')) {
            let match = texto.match(/cambio\s+(\d+(?:\.\d+)?)\s+(\w{3})\s+para\s+(\w{3})/i);
            if (match) {
                let valor = parseFloat(match[1]);
                let de = match[2].toUpperCase();
                let para = match[3].toUpperCase();
                exibirRespostaJarvis(`🔄 Convertendo ${valor} ${de} para ${para}...`, false);
                try {
                    const resp = await fetch(`https://api.exchangerate-api.com/v4/latest/${de}`);
                    const data = await resp.json();
                    let taxa = data.rates[para];
                    if (taxa) {
                        let resultado = valor * taxa;
                        exibirRespostaJarvis(`💰 ${valor} ${de} = ${resultado.toFixed(2)} ${para}`);
                    } else exibirRespostaJarvis(`Moeda ${para} não suportada.`);
                } catch { exibirRespostaJarvis("Erro ao obter cotação. Tente novamente."); }
            } else exibirRespostaJarvis("Formato: cambio [valor] [moeda] para [moeda] (ex: cambio 100 USD para BRL)");
            return;
        }
        // 3. Previsão do tempo extendida (5 dias) - usando OpenWeatherMap se chave existir, senão fallback
        if (cmd.startsWith('previsão ')) {
            let cidade = texto.replace(/previsão /i, "").trim();
            if (!cidade) { exibirRespostaJarvis("Informe a cidade."); return; }
            exibirRespostaJarvis(`🌤️ Buscando previsão para ${cidade}...`, false);
            // Como a chave pode não estar configurada, usaremos uma API gratuita sem chave (wttr.in)
            try {
                const resp = await fetch(`https://wttr.in/${encodeURIComponent(cidade)}?format=%l:+%C,+%t,+%w,+%h&lang=pt`);
                const textoPrevisao = await resp.text();
                exibirRespostaJarvis(`🌡️ ${textoPrevisao}`);
            } catch { exibirRespostaJarvis("Erro ao obter previsão. Tente novamente."); }
            return;
        }
        // 4. Número da sorte
        if (cmd === 'número da sorte') {
            let numero = Math.floor(Math.random() * 1000) + 1;
            exibirRespostaJarvis(`🍀 Seu número da sorte é: **${numero}**`);
            return;
        }
        // 5. Dado virtual
        if (cmd.startsWith('dado ')) {
            let faces = parseInt(cmd.replace('dado', '').trim());
            if (isNaN(faces)) faces = 6;
            let resultado = Math.floor(Math.random() * faces) + 1;
            exibirRespostaJarvis(`🎲 Dado de ${faces} faces: **${resultado}**`);
            return;
        }
        // 6. Cara ou coroa
        if (cmd === 'cara ou coroa') {
            let res = Math.random() < 0.5 ? "cara" : "coroa";
            exibirRespostaJarvis(`🪙 A moeda caiu em: **${res}**`);
            return;
        }
        // 7. Tamanho do texto
        if (cmd.startsWith('tamanho do texto ')) {
            let txt = texto.replace(/tamanho do texto /i, "").trim();
            let chars = txt.length;
            let palavras = txt.split(/\s+/).filter(w => w.length > 0).length;
            exibirRespostaJarvis(`📝 Caracteres: ${chars}\nPalavras: ${palavras}`);
            return;
        }
        // 8. Inverter texto
        if (cmd.startsWith('inverter texto ')) {
            let txt = texto.replace(/inverter texto /i, "").trim();
            let invertido = txt.split('').reverse().join('');
            exibirRespostaJarvis(`🔄 Invertido: ${invertido}`);
            return;
        }
        // 9. Palíndromo
        if (cmd.startsWith('é palíndromo? ')) {
            let txt = texto.replace(/é palíndromo\? /i, "").trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            let invertido = txt.split('').reverse().join('');
            let eh = txt === invertido;
            exibirRespostaJarvis(eh ? "✅ É palíndromo!" : "❌ Não é palíndromo.");
            return;
        }
        // 10. Cronômetro
        if (cmd === 'cronômetro iniciar') {
            if (cronometroIntervalo) { exibirRespostaJarvis("⏱️ Cronômetro já está rodando."); return; }
            cronometroInicio = Date.now();
            cronometroIntervalo = setInterval(() => {
                let decorrido = ((Date.now() - cronometroInicio) / 1000).toFixed(1);
                document.title = `⏱️ ${decorrido}s - JARVIS`;
            }, 100);
            exibirRespostaJarvis("⏱️ Cronômetro iniciado! Use 'cronômetro parar'.");
            return;
        }
        if (cmd === 'cronômetro parar') {
            if (cronometroIntervalo) {
                clearInterval(cronometroIntervalo);
                let decorrido = ((Date.now() - cronometroInicio) / 1000).toFixed(1);
                document.title = "JARVIS";
                cronometroIntervalo = null;
                exibirRespostaJarvis(`⏱️ Cronômetro parado. Tempo decorrido: ${decorrido} segundos.`);
            } else exibirRespostaJarvis("Nenhum cronômetro em execução.");
            return;
        }
        // 11. Conversor de base numérica
        if (cmd.startsWith('base ')) {
            let match = texto.match(/base\s+(\d+)\s+(\d+)\s+para\s+(\w+)/i);
            if (match) {
                let baseOrig = parseInt(match[1]);
                let numero = match[2];
                let baseDest = match[3].toLowerCase();
                let numDec = parseInt(numero, baseOrig);
                if (isNaN(numDec)) { exibirRespostaJarvis("Número inválido para a base informada."); return; }
                let resultado;
                if (baseDest === 'bin' || baseDest === 'binário') resultado = numDec.toString(2);
                else if (baseDest === 'hex' || baseDest === 'hexa') resultado = numDec.toString(16).toUpperCase();
                else if (baseDest === 'oct' || baseDest === 'octal') resultado = numDec.toString(8);
                else resultado = numDec.toString(10);
                exibirRespostaJarvis(`🔢 ${numero} (base ${baseOrig}) = ${resultado} (${baseDest})`);
            } else exibirRespostaJarvis("Formato: base [base_origem] [numero] para [bin|hex|oct|dec]");
            return;
        }
        // 12. Calculadora de idade
        if (cmd.startsWith('idade ')) {
            let dataStr = texto.replace(/idade /i, "").trim();
            let partes = dataStr.split(/[\/\-]/);
            if (partes.length === 3) {
                let dia = parseInt(partes[0]);
                let mes = parseInt(partes[1]) - 1;
                let ano = parseInt(partes[2]);
                let nasc = new Date(ano, mes, dia);
                let hoje = new Date();
                let idade = hoje.getFullYear() - nasc.getFullYear();
                if (hoje < new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate())) idade--;
                let meses = (hoje.getMonth() - nasc.getMonth() + 12) % 12;
                exibirRespostaJarvis(`📅 Idade: ${idade} anos e ${meses} meses`);
            } else exibirRespostaJarvis("Formato: idade dd/mm/aaaa");
            return;
        }
        // 13. Lembrete recorrente (diário/semanal) - versão simples
        if (cmd.startsWith('lembre-me todo dia ')) {
            let resto = texto.replace(/lembre-me todo dia /i, "").trim();
            let match = resto.match(/(.+?)\s+às\s+(\d{1,2}):(\d{2})/);
            if (match) {
                let tarefa = match[1];
                let hora = parseInt(match[2]);
                let minuto = parseInt(match[3]);
                let agora = new Date();
                let dataAlvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, minuto, 0);
                if (dataAlvo <= agora) dataAlvo.setDate(dataAlvo.getDate() + 1);
                let ms = dataAlvo - agora;
                setTimeout(() => {
                    new Notification("🔔 JARVIS (recorrente)", { body: tarefa });
                    exibirRespostaJarvis(`🔔 Diário: ${tarefa}`);
                    // recriar para o próximo dia
                    setInterval(() => {
                        let agora2 = new Date();
                        let proximo = new Date(agora2.getFullYear(), agora2.getMonth(), agora2.getDate(), hora, minuto, 0);
                        if (proximo <= agora2) proximo.setDate(proximo.getDate() + 1);
                        setTimeout(() => {
                            new Notification("🔔 JARVIS (recorrente)", { body: tarefa });
                            exibirRespostaJarvis(`🔔 Diário: ${tarefa}`);
                        }, proximo - agora2);
                    }, 24 * 60 * 60 * 1000);
                }, ms);
                exibirRespostaJarvis(`✅ Lembrete diário criado para ${hora}:${String(minuto).padStart(2,'0')}`);
            } else exibirRespostaJarvis("Use: lembre-me todo dia [tarefa] às [hh:mm]");
            return;
        }
        // 14. Lista de tarefas
        if (cmd.startsWith('adicionar tarefa ')) {
            let tarefa = texto.replace(/adicionar tarefa /i, "").trim();
            if (!tarefa) { exibirRespostaJarvis("Informe a tarefa."); return; }
            dbMemoriaLocal.tarefas.push({ id: Date.now(), texto: tarefa, concluida: false });
            localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
            exibirRespostaJarvis(`✅ Tarefa adicionada: "${tarefa}"`);
            return;
        }
        if (cmd === 'listar tarefas') {
            let tarefas = dbMemoriaLocal.tarefas.filter(t => !t.concluida);
            if (tarefas.length === 0) exibirRespostaJarvis("Nenhuma tarefa pendente.");
            else {
                let lista = "📋 Tarefas pendentes:\n" + tarefas.map((t, i) => `${i+1}. ${t.texto}`).join("\n");
                exibirRespostaJarvis(lista);
            }
            return;
        }
        if (cmd.startsWith('concluir tarefa ')) {
            let idx = parseInt(cmd.replace('concluir tarefa', '').trim()) - 1;
            let tarefasPendentes = dbMemoriaLocal.tarefas.filter(t => !t.concluida);
            if (idx >= 0 && idx < tarefasPendentes.length) {
                let tarefa = tarefasPendentes[idx];
                tarefa.concluida = true;
                localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
                exibirRespostaJarvis(`✅ Tarefa "${tarefa.texto}" concluída!`);
            } else exibirRespostaJarvis("Número de tarefa inválido.");
            return;
        }
        // 15. Gerar QR Code
        if (cmd.startsWith('gerar qr ')) {
            let conteudo = texto.replace(/gerar qr /i, "").trim();
            if (!conteudo) { exibirRespostaJarvis("Informe o texto para gerar QR."); return; }
            let url = await gerarQRCode(conteudo);
            if (url) exibirRespostaJarvis(`📱 QR Code gerado: <img src="${url}" style="max-width:200px; border-radius:8px; margin-top:8px;">`, true, true);
            else exibirRespostaJarvis("❌ Erro ao gerar QR Code.");
            return;
        }
        // 16. Resumir URL (usando backend)
        if (cmd.startsWith('resumir ')) {
            let url = texto.replace(/resumir /i, "").trim();
            if (!url) { exibirRespostaJarvis("Informe a URL."); return; }
            exibirRespostaJarvis(`📄 Resumindo ${url}...`, false);
            const resp = await fetch(`${BACKEND_URL}api/comando`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historico: [{ role: "user", content: `Resuma o conteúdo do site: ${url}` }] }) });
            const data = await resp.json();
            exibirRespostaJarvis(data.resposta || "Não foi possível resumir.");
            return;
        }
        // 17. Buscar imagem (Unsplash)
        if (cmd.startsWith('buscar imagem de ')) {
            let query = texto.replace(/buscar imagem de /i, "").trim();
            if (!query) { exibirRespostaJarvis("Informe o que deseja buscar."); return; }
            exibirRespostaJarvis(`🖼️ Buscando imagem de ${query}...`, false);
            try {
                // Usando a API pública do Lorem Picsum? Melhor: Unsplash com chave? Usaremos uma fonte gratuita sem chave: placeholder images via unsplash random
                const resp = await fetch(`https://source.unsplash.com/featured/800x600?${encodeURIComponent(query)}`);
                if (resp.ok) {
                    const imgUrl = resp.url;
                    exibirRespostaJarvis(`🖼️ Imagem encontrada: <img src="${imgUrl}" style="max-width:100%; border-radius:8px; margin-top:8px;">`, true, true);
                } else exibirRespostaJarvis("Nenhuma imagem encontrada.");
            } catch { exibirRespostaJarvis("Erro ao buscar imagem."); }
            return;
        }
        // 18. Citação aleatória
        if (cmd === 'citação') {
            try {
                const resp = await fetch('https://api.quotable.io/random');
                const data = await resp.json();
                exibirRespostaJarvis(`📖 "${data.content}" — ${data.author}`);
            } catch { exibirRespostaJarvis("Erro ao buscar citação. Tente novamente."); }
            return;
        }
        // 19. Horário mundial
        if (cmd.startsWith('horário em ')) {
            let cidade = texto.replace(/horário em /i, "").trim();
            if (!cidade) { exibirRespostaJarvis("Informe a cidade."); return; }
            try {
                const resp = await fetch(`https://worldtimeapi.org/api/timezone/${cidade}`);
                const data = await resp.json();
                if (data.datetime) {
                    let hora = new Date(data.datetime).toLocaleTimeString();
                    exibirRespostaJarvis(`🕒 Horário em ${cidade}: ${hora}`);
                } else exibirRespostaJarvis("Cidade não encontrada.");
            } catch { exibirRespostaJarvis("Erro ao obter horário."); }
            return;
        }
        // 20. Contador regressivo
        if (cmd.startsWith('faltam quantos dias para ')) {
            let dataStr = texto.replace(/faltam quantos dias para /i, "").trim();
            let partes = dataStr.split(/[\/\-]/);
            if (partes.length === 3) {
                let dia = parseInt(partes[0]);
                let mes = parseInt(partes[1]) - 1;
                let ano = parseInt(partes[2]);
                let dataEvento = new Date(ano, mes, dia);
                let hoje = new Date();
                let diff = Math.ceil((dataEvento - hoje) / (1000 * 60 * 60 * 24));
                if (diff >= 0) exibirRespostaJarvis(`📅 Faltam ${diff} dias para ${dataStr}.`);
                else exibirRespostaJarvis(`📅 Já se passaram ${Math.abs(diff)} dias desde ${dataStr}.`);
            } else exibirRespostaJarvis("Formato: faltam quantos dias para dd/mm/aaaa");
            return;
        }

        // ---------- COMANDOS OFFLINE GERAIS ----------
        let respostaOffline = processarComandoOffline(texto);
        if (respostaOffline) {
            exibirRespostaJarvis(respostaOffline, true, true);
            return;
        }

        // ---------- SE NADA DISSO, CHAMA IA ----------
        if (modoAviao) exibirRespostaJarvis("✈️ Modo avião ativo. Use comandos offline.");
        else { historicoConversa.push({ role: "user", content: texto }); await chamarIA(); }
    }

    // ==================== UPLOAD DE PDF ====================
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
            exibirRespostaJarvis(`📚 PDF aprendido como matéria "${nomeMateriaPDF}".`);
            aguardandoAprenderPDF = false;
            nomeMateriaPDF = '';
            fileInput.value = '';
            return;
        }
        if (textoCompleto) {
            exibirRespostaJarvis(`✅ PDF carregado: ${pdfNumPaginas} páginas, ${pdfFatias.length} fatias.`);
        } else exibirRespostaJarvis("Falha ao processar o PDF.");
        fileInput.value = '';
    }

    // ==================== OCR, QR, SALVAR CONVERSA ====================
    async function realizarOCR(arquivo) {
        exibirRespostaJarvis("🔍 Processando imagem com OCR...", false);
        try {
            const { data: { text } } = await Tesseract.recognize(arquivo, 'por');
            const resultado = text.trim() || "Nenhum texto encontrado.";
            exibirRespostaJarvis(`📷 **Texto extraído:**\n${resultado}`, true);
            historicoConversa.push({ role: "user", content: `[OCR] ${resultado}` });
        } catch (err) { exibirRespostaJarvis(`❌ Erro no OCR: ${err.message}`); }
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
        menuToggle.addEventListener('click', () => { sidebar.classList.add('open'); if (overlay) overlay.classList.add('active'); });
    }
    if (closeSidebar && sidebar) {
        closeSidebar.addEventListener('click', () => { sidebar.classList.remove('open'); if (overlay) overlay.classList.remove('active'); });
    }
    if (overlay) {
        overlay.addEventListener('click', () => { if (sidebar) sidebar.classList.remove('open'); overlay.classList.remove('active'); });
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

    const savedHistorico = localStorage.getItem('jarvis_historico');
    if (savedHistorico) {
        try { historicoConversa = JSON.parse(savedHistorico); } catch(e) {}
    }

    exibirRespostaJarvis("✅ JARVIS ultra completo ativado! Agora com 20 novas funcionalidades: gorjeta, câmbio, previsão, sorte, dado, moeda, tamanho texto, inverter, palíndromo, cronômetro, base numérica, idade, lembrete diário, lista de tarefas, gerar QR, resumir URL, buscar imagem, citação, horário mundial, contador regressivo. Use 'ajuda' para ver os comandos (implemente se quiser).", false);
});
