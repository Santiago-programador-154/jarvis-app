// script.js

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

let pdfTextoCompleto = "";
let pdfFatias = [];
let indiceFatiaAtual = 0;
let estaLendoPdf = false;
let modoSilencio = false; 
let ranzinzaGravando = false;
let reconhecimento;

const frasesRanzinzas = [
    "Sério que você precisa de ajuda para isso? Que merda. Tá bom...",
    "Processando... Embora porra, você poderia ter feito de cabeça.",
    "Comando recebido. Não que eu esteja animado com essa caralho de tarefa.",
    "Espero que consiga entender a resposta. Aqui está:"
];

let dbMemoriaLocal = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || {
    "geografia": ["Brasil: Brasília. População ~203 milhões."],
    "química": ["Água: H2O - Massa Molar: 18 g/mol."],
    "português": ["Mas: oposição. Mais: quantidade."],
    "história": ["Revolução Francesa: 1789."],
    "filosofia": ["Estoicismo: Focar apenas no que você pode controlar."],
    "diario": [],
    "flashcards": [{ q: "Qual a capital do Brasil?", r: "Brasília" }]
};

const BACKEND_URL = "https://jarvis-backend-pm7w.onrender.com/"; 

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    reconhecimento = new SpeechRecognition();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.continuous = true;
    reconhecimento.interimResults = false;

    reconhecimento.onresult = function(event) {
        let textoEscutado = event.results[event.results.length - 1][0].transcript.trim();
        let cmd = textoEscutado.toLowerCase();
        if (ranzinzaGravando || cmd.startsWith("jarvis")) {
            let comandoLimpo = cmd.replace(/^jarvis/i, "").trim();
            if (comandoLimpo !== "") {
                document.getElementById('userInput').value = comandoLimpo;
                enviarMensagem();
            }
        }
    };
    reconhecimento.onend = function() { if (ranzinzaGravando) reconhecimento.start(); };
}

function alternarVoz() {
    if (!SpeechRecognition) { alert("Microfone indisponível."); return; }
    let micBtn = document.getElementById('micBtn');
    if (ranzinzaGravando) {
        reconhecimento.stop();
        micBtn.classList.remove('gravando');
        micBtn.innerText = "🎙️";
        ranzinzaGravando = false;
    } else {
        reconhecimento.start();
        micBtn.classList.add('gravando');
        micBtn.innerText = "🛑";
        ranzinzaGravando = true;
    }
}

function falar(texto) {
    if (modoSilencio) return;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        let fala = new SpeechSynthesisUtterance(texto.replace(/<br>/g, " ").replace(/<b>/g, "").replace(/<\/b>/g, ""));
        fala.lang = 'pt-BR';
        fala.rate = 1.1;
        fala.pitch = 0.85;
        window.speechSynthesis.speak(fala);
    }
}

function enviarMensagem() {
    let input = document.getElementById('userInput');
    let chatBox = document.getElementById('chatBox');
    let texto = input.value.trim();

    if (texto === "") return;

    chatBox.innerHTML += `<div class="balao user-msg"><span class="sender-name">Você</span>${texto}</div>`;
    input.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;

    let cmd = texto.toLowerCase();

    if (cmd === "jarvis silêncio" || cmd === "silêncio") {
        modoSilencio = true;
        exibirRespostaLocal("Modo silêncio ativado.", chatBox);
        return;
    }
    if (cmd === "jarvis volte a falar" || cmd === "volte a falar") {
        modoSilencio = false;
        exibirRespostaLocal("Pronto, voltei a falar.", chatBox);
        return;
    }

    if (estaLendoPdf && (cmd.includes("continue") || cmd.includes("continuar"))) {
        if (indiceFatiaAtual >= pdfFatias.length) {
            exibirRespostaLocal("Fim do documento.", chatBox);
            estaLendoPdf = false;
            return;
        }
        let textoParaEnviar = `Contexto do PDF (Fatia ${indiceFatiaAtual + 1}):\n\n${pdfFatias[indiceFatiaAtual]}`;
        indiceFatiaAtual++;
        acionarCerebroNuvem(textoParaEnviar, chatBox);
        return;
    }

    let respostaOffline = verificarRegrasLocais(cmd, texto);
    if (respostaOffline !== null) {
        exibirRespostaLocal(respostaOffline, chatBox);
    } else {
        // Envia o comando estruturado isolando o texto das memórias
        let comandoFormatado = `Comando do Usuário: ${texto}\n\n---MEMORIAS_LOCAIS---\n${JSON.stringify(dbMemoriaLocal)}`;
        acionarCerebroNuvem(comandoFormatado, chatBox);
    }
}

function exibirRespostaLocal(resposta, chatBox) {
    setTimeout(() => {
        let mauHumor = frasesRanzinzas[Math.floor(Math.random() * frasesRanzinzas.length)];
        let respostaFinal = `${mauHumor}<br>${resposta}`;
        chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>${respostaFinal}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
        falar(respostaFinal);
    }, 400);
}

function acionarCerebroNuvem(textoComando, chatBox) {
    chatBox.innerHTML += `<div class="balao jarvis-msg de-nuvem" id="tempMsg"><span class="sender-name">JARVIS</span><i>Pensando...</i></div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    fetch(`${BACKEND_URL}api/comando`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comando: textoComando })
    })
    .then(res => res.json())
    .then(data => {
        let balaoPensamento = document.getElementById('tempMsg');
        if (balaoPensamento) {
            let respostaTextual = data.resposta || "Não consegui processar isso.";
            
            if (respostaTextual.includes("[GRAVAR_MEMORIA:")) {
                try {
                    let match = respostaTextual.match(/\[GRAVAR_MEMORIA\s*:\s*([^:]+)\s*:\s*([^\]]+)\]/);
                    if (match) {
                        let mat = match[1].trim().toLowerCase();
                        let info = match[2].trim();
                        if (!dbMemoriaLocal[mat]) dbMemoriaLocal[mat] = [];
                        dbMemoriaLocal[mat].push(info);
                        localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
                        respostaTextual = respostaTextual.replace(/\[GRAVAR_MEMORIA.*?\]/g, `<i>(Sincronizado na memória local: [${mat.toUpperCase()}])</i>`);
                    }
                } catch(e) {}
            }

            balaoPensamento.innerHTML = `<span class="sender-name">JARVIS</span>${respostaTextual}`;
            
            if (data.imagem_url) {
                balaoPensamento.innerHTML += `<br><img src="${data.imagem_url}" alt="Imagem do Jarvis" style="width:100%; border-radius:10px; margin-top:10px; border:1px solid #00f0ff;">`;
            }
            
            balaoPensamento.removeAttribute('id');
            chatBox.scrollTop = chatBox.scrollHeight;
            falar(respostaTextual);
        }
    })
    .catch(err => {
        let balaoPensamento = document.getElementById('tempMsg');
        if (balaoPensamento) {
            balaoPensamento.innerHTML = `<span class="sender-name">JARVIS</span>Módulo de IA desconectado.`;
            balaoPensamento.removeAttribute('id');
        }
    });
}

function verificarRegrasLocais(cmd, comandoOriginal) {
    if (cmd.includes("que horas são")) {
        let agora = new Date();
        return `São ${agora.getHours()}:${String(agora.getMinutes()).padStart(2, '0')}.`;
    }
    if (cmd.includes("que dia é hoje")) {
        let hoje = new Date();
        return `Hoje é ${hoje.getDate()}/${hoje.getMonth()+1}/${hoje.getFullYear()}.`;
    }
    if (cmd.startsWith("registrar diário") || cmd.startsWith("registrar diario")) {
        let nota = comandoOriginal.replace(/registrar diário/i, "").replace(/registrar diario/i, "").trim();
        if (!nota) return "Escreva algo para o diário.";
        dbMemoriaLocal.diario.push(`${new Date().toLocaleDateString()}: ${nota}`);
        localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
        return "Guardado no diário.";
    }
    if (cmd === "ler diário" || cmd === "ler diario") {
        if (dbMemoriaLocal.diario.length === 0) return "Diário vazio.";
        return "<b>Seu Diário:</b><br>" + dbMemoriaLocal.diario.join("<br>");
    }
    if (cmd === "flashcard") {
        if (dbMemoriaLocal.flashcards.length === 0) return "Sem flashcards.";
        let card = dbMemoriaLocal.flashcards[Math.floor(Math.random() * dbMemoriaLocal.flashcards.length)];
        return `<b>Pergunta:</b> ${card.q}`;
    }
    if (cmd === "resposta flashcard") {
        return "<b>Gabarito:</b><br>" + dbMemoriaLocal.flashcards.map(c => `Q: ${c.q} -> R: ${c.r}`).join("<br>");
    }

    for (let materia in dbMemoriaLocal) {
        if (cmd === materia) {
            let lista = `<br>Registros de <b>${materia.toUpperCase()}</b>:<br>`;
            dbMemoriaLocal[materia].forEach((item, i) => { if(typeof item === 'string') lista += `${i+1}. ${item}<br>`; });
            return lista;
        }
    }

    if (cmd.includes("calcule") || cmd.includes("quanto é")) {
        let expressao = cmd.replace("calcule", "").replace("quanto é", "").trim();
        try {
            expressao = expressao.replace(/vezes/g, "*").replace(/por/g, "/").replace(/raiz/g, "Math.sqrt").replace(/seno/g, "Math.sin");
            return `Resultado: ${Function(`"use strict"; return (${expressao})`)()}`;
        } catch (e) { return "Erro no cálculo."; }
    }
    return null; 
}

async function arquivoSelecionado() {
    let fileInput = document.getElementById('fileInput');
    let chatBox = document.getElementById('chatBox');
    if (!fileInput || fileInput.files.length === 0) return;
    
    let arquivo = fileInput.files[0];
    chatBox.innerHTML += `<div class="balao user-msg"><span class="sender-name">Você</span>📎 <i>Arquivo: ${arquivo.name}</i></div>`;

    if (arquivo.type === "application/pdf") {
        chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>Processando PDF...</div>`;
        try {
            let arrayBuffer = await arquivo.arrayBuffer();
            let pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let textoExtraido = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                let pagina = await pdf.getPage(i);
                let conteudoTexto = await pagina.getTextContent();
                textoExtraido += conteudoTexto.items.map(item => item.str).join(" ") + "\n";
            }
            pdfTextoCompleto = textoExtraido;
            pdfFatias = fatiarTexto(pdfTextoCompleto, 4000);
            indiceFatiaAtual = 0;
            estaLendoPdf = true;
            exibirRespostaLocal(`PDF Mapeado em ${pdfFatias.length} fatias. Diga "continuar".`, chatBox);
        } catch (erro) {
            chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>Falha no PDF.</div>`;
        }
    } else if (arquivo.type.startsWith("image/")) {
        chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>Imagem recebida localmente. Forneça instruções de texto adicionais para a análise avançada.</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
        falar("Imagem recebida localmente.");
    }
}

function fatiarTexto(texto, tamanhoMaximo) {
    let palavras = texto.split(" ");
    let fatias = []; let fatiaAtual = "";
    palavras.forEach(p => {
        if ((fatiaAtual + p).length > tamanhoMaximo) { fatias.push(fatiaAtual.trim()); fatiaAtual = p + " "; }
        else { fatiaAtual += p + " "; }
    });
    if (fatiaAtual.trim().length > 0) fatias.push(fatiaAtual.trim());
    return fatias;
}
