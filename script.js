// ==================== JARVIS - FRONTEND COMPLETO COM RAG ====================
document.addEventListener('DOMContentLoaded', () => {
    // Elementos
    const chatBox = document.getElementById('chatBox');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const fileInput = document.getElementById('fileInput');

    // Estado
    let modoSilencio = false;
    let historicoConversa = [];
    let reconhecimento = null;
    let gravando = false;

    // Backend URL
    const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ? 'http://localhost:5000/'
        : 'https://seu-backend.onrender.com/';  // altere para seu backend real

    // ==================== FUNÇÕES DE UI ====================
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

    function exibirRespostaJarvis(resposta, falar = true) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'balao jarvis-msg';
        msgDiv.innerHTML = `<div class="avatar"><i class="fas fa-robot"></i></div>
                            <div class="message-content">
                                <span class="sender-name">JARVIS</span>
                                <p>${resposta.replace(/\n/g, '<br>')}</p>
                            </div>`;
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        historicoConversa.push({ role: "assistant", content: resposta });
        if (falar && !modoSilencio) {
            const utterance = new SpeechSynthesisUtterance(resposta.replace(/<[^>]*>/g, ''));
            utterance.lang = 'pt-BR';
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        }
    }

    // ==================== PDF E RAG ====================
    async function enviarPDFparaRAG(nome, textoCompleto) {
        try {
            const response = await fetch(`${BACKEND_URL}api/add_pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, texto: textoCompleto })
            });
            const data = await response.json();
            console.log("RAG status:", data);
        } catch (err) {
            console.error("Erro ao enviar PDF para RAG:", err);
        }
    }

    async function processarPDF(arquivo) {
        if (arquivo.type !== 'application/pdf') {
            exibirRespostaJarvis("Envie um arquivo PDF válido.");
            return;
        }
        exibirMensagemUsuario(`📎 Enviou: ${arquivo.name}`);
        exibirRespostaJarvis("Processando PDF e armazenando no RAG...", false);
        
        const arrayBuffer = await arquivo.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let textoCompleto = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const pagina = await pdf.getPage(i);
            const conteudo = await pagina.getTextContent();
            textoCompleto += conteudo.items.map(item => item.str).join(" ") + "\n";
        }
        // Envia para o backend (RAG)
        await enviarPDFparaRAG(arquivo.name, textoCompleto);
        exibirRespostaJarvis(`✅ PDF "${arquivo.name}" indexado com sucesso! Agora você pode perguntar sobre seu conteúdo.`);
    }

    // ==================== COMANDOS OFFLINE ====================
    function comandosOffline(texto) {
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
            const piadas = ["Por que o programador foi ao mercado? Precisava de um par de bytes!", "O que o zero disse ao oito? Bonito cinto!"];
            return piadas[Math.floor(Math.random() * piadas.length)];
        }
        if (cmd.startsWith('registrar diário')) {
            let nota = texto.replace(/registrar diário/i, '').trim();
            if (!nota) return "Escreva algo.";
            let db = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || { diario: [] };
            db.diario.push(`${new Date().toLocaleDateString()}: ${nota}`);
            localStorage.setItem('jarvis_memoria_v3', JSON.stringify(db));
            return "Diário registrado.";
        }
        if (cmd === 'ler diário') {
            let db = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || { diario: [] };
            return db.diario.length ? `<b>Diário:</b><br>${db.diario.join('<br>')}` : "Diário vazio.";
        }
        if (cmd === 'flashcard') {
            let db = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || { flashcards: [{ q: "Capital do Brasil?", r: "Brasília" }] };
            let card = db.flashcards[Math.floor(Math.random() * db.flashcards.length)];
            return `<b>Flashcard:</b> ${card.q}`;
        }
        return null;
    }

    // ==================== ENVIO PRINCIPAL ====================
    async function enviarMensagem() {
        const texto = userInput.value.trim();
        if (!texto) return;

        exibirMensagemUsuario(texto);
        userInput.value = '';

        // Verifica offline
        let respostaOff = comandosOffline(texto);
        if (respostaOff) {
            exibirRespostaJarvis(respostaOff);
            return;
        }

        // Se não, chama backend (Gemini + RAG + busca web)
        const typingDiv = document.getElementById('typingIndicator');
        if (typingDiv) typingDiv.style.display = 'flex';
        
        try {
            const response = await fetch(`${BACKEND_URL}api/comando`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ historico: historicoConversa.slice(-20) })
            });
            const data = await response.json();
            if (typingDiv) typingDiv.style.display = 'none';
            exibirRespostaJarvis(data.resposta || "Sem resposta.");
        } catch (err) {
            if (typingDiv) typingDiv.style.display = 'none';
            exibirRespostaJarvis("Erro de conexão com o servidor. Verifique o backend.");
        }
    }

    // ==================== EVENTOS ====================
    sendBtn.addEventListener('click', enviarMensagem);
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') enviarMensagem(); });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) processarPDF(e.target.files[0]);
        fileInput.value = '';
    });

    // Microfone
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        reconhecimento = new SpeechRecognitionAPI();
        reconhecimento.lang = 'pt-BR';
        reconhecimento.continuous = false;
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

    // Mensagem inicial
    exibirRespostaJarvis("JARVIS 2.0 ativado! Agora com **Gemini Flash + RAG + busca na web**. Envie um PDF, pergunte qualquer coisa, ou diga 'pesquise X'.", false);
});
