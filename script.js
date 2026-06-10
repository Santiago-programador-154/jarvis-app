// ==================== JARVIS - VERSÃO ESTÁVEL ====================
// Inicialização segura
document.addEventListener('DOMContentLoaded', function() {
    console.log('JARVIS iniciado');

    // Elementos do DOM
    const chatBox = document.getElementById('chatBox');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');

    // Verificação crítica
    if (!sendBtn || !userInput || !chatBox) {
        console.error('Elementos do chat não encontrados!');
        alert('Erro: elementos do chat não encontrados. Recarregue a página.');
        return;
    }

    // Estado
    let modoSilencio = false;
    let historicoConversa = [];
    let reconhecimento = null;
    let gravando = false;

    // Banco de memória local (expandido)
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

    // Função para exibir mensagem do JARVIS
    function exibirRespostaJarvis(resposta, falarTexto = true) {
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
        if (falarTexto && !modoSilencio) {
            const utterance = new SpeechSynthesisUtterance(resposta.replace(/<[^>]*>/g, ''));
            utterance.lang = 'pt-BR';
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        }
    }

    // Função para exibir mensagem do usuário
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

    // Processamento offline (comandos)
    function processarComandoOffline(texto) {
        const cmd = texto.toLowerCase();
        // Horas
        if (cmd.includes('que horas são')) {
            const agora = new Date();
            return `${agora.getHours()}:${String(agora.getMinutes()).padStart(2,'0')}`;
        }
        // Data
        if (cmd.includes('que dia é hoje')) {
            const hoje = new Date();
            return `${hoje.getDate()}/${hoje.getMonth()+1}/${hoje.getFullYear()}`;
        }
        // Piada
        if (cmd === 'conte uma piada') {
            return piadas[Math.floor(Math.random() * piadas.length)];
        }
        // Diário
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
        // Flashcard
        if (cmd === 'flashcard') {
            const card = dbMemoriaLocal.flashcards[Math.floor(Math.random() * dbMemoriaLocal.flashcards.length)];
            return `<b>Flashcard:</b> ${card.q}`;
        }
        // Matérias (geografia, historia, etc)
        for (let materia in dbMemoriaLocal) {
            if (cmd === materia && dbMemoriaLocal[materia].length) {
                return `<b>${materia.toUpperCase()}</b><br>${dbMemoriaLocal[materia].slice(0,5).join('<br>')}`;
            }
        }
        // Matemática simples (expressões)
        try {
            const mathMatch = texto.match(/[\d\s\+\-\*\/\(\)\.\,\^\%]+/);
            if (mathMatch && !/[a-zA-Z]/.test(mathMatch[0])) {
                let expr = mathMatch[0].replace(/,/g, '.').replace(/\^/g, '**');
                let result = eval(expr);
                if (!isNaN(result)) return `Resultado: ${result}`;
            }
        } catch(e) {}
        
        return null; // não tratado offline
    }

    // Função principal de envio
    async function enviarMensagem() {
        const texto = userInput.value.trim();
        if (!texto) return;

        // Exibe mensagem do usuário
        exibirMensagemUsuario(texto);
        userInput.value = '';
        
        // Processa offline
        let resposta = processarComandoOffline(texto);
        if (resposta) {
            exibirRespostaJarvis(resposta);
            return;
        }
        
        // Se chegou aqui, precisa de IA (backend)
        exibirRespostaJarvis("⏳ Processando sua solicitação... (modo online)", false);
        
        // Mostrar indicador de digitação (opcional)
        const typingDiv = document.getElementById('typingIndicator');
        if (typingDiv) typingDiv.style.display = 'flex';
        
        try {
            const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
                ? 'http://localhost:5000/'
                : 'https://jarvis-backend-pm7w.onrender.com/';
                
            const respostaIA = await fetch(`${BACKEND_URL}api/comando`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    historico: historicoConversa.slice(-20),
                    modo_especialista: false 
                })
            });
            const data = await respostaIA.json();
            if (typingDiv) typingDiv.style.display = 'none';
            // Remove a mensagem de "Processando..." e coloca a resposta real
            const ultimaMsg = chatBox.querySelector('.jarvis-msg:last-child');
            if (ultimaMsg && ultimaMsg.innerText.includes('Processando')) {
                ultimaMsg.remove();
            }
            exibirRespostaJarvis(data.resposta || "Desculpe, não consegui processar.");
        } catch (erro) {
            if (typingDiv) typingDiv.style.display = 'none';
            const ultimaMsg = chatBox.querySelector('.jarvis-msg:last-child');
            if (ultimaMsg && ultimaMsg.innerText.includes('Processando')) {
                ultimaMsg.remove();
            }
            exibirRespostaJarvis("Erro de conexão com o servidor. Verifique se o backend está rodando.\n\nDica: use comandos offline como 'que horas são', 'geografia', 'conte uma piada'.");
        }
    }

    // Configurar eventos
    sendBtn.addEventListener('click', enviarMensagem);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            enviarMensagem();
        }
    });

    // Microfone (se suportado)
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        reconhecimento = new SpeechRecognition();
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
    } else {
        if (micBtn) micBtn.style.display = 'none';
    }

    // Sidebar toggle (se existirem os botões)
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
    
    // Bateria (opcional)
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
    
    // Mensagem de boas-vindas
    exibirRespostaJarvis("Sistemas online! Agora com raciocínio local. Pergunte sobre geografia, história, matemática ou use 'conte uma piada'.", false);
});
