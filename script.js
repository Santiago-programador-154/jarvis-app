if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

let pdfDoc = null;              // objeto do PDF (para navegação por página)
let pdfPaginaAtual = 1;
let pdfNumPaginas = 0;
let estaLendoPdf = false;
let pdfFatias = [];
let indiceFatiaAtual = 0;
let modoSilencio = false;
let ranzinzaGravando = false;
let reconhecimento;
let historicoConversa = [];
let lembretes = JSON.parse(localStorage.getItem('jarvis_lembretes')) || [];
let falandoAgora = false;
let vozPausada = false;

let BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000/'
    : 'https://jarvis-backend-pm7w.onrender.com/';  // altere para seu backend real

let dbMemoriaLocal = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || {
    "geografia": ["Brasil: Brasília. População ~203 milhões."],
    "química": ["Água: H2O - Massa Molar: 18 g/mol."],
    "português": ["Mas: oposição. Mais: quantidade."],
    "história": ["Revolução Francesa: 1789."],
    "filosofia": ["Estoicismo: Focar apenas no que você pode controlar."],
    "diario": [],
    "flashcards": [{ q: "Qual a capital do Brasil?", r: "Brasília" }]
};

const piadas = [
    "Por que o programador foi ao mercado? Porque precisava de um par de bytes!",
    "O que o zero disse para o oito? Bonito cinto!",
    "Qual é o cúmulo do preguiçoso? Ser enterrado numa montanha de documentos porque tinha preguiça de sair de cima.",
    "Por que o livro de matemática é tão triste? Porque tem muitos problemas.",
    "Qual o animal mais velho do mundo? A zebra, porque ainda está em preto e branco.",
    "Por que o elétron não sai de casa? Porque se sair, dá problema.",
    "O que o fígado disse para o rim? Você é um rimão!",
    "Qual a fórmula da água benta? H Deus O.",
    "O que o pássaro disse para o vento? Você é que sopra, eu só voo.",
    "Por que a planta não foi à festa? Porque não tinha raiz para dançar."
];

// ==================== VOZ ====================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    reconhecimento = new SpeechRecognition();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.continuous = false;
    reconhecimento.interimResults = false;
    reconhecimento.onresult = (event) => {
        let texto = event.results[0][0].transcript.trim();
        if (texto.toLowerCase().startsWith("jarvis")) {
            let cmd = texto.replace(/^jarvis/i, "").trim();
            if (cmd) document.getElementById('userInput').value = cmd;
            enviarMensagem();
        }
    };
    reconhecimento.onend = () => {
        let btn = document.getElementById('micBtn');
        if (ranzinzaGravando) {
            ranzinzaGravando = false;
            btn.classList.remove('gravando');
            btn.innerText = "🎙️";
        }
    };
}

function alternarVoz() {
    if (!SpeechRecognition) { alert("Microfone não suportado."); return; }
    let btn = document.getElementById('micBtn');
    if (ranzinzaGravando) {
        reconhecimento.stop();
        btn.classList.remove('gravando');
        btn.innerText = "🎙️";
        ranzinzaGravando = false;
    } else {
        reconhecimento.start();
        btn.classList.add('gravando');
        btn.innerText = "🛑";
        ranzinzaGravando = true;
    }
}

function falar(texto, modoEspecialista = false) {
    if (modoSilencio) return;
    if (falandoAgora) window.speechSynthesis.cancel();
    let utterance = new SpeechSynthesisUtterance(texto.replace(/<[^>]*>/g, ""));
    utterance.lang = 'pt-BR';
    utterance.rate = modoEspecialista ? 0.9 : 1.1;
    utterance.pitch = modoEspecialista ? 0.7 : 0.85;
    utterance.onstart = () => { falandoAgora = true; };
    utterance.onend = () => { falandoAgora = false; };
    window.speechSynthesis.speak(utterance);
}

function pausarVoz() {
    if (falandoAgora) {
        window.speechSynthesis.cancel();
        vozPausada = true;
    }
}
function continuarVoz() {
    vozPausada = false;
    // não reinicia automaticamente; o usuário precisa repetir o comando de leitura
}

// ==================== AUXILIARES ====================
function podarHistorico(limite = 40) {
    if (historicoConversa.length > limite) historicoConversa = historicoConversa.slice(-limite);
}

function exibirRespostaLocal(resposta, chatBox, modoEspecialista = false) {
    setTimeout(() => {
        let frases = ["Processando... Veja:", "Comando recebido. Aqui:", "Analisando dados. Toma:"];
        let humor = frases[Math.floor(Math.random() * frases.length)];
        let final = `<b>${humor}</b><br>${resposta}`;
        chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>${final}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
        falar(resposta, modoEspecialista);
    }, 200);
}

// ==================== PDF (fatiado + navegação por páginas) ====================
async function carregarPDFCompleto(arrayBuffer) {
    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    pdfNumPaginas = pdfDoc.numPages;
    pdfPaginaAtual = 1;
    estaLendoPdf = true;
    document.getElementById('pdfStatus').innerHTML = `📄 PDF: ${pdfNumPaginas} páginas (fatiado)`;
    // extrai todo o texto para fatias (para uso com "continue/leia")
    let textoCompleto = "";
    for (let i = 1; i <= pdfNumPaginas; i++) {
        let pagina = await pdfDoc.getPage(i);
        let conteudo = await pagina.getTextContent();
        textoCompleto += conteudo.items.map(item => item.str).join(" ") + "\n";
    }
    pdfFatias = fatiarTexto(textoCompleto, 30000);
    indiceFatiaAtual = 0;
    return true;
}

async function lerPaginaPDF(paginaNum, chatBox, modoEspecialista = false) {
    if (!pdfDoc) return false;
    if (paginaNum < 1 || paginaNum > pdfNumPaginas) return false;
    let pagina = await pdfDoc.getPage(paginaNum);
    let conteudo = await pagina.getTextContent();
    let texto = conteudo.items.map(item => item.str).join(" ");
    let prompt = modoEspecialista
        ? `[LEITURA_ESPECIALISTA] Página ${paginaNum} do PDF:\n${texto}\n\nNarre este conteúdo como um documentário dramático.`
        : `[LEITURA_PURA_DO_PDF] Página ${paginaNum}:\n${texto}`;
    historicoConversa.push({ "role": "user", "content": prompt });
    podarHistorico();
    acionarCerebroNuvem(chatBox, modoEspecialista);
    return true;
}

function fatiarTexto(texto, tamanhoMaximo) {
    let palavras = texto.split(" ");
    let fatias = [];
    let atual = "";
    for (let p of palavras) {
        if ((atual + p).length > tamanhoMaximo) {
            fatias.push(atual.trim());
            atual = p + " ";
        } else {
            atual += p + " ";
        }
    }
    if (atual.trim()) fatias.push(atual.trim());
    return fatias;
}

// ==================== ENVIO DE MENSAGEM ====================
function enviarMensagem() {
    let input = document.getElementById('userInput');
    let chatBox = document.getElementById('chatBox');
    let texto = input.value.trim();
    if (!texto) return;
    chatBox.innerHTML += `<div class="balao user-msg"><span class="sender-name">Você</span>${texto}</div>`;
    input.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;
    let cmd = texto.toLowerCase();

    // Controles de voz
    if (cmd === "pausar" && estaLendoPdf) {
        pausarVoz();
        exibirRespostaLocal("Leitura pausada. Diga 'continuar' para retomar (use 'continue' para próxima fatia).", chatBox);
        return;
    }
    if (cmd === "continuar" && vozPausada) {
        continuarVoz();
        exibirRespostaLocal("Retomando leitura (último texto).", chatBox);
        return;
    }

    // Controle de PDF (navegação por página)
    if (estaLendoPdf && pdfDoc) {
        if (cmd === "próxima página") {
            pdfPaginaAtual = Math.min(pdfPaginaAtual + 1, pdfNumPaginas);
            lerPaginaPDF(pdfPaginaAtual, chatBox, false);
            document.getElementById('pdfStatus').innerHTML = `📄 PDF: pág ${pdfPaginaAtual}/${pdfNumPaginas}`;
            return;
        }
        if (cmd === "página anterior") {
            pdfPaginaAtual = Math.max(pdfPaginaAtual - 1, 1);
            lerPaginaPDF(pdfPaginaAtual, chatBox, false);
            document.getElementById('pdfStatus').innerHTML = `📄 PDF: pág ${pdfPaginaAtual}/${pdfNumPaginas}`;
            return;
        }
        if (cmd.startsWith("ir para página")) {
            let pag = parseInt(cmd.replace("ir para página", "").trim());
            if (!isNaN(pag) && pag >= 1 && pag <= pdfNumPaginas) {
                pdfPaginaAtual = pag;
                lerPaginaPDF(pdfPaginaAtual, chatBox, false);
                document.getElementById('pdfStatus').innerHTML = `📄 PDF: pág ${pdfPaginaAtual}/${pdfNumPaginas}`;
            } else exibirRespostaLocal("Página inválida.", chatBox);
            return;
        }
        if (cmd === "modo especialista") {
            lerPaginaPDF(pdfPaginaAtual, chatBox, true);
            return;
        }
    }

    // Modo fatias (continue/leia) – o coração do sistema original
    if (estaLendoPdf && (cmd.includes("continue") || cmd.includes("continuar") || cmd.includes("leia"))) {
        if (indiceFatiaAtual >= pdfFatias.length) {
            exibirRespostaLocal("Fim do documento (todas as fatias lidas).", chatBox);
            estaLendoPdf = false;
            document.getElementById('pdfStatus').innerHTML = "📄 PDF: Finalizado";
            return;
        }
        let modoLeitura = cmd.includes("leia");
        let textoFatia = pdfFatias[indiceFatiaAtual];
        indiceFatiaAtual++;
        document.getElementById('pdfStatus').innerHTML = `📄 PDF: fatia ${indiceFatiaAtual}/${pdfFatias.length}`;

        let promptFatia = "";
        if (modoLeitura) {
            promptFatia = `[LEITURA_PURA_DO_PDF] - Fatia ${indiceFatiaAtual} de ${pdfFatias.length}\n\nConteúdo:\n${textoFatia}`;
        } else {
            promptFatia = `[CONTINUAÇÃO DO PDF] - Fatia ${indiceFatiaAtual} de ${pdfFatias.length}\n\nConteúdo:\n${textoFatia}\n\nFaça uma análise detalhada, inteligente e sarcástica.`;
        }
        historicoConversa.push({ "role": "user", "content": promptFatia });
        podarHistorico();
        acionarCerebroNuvem(chatBox, false);
        return;
    }

    // Lembretes
    if (cmd.startsWith("lembre-me de")) {
        let resto = cmd.replace("lembre-me de", "").trim();
        let match = resto.match(/(.+?)\s+às\s+(\d{1,2}):(\d{2})/i);
        if (match) {
            let tarefa = match[1].trim();
            let hora = parseInt(match[2]);
            let minuto = parseInt(match[3]);
            let agora = new Date();
            let dataAlvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, minuto, 0);
            if (dataAlvo < agora) dataAlvo.setDate(dataAlvo.getDate() + 1);
            let lembrete = { id: Date.now(), tarefa, data: dataAlvo.toISOString() };
            lembretes.push(lembrete);
            localStorage.setItem('jarvis_lembretes', JSON.stringify(lembretes));
            exibirRespostaLocal(`✅ Lembrete criado: "${tarefa}" às ${hora}:${String(minuto).padStart(2,'0')}`, chatBox);
        } else exibirRespostaLocal("Use: lembre-me de [tarefa] às [hh:mm]", chatBox);
        return;
    }

    // Piada
    if (cmd === "conte uma piada") {
        let piada = piadas[Math.floor(Math.random() * piadas.length)];
        exibirRespostaLocal(piada, chatBox);
        return;
    }

    // Salvar conversa
    if (cmd === "salvar conversa") {
        salvarConversaPDF();
        exibirRespostaLocal("Conversa salva em PDF.", chatBox);
        return;
    }

    // Bateria
    if (cmd === "bateria") {
        mostrarBateria(true);
        return;
    }

    // Silêncio
    if (cmd === "jarvis silêncio" || cmd === "silêncio") {
        modoSilencio = true;
        exibirRespostaLocal("Modo silêncio ativado.", chatBox);
        return;
    }
    if (cmd === "jarvis volte a falar" || cmd === "volte a falar") {
        modoSilencio = false;
        exibirRespostaLocal("Modo áudio reativado.", chatBox);
        return;
    }

    // Comandos offline (diário, flashcards, horas, etc.)
    let respOff = verificarRegrasLocais(cmd, texto);
    if (respOff) {
        exibirRespostaLocal(respOff, chatBox);
    } else {
        let comandoComMemoria = `Comando do Usuário: ${texto}\n\n---MEMORIAS_LOCAIS---\n${JSON.stringify(dbMemoriaLocal)}`;
        historicoConversa.push({ "role": "user", "content": comandoComMemoria });
        podarHistorico();
        acionarCerebroNuvem(chatBox, false);
    }
}

// ==================== COMANDOS OFFLINE ====================
function verificarRegrasLocais(cmd, original) {
    if (cmd.includes("que horas são")) {
        let agora = new Date();
        return `${agora.getHours()}:${String(agora.getMinutes()).padStart(2,'0')}`;
    }
    if (cmd.includes("que dia é hoje")) {
        let hoje = new Date();
        return `${hoje.getDate()}/${hoje.getMonth()+1}/${hoje.getFullYear()}`;
    }
    if (cmd.startsWith("registrar diário") || cmd.startsWith("registrar diario")) {
        let nota = original.replace(/registrar diário/i, "").trim();
        if (!nota) return "Escreva algo.";
        dbMemoriaLocal.diario.push(`${new Date().toLocaleDateString()}: ${nota}`);
        localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
        return "Diário registrado.";
    }
    if (cmd === "ler diário" || cmd === "ler diario") {
        if (!dbMemoriaLocal.diario.length) return "Diário vazio.";
        return "<b>Diário:</b><br>" + dbMemoriaLocal.diario.join("<br>");
    }
    if (cmd === "flashcard") {
        let card = dbMemoriaLocal.flashcards[Math.floor(Math.random() * dbMemoriaLocal.flashcards.length)];
        return `<b>Flashcard:</b> ${card.q}`;
    }
    for (let materia in dbMemoriaLocal) {
        if (cmd === materia) {
            let lista = `<b>${materia.toUpperCase()}</b><br>`;
            dbMemoriaLocal[materia].forEach(item => { if(typeof item === 'string') lista += `- ${item}<br>`; });
            return lista;
        }
    }
    return null;
}

// ==================== BACKEND (IA) ====================
function acionarCerebroNuvem(chatBox, modoEspecialista = false) {
    let tempId = "tempMsg" + Date.now();
    chatBox.innerHTML += `<div class="balao jarvis-msg" id="${tempId}"><i>🤖 JARVIS processando...</i></div>`;
    fetch(`${BACKEND_URL}api/comando`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historico: historicoConversa, modo_especialista: modoEspecialista })
    })
    .then(res => res.json())
    .then(data => {
        let balao = document.getElementById(tempId);
        if (!balao) return;
        let resposta = data.resposta || "Falha na comunicação.";
        balao.innerHTML = `<span class="sender-name">JARVIS</span>${resposta}`;
        historicoConversa.push({ "role": "assistant", "content": resposta });
        podarHistorico();
        if (data.imagem_url) {
            balao.innerHTML += `<br><img src="${data.imagem_url}" style="max-width:100%; border-radius:10px; margin-top:8px;" onerror="this.parentElement.innerHTML+='<span style=color:red> ❌ Falha imagem</span>'">`;
        }
        falar(resposta, modoEspecialista);
    })
    .catch(err => {
        let balao = document.getElementById(tempId);
        if (balao) balao.innerHTML = `<span class="sender-name">JARVIS</span>🔌 Erro: ${err.message}`;
    });
}

// ==================== UPLOAD DE PDF/IMAGEM ====================
async function arquivoSelecionado() {
    let fileInput = document.getElementById('fileInput');
    let arquivo = fileInput.files[0];
    if (!arquivo) return;
    let chatBox = document.getElementById('chatBox');
    chatBox.innerHTML += `<div class="balao user-msg"><span class="sender-name">Você</span>📎 ${arquivo.name}</div>`;
    if (arquivo.type === "application/pdf") {
        let buffer = await arquivo.arrayBuffer();
        let success = await carregarPDFCompleto(buffer);
        if (success) {
            chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>PDF carregado: ${pdfNumPaginas} páginas, ${pdfFatias.length} fatias. Use "continue" (análise) ou "leia" (texto puro) para cada fatia. Navegue por páginas com "próxima página".</div>`;
            // não lê automaticamente; aguarda comando
        } else {
            chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>Falha ao ler PDF.</div>`;
        }
    } else if (arquivo.type.startsWith("image/")) {
        realizarOCR(arquivo, chatBox);
    } else {
        chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>Formato não suportado. Envie PDF ou imagem.</div>`;
    }
    fileInput.value = '';
}

// ==================== OCR ====================
async function realizarOCR(arquivo, chatBox) {
    chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>🔍 Extraindo texto da imagem... aguarde.</div>`;
    try {
        const { data: { text } } = await Tesseract.recognize(arquivo, 'por', { logger: m => console.log(m) });
        let resultado = text.trim() || "Nenhum texto encontrado.";
        chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">OCR</span>📝 ${resultado}</div>`;
        historicoConversa.push({ role: "user", content: `[OCR] ${resultado}` });
    } catch (e) {
        chatBox.innerHTML += `<div class="balao jarvis-msg"><span class="sender-name">JARVIS</span>❌ Falha no OCR: ${e.message}</div>`;
    }
}
function abrirCameraOCR() {
    let input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        if (e.target.files[0]) realizarOCR(e.target.files[0], document.getElementById('chatBox'));
    };
    input.click();
}

// ==================== QR CODE ====================
async function abrirCameraQR() {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let modal = document.createElement('div');
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
                canvas.height = videoElement.videoHeight;
                canvas.width = videoElement.videoWidth;
                ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                let code = jsQR(imageData.data, canvas.width, canvas.height);
                if (code) {
                    let conteudo = code.data;
                    stream.getTracks().forEach(track => track.stop());
                    modal.remove();
                    if (conteudo.startsWith("http")) window.open(conteudo, '_blank');
                    else exibirRespostaLocal(`QR Code lido: ${conteudo}`, document.getElementById('chatBox'));
                    return;
                }
            }
            requestAnimationFrame(tick);
        };
        tick();
        modal.querySelector('#closeQRModal').onclick = () => { if(stream) stream.getTracks().forEach(t=>t.stop()); modal.remove(); };
    } catch (err) {
        modal.innerHTML = `<div class="modal-content"><p>Erro ao acessar câmera: ${err.message}</p><button id="closeQRModal">Fechar</button></div>`;
        modal.querySelector('#closeQRModal').onclick = () => modal.remove();
    }
}

// ==================== SALVAR CHAT PDF ====================
function salvarConversaPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 10;
    const lineHeight = 7;
    const maxWidth = 180;
    doc.setFontSize(12);
    doc.text("Conversa com JARVIS", 10, y);
    y += lineHeight;
    historicoConversa.forEach(msg => {
        let role = msg.role === "user" ? "Você" : "JARVIS";
        let linhas = doc.splitTextToSize(`${role}: ${msg.content}`, maxWidth);
        linhas.forEach(line => {
            if (y > 280) { doc.addPage(); y = 10; }
            doc.text(line, 10, y);
            y += lineHeight;
        });
        y += 3;
    });
    doc.save(`jarvis_conversa_${new Date().toISOString().slice(0,19)}.pdf`);
}

// ==================== BATERIA ====================
function mostrarBateria(falarResultado = false) {
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            let nivel = Math.round(battery.level * 100);
            let texto = `Bateria: ${nivel}%${battery.charging ? " (carregando)" : ""}`;
            document.getElementById('batteryStatus').innerHTML = `🔋 ${texto}`;
            if (falarResultado) exibirRespostaLocal(texto, document.getElementById('chatBox'));
        }).catch(() => atualizarBateriaPlaceholder());
    } else {
        atualizarBateriaPlaceholder();
    }
}
function atualizarBateriaPlaceholder() {
    document.getElementById('batteryStatus').innerHTML = `🔋 API não suportada`;
}

// ==================== LEMBRETES ====================
function verificarLembretes() {
    let agora = new Date();
    lembretes.forEach((lem, idx) => {
        let dataLembrete = new Date(lem.data);
        if (agora >= dataLembrete) {
            if (Notification.permission === "granted") {
                new Notification("🔔 JARVIS", { body: lem.tarefa });
            } else if (Notification.permission !== "denied") {
                Notification.requestPermission().then(perm => {
                    if (perm === "granted") new Notification("🔔 JARVIS", { body: lem.tarefa });
                });
            }
            exibirRespostaLocal(`🔔 Lembrete: ${lem.tarefa}`, document.getElementById('chatBox'));
            lembretes.splice(idx, 1);
            localStorage.setItem('jarvis_lembretes', JSON.stringify(lembretes));
        }
    });
}

// ==================== INICIALIZAÇÃO ====================
document.getElementById('fileInput').addEventListener('change', arquivoSelecionado);
document.getElementById('saveChatBtn').addEventListener('click', () => salvarConversaPDF());
document.getElementById('ocrImageBtn').addEventListener('click', () => abrirCameraOCR());
document.getElementById('qrScanBtn').addEventListener('click', () => abrirCameraQR());
setInterval(verificarLembretes, 10000);
mostrarBateria();
if (Notification.permission === "default") Notification.requestPermission();
