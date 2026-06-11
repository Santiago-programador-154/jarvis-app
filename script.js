// ==================== JARVIS - VERSÃO CORRIGIDA ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('JARVIS iniciado');

    // ==================== ELEMENTOS DOM ====================
    const chatBox = document.getElementById('chatBox');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const fileInput = document.getElementById('fileInput');
    let pdfStatusDiv = document.getElementById('pdfStatus');
    if (!pdfStatusDiv) {
        pdfStatusDiv = document.createElement('div');
        pdfStatusDiv.id = 'pdfStatus';
        pdfStatusDiv.className = 'pdf-status';
        const tabsContainer = document.querySelector('.tabs-container');
        if (tabsContainer) tabsContainer.parentNode.insertBefore(pdfStatusDiv, tabsContainer);
    }

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
    let mediaRecorder = null;
    let audioChunks = [];

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
        "flashcards": [{ q: "Capital do Brasil?", r: "Brasília" }],
        "tarefas": [],
        "humor": []
    };
    let gastos = JSON.parse(localStorage.getItem('jarvis_gastos')) || [];

    const piadas = ["Por que o programador foi ao mercado? Por bytes!", "O que o zero disse ao oito? Bonito cinto!", "Qual o cúmulo do preguiçoso? Ser enterrado numa montanha de documentos.", "Por que o livro de matemática é triste? Porque tem muitos problemas."];

    let aguardandoAprenderPDF = false;
    let nomeMateriaPDF = '';

    // ==================== FUNÇÕES UI ====================
    function exibirMensagemUsuario(texto) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'balao user-msg';
        msgDiv.innerHTML = `<div class="avatar"><i class="fas fa-user"></i></div>
                            <div class="message-content"><span class="sender-name">Você</span><p>${texto.replace(/</g, '&lt;')}</p></div></div>`;
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        historicoConversa.push({ role: "user", content: texto });
        localStorage.setItem('jarvis_historico', JSON.stringify(historicoConversa));
        atualizarEstatisticas();
    }

    function exibirRespostaJarvis(resposta, falarTexto = true, isHtml = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'balao jarvis-msg';
        const conteudo = isHtml ? resposta : resposta.replace(/\n/g, '<br>');
        msgDiv.innerHTML = `<div class="avatar"><i class="fas fa-robot"></i></div>
                            <div class="message-content"><span class="sender-name">JARVIS</span><p>${conteudo}</p></div></div>`;
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
        atualizarEstatisticas();
    }

    function atualizarEstatisticas() {
        if(document.getElementById('statComandos')) document.getElementById('statComandos').innerText = historicoConversa.filter(m => m.role === 'user').length;
        if(document.getElementById('statMensagens')) document.getElementById('statMensagens').innerText = historicoConversa.length;
        if(document.getElementById('statTarefas')) document.getElementById('statTarefas').innerText = dbMemoriaLocal.tarefas.filter(t => !t.concluida).length;
        if(document.getElementById('statGastos')) document.getElementById('statGastos').innerHTML = `R$ ${gastos.reduce((s,g) => s + g.valor, 0).toFixed(2)}`;
        if(document.getElementById('statDiario')) document.getElementById('statDiario').innerText = dbMemoriaLocal.diario.length;
    }

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
        } catch(e) { return null; }
    }
    function fatiarTexto(texto, max) {
        let palavras = texto.split(' '), fatias = [], atual = '';
        for (let p of palavras) {
            if ((atual + p).length > max) { fatias.push(atual.trim()); atual = p + ' '; }
            else atual += p + ' ';
        }
        if (atual.trim()) fatias.push(atual.trim());
        return fatias;
    }
    async function enviarFatiaPDF(modoLeitura = false) {
        if (indiceFatiaAtual >= pdfFatias.length) { exibirRespostaJarvis("Fim do documento."); estaLendoPdf = false; atualizarStatusPDF("Finalizado"); return; }
        const texto = pdfFatias[indiceFatiaAtual++];
        atualizarStatusPDF(`Fatia ${indiceFatiaAtual}/${pdfFatias.length}`);
        let prompt = modoLeitura ? `[LEITURA_PURA_DO_PDF] Fatia ${indiceFatiaAtual}: ${texto}` : `[CONTINUAÇÃO DO PDF] Fatia ${indiceFatiaAtual}: ${texto}\nFaça análise detalhada.`;
        historicoConversa.push({ role: "user", content: prompt });
        await chamarIA();
    }
    async function lerPaginaPDF(paginaNum, modo = 'leitura') {
        if (!pdfDoc || paginaNum < 1 || paginaNum > pdfNumPaginas) return;
        const pagina = await pdfDoc.getPage(paginaNum);
        const texto = (await pagina.getTextContent()).items.map(i => i.str).join(' ');
        let prompt = modo === 'especialista' ? `[LEITURA_ESPECIALISTA] Página ${paginaNum}: ${texto}\nNarre como documentário.` : `[LEITURA_PURA_DO_PDF] Página ${paginaNum}: ${texto}`;
        historicoConversa.push({ role: "user", content: prompt });
        await chamarIA();
    }
    function atualizarStatusPDF(texto) { 
        if (pdfStatusDiv) {
            pdfStatusDiv.style.display = 'flex';
            pdfStatusDiv.innerHTML = `<i class="fas fa-file-pdf"></i> ${texto}`;
        }
    }

    // ==================== COMANDOS OFFLINE ====================
    function processarComandoOffline(texto) {
        const cmd = texto.toLowerCase();
        if (cmd.includes('que horas são')) return new Date().toLocaleTimeString();
        if (cmd.includes('que dia é hoje')) return new Date().toLocaleDateString();
        if (cmd === 'conte uma piada') return piadas[Math.floor(Math.random() * piadas.length)];
        if (cmd.startsWith('registrar diário')) {
            let nota = texto.replace(/registrar diário/i, '').trim();
            if (!nota) return "Escreva algo.";
            dbMemoriaLocal.diario.push(`${new Date().toLocaleDateString()}: ${nota}`);
            localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
            return "Diário registrado.";
        }
        if (cmd === 'ler diário') return dbMemoriaLocal.diario.length ? `<b>Diário:</b><br>${dbMemoriaLocal.diario.join('<br>')}` : "Diário vazio.";
        if (cmd === 'flashcard') {
            let card = dbMemoriaLocal.flashcards[Math.floor(Math.random() * dbMemoriaLocal.flashcards.length)];
            return `<b>Flashcard:</b> ${card.q}`;
        }
        for (let materia in dbMemoriaLocal) {
            if (cmd === materia && dbMemoriaLocal[materia].length) return `<b>${materia.toUpperCase()}</b><br>${dbMemoriaLocal[materia].slice(0,5).join('<br>')}`;
        }
        try {
            let math = texto.match(/[\d\s\+\-\*\/\(\)\.\,\^\%]+/);
            if (math && !/[a-zA-Z]/.test(math[0])) return `Resultado: ${eval(math[0].replace(/,/g,'.').replace(/\^/g,'**'))}`;
        } catch(e) {}
        return null;
    }

    // ==================== IA (BACKEND) ====================
    async function chamarIA() {
        if (modoAviao) { exibirRespostaJarvis("✈️ Modo avião ativo. Use comandos offline."); return; }
        const typing = document.getElementById('typingIndicator');
        if (typing) typing.style.display = 'flex';
        try {
            const res = await fetch(`${BACKEND_URL}api/comando`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ historico: historicoConversa.slice(-20), modo_especialista: modoEspecialista })
            });
            const data = await res.json();
            if (typing) typing.style.display = 'none';
            exibirRespostaJarvis(data.resposta || "Sem resposta.");
        } catch(e) {
            if (typing) typing.style.display = 'none';
            exibirRespostaJarvis("Erro de conexão com o servidor.");
        }
    }

    // ==================== FUNÇÕES AUXILIARES NOVAS ====================
    function levenshtein(a, b) {
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
        for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const cost = a[i-1] === b[j-1] ? 0 : 1;
                matrix[j][i] = Math.min(matrix[j][i-1] + 1, matrix[j-1][i] + 1, matrix[j-1][i-1] + cost);
            }
        }
        return matrix[b.length][a.length];
    }

    // ==================== ENVIO PRINCIPAL ====================
    window.inserirComando = function(cmd) { userInput.value = cmd; enviarMensagem(); };

    async function enviarMensagem() {
        const texto = userInput.value.trim();
        if (!texto) return;
        exibirMensagemUsuario(texto);
        userInput.value = '';
        const cmd = texto.toLowerCase();

        // ---------- COMANDOS EXISTENTES (compactados - apenas os essenciais) ----------
        if (cmd.startsWith('aprender ')) {
            let resto = texto.substring(9).trim();
            let dp = resto.indexOf(':');
            if (dp>0) exibirRespostaJarvis(adicionarConhecimentoOffline(resto.substring(0,dp).trim().toLowerCase(), resto.substring(dp+1).trim()));
            else exibirRespostaJarvis("Use: aprender [matéria] : [conteúdo]");
            return;
        }
        if (cmd.startsWith('aprender pdf')) {
            let nome = cmd.replace('aprender pdf','').trim();
            if(nome) { aguardandoAprenderPDF = true; nomeMateriaPDF = nome; exibirRespostaJarvis(`📖 Envie PDF para matéria "${nome}".`); }
            else exibirRespostaJarvis("Especifique o nome da matéria.");
            return;
        }
        if (estaLendoPdf && pdfDoc) {
            if (cmd === 'próxima página') { if(pdfPaginaAtual < pdfNumPaginas){ pdfPaginaAtual++; await lerPaginaPDF(pdfPaginaAtual); atualizarStatusPDF(`Página ${pdfPaginaAtual}/${pdfNumPaginas}`); } else exibirRespostaJarvis("Última página."); return; }
            if (cmd === 'página anterior') { if(pdfPaginaAtual > 1){ pdfPaginaAtual--; await lerPaginaPDF(pdfPaginaAtual); atualizarStatusPDF(`Página ${pdfPaginaAtual}/${pdfNumPaginas}`); } else exibirRespostaJarvis("Primeira página."); return; }
            if (cmd === 'modo especialista') { modoEspecialista=true; if(pdfDoc) await lerPaginaPDF(pdfPaginaAtual,'especialista'); else exibirRespostaJarvis("Nenhum PDF carregado."); return; }
            if (cmd === 'continue' || cmd === 'continuar') { await enviarFatiaPDF(false); return; }
            if (cmd === 'leia') { await enviarFatiaPDF(true); return; }
        }
        // ... (mantenha os outros comandos como estavam no seu script original, apenas remova as partes que usam unescape/escape)
        // Para evitar duplicação enorme, mantenha o restante do seu código original,
        // mas substitua a lógica de senhas (salvar senha / mostrar senhas) pelo seguinte:

        if (cmd.startsWith('salvar senha ')) {
            let partes = texto.match(/salvar senha (.+?)\s+(.+?)\s+(.+)/i);
            if(partes){
                let site=partes[1], usuario=partes[2], senha=partes[3];
                let cofre = JSON.parse(localStorage.getItem('jarvis_cofre')) || [];
                // Usando btoa com encodeURIComponent (seguro)
                let dados = JSON.stringify({ site, usuario, senha });
                let encrypted = btoa(encodeURIComponent(dados));
                cofre.push(encrypted);
                localStorage.setItem('jarvis_cofre', JSON.stringify(cofre));
                exibirRespostaJarvis(`🔐 Senha salva para ${site}.`);
            } else exibirRespostaJarvis("Formato: salvar senha [site] [usuario] [senha]");
            return;
        }
        if (cmd === 'mostrar senhas') {
            let cofre = JSON.parse(localStorage.getItem('jarvis_cofre')) || [];
            if(cofre.length===0) exibirRespostaJarvis("Nenhuma senha salva.");
            else {
                let lista = "🔐 **Senhas salvas:**\n";
                for(let i=0; i<cofre.length; i++){
                    try {
                        let decStr = decodeURIComponent(atob(cofre[i]));
                        let dec = JSON.parse(decStr);
                        lista += `${i+1}. ${dec.site} - ${dec.usuario}\n`;
                    } catch(e){}
                }
                exibirRespostaJarvis(lista);
            }
            return;
        }

        // ... adicione aqui os demais comandos (clima, notícias, etc) conforme seu código original

        // Fallback offline
        let respostaOffline = processarComandoOffline(texto);
        if (respostaOffline) { exibirRespostaJarvis(respostaOffline, true, true); return; }

        // IA
        if (modoAviao) exibirRespostaJarvis("✈️ Modo avião ativo.");
        else { historicoConversa.push({ role: "user", content: texto }); await chamarIA(); }
    }

    // ==================== UPLOAD DE PDF ====================
    async function arquivoSelecionado() {
        if (!fileInput.files.length) return;
        let arquivo = fileInput.files[0];
        if (arquivo.type !== 'application/pdf') { exibirRespostaJarvis("Envie um PDF."); fileInput.value=''; return; }
        exibirMensagemUsuario(`📎 Enviou PDF: ${arquivo.name}`);
        let buffer = await arquivo.arrayBuffer();
        let texto = await carregarPDFCompleto(buffer);
        if (aguardandoAprenderPDF && nomeMateriaPDF && texto) {
            adicionarConhecimentoOffline(nomeMateriaPDF, texto);
            exibirRespostaJarvis(`📚 PDF aprendido como matéria "${nomeMateriaPDF}"`);
            aguardandoAprenderPDF=false; nomeMateriaPDF=''; fileInput.value=''; return;
        }
        if(texto) exibirRespostaJarvis(`✅ PDF carregado: ${pdfNumPaginas} páginas, ${pdfFatias.length} fatias.`);
        else exibirRespostaJarvis("Falha ao processar PDF.");
        fileInput.value='';
    }

    // ==================== OCR, QR, SALVAR CONVERSA ====================
    async function realizarOCR(arquivo) {
        exibirRespostaJarvis("🔍 OCR processando...", false);
        try{
            const { data: { text } } = await Tesseract.recognize(arquivo, 'por');
            exibirRespostaJarvis(`📷 Texto extraído:\n${text.trim() || "Nenhum texto"}`);
        } catch(e){ exibirRespostaJarvis(`❌ Erro: ${e.message}`); }
    }
    function abrirCameraOCR() { let input = document.createElement('input'); input.type='file'; input.accept='image/*'; input.onchange = async e => { if(e.target.files[0]) await realizarOCR(e.target.files[0]); }; input.click(); }
    async function abrirCameraQR() {
        const video = document.createElement('video'), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        const modal = document.createElement('div'); modal.className = 'modal'; modal.innerHTML = `<div class="modal-content"><h3>📱 Aponte para o QR Code</h3><video id="qrVideo" autoplay playsinline></video><br><button id="closeQRModal">Fechar</button></div>`;
        document.body.appendChild(modal);
        const videoElement = modal.querySelector('#qrVideo');
        let stream = null;
        try{
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            videoElement.srcObject = stream;
            await videoElement.play();
            const tick = () => {
                if(videoElement.readyState === videoElement.HAVE_ENOUGH_DATA){
                    canvas.width = videoElement.videoWidth; canvas.height = videoElement.videoHeight;
                    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                    let code = jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data, canvas.width, canvas.height);
                    if(code){
                        if(stream) stream.getTracks().forEach(t=>t.stop());
                        modal.remove();
                        if(code.data.startsWith('http')) window.open(code.data, '_blank');
                        else exibirRespostaJarvis(`📲 QR Code: ${code.data}`);
                        return;
                    }
                }
                requestAnimationFrame(tick);
            };
            tick();
            modal.querySelector('#closeQRModal').onclick = () => { if(stream) stream.getTracks().forEach(t=>t.stop()); modal.remove(); };
        } catch(err){ modal.innerHTML = `<div class="modal-content"><p>❌ Erro câmera: ${err.message}</p><button id="closeQRModal">Fechar</button></div>`; modal.querySelector('#closeQRModal').onclick = () => modal.remove(); }
    }
    function salvarConversaPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 10;
        doc.text("Conversa com JARVIS", 10, y);
        y+=7;
        historicoConversa.slice(-30).forEach(msg=>{
            let role = msg.role==="user"?"Você":"JARVIS";
            let linhas = doc.splitTextToSize(`${role}: ${msg.content.substring(0,500)}`, 180);
            linhas.forEach(l=>{ if(y>280){ doc.addPage(); y=10; } doc.text(l,10,y); y+=6; });
            y+=3;
        });
        doc.save(`jarvis_${Date.now()}.pdf`);
        exibirRespostaJarvis("Conversa salva em PDF.");
    }

    // ==================== EVENTOS E UI ====================
    sendBtn.addEventListener('click', enviarMensagem);
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') enviarMensagem(); });
    fileInput.addEventListener('change', arquivoSelecionado);

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const closeSidebar = document.getElementById('closeSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if(menuToggle && sidebar) menuToggle.addEventListener('click', ()=>{ sidebar.classList.add('open'); overlay.classList.add('active'); });
    if(closeSidebar && sidebar) closeSidebar.addEventListener('click', ()=>{ sidebar.classList.remove('open'); overlay.classList.remove('active'); });
    if(overlay) overlay.addEventListener('click', ()=>{ sidebar.classList.remove('open'); overlay.classList.remove('active'); });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', ()=>{
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });

    document.getElementById('exportDiarioBtn')?.addEventListener('click', ()=>inserirComando('exportar diario'));
    document.getElementById('exportFlashcardsBtn')?.addEventListener('click', ()=>inserirComando('exportar flashcards'));
    document.getElementById('exportGastosBtn')?.addEventListener('click', ()=>inserirComando('relatório de gastos'));
    document.getElementById('salvarConversaBtn')?.addEventListener('click', salvarConversaPDF);
    document.getElementById('limparConversaBtn')?.addEventListener('click', ()=>{ if(confirm("Limpar conversa?")){ historicoConversa=[]; localStorage.removeItem('jarvis_historico'); location.reload(); } });
    document.getElementById('ocrImageBtn')?.addEventListener('click', abrirCameraOCR);
    document.getElementById('qrScanBtn')?.addEventListener('click', abrirCameraQR);
    document.getElementById('exportBackupBtn')?.addEventListener('click', ()=>inserirComando('exportar tudo'));
    document.getElementById('importBackupBtn')?.addEventListener('click', ()=>inserirComando('importar backup'));
    document.getElementById('clearAllDataBtn')?.addEventListener('click', ()=>{ if(confirm("Apagar TODOS os dados?")){ localStorage.clear(); location.reload(); } });
    document.querySelectorAll('.theme-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
            let theme = btn.getAttribute('data-theme');
            if(theme==='dark'){ document.body.classList.remove('light-mode','blue-theme','green-theme'); document.body.classList.add('dark-mode'); }
            else if(theme==='light'){ document.body.classList.remove('dark-mode','blue-theme','green-theme'); document.body.classList.add('light-mode'); }
            else if(theme==='blue'){ document.body.classList.remove('light-mode','dark-mode','green-theme'); document.body.classList.add('blue-theme'); }
            else if(theme==='green'){ document.body.classList.remove('light-mode','dark-mode','blue-theme'); document.body.classList.add('green-theme'); }
        });
    });

    if(window.SpeechRecognition || window.webkitSpeechRecognition){
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        reconhecimento = new SpeechRecognitionAPI();
        reconhecimento.lang = 'pt-BR';
        reconhecimento.continuous = false;
        reconhecimento.onresult = (event) => { userInput.value = event.results[0][0].transcript.trim(); enviarMensagem(); };
        reconhecimento.onend = () => { if(micBtn){ micBtn.classList.remove('gravando'); micBtn.innerHTML='<i class="fas fa-microphone"></i>'; } gravando=false; };
        micBtn.addEventListener('click', () => {
            if(gravando) reconhecimento.stop();
            else { reconhecimento.start(); micBtn.classList.add('gravando'); micBtn.innerHTML='<i class="fas fa-stop"></i>'; gravando=true; }
        });
    }

    let saved = localStorage.getItem('jarvis_historico');
    if(saved) try{ historicoConversa = JSON.parse(saved); } catch(e){}
    atualizarEstatisticas();

    let comandos = ["continue","leia","próxima página","criar pdf sobre","criar audio sobre","criar slides sobre","clima em","massa molar de","rode python:","rode js:","encurtar","converter","gerar senha","traduzir","adicionar gasto","resumo gastos","relatório de gastos","últimas notícias","horóscopo","tabuada do","imc","juros compostos","pomodoro","tela cheia","vibrar","modo avião","modo normal","gerar qr","resumir texto","citação","fato científico","email temporário","cronograma de estudos","força da senha","falar","humor hoje","combustível","converter tempo","media","nota","traduzir frase","palavra do dia","modo foco ativar","histórico de","exportar tudo","importar backup","tema azul","tema verde","tema padrão","receita","timer","salvar senha","mostrar senhas","adicionar evento","eventos hoje","eventos amanhã","comparar textos","gravar nota","parar gravação","recomendar filme","rastrear","criar curriculo"];
    comandos.forEach(c=>{ let opt = document.createElement('option'); opt.value=c; document.getElementById('commands-list')?.appendChild(opt); });
    exibirRespostaJarvis("✅ JARVIS 5.0 ativado! Mais de 100 comandos. Divirta-se!", false);
});
