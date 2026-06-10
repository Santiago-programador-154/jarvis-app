// ==================== CONFIGURAÇÃO GLOBAL ====================
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// Estado
let pdfDoc = null;
let pdfPaginaAtual = 1;
let pdfNumPaginas = 0;
let pdfFatias = [];
let indiceFatiaAtual = 0;
let estaLendoPdf = false;
let modoSilencio = false;
let ranzinzaGravando = false;
let falandoAgora = false;
let reconhecimento;
let historicoConversa = [];
let lembretes = JSON.parse(localStorage.getItem('jarvis_lembretes')) || [];
let darkMode = true;

// URLs
const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:5000/'
    : 'https://jarvis-backend-pm7w.onrender.com/';

// Banco de memória expandido
let dbMemoriaLocal = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || {
    "geografia": ["Brasil: Brasília (DF). População ~214M.", "EUA: Washington D.C.", "França: Paris.", "Japão: Tóquio."],
    "historia": ["Independência do Brasil: 1822.", "Revolução Francesa: 1789.", "1ª Guerra: 1914-1918.", "2ª Guerra: 1939-1945."],
    "quimica": ["Água: H2O - 18g/mol.", "Sal: NaCl - 58,44g/mol.", "Gás carbônico: CO2."],
    "fisica": ["Velocidade média = Δs/Δt.", "Força = m·a.", "Energia cinética = (m·v²)/2."],
    "biologia": ["Células: unidade básica.", "Fotossíntese: plantas.", "DNA: código genético."],
    "matematica": ["Pitágoras: a²=b²+c².", "Área círculo: πr².", "Regra de três."],
    "programacao": ["Python, JS, Java, C++.", "HTML/CSS."],
    "filosofia": ["Sócrates: 'Conhece-te a ti mesmo'.", "Platão, Aristóteles, Nietzsche."],
    "portugues": ["Mas x Mais.", "Por que/Porque.", "Sujeito e predicado."],
    "diario": [],
    "flashcards": [{ q: "Capital do Brasil?", r: "Brasília" }]
};

const frasesRanzinzas = ["Processando...", "Comando recebido.", "Analisando dados."];
const piadas = ["Por que o programador foi ao mercado? Por bytes!", "O que o zero disse ao oito? Bonito cinto!"];

// ==================== VOZ ====================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    reconhecimento = new SpeechRecognition();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.continuous = false;
    reconhecimento.onresult = (e) => {
        let texto = e.results[0][0].transcript.trim();
        if (texto.toLowerCase().startsWith("jarvis")) {
            let cmd = texto.replace(/^jarvis/i, "").trim();
            if (cmd) document.getElementById('userInput').value = cmd;
            enviarMensagem();
        } else if (ranzinzaGravando) {
            document.getElementById('userInput').value = texto;
            enviarMensagem();
        }
    };
    reconhecimento.onend = () => {
        let btn = document.getElementById('micBtn');
        if (ranzinzaGravando) {
            ranzinzaGravando = false;
            if (btn) {
                btn.classList.remove('gravando');
                btn.innerHTML = '<i class="fas fa-microphone"></i>';
            }
        }
    };
}

function alternarVoz() {
    if (!SpeechRecognition) return alert("Microfone não suportado.");
    let btn = document.getElementById('micBtn');
    if (ranzinzaGravando) {
        reconhecimento.stop();
        if (btn) {
            btn.classList.remove('gravando');
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
        ranzinzaGravando = false;
    } else {
        reconhecimento.start();
        if (btn) {
            btn.classList.add('gravando');
            btn.innerHTML = '<i class="fas fa-stop"></i>';
        }
        ranzinzaGravando = true;
    }
}

function falar(texto) {
    if (modoSilencio) return;
    if (falandoAgora) window.speechSynthesis.cancel();
    let utterance = new SpeechSynthesisUtterance(texto.replace(/<[^>]*>/g, ''));
    utterance.lang = 'pt-BR';
    utterance.rate = 1.0;
    utterance.pitch = 0.9;
    utterance.onstart = () => falandoAgora = true;
    utterance.onend = () => falandoAgora = false;
    window.speechSynthesis.speak(utterance);
}

function exibirRespostaLocal(resposta, chatBox, falarResposta = true) {
    setTimeout(() => {
        let humor = frasesRanzinzas[Math.floor(Math.random() * frasesRanzinzas.length)];
        let avatar = '<i class="fas fa-robot"></i>';
        let nome = "JARVIS";
        let bubbleClass = "jarvis-msg";
        let final = `<b>${humor}</b><br>${resposta}`;
        chatBox.innerHTML += `<div class="balao ${bubbleClass}"><div class="avatar">${avatar}</div><div class="message-content"><span class="sender-name">${nome}</span><p>${final}</p></div></div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
        if (falarResposta) falar(resposta);
    }, 100);
}

// ==================== RACIOCÍNIO LOCAL ====================
function processarRaciocinioLocal(comando) {
    try {
        let mathExpr = comando.match(/[\d\s\+\-\*\/\(\)\.\,\^\%]+/);
        if (mathExpr && !comando.match(/[a-z]/i)) {
            let expr = mathExpr[0].replace(/,/g, '.').replace(/\^/g, '**');
            let result = eval(expr);
            if (!isNaN(result)) return `Resultado: ${result}`;
        }
    } catch(e) {}
    let kmMatch = comando.match(/(\d+)\s*km\s*para\s*m(?:etros)?/i);
    if (kmMatch) return `${kmMatch[1]} km = ${kmMatch[1] * 1000} metros.`;
    let celsiusMatch = comando.match(/(\d+)\s*°?\s*c(elsius)?\s*para\s*f(ahrenheit)?/i);
    if (celsiusMatch) {
        let c = parseFloat(celsiusMatch[1]);
        let f = (c * 9/5) + 32;
        return `${c}°C = ${f.toFixed(1)}°F.`;
    }
    for (let materia in dbMemoriaLocal) {
        if (comando.includes(materia) && dbMemoriaLocal[materia].length) {
            let dados = dbMemoriaLocal[materia].slice(0,5);
            return `<b>${materia.toUpperCase()}</b><br>${dados.join('<br>')}`;
        }
    }
    return null;
}

function verificarRegrasLocais(cmd, original) {
    if (cmd.includes("que horas são")) {
        let agora = new Date();
        return `${agora.getHours()}:${String(agora.getMinutes()).padStart(2,'0')}`;
    }
    if (cmd.includes("que dia é hoje")) {
        let hoje = new Date();
        return `${hoje.getDate()}/${hoje.getMonth()+1}/${hoje.getFullYear()}`;
    }
    if (cmd.startsWith("registrar diário")) {
        let nota = original.replace(/registrar diário/i, "").trim();
        if (!nota) return "Escreva algo.";
        dbMemoriaLocal.diario.push(`${new Date().toLocaleDateString()}: ${nota}`);
        localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
        return "Diário registrado.";
    }
    if (cmd === "ler diário") {
        if (!dbMemoriaLocal.diario.length) return "Diário vazio.";
        return "<b>Diário:</b><br>" + dbMemoriaLocal.diario.join("<br>");
    }
    if (cmd === "flashcard") {
        let card = dbMemoriaLocal.flashcards[Math.floor(Math.random() * dbMemoriaLocal.flashcards.length)];
        return `<b>Flashcard:</b> ${card.q}`;
    }
    if (cmd === "conte uma piada") {
        return piadas[Math.floor(Math.random() * piadas.length)];
    }
    if (cmd === "bateria") {
        mostrarBateria(true);
        return null; // será tratado pelo mostrarBateria
    }
    if (cmd === "salvar conversa") {
        salvarConversaPDF();
        return "Conversa salva em PDF.";
    }
    if (cmd === "silêncio") {
        modoSilencio = true;
        return "Modo silêncio ativado.";
    }
    if (cmd === "volte a falar") {
        modoSilencio = false;
        return "Modo áudio reativado.";
    }
    return null;
}

// ==================== ENVIO DE MENSAGEM (CORRIGIDO) ====================
function enviarMensagem() {
    let input = document.getElementById('userInput');
    let chatBox = document.getElementById('chatBox');
    let texto = input.value.trim();
    if (!texto) return;

    // Mostrar mensagem do usuário
    chatBox.innerHTML += `<div class="balao user-msg"><div class="avatar"><i class="fas fa-user"></i></div><div class="message-content"><span class="sender-name">Você</span><p>${texto.replace(/</g, '&lt;')}</p></div></div>`;
    input.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;

    let cmd = texto.toLowerCase();

    // 1. Comandos offline imediatos
    let respostaOffline = verificarRegrasLocais(cmd, texto);
    if (respostaOffline) {
        exibirRespostaLocal(respostaOffline, chatBox);
        return;
    }

    // 2. Raciocínio matemático/ciências offline
    let respostaLocal = processarRaciocinioLocal(cmd);
    if (respostaLocal) {
        exibirRespostaLocal(respostaLocal, chatBox);
        return;
    }

    // 3. Se não, chama IA (back-end)
    let typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) typingIndicator.style.display = 'flex';
    
    let comandoComMemoria = `Comando: ${texto}\n\nMemórias: ${JSON.stringify(dbMemoriaLocal)}`;
    historicoConversa.push({ role: "user", content: comandoComMemoria });
    if (historicoConversa.length > 30) historicoConversa = historicoConversa.slice(-30);

    fetch(`${BACKEND_URL}api/comando`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historico: historicoConversa, modo_especialista: false })
    })
    .then(res => res.json())
    .then(data => {
        if (typingIndicator) typingIndicator.style.display = 'none';
        let resposta = data.resposta || "Erro na resposta da IA.";
        chatBox.innerHTML += `<div class="balao jarvis-msg"><div class="avatar"><i class="fas fa-robot"></i></div><div class="message-content"><span class="sender-name">JARVIS</span><p>${resposta}</p></div></div>`;
        historicoConversa.push({ role: "assistant", content: resposta });
        chatBox.scrollTop = chatBox.scrollHeight;
        falar(resposta);
        if (data.imagem_url) {
            chatBox.innerHTML += `<div class="balao jarvis-msg"><div class="avatar"><i class="fas fa-image"></i></div><div class="message-content"><span class="sender-name">JARVIS</span><p><img src="${data.imagem_url}" style="max-width:100%; border-radius:12px;"></p></div></div>`;
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    })
    .catch(err => {
        if (typingIndicator) typingIndicator.style.display = 'none';
        console.error(err);
        exibirRespostaLocal("Erro de conexão com o núcleo neural. Verifique o backend.", chatBox);
    });
}

// ==================== PDF, OCR, QR, BATERIA, PDF CHAT ====================
// Funções simplificadas mas funcionais (você pode expandir depois)
function arquivoSelecionado() {
    let fileInput = document.getElementById('fileInput');
    let arquivo = fileInput.files[0];
    if (!arquivo) return;
    let chatBox = document.getElementById('chatBox');
    chatBox.innerHTML += `<div class="balao user-msg"><div class="avatar"><i class="fas fa-user"></i></div><div class="message-content"><span class="sender-name">Você</span><p>📎 Arquivo: ${arquivo.name}</p></div></div>`;
    exibirRespostaLocal("Funcionalidade de PDF/OCR disponível na versão completa. Por favor, use o comando 'continue' ou 'leia' para PDFs carregados anteriormente.", chatBox);
    fileInput.value = '';
}

function abrirCameraOCR() {
    exibirRespostaLocal("OCR será implementado em breve. Por enquanto, use o envio de imagem pelo botão de anexo.", document.getElementById('chatBox'));
}

function abrirCameraQR() {
    exibirRespostaLocal("Leitura de QR Code em desenvolvimento.", document.getElementById('chatBox'));
}

function salvarConversaPDF() {
    if (typeof window.jspdf === 'undefined') {
        alert("jsPDF não carregado. Aguarde e tente novamente.");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 10;
    doc.text("Conversa com JARVIS", 10, y);
    y += 7;
    historicoConversa.forEach(msg => {
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
    exibirRespostaLocal("Conversa salva em PDF.", document.getElementById('chatBox'));
}

function mostrarBateria(falar = false) {
    if ('getBattery' in navigator) {
        navigator.getBattery().then(b => {
            let lvl = Math.round(b.level * 100);
            let txt = `Bateria: ${lvl}%${b.charging ? " (carregando)" : ""}`;
            let batteryDiv = document.getElementById('batteryStatus');
            if (batteryDiv) batteryDiv.innerHTML = `<i class="fas fa-battery-full"></i> ${txt}`;
            if (falar) exibirRespostaLocal(txt, document.getElementById('chatBox'));
        });
    } else {
        let batteryDiv = document.getElementById('batteryStatus');
        if (batteryDiv) batteryDiv.innerHTML = `<i class="fas fa-battery-slash"></i> Não suportado`;
        if (falar) exibirRespostaLocal("API de bateria não suportada.", document.getElementById('chatBox'));
    }
}

function inserirComando(cmd) {
    let input = document.getElementById('userInput');
    if (input) {
        input.value = cmd;
        enviarMensagem();
    }
}

// ==================== EVENTOS E INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', () => {
    // Sidebar e overlay
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuToggle = document.getElementById('menuToggle');
    const closeSidebar = document.getElementById('closeSidebar');
    
    if (menuToggle) menuToggle.addEventListener('click', () => {
        if (sidebar) sidebar.classList.add('open');
        if (overlay) overlay.classList.add('active');
    });
    if (closeSidebar) closeSidebar.addEventListener('click', () => {
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    });
    if (overlay) overlay.addEventListener('click', () => {
        if (sidebar) sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });
    
    // Botões principais
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.addEventListener('click', enviarMensagem);
    
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.addEventListener('click', alternarVoz);
    
    const userInput = document.getElementById('userInput');
    if (userInput) userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') enviarMensagem(); });
    
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.addEventListener('change', arquivoSelecionado);
    
    const saveChatBtn = document.getElementById('saveChatBtn');
    if (saveChatBtn) saveChatBtn.addEventListener('click', salvarConversaPDF);
    
    const ocrBtn = document.getElementById('ocrImageBtn');
    if (ocrBtn) ocrBtn.addEventListener('click', abrirCameraOCR);
    
    const qrBtn = document.getElementById('qrScanBtn');
    if (qrBtn) qrBtn.addEventListener('click', abrirCameraQR);
    
    const clearChatBtn = document.getElementById('clearChatBtn');
    if (clearChatBtn) clearChatBtn.addEventListener('click', () => {
        if (confirm("Limpar toda a conversa?")) {
            historicoConversa = [];
            const chatBox = document.getElementById('chatBox');
            if (chatBox) chatBox.innerHTML = `<div class="balao jarvis-msg"><div class="avatar"><i class="fas fa-robot"></i></div><div class="message-content"><span class="sender-name">JARVIS</span><p>Conversa reiniciada. Como posso ajudar?</p></div></div>`;
        }
    });
    
    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) newChatBtn.addEventListener('click', () => {
        historicoConversa = [];
        const chatBox = document.getElementById('chatBox');
        if (chatBox) chatBox.innerHTML = `<div class="balao jarvis-msg"><div class="avatar"><i class="fas fa-robot"></i></div><div class="message-content"><span class="sender-name">JARVIS</span><p>Nova conversa iniciada.</p></div></div>`;
    });
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        darkMode = !darkMode;
        themeToggle.innerHTML = darkMode ? '<i class="fas fa-moon"></i> Modo escuro' : '<i class="fas fa-sun"></i> Modo claro';
    });
    
    // Inicializa bateria
    mostrarBateria(false);
    setInterval(() => mostrarBateria(false), 60000);
});
