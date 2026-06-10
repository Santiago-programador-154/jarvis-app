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
let historicoConversa = []; 

// 🔧 URL dinâmica: se estiver localhost, aponta para backend local, senão usa a variável (ajuste manual)
let BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/'
    : 'https://jarvis-backend-pm7w.onrender.com/';  // substitua pelo seu domínio real

const frasesRanzinzas = [
    "Processando... Veja se sua mente limitada consegue captar isso:",
    "Comando recebido. Não que eu me importe muito, mas aqui está:",
    "Analisando dados. Preste atenção para eu não ter que repetir:"
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

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    reconhecimento = new SpeechRecognition();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.continuous = false;      // 🛑 Evita loop infinito
    reconhecimento.interimResults = false;

    reconhecimento.onresult = function(event) {
        let textoEscutado = event.results[0][0].transcript.trim();
        let cmd = textoEscutado.toLowerCase();
        if (cmd.startsWith("jarvis")) {
            let comandoLimpo = cmd.replace(/^jarvis/i, "").trim();
            if (comandoLimpo !== "") {
                document.getElementById('userInput').value = comandoLimpo;
                enviarMensagem();
            }
        } else if (ranzinzaGravando) {
            // Se não começou com "jarvis" mas o microfone está ativo, ignora.
        }
    };
    reconhecimento.onend = function() { 
        let micBtn = document.getElementById('micBtn');
        if (ranzinzaGravando) {
            // Se ainda estiver em modo gravação, religa (mas cuidado com loop)
            // Melhor: não religar automaticamente, exige clique novamente
            ranzinzaGravando = false;
            micBtn.classList.remove('gravando');
            micBtn.innerText = "🎙️";
        }
    };
} else {
    alert("Seu navegador não suporta reconhecimento de voz.");
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

// 🧹 Função para limitar o tamanho do histórico (evita estouro de tokens)
function podarHistorico(limite = 30) {
    if (historicoConversa.length > limite) {
        historicoConversa = historicoConversa.slice(-limite);
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
        exibirRespostaLocal("Modo silêncio ativado. Não falarei mais.", chatBox);
        return;
    }
    if (cmd === "jarvis volte a falar" || cmd === "volte a falar") {
        modoSilencio = false;
        exibirRespostaLocal("Modo de áudio reativado.", chatBox);
        return;
    }

    if (estaLendoPdf && (cmd.includes("continue") || cmd.includes("continuar"))) {
        if (indiceFatiaAtual >= pdfFatias.length) {
            exibirRespostaLocal("Fim do documento. Encerrando leitura.", chatBox);
            estaLendoPdf = false;
            document.getElementById('pdfStatus').innerText = "PDF: Finalizado";
            return;
        }
        // ✅ Envia apenas a fatia, sem repetir instruções longas
        let textoFatia = pdfFatias[indiceFatiaAtual];
        indiceFatiaAtual++;
        document.getElementById('pdfStatus').innerText = `PDF: Lendo fatia ${indiceFatiaAtual}/${pdfFatias.length}`;
        
        let promptFatia = `[CONTINUAÇÃO DO PDF] - Fatia ${indiceFatiaAtual} de ${pdfFatias.length}\n\nConteúdo:\n${textoFatia}\n\nAnalise detalhadamente este trecho, relacione com o anterior se possível, e entregue uma resposta inteligente.`;
        historicoConversa.push({"role": "user", "content": promptFatia});
        podarHistorico(30);
        acionarCerebroNuvem(chatBox);
        return;
    }

    let respostaOffline = verificarRegrasLocais(cmd, texto);
    if (respostaOffline !== null) {
        exibirRespostaLocal(respostaOffline, chatBox);
    } else {
        let comandoFormatado = `Comando do Usuário: ${texto}\n\n---MEMORIAS_LOCAIS---\n${JSON.stringify(dbMemoriaLocal)}`;
        historicoConversa.push({"role": "user", "content": comandoFormatado});
        podarHistorico(30);
        acionarCerebroNuvem(chatBox);
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

function acionarCerebroNuvem(chatBox) {
    chatBox.innerHTML += `<div class="balao jarvis-msg de-nuvem" id="tempMsg"><span class="sender-name">JARVIS</span><i>Racionalizando o contexto histórico...</i></div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    fetch(`${BACKEND_URL}api/comando`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historico: historicoConversa })
    })
    .then(res => res.json())
    .then(data => {
        let balaoPensamento = document.getElementById('tempMsg');
        if (balaoPensamento) {
            let respostaTextual = data.resposta || "Erro na central de processamento.";
            
            if (respostaTextual.includes("[GRAVAR_MEMORIA:")) {
                try {
                    let match = respostaTextual.match(/\[GRAVAR_MEMORIA\s*:\s*([^:]+)\s*:\s*([^\]]+)\]/);
                    if (match) {
                        let mat = match[1].trim().toLowerCase();
                        let info = match[2].trim();
                        if (!dbMemoriaLocal[mat]) dbMemoriaLocal[mat] = [];
                        dbMemoriaLocal[mat].push(info);
                        localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
                        respostaTextual = respostaTextual.replace(/\[GRAVAR_MEMORIA.*?\]/g, `<i>✅ (Sincronizado na memória local: [${mat.toUpperCase()}])</i>`);
                    }
                } catch(e) { console.warn(e); }
            }

            balaoPensamento.innerHTML = `<span class="sender-name">JARVIS</span>${respostaTextual}`;
            historicoConversa.push({"role": "assistant", "content": respostaTextual});
            podarHistorico(30);

            if (data.imagem_url) {
                balaoPensamento.innerHTML += `<br><img src="${data.imagem_url}" alt="Imagem gerada por IA" style="width:100%; border-radius:10px; margin-top:10px; border:1px solid #00f0ff;">`;
            }
            
            balaoPensamento.removeAttribute('id');
            chatBox.scrollTop = chatBox.scrollHeight;
            falar(respostaTextual);
        }
    })
    .catch(err => {
        let balaoPensamento = document.getElementById('tempMsg');
        if (balaoPensamento) {
            balaoPensamento.innerHTML = `<span class="sender-name">JARVIS</span>🔌 Conexão interrompida com o núcleo neural. Verifique se o backend está rodando em ${BACKEND_URL}`;
            balaoPensamento.removeAttribute('id');
        }
        console.error(err);
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
        if (!nota) return "Escreva algo válido.";
        dbMemoriaLocal.diario.push(`${new Date().toLocaleDateString()}: ${nota}`);
        localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
        return "Fatos registrados no banco secundário.";
    }
    if (cmd === "ler diário" || cmd === "ler diario") {
        if (dbMemoriaLocal.diario.length === 0) return "Banco do diário vazio.";
        return "<b>Registros de Diário:</b><br>" + dbMemoriaLocal.diario.join("<br>");
    }
    if (cmd === "flashcard") {
        if (dbMemoriaLocal.flashcards.length === 0) return "Nenhum vetor de teste disponível.";
        let card = dbMemoriaLocal.flashcards[Math.floor(Math.random() * dbMemoriaLocal.flashcards.length)];
        return `<b>Desafio Cognitivo:</b> ${card.q}`;
    }

    for (let materia in dbMemoriaLocal) {
        if (cmd === materia) {
            let lista = `<br>Matriz de memória de <b>${materia.toUpperCase()}</b>:<br>`;
            dbMemoriaLocal[materia].forEach((item, i) => { if(typeof item === 'string') lista += `${i+1}. ${item}<br>`; });
            return lista;
        }
    }
    return null; 
}

async function arquivoSelecionado() {
    let fileInput = document.getElementById('fileInput');
    let chatBox = document.getElementById('chatBox');
    if (!fileInput || fileInput.files.length === 0) return;
    
    let arquivo = fileInput.files[0];
    chatBox.innerHTML += `<div class="balao user-msg"><span class="sender-name">Você</span>📎 <i>Injetando: ${arquivo.name}</i></div>`;

    if (arquivo.type === "application/pdf") {
        chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>Fazendo engenharia reversa no PDF...</div>`;
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
            pdfFatias = fatiarTexto(pdfTextoCompleto, 30000); // fatias menores
            indiceFatiaAtual = 0;
            estaLendoPdf = true;
            document.getElementById('pdfStatus').innerText = `PDF: 0/${pdfFatias.length} fatias`;
            exibirRespostaLocal(`Documento indexado com sucesso. (${pdfFatias.length} fatias). Envie "continuar" para processar a primeira seção.`, chatBox);
        } catch (erro) {
            console.error(erro);
            chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>❌ Falha ao descriptografar o PDF. Verifique se não está corrompido.</div>`;
        }
    } else {
        chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>⚠️ Apenas PDF é suportado para leitura no momento.</div>`;
    }
    fileInput.value = '';
}

function fatiarTexto(texto, tamanhoMaximo) {
    let palavras = texto.split(" ");
    let fatias = []; let fatiaAtual = "";
    for (let p of palavras) {
        if ((fatiaAtual + p).length > tamanhoMaximo) {
            fatias.push(fatiaAtual.trim());
            fatiaAtual = p + " ";
        } else {
            fatiaAtual += p + " ";
        }
    }
    if (fatiaAtual.trim().length > 0) fatias.push(fatiaAtual.trim());
    return fatias;
}
