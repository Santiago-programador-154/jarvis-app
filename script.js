// ==================== JARVIS - VERSÃO COMPLETA COM PDF ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('JARVIS iniciado');

    // ==================== ELEMENTOS DOM ====================
    const chatBox = document.getElementById('chatBox');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const fileInput = document.getElementById('fileInput');
    const pdfStatusDiv = document.getElementById('pdfStatus');

    if (!sendBtn || !userInput || !chatBox) {
        console.error('Elementos essenciais não encontrados');
        return;
    }

    // ==================== ESTADO GLOBAL ====================
    let modoSilencio = false;
    let historicoConversa = [];
    let reconhecimento = null;
    let gravando = false;
    
    // PDF state
    let pdfDoc = null;
    let pdfPaginaAtual = 1;
    let pdfNumPaginas = 0;
    let pdfFatias = [];
    let indiceFatiaAtual = 0;
    let estaLendoPdf = false;
    let modoEspecialista = false;

    // Backend URL (para IA)
    const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ? 'http://localhost:5000/'
        : 'https://jarvis-backend-pm7w.onrender.com/';

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

    // ==================== FUNÇÕES AUXILIARES ====================
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

    // ==================== PDF FUNCTIONS ====================
    async function carregarPDFCompleto(arrayBuffer) {
        try {
            pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            pdfNumPaginas = pdfDoc.numPages;
            pdfPaginaAtual = 1;
            estaLendoPdf = true;
            atualizarStatusPDF(`Carregado: ${pdfNumPaginas} páginas`);
            
            // Extrai todo o texto para fatias
            let textoCompleto = "";
            for (let i = 1; i <= pdfNumPaginas; i++) {
                const pagina = await pdfDoc.getPage(i);
                const conteudo = await pagina.getTextContent();
                textoCompleto += conteudo.items.map(item => item.str).join(" ") + "\n";
            }
            pdfFatias = fatiarTexto(textoCompleto, 30000);
            indiceFatiaAtual = 0;
            atualizarStatusPDF(`${pdfNumPaginas} páginas, ${pdfFatias.length} fatias`);
            return true;
        } catch(e) {
            console.error(e);
            return false;
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
        if (modo === 'especialista') {
            prompt = `[LEITURA_ESPECIALISTA] Página ${paginaNum} do PDF:\n${texto}\n\nNarre este conteúdo como um documentário dramático.`;
        } else if (modo === 'leitura') {
            prompt = `[LEITURA_PURA_DO_PDF] - Página ${paginaNum}:\n${texto}`;
        } else {
            prompt = `[CONTINUAÇÃO DO PDF] - Página ${paginaNum}:\n${texto}\n\nFaça uma análise detalhada.`;
        }
        
        exibirRespostaJarvis(`📄 Lendo página ${paginaNum}...`, false);
        historicoConversa.push({ role: "user", content: prompt });
        // Chama IA para processar
        await chamarIA();
        return true;
    }

    async function enviarFatiaPDF(modoLeitura = false) {
        if (indiceFatiaAtual >= pdfFatias.length) {
            exibirRespostaJarvis("Fim do documento. Todas as fatias foram lidas.");
            estaLendoPdf = false;
            atualizarStatusPDF("Finalizado");
            return;
        }
        const textoFatia = pdfFatias[indiceFatiaAtual];
        indiceFatiaAtual++;
        atualizarStatusPDF(`Fatia ${indiceFatiaAtual}/${pdfFatias.length}`);
        
        let prompt;
        if (modoLeitura) {
            prompt = `[LEITURA_PURA_DO_PDF] - Fatia ${indiceFatiaAtual} de ${pdfFatias.length}\n\nConteúdo:\n${textoFatia}`;
        } else {
            prompt = `[CONTINUAÇÃO DO PDF] - Fatia ${indiceFatiaAtual} de ${pdfFatias.length}\n\nConteúdo:\n${textoFatia}\n\nFaça uma análise detalhada e inteligente.`;
        }
        historicoConversa.push({ role: "user", content: prompt });
        await chamarIA();
    }

    // ==================== COMANDOS OFFLINE ====================
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
        if (cmd === 'conte uma piada') {
            return piadas[Math.floor(Math.random() * piadas.length)];
        }
        if (cmd.startsWith('registrar diário')) {
            let nota = texto.replace(/registrar diário/i, '').trim();
            if (!nota) return "Escreva algo para registrar.";
            dbMemoriaLocal.diario.push(`${new Date().toLocaleDateString()}: ${nota}`);
            localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
            return "Diário registrado com sucesso.";
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
            if (cmd === materia && dbMemoriaLocal[materia].length) {
                return `<b>${materia.toUpperCase()}</b><br>${dbMemoriaLocal[materia].slice(0,5).join('<br>')}`;
            }
        }
        // Matemática simples
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
        const typingDiv = document.getElementById('typingIndicator');
        if (typingDiv) typingDiv.style.display = 'flex';
        try {
            const response = await fetch(`${BACKEND_URL}api/comando`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    historico: historicoConversa.slice(-20),
                    modo_especialista: modoEspecialista 
                })
            });
            const data = await response.json();
            if (typingDiv) typingDiv.style.display = 'none';
            exibirRespostaJarvis(data.resposta || "Sem resposta da IA.");
        } catch (error) {
            if (typingDiv) typingDiv.style.display = 'none';
            exibirRespostaJarvis("Erro ao conectar com o servidor. Verifique o backend ou use comandos offline.");
        }
    }

    // ==================== ENVIO PRINCIPAL ====================
    async function enviarMensagem() {
        const texto = userInput.value.trim();
        if (!texto) return;

        exibirMensagemUsuario(texto);
        userInput.value = '';
        
        const cmd = texto.toLowerCase();

        // Comandos de controle de PDF
        if (estaLendoPdf) {
            if (cmd === 'próxima página') {
                if (pdfDoc && pdfPaginaAtual < pdfNumPaginas) {
                    pdfPaginaAtual++;
                    await lerPaginaPDF(pdfPaginaAtual, 'analise');
                    atualizarStatusPDF(`Página ${pdfPaginaAtual}/${pdfNumPaginas}`);
                } else {
                    exibirRespostaJarvis("Já está na última página.");
                }
                return;
            }
            if (cmd === 'página anterior') {
                if (pdfDoc && pdfPaginaAtual > 1) {
                    pdfPaginaAtual--;
                    await lerPaginaPDF(pdfPaginaAtual, 'analise');
                    atualizarStatusPDF(`Página ${pdfPaginaAtual}/${pdfNumPaginas}`);
                } else {
                    exibirRespostaJarvis("Já está na primeira página.");
                }
                return;
            }
            if (cmd === 'modo especialista') {
                modoEspecialista = true;
                if (pdfDoc) {
                    await lerPaginaPDF(pdfPaginaAtual, 'especialista');
                } else {
                    exibirRespostaJarvis("Nenhum PDF carregado.");
                }
                return;
            }
            if (cmd === 'continue' || cmd === 'continuar') {
                await enviarFatiaPDF(false);
                return;
            }
            if (cmd === 'leia') {
                await enviarFatiaPDF(true);
                return;
            }
        }

        // Comandos offline gerais
        let respostaOffline = processarComandoOffline(texto);
        if (respostaOffline) {
            exibirRespostaJarvis(respostaOffline, true, true);
            return;
        }

        // Se não for offline e não for comando de PDF, manda para IA
        historicoConversa.push({ role: "user", content: texto });
        await chamarIA();
    }

    // ==================== UPLOAD DE PDF ====================
    async function arquivoSelecionado() {
        if (!fileInput || !fileInput.files.length) return;
        const arquivo = fileInput.files[0];
        if (arquivo.type !== 'application/pdf') {
            exibirRespostaJarvis("Por favor, envie um arquivo PDF válido.");
            fileInput.value = '';
            return;
        }
        exibirMensagemUsuario(`📎 Enviou o PDF: ${arquivo.name}`);
        const arrayBuffer = await arquivo.arrayBuffer();
        const sucesso = await carregarPDFCompleto(arrayBuffer);
        if (sucesso) {
            exibirRespostaJarvis(`✅ PDF carregado: ${pdfNumPaginas} páginas, ${pdfFatias.length} fatias.\nUse "continue" para análise ou "leia" para texto puro.\nNavegue com "próxima página".`);
        } else {
            exibirRespostaJarvis("Falha ao processar o PDF. Tente novamente.");
        }
        fileInput.value = '';
    }

    // ==================== MICROFONE ====================
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        reconhecimento = new SpeechRecognitionAPI();
        reconhecimento.lang = 'pt-BR';
        reconhecimento.continuous = false;
        reconhecimento.interimResults = false;
        reconhecimento.onresult = (event) => {
            const texto = event.results[0][0].transcript.trim();
            userInput.value = texto;
            enviarMensagem();
        };
        reconhecimento.onend = () => {
            if (micBtn) {
                micBtn.classList.remove('gravando');
                micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            }
            gravando = false;
        };
        if (micBtn) {
            micBtn.addEventListener('click', () => {
                if (gravando) {
                    reconhecimento.stop();
                } else {
                    reconhecimento.start();
                    micBtn.classList.add('gravando');
                    micBtn.innerHTML = '<i class="fas fa-stop"></i>';
                    gravando = true;
                }
            });
        }
    } else if (micBtn) {
        micBtn.style.display = 'none';
    }

    // ==================== EVENTOS E UI ====================
    sendBtn.addEventListener('click', enviarMensagem);
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') enviarMensagem(); });
    if (fileInput) fileInput.addEventListener('change', arquivoSelecionado);
    
    // Sidebar toggle (se existir)
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
    
    // Bateria
    if (document.getElementById('batteryStatus')) {
        if ('getBattery' in navigator) {
            navigator.getBattery().then(b => {
                const lvl = Math.round(b.level * 100);
                document.getElementById('batteryStatus').innerHTML = `<i class="fas fa-battery-full"></i> Bateria: ${lvl}%`;
            });
        } else {
            document.getElementById('batteryStatus').innerHTML = `<i class="fas fa-battery-slash"></i> Bateria: N/D`;
        }
    }
    
    // Mensagem inicial
    exibirRespostaJarvis("Sistemas online! PDF funcionando. Envie um PDF e use 'continue' para analisar, 'leia' para texto puro, ou 'próxima página' para navegar.", false);
});
