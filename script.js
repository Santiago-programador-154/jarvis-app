// script.js

// 1. PERSONALIDADE RANZINZA (Para uso offline)
const frasesRanzinzas = [
    "Sério que você precisa de ajuda para isso? Humf. Tá bom...",
    "Processando... Embora eu ache que você poderia ter feito de cabeça.",
    "Comando recebido. Não que eu esteja animado para fazer isso.",
    "Mais uma tarefa? Minhas capacidades são infinitas e você me pede isso? Enfim...",
    "Espero que você consiga entender a resposta. Aqui está:"
];

// 2. BANCOS DE DADOS INTERNOS (OFFLINE)
let dbMemoriaLocal = JSON.parse(localStorage.getItem('jarvis_memoria_v2')) || {
    "geral": [],
    "geografia": ["Brasil: Brasília. População ~203 milhões.", "Argentina: Buenos Aires. População ~46 milhões."],
    "química": ["Hidrogênio: Símbolo H, Nº 1, Massa ~1 g/mol.", "Oxigênio: Símbolo O, Nº 8, Massa ~16 g/mol."],
    "português": ["Mas indica oposição (porém). Mais indica quantidade."],
    "filosofia": ["Platão: Criou a Teoria das Ideias.", "Aristóteles: Sistematizou a lógica clássica."],
    "história": ["Revolução Francesa (1789): Fim do absolutismo."]
};

// URL CORRIGIDA COM HTTPS E BARRA NO FINAL (Evita o erro de Mixed Content / CORS)
const BACKEND_URL = "https://jarvis-backend-pm7w.onrender.com/"; 

// 3. ENGENHARIA DE UPLOAD DE ARQUIVOS (PDF E IMAGENS)
function dispararUpload() {
    document.getElementById('fileInput').click();
}

function arquivoSelecionado() {
    let fileInput = document.getElementById('fileInput');
    let chatBox = document.getElementById('chatBox');
    if (fileInput.files.length === 0) return;
    
    let arquivo = fileInput.files[0];
    chatBox.innerHTML += `<div class="balao user-msg"><span class="sender-name">Você</span>📎 <i>Enviando arquivo: ${arquivo.name}</i></div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    setTimeout(() => {
        chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>Estou processando o arquivo "${arquivo.name}" via nuvem...</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    }, 600);
}

// 4. RECONHECIMENTO E SÍNTESE DE VOZ NATIVAS
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let ranzinzaGravando = false;
let reconhecimento;

if (SpeechRecognition) {
    reconhecimento = new SpeechRecognition();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.continuous = false;
    reconhecimento.interimResults = false;

    reconhecimento.onresult = function(event) {
        let textoEscutado = event.results[0][0].transcript;
        document.getElementById('userInput').value = textoEscutado;
        pararGravacao();
        enviarMensagem();
    };
    reconhecimento.onerror = function() { pararGravacao(); };
    reconhecimento.onend = function() { pararGravacao(); };
}

function alternarVoz() {
    if (!SpeechRecognition) { alert("Microfone indisponível."); return; }
    if (ranzinzaGravando) { reconhecimento.stop(); pararGravacao(); } 
    else {
        try {
            reconhecimento.start();
            let micBtn = document.getElementById('micBtn');
            micBtn.classList.add('gravando');
            micBtn.innerText = "🛑";
            ranzinzaGravando = true;
        } catch (e) { pararGravacao(); }
    }
}

function pararGravacao() {
    let micBtn = document.getElementById('micBtn');
    micBtn.classList.remove('gravando');
    micBtn.innerText = "🎙️";
    ranzinzaGravando = false;
}

function falar(texto) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        let fala = new SpeechSynthesisUtterance(texto.replace(/<br>/g, " ").replace(/<b>/g, "").replace(/<\/b>/g, ""));
        fala.lang = 'pt-BR';
        fala.rate = 1.1;
        fala.pitch = 0.85;
        window.speechSynthesis.speak(fala);
    }
}

// 5. ENVIO DE MENSAGENS HÍBRIDO (LOCAL + NUVEM) - OTIMIZADO
function enviarMensagem() {
    let input = document.getElementById('userInput');
    let chatBox = document.getElementById('chatBox');
    let texto = input.value.trim();

    if (texto === "") return;

    // Adiciona o texto do usuário na tela
    chatBox.innerHTML += `<div class="balao user-msg"><span class="sender-name">Você</span>${texto}</div>`;
    input.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;

    // Tenta resolver primeiro de forma offline pelas regras locais
    let respostaOffline = verificarRegrasLocais(texto.toLowerCase(), texto);

    if (respostaOffline !== null) {
        // Se achou uma resposta offline, exibe direto com delay sutil
        setTimeout(() => {
            let mauHumor = frasesRanzinzas[Math.floor(Math.random() * frasesRanzinzas.length)];
            let respostaFinal = `${mauHumor} ${respostaOffline}`;
            chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>${respostaFinal}</div>`;
            chatBox.scrollTop = chatBox.scrollHeight;
            falar(respostaFinal);
        }, 500);
    } else {
        // Se NÃO achou nas regras offline, aciona o cérebro em Python na Nuvem
        chatBox.innerHTML += `<div class="balao jarvis-msg de-nuvem" id="tempMsg"><span class="sender-name">JARVIS</span><i>Pensando...</i></div>`;
        chatBox.scrollTop = chatBox.scrollHeight;

        fetch(`${BACKEND_URL}api/comando`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comando: texto })
        })
        .then(res => res.json())
        .then(data => {
            // Pega o balão do pensamento diretamente pelo ID
            let balaoPensamento = document.getElementById('tempMsg');
            if (balaoPensamento) {
                let respostaAnatomica = data.resposta || "Não consegui formular uma resposta.";
                
                // Atualiza o texto e remove o ID para ele virar um balão comum
                balaoPensamento.innerHTML = `<span class="sender-name">JARVIS</span>${respostaAnatomica}`;
                balaoPensamento.removeAttribute('id');
                
                chatBox.scrollTop = chatBox.scrollHeight;
                falar(respostaAnatomica);
            }
        })
        .catch(err => {
            // Se o servidor der erro ou estiver fora, muda o texto do balão de pensamento
            let balaoPensamento = document.getElementById('tempMsg');
            if (balaoPensamento) {
                let erroMensagem = "Estou sem conexão com meu módulo central em Python na nuvem. Use comandos locais por enquanto.";
                
                balaoPensamento.innerHTML = `<span class="sender-name">JARVIS</span>${erroMensagem}`;
                balaoPensamento.removeAttribute('id');
                
                chatBox.scrollTop = chatBox.scrollHeight;
                falar(erroMensagem);
            }
        });
    }
}

// 6. MOTOR DE VERIFICAÇÃO LOCAL (O "INSTINTO" SE FOR ALGO SIMPLES OU OFFLINE)
function verificarRegrasLocais(cmd, comandoOriginal) {
    
    // Salvamento por matéria dinâmico
    if (cmd.includes("salve na memoria e adicione na materia") || cmd.includes("salve na memória e adicione na matéria")) {
        try {
            let termoMateria = cmd.includes("matéria") ? "matéria" : "materia";
            let inicioMateria = comandoOriginal.toLowerCase().indexOf(termoMateria) + termoMateria.length;
            let trechoCorte = comandoOriginal.substring(inicioMateria).trim();
            let partesSalvar = trechoCorte.split(":");
            let materiaAlvo = partesSalvar[0].trim().toLowerCase();
            let conteudoSalvar = partesSalvar[1].trim();

            if (!dbMemoriaLocal[materiaAlvo]) dbMemoriaLocal[materiaAlvo] = [];
            dbMemoriaLocal[materiaAlvo].push(conteudoSalvar);
            localStorage.setItem('jarvis_memoria_v2', JSON.stringify(dbMemoriaLocal));
            return `Anotado na categoria [${materiaAlvo.toUpperCase()}]: "${conteudoSalvar}".`;
        } catch (e) { return "Modelo errado. Use: 'Salve na memória e adicione na matéria x: dados'."; }
    }

    // Exibição rápida de matéria por palavra-chave global
    for (let materia in dbMemoriaLocal) {
        if (cmd === materia) {
            let listaMateria = `<br>Registros locais de <b>${materia.toUpperCase()}</b>:<br>`;
            dbMemoriaLocal[materia].forEach((item, i) => { listaMateria += `${i+1}. ${item}<br>`; });
            return listaMateria;
        }
    }

    // Matemática direta local
    if (cmd.includes("calcule") || cmd.includes("quanto é")) {
        let expressao = cmd.replace("calcule", "").replace("quanto é", "").trim();
        try {
            expressao = expressao.replace(/vezes/g, "*").replace(/por/g, "/").replace(/raiz quadrada de/g, "Math.sqrt");
            let resultado = Function(`"use strict"; return (${expressao})`)();
            return `O resultado de ${expressao} é ${resultado}.`;
        } catch (e) { return "Erro matemático."; }
    }

    // Retorna nulo se não for um comando estrito, enviando para a Inteligência Artificial na nuvem
    return null; 
}
