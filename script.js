// ==================== JARVIS - VERSÃO MEGA COMPLETA ====================
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
    function atualizarStatusPDF(texto) { if (pdfStatusDiv) pdfStatusDiv.innerHTML = `<i class="fas fa-file-pdf"></i> ${texto}`; }

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
            exibirRespostaJarvis("Erro de conexão.");
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

        // ---------- COMANDOS EXISTENTES (compactados) ----------
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
        if (cmd === 'exportar diario') {
            let conteudo = dbMemoriaLocal.diario.join("\n") || "Diário vazio.";
            let blob = new Blob([conteudo], {type:"text/plain"});
            let a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="diario_jarvis.txt"; a.click();
            exibirRespostaJarvis("✅ Diário exportado.");
            return;
        }
        if (cmd === 'exportar flashcards') {
            let linhas = ["pergunta,resposta"]; dbMemoriaLocal.flashcards.forEach(c=>linhas.push(`"${c.q}","${c.r}"`));
            let blob = new Blob([linhas.join("\n")], {type:"text/csv"});
            let a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="flashcards.csv"; a.click();
            exibirRespostaJarvis("✅ Flashcards exportados.");
            return;
        }
        if (cmd.startsWith('criar audio sobre ')) {
            let tema = texto.replace(/criar audio sobre /i,"").trim();
            if(!tema) { exibirRespostaJarvis("Tema?"); return; }
            exibirRespostaJarvis(`🎧 Gerando áudio...`, false);
            let resIA = await fetch(`${BACKEND_URL}api/comando`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ historico:[{role:"user", content:`Resumo curto (1500 caracteres) sobre: ${tema}`}] }) });
            let dataIA = await resIA.json();
            let textoAudio = dataIA.resposta || "";
            let resAudio = await fetch(`${BACKEND_URL}api/gerar_audio`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ texto:textoAudio }) });
            if(resAudio.ok){ let blob=await resAudio.blob(); let a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="audio.mp3"; a.click(); exibirRespostaJarvis("✅ Áudio gerado."); }
            else exibirRespostaJarvis("❌ Erro.");
            return;
        }
        if (cmd.startsWith('criar slides sobre ')) {
            let tema = texto.replace(/criar slides sobre /i,"").trim();
            if(!tema) { exibirRespostaJarvis("Tema?"); return; }
            exibirRespostaJarvis(`📊 Gerando slides...`, false);
            let resIA = await fetch(`${BACKEND_URL}api/comando`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ historico:[{role:"user", content:`Crie conteúdo HTML simples (<h1>,<p>,<ul>) para slides sobre: ${tema}. Máximo 5 tópicos.`}] }) });
            let dataIA = await resIA.json();
            let resSlides = await fetch(`${BACKEND_URL}api/gerar_slides`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ titulo:tema, conteudo:dataIA.resposta }) });
            if(resSlides.ok){ let blob=await resSlides.blob(); let a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="slides.pptx"; a.click(); exibirRespostaJarvis("✅ Slides gerados."); }
            else exibirRespostaJarvis("❌ Erro.");
            return;
        }
        if (cmd.startsWith('clima em ')) {
            let cidade = texto.replace(/clima em /i,"").trim();
            if(!cidade) { exibirRespostaJarvis("Cidade?"); return; }
            exibirRespostaJarvis(`🌡️ Consultando...`, false);
            let resp = await fetch(`${BACKEND_URL}api/clima`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ cidade }) });
            let data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('massa molar de ')) {
            let formula = texto.replace(/massa molar de /i,"").trim();
            if(!formula) { exibirRespostaJarvis("Fórmula?"); return; }
            let resp = await fetch(`${BACKEND_URL}api/massa_molar`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ formula }) });
            let data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('rode python:')) {
            let codigo = texto.replace(/rode python:/i,"").trim();
            if(!codigo) { exibirRespostaJarvis("Código?"); return; }
            exibirRespostaJarvis("🐍 Executando...", false);
            let resp = await fetch(`${BACKEND_URL}api/executar_codigo`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ linguagem:"python", codigo }) });
            let data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('rode js:')) {
            let codigo = texto.replace(/rode js:/i,"").trim();
            if(!codigo) return exibirRespostaJarvis("Código vazio.");
            let resp = await fetch(`${BACKEND_URL}api/executar_codigo`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ linguagem:"javascript", codigo }) });
            let data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('encurtar ')) {
            let link = texto.replace(/encurtar /i,"").trim();
            if(!link) return exibirRespostaJarvis("Link?");
            let resp = await fetch(`${BACKEND_URL}api/encurtar`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url:link }) });
            let data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd === 'ler tudo em voz alta' && estaLendoPdf && pdfDoc) {
            exibirRespostaJarvis("🔊 Leitura contínua...", false);
            let pag = pdfPaginaAtual;
            const falar = async () => {
                if(pag > pdfNumPaginas) { exibirRespostaJarvis("Fim."); return; }
                let pg = await pdfDoc.getPage(pag);
                let txt = (await pg.getTextContent()).items.map(i=>i.str).join(' ');
                let utterance = new SpeechSynthesisUtterance(txt);
                utterance.lang='pt-BR';
                utterance.onend=()=>{ pag++; falar(); };
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
                exibirRespostaJarvis(`📖 Página ${pag}...`, false);
            };
            falar();
            return;
        }
        if (cmd.startsWith('lembre-me de ')) {
            let resto = texto.replace(/lembre-me de /i,"").trim();
            let match = resto.match(/(.+?)\s+às\s+(\d{1,2}):(\d{2})/);
            if(match){
                let tarefa=match[1], hora=parseInt(match[2]), min=parseInt(match[3]);
                let agora=new Date(), alvo=new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, min, 0);
                if(alvo<agora) alvo.setDate(alvo.getDate()+1);
                let ms = alvo-agora;
                if(ms>0){
                    setTimeout(()=>{ new Notification("🔔 JARVIS",{body:tarefa}); exibirRespostaJarvis(`🔔 Lembrete: ${tarefa}`); }, ms);
                    exibirRespostaJarvis(`✅ Lembrete para ${alvo.toLocaleTimeString()}`);
                } else exibirRespostaJarvis("Horário inválido.");
            } else exibirRespostaJarvis("Use: lembre-me de [tarefa] às [hh:mm]");
            return;
        }
        if (cmd.startsWith('converter ')) {
            let partes = texto.match(/converter (\d+(?:\.\d+)?)\s+(\w+)\s+para\s+(\w+)/i);
            if(partes){
                let resp = await fetch(`${BACKEND_URL}api/converter`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ valor:parseFloat(partes[1]), de:partes[2].toLowerCase(), para:partes[3].toLowerCase() }) });
                let data = await resp.json();
                exibirRespostaJarvis(data.resposta || data.erro);
            } else exibirRespostaJarvis("Formato: converter [valor] [unidade] para [unidade]");
            return;
        }
        if (cmd.startsWith('gerar senha')) {
            let tam = parseInt(cmd.match(/\d+/)?.[0]) || 12;
            let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
            let senha = Array.from({length:tam}, ()=>chars[Math.floor(Math.random()*chars.length)]).join('');
            exibirRespostaJarvis(`🔐 Senha (${tam}): \`${senha}\``);
            return;
        }
        const dicionario = { hello:"olá", world:"mundo", good:"bom", bad:"ruim", house:"casa", car:"carro", dog:"cachorro", cat:"gato", sun:"sol", moon:"lua", star:"estrela", water:"água", fire:"fogo", earth:"terra", air:"ar" };
        if (cmd.startsWith('traduzir ')) {
            let palavra = texto.replace(/traduzir /i,"").trim().toLowerCase();
            if(dicionario[palavra]) exibirRespostaJarvis(`📖 ${palavra} → ${dicionario[palavra]}`);
            else exibirRespostaJarvis(`Tradução não encontrada.`);
            return;
        }
        if (cmd.startsWith('adicionar gasto ')) {
            let partes = texto.match(/adicionar gasto (.+?)\s+(\d+(?:\.\d+)?)/i);
            if(partes){
                gastos.push({ categoria:partes[1].trim(), valor:parseFloat(partes[2]), data:new Date().toISOString() });
                localStorage.setItem('jarvis_gastos', JSON.stringify(gastos));
                exibirRespostaJarvis(`💰 Gasto: ${partes[1]} R$ ${parseFloat(partes[2]).toFixed(2)}`);
            } else exibirRespostaJarvis("Formato: adicionar gasto [categoria] [valor]");
            return;
        }
        if (cmd === 'resumo gastos') {
            let total = gastos.reduce((s,g)=>s+g.valor,0);
            let porCat = {};
            gastos.forEach(g=>{ porCat[g.categoria] = (porCat[g.categoria]||0)+g.valor; });
            let resumo = `💰 Total: R$ ${total.toFixed(2)}\nPor categoria:\n` + Object.entries(porCat).map(([c,v])=>`   ${c}: R$ ${v.toFixed(2)}`).join("\n");
            exibirRespostaJarvis(resumo);
            return;
        }
        if (cmd === 'relatório de gastos') {
            if (gastos.length === 0) { exibirRespostaJarvis("Nenhum gasto registrado."); return; }
            let porCat = {};
            gastos.forEach(g=>{ porCat[g.categoria] = (porCat[g.categoria]||0)+g.valor; });
            let labels = Object.keys(porCat);
            let data = Object.values(porCat);
            let modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `<div class="modal-content" style="max-width:500px;"><h3>📊 Relatório de Gastos</h3><canvas id="gastosChart" width="400" height="300"></canvas><br><button id="closeChartBtn">Fechar</button></div>`;
            document.body.appendChild(modal);
            let ctx = modal.querySelector('#gastosChart').getContext('2d');
            new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Gastos (R$)', data, backgroundColor: '#00f0ff' }] } });
            modal.querySelector('#closeChartBtn').onclick = () => modal.remove();
            return;
        }
        if (cmd === 'últimas notícias' || cmd === 'notícias') {
            exibirRespostaJarvis("📰 Buscando...", false);
            let resp = await fetch(`${BACKEND_URL}api/noticias`);
            let data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('horóscopo ')) {
            let signo = cmd.replace('horóscopo','').trim().toLowerCase();
            let signos = ["aries","touro","gemeos","cancer","leao","virgem","libra","escorpiao","sagitario","capricornio","aquario","peixes"];
            if(!signos.includes(signo)){ exibirRespostaJarvis("Signo inválido."); return; }
            exibirRespostaJarvis(`🔮 Buscando...`, false);
            try{
                let resp = await fetch(`https://horoscope-api.herokuapp.com/horoscope/${signo}/today`);
                let data = await resp.json();
                exibirRespostaJarvis(`🔮 ${signo}: ${data.horoscope}`);
            } catch{ exibirRespostaJarvis("Erro."); }
            return;
        }
        if (cmd.startsWith('tabuada do ')) {
            let num = parseInt(cmd.replace('tabuada do','').trim());
            if(!isNaN(num)){
                let res = `📐 Tabuada do ${num}:\n` + Array.from({length:10},(_,i)=>`${num} x ${i+1} = ${num*(i+1)}`).join("\n");
                exibirRespostaJarvis(res);
            } else exibirRespostaJarvis("Digite: tabuada do [número]");
            return;
        }
        if (cmd.startsWith('imc ')) {
            let match = texto.match(/imc\s+peso\s+(\d+(?:\.\d+)?)\s+altura\s+(\d+(?:\.\d+)?)/i);
            if(match){
                let peso=parseFloat(match[1]), altura=parseFloat(match[2]), imc=peso/(altura*altura);
                let classif = imc<18.5?"Abaixo do peso":imc<25?"Normal":imc<30?"Sobrepeso":imc<35?"Obesidade I":imc<40?"Obesidade II":"Obesidade III";
                exibirRespostaJarvis(`📊 IMC = ${imc.toFixed(2)} - ${classif}`);
            } else exibirRespostaJarvis("Formato: imc peso [kg] altura [m]");
            return;
        }
        if (cmd.startsWith('juros compostos ')) {
            let match = texto.match(/juros compostos\s+capital\s+(\d+(?:\.\d+)?)\s+taxa\s+(\d+(?:\.\d+)?)%?\s+meses\s+(\d+)/i);
            if(match){
                let cap=parseFloat(match[1]), taxa=parseFloat(match[2])/100, meses=parseInt(match[3]), mont=cap*Math.pow(1+taxa,meses);
                exibirRespostaJarvis(`📈 Montante: R$ ${mont.toFixed(2)} | Juros: R$ ${(mont-cap).toFixed(2)}`);
            } else exibirRespostaJarvis("Formato: juros compostos capital [valor] taxa [%] meses [n]");
            return;
        }
        if (cmd.startsWith('pomodoro ')) {
            let min = parseInt(cmd.replace('pomodoro','').trim());
            if(!isNaN(min) && min>0){
                exibirRespostaJarvis(`🍅 Pomodoro ${min} min iniciado.`);
                setTimeout(()=>{
                    exibirRespostaJarvis(`⏰ Pomodoro finalizado!`);
                    if(Notification.permission==="granted") new Notification("Pomodoro",{body:"Tempo finalizado!"});
                }, min*60*1000);
            } else exibirRespostaJarvis("Digite: pomodoro [minutos]");
            return;
        }
        if (cmd === 'tela cheia') { if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); else exibirRespostaJarvis("Não suportado."); return; }
        if (cmd === 'vibrar') { if(navigator.vibrate) navigator.vibrate(200); else exibirRespostaJarvis("Não suportado."); return; }
        if (cmd.startsWith('buscar no histórico ')) {
            let termo = cmd.replace('buscar no histórico','').trim();
            let hist = JSON.parse(localStorage.getItem('jarvis_historico')) || [];
            let res = hist.filter(m=>m.content.toLowerCase().includes(termo));
            if(res.length) exibirRespostaJarvis(`🔍 Encontrados ${res.length} resultados:\n`+res.slice(-5).map(m=>`${m.role}: ${m.content.substring(0,100)}...`).join("\n"));
            else exibirRespostaJarvis(`Nenhum resultado para "${termo}".`);
            return;
        }
        if (cmd === 'modo avião') { modoAviao=true; exibirRespostaJarvis("✈️ Modo avião ativado."); return; }
        if (cmd === 'modo normal') { modoAviao=false; exibirRespostaJarvis("📡 Modo normal."); return; }
        if (cmd === 'tema azul') { document.body.classList.remove('light-mode','green-theme'); document.body.classList.add('blue-theme'); exibirRespostaJarvis("🎨 Tema azul aplicado."); return; }
        if (cmd === 'tema verde') { document.body.classList.remove('light-mode','blue-theme'); document.body.classList.add('green-theme'); exibirRespostaJarvis("🎨 Tema verde aplicado."); return; }
        if (cmd === 'tema padrão') { document.body.classList.remove('light-mode','blue-theme','green-theme'); document.body.classList.add('dark-mode'); exibirRespostaJarvis("🎨 Tema padrão restaurado."); return; }

        // ==================== NOVAS FUNCIONALIDADES ====================
        // Receita culinária
        if (cmd === 'receita') {
            const receitas = ["🍳 **Omelete simples**: 2 ovos, sal, pimenta, queijo.", "🥗 **Salada de frutas**: pique maçã, banana, laranja, uva.", "🍝 **Macarrão alho e óleo**: alho no azeite, macarrão, salsinha.", "🍰 **Bolo de caneca**: 1 ovo, 4 colheres leite, 3 farinha, 2 açúcar, 1 chocolate, fermento. 1 min micro-ondas."];
            exibirRespostaJarvis(receitas[Math.floor(Math.random() * receitas.length)]);
            return;
        }
        if (cmd.startsWith('receita de ')) { exibirRespostaJarvis("📖 Ainda não tenho essa receita. Use 'aprender receita_[nome] : [instruções]' para ensinar."); return; }
        // Timer
        if (cmd.startsWith('timer ')) {
            let match = texto.match(/timer\s+(\d+)\s+(segundos?|minutos?)/i);
            if (!match) match = texto.match(/timer\s+(\d+)/i);
            if (match) {
                let valor = parseInt(match[1]), unidade = match[2] ? match[2].toLowerCase() : "minutos", ms = unidade.startsWith("seg") ? valor * 1000 : valor * 60 * 1000;
                if (ms > 0 && ms < 3600000) {
                    exibirRespostaJarvis(`⏲️ Timer de ${valor} ${unidade} iniciado.`);
                    setTimeout(() => { exibirRespostaJarvis(`🔔 Timer de ${valor} ${unidade} finalizado!`); if(Notification.permission==="granted") new Notification("Timer",{body:`${valor} ${unidade} terminou!`}); }, ms);
                } else exibirRespostaJarvis("Timer muito longo (máx 1 hora).");
            } else exibirRespostaJarvis("Use: timer [número] [segundos/minutos]");
            return;
        }
        // Cofre de senhas
        if (cmd.startsWith('salvar senha ')) {
            let partes = texto.match(/salvar senha (.+?)\s+(.+?)\s+(.+)/i);
            if(partes){
                let site=partes[1], usuario=partes[2], senha=partes[3];
                let cofre = JSON.parse(localStorage.getItem('jarvis_cofre')) || [];
                let encrypted = btoa(unescape(encodeURIComponent(JSON.stringify({ site, usuario, senha }))));
                cofre.push(encrypted);
                localStorage.setItem('jarvis_cofre', JSON.stringify(cofre));
                exibirRespostaJarvis(`🔐 Senha salva para ${site}.`);
            } else exibirRespostaJarvis("Formato: salvar senha [site] [usuario] [senha]");
            return;
        }
        if (cmd === 'mostrar senhas') {
            let cofre = JSON.parse(localStorage.getItem('jarvis_cofre')) || [];
            if(cofre.length===0) exibirRespostaJarvis("Nenhuma senha salva.");
            else { let lista = "🔐 **Senhas salvas:**\n"; cofre.forEach((enc,i)=>{ try{ let dec=JSON.parse(decodeURIComponent(escape(atob(enc)))); lista+=`${i+1}. ${dec.site} - ${dec.usuario}\n`; }catch(e){} }); exibirRespostaJarvis(lista); }
            return;
        }
        // Agenda
        if (cmd.startsWith('adicionar evento ')) {
            let resto = texto.replace(/adicionar evento /i,"").trim();
            let match = resto.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)/);
            if(match){
                let agenda = JSON.parse(localStorage.getItem('jarvis_agenda')) || [];
                agenda.push({ data:match[1], desc:match[2] });
                localStorage.setItem('jarvis_agenda', JSON.stringify(agenda));
                exibirRespostaJarvis(`✅ Evento para ${match[1]}: ${match[2]}`);
            } else exibirRespostaJarvis("Formato: adicionar evento dd/mm/aaaa descrição");
            return;
        }
        if (cmd === 'eventos hoje') {
            let hoje = new Date().toLocaleDateString();
            let agenda = JSON.parse(localStorage.getItem('jarvis_agenda')) || [];
            let evs = agenda.filter(e=>e.data===hoje);
            if(evs.length) exibirRespostaJarvis(`📅 Hoje:\n`+evs.map(e=>`• ${e.desc}`).join("\n"));
            else exibirRespostaJarvis("Nenhum evento hoje.");
            return;
        }
        if (cmd === 'eventos amanhã') {
            let amanha = new Date(Date.now()+86400000).toLocaleDateString();
            let agenda = JSON.parse(localStorage.getItem('jarvis_agenda')) || [];
            let evs = agenda.filter(e=>e.data===amanha);
            if(evs.length) exibirRespostaJarvis(`📅 Amanhã:\n`+evs.map(e=>`• ${e.desc}`).join("\n"));
            else exibirRespostaJarvis("Nenhum evento amanhã.");
            return;
        }
        // Comparar textos
        if (cmd.startsWith('comparar textos ')) {
            let resto = texto.replace(/comparar textos /i,"").trim();
            let sep = resto.indexOf(' ', resto.indexOf(' ')+1);
            let t1 = resto.substring(0,sep).trim(), t2 = resto.substring(sep+1).trim();
            if(t1 && t2){
                let dist = levenshtein(t1, t2);
                let maxLen = Math.max(t1.length, t2.length);
                let sim = ((maxLen - dist) / maxLen * 100).toFixed(1);
                exibirRespostaJarvis(`📊 Similaridade: ${sim}% (distância ${dist})`);
            } else exibirRespostaJarvis("Use: comparar textos [texto1] [texto2]");
            return;
        }
        // Gravação de voz
        if (cmd === 'gravar nota') {
            if (!navigator.mediaDevices) { exibirRespostaJarvis("Não suportado."); return; }
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    const blob = new Blob(audioChunks, { type: 'audio/wav' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `nota_voz_${Date.now()}.wav`;
                    a.click();
                    exibirRespostaJarvis("🎙️ Gravação salva.");
                    stream.getTracks().forEach(t => t.stop());
                };
                mediaRecorder.start();
                exibirRespostaJarvis("🔴 Gravando... Diga 'parar gravação'.");
            }).catch(err => exibirRespostaJarvis(`Erro: ${err.message}`));
            return;
        }
        if (cmd === 'parar gravação' && mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            exibirRespostaJarvis("⏹️ Gravação finalizada.");
            return;
        }
        // Recomendação de filme (backend)
        if (cmd === 'recomendar filme') {
            exibirRespostaJarvis("🎬 Buscando recomendação...", false);
            let resp = await fetch(`${BACKEND_URL}api/recomendar_filme`);
            let data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        // Rastreamento de encomendas
        if (cmd.startsWith('rastrear ')) {
            let codigo = texto.replace(/rastrear /i,"").trim();
            if(!codigo) { exibirRespostaJarvis("Informe o código."); return; }
            exibirRespostaJarvis(`📦 Rastreando...`, false);
            let resp = await fetch(`${BACKEND_URL}api/rastrear`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ codigo }) });
            let data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        // Gerador de currículo
        if (cmd === 'criar curriculo') {
            exibirRespostaJarvis("📄 Envie suas informações no formato: nome, email, telefone, experiência, educação. Ex: criar curriculo João; joao@email.com; 99999; Estagiário em TI; Ensino Médio completo");
            return;
        }
        if (cmd.startsWith('criar curriculo ')) {
            let partes = texto.replace(/criar curriculo /i,"").split(';').map(p=>p.trim());
            if(partes.length>=5){
                let [nome, email, telefone, experiencia, educacao] = partes;
                let resp = await fetch(`${BACKEND_URL}api/gerar_curriculo`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nome, email, telefone, experiencia, educacao }) });
                if(resp.ok){
                    let blob = await resp.blob();
                    let a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `curriculo_${nome}.pdf`;
                    a.click();
                    exibirRespostaJarvis("✅ Currículo gerado! Download iniciado.");
                } else exibirRespostaJarvis("❌ Erro ao gerar currículo.");
            } else exibirRespostaJarvis("Formato: criar curriculo Nome; email; telefone; experiência; educação");
            return;
        }

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
            let { data: { text } } = await Tesseract.recognize(arquivo, 'por');
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
