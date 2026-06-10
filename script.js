// ==================== JARVIS - VERSÃO FINAL COM INTERFACE POR ABAS ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('JARVIS iniciado');

    // ==================== ELEMENTOS DOM ====================
    const chatBox = document.getElementById('chatBox');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const fileInput = document.getElementById('fileInput');
    const pdfStatusDiv = document.getElementById('pdfStatus');
    const commandsDatalist = document.getElementById('commands-list');

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

    const piadas = ["Por que o programador foi ao mercado? Por bytes!", "O que o zero disse ao oito? Bonito cinto!", "..."];

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
        document.getElementById('statComandos') && (document.getElementById('statComandos').innerText = historicoConversa.filter(m => m.role === 'user').length);
        document.getElementById('statMensagens') && (document.getElementById('statMensagens').innerText = historicoConversa.length);
        document.getElementById('statTarefas') && (document.getElementById('statTarefas').innerText = dbMemoriaLocal.tarefas.filter(t => !t.concluida).length);
        document.getElementById('statGastos') && (document.getElementById('statGastos').innerHTML = `R$ ${gastos.reduce((s,g) => s + g.valor, 0).toFixed(2)}`);
        document.getElementById('statDiario') && (document.getElementById('statDiario').innerText = dbMemoriaLocal.diario.length);
    }

    function adicionarConhecimentoOffline(materia, conteudo) {
        if (!dbMemoriaLocal[materia]) dbMemoriaLocal[materia] = [];
        dbMemoriaLocal[materia].push(conteudo);
        localStorage.setItem('jarvis_memoria_v3', JSON.stringify(dbMemoriaLocal));
        return `✅ Aprendi: "${materia}" -> "${conteudo.substring(0, 50)}..."`;
    }

    // ==================== PDF ====================
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

    // ==================== IA ====================
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

    // ==================== NOVAS FUNCIONALIDADES (20 extras) ====================
    async function gerarQRCode(texto) { return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(texto)}`; }
    function forcaSenha(s) { let f = (s.length>=8) + (s.match(/[A-Z]/)?1:0) + (s.match(/[0-9]/)?1:0) + (s.match(/[^A-Za-z0-9]/)?1:0); return f<=2?"Fraca":f<=4?"Média":"Forte"; }

    // ==================== ENVIO PRINCIPAL ====================
    window.inserirComando = function(cmd) { userInput.value = cmd; enviarMensagem(); };

    async function enviarMensagem() {
        const texto = userInput.value.trim();
        if (!texto) return;
        exibirMensagemUsuario(texto);
        userInput.value = '';
        const cmd = texto.toLowerCase();

        // --- Comandos estruturais (PDF, aprender, etc.) ---
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
            exibirRespostaJarvis(`🎧 Gerando áudio de "${tema}"...`, false);
            let resIA = await fetch(`${BACKEND_URL}api/comando`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ historico:[{role:"user", content:`Resumo curto (1500 caracteres) sobre: ${tema}`}] }) });
            let dataIA = await resIA.json();
            let textoAudio = dataIA.resposta || "";
            let resAudio = await fetch(`${BACKEND_URL}api/gerar_audio`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ texto:textoAudio }) });
            if(resAudio.ok){ let blob=await resAudio.blob(); let a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="audio.mp3"; a.click(); exibirRespostaJarvis("✅ Áudio gerado."); }
            else exibirRespostaJarvis("❌ Erro no áudio.");
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
            exibirRespostaJarvis(`🌡️ Consultando ${cidade}...`, false);
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
            if(!codigo) { exibirRespostaJarvis("Código?"); return; }
            let resp = await fetch(`${BACKEND_URL}api/executar_codigo`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ linguagem:"javascript", codigo }) });
            let data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd.startsWith('encurtar ')) {
            let link = texto.replace(/encurtar /i,"").trim();
            if(!link) { exibirRespostaJarvis("Link?"); return; }
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
            exibirRespostaJarvis(`🔮 Buscando horóscopo...`, false);
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
        if (cmd === 'tela cheia') {
            if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
            else exibirRespostaJarvis("Não suportado.");
            return;
        }
        if (cmd === 'vibrar') {
            if(navigator.vibrate) navigator.vibrate(200);
            else exibirRespostaJarvis("Não suportado.");
            return;
        }
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

        // ---- 20 novas funcionalidades integradas (resumidas) ----
        if (cmd.startsWith('media ')) {
            let nums = texto.match(/\d+(?:\.\d+)?/g);
            if(nums && nums.length){
                let media = nums.reduce((a,b)=>a+parseFloat(b),0)/nums.length;
                let status = media>=7?"✅ Aprovado":media>=5?"⚠️ Recuperação":"❌ Reprovado";
                exibirRespostaJarvis(`📊 Média = ${media.toFixed(2)} - ${status}`);
            } else exibirRespostaJarvis("Forneça notas separadas por espaço.");
            return;
        }
        if (cmd.startsWith('nota ')) {
            let nota = parseFloat(texto.match(/\d+(?:\.\d+)?/)?.[0]);
            if(!isNaN(nota)){
                let letra = nota>=9?"A":nota>=8?"B":nota>=7?"C":nota>=5?"D":"F";
                exibirRespostaJarvis(`📝 Nota ${nota} → ${letra}`);
            } else exibirRespostaJarvis("Use: nota [valor]");
            return;
        }
        if (cmd === 'cronograma de estudos') {
            let materias = ["Matemática","Português","História","Geografia","Ciências","Inglês","Física","Química"];
            let sorteadas = materias.sort(()=>0.5-Math.random()).slice(0,4);
            exibirRespostaJarvis("📚 Cronograma:\n"+sorteadas.map((m,i)=>`${i+1}. ${m}: 30 min`).join("\n"));
            return;
        }
        if (cmd.startsWith('força da senha ')) {
            let senha = texto.replace(/força da senha /i,"").trim();
            exibirRespostaJarvis(`🔐 Força: ${forcaSenha(senha)}`);
            return;
        }
        if (cmd.startsWith('falar ')) {
            let txt = texto.replace(/falar /i,"").trim();
            exibirRespostaJarvis(txt, true);
            return;
        }
        if (cmd.startsWith('humor hoje ')) {
            let nota = parseInt(cmd.match(/\d+/)?.[0]);
            if(nota>=1 && nota<=5){
                dbMemoriaLocal.humor.push({data:new Date().toLocaleDateString(), nota});
                localStorage.setItem('jarvis_memoria_v3',JSON.stringify(dbMemoriaLocal));
                exibirRespostaJarvis(`😊 Humor ${nota}/5 registrado.`);
            } else exibirRespostaJarvis("Use: humor hoje [1-5]");
            return;
        }
        if (cmd.startsWith('combustível ')) {
            let m = texto.match(/distancia\s+(\d+(?:\.\d+)?)\s+consumo\s+(\d+(?:\.\d+)?)\s+preco\s+(\d+(?:\.\d+)?)/i);
            if(m){
                let litros = parseFloat(m[1])/parseFloat(m[2]);
                let custo = litros*parseFloat(m[3]);
                exibirRespostaJarvis(`⛽ Litros: ${litros.toFixed(2)} | Custo: R$ ${custo.toFixed(2)}`);
            } else exibirRespostaJarvis("Formato: combustível distancia [km] consumo [km/l] preco [R$/l]");
            return;
        }
        if (cmd.startsWith('converter tempo ')) {
            let m = texto.match(/converter tempo (\d+(?:\.\d+)?)\s+(\w+)\s+para\s+(\w+)/i);
            if(m){
                let valor=parseFloat(m[1]), de=m[2].toLowerCase(), para=m[3].toLowerCase();
                let seg = de==="segundos"?valor:de==="minutos"?valor*60:de==="horas"?valor*3600:de==="dias"?valor*86400:0;
                let res = para==="segundos"?seg:para==="minutos"?seg/60:para==="horas"?seg/3600:para==="dias"?seg/86400:0;
                exibirRespostaJarvis(`⏱️ ${valor} ${de} = ${res.toFixed(2)} ${para}`);
            } else exibirRespostaJarvis("Formato: converter tempo [valor] [unidade] para [unidade]");
            return;
        }
        if (cmd === 'email temporário') {
            exibirRespostaJarvis("📧 Gerando e-mail...", false);
            try{
                let resp = await fetch('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
                let data = await resp.json();
                exibirRespostaJarvis(`📧 Email: ${data[0]}`);
                localStorage.setItem('temp_email', data[0]);
            } catch{ exibirRespostaJarvis("Erro."); }
            return;
        }
        if (cmd === 'fato científico') {
            exibirRespostaJarvis("🔬 Buscando fato...", false);
            try{
                let resp = await fetch('https://uselessfacts.jsph.pl/random.json?language=pt');
                let data = await resp.json();
                exibirRespostaJarvis(`🔬 ${data.text}`);
            } catch{ exibirRespostaJarvis("Erro."); }
            return;
        }
        if (cmd.startsWith('lembrar aniversário ')) {
            let m = texto.match(/lembrar aniversário (\d{1,2}\/\d{1,2}\/\d{4}) (.+)/i);
            if(m){
                let aniv = JSON.parse(localStorage.getItem('aniversarios')||'[]');
                aniv.push({nome:m[2], data:m[1]});
                localStorage.setItem('aniversarios', JSON.stringify(aniv));
                exibirRespostaJarvis(`🎂 Aniversário de ${m[2]} em ${m[1]} salvo.`);
            } else exibirRespostaJarvis("Formato: lembrar aniversário dd/mm/aaaa nome");
            return;
        }
        if (cmd.startsWith('traduzir frase ')) {
            let resto = texto.replace(/traduzir frase /i,"").trim();
            let m = resto.match(/(.+)\s+para\s+(\w+)/i);
            if(m){
                exibirRespostaJarvis("🌐 Traduzindo...", false);
                try{
                    let resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(m[1])}&langpair=auto|${m[2]==='portugues'?'pt':m[2]==='ingles'?'en':m[2]==='espanhol'?'es':'fr'}`);
                    let data = await resp.json();
                    exibirRespostaJarvis(`📝 Tradução: ${data.responseData.translatedText}`);
                } catch{ exibirRespostaJarvis("Erro."); }
            } else exibirRespostaJarvis("Formato: traduzir frase [texto] para [idioma]");
            return;
        }
        if (cmd === 'palavra do dia') {
            let palavras = [{p:"serendipity",t:"acaso feliz"},{p:"ephemeral",t:"efêmero"},{p:"resilience",t:"resiliência"}];
            let escolha = palavras[Math.floor(Math.random()*palavras.length)];
            exibirRespostaJarvis(`📖 Palavra do dia: ${escolha.p} → ${escolha.t}`);
            return;
        }
        if (cmd.startsWith('resumir texto ')) {
            let txt = texto.replace(/resumir texto /i,"").trim();
            if(txt.length<10){ exibirRespostaJarvis("Texto muito curto."); return; }
            exibirRespostaJarvis("📄 Resumindo...", false);
            let resp = await fetch(`${BACKEND_URL}api/comando`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ historico:[{role:"user", content:`Resuma este texto em até 3 frases: ${txt}`}] }) });
            let data = await resp.json();
            exibirRespostaJarvis(data.resposta);
            return;
        }
        if (cmd === 'modo foco ativar') { modoSilencio=true; exibirRespostaJarvis("🎯 Modo foco ativado (sem voz)."); return; }
        if (cmd === 'modo foco desativar') { modoSilencio=false; exibirRespostaJarvis("🎯 Voz retomada."); return; }
        if (cmd.startsWith('histórico de ')) {
            let dataStr = cmd.replace('histórico de','').trim();
            let hist = JSON.parse(localStorage.getItem('jarvis_historico')) || [];
            let filt = hist.filter(m=>m.content.includes(dataStr));
            exibirRespostaJarvis(`📜 ${filt.length} mensagens com "${dataStr}".`);
            return;
        }
        if (cmd === 'exportar tudo') {
            let backup = { memoria:dbMemoriaLocal, historico:historicoConversa, gastos:gastos };
            let blob = new Blob([JSON.stringify(backup,null,2)], {type:"application/json"});
            let a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="jarvis_backup.json"; a.click();
            exibirRespostaJarvis("💾 Backup exportado.");
            return;
        }
        if (cmd === 'importar backup') {
            let input = document.createElement('input');
            input.type='file'; input.accept='application/json';
            input.onchange = async (e)=>{
                let file = e.target.files[0];
                let text = await file.text();
                let data = JSON.parse(text);
                if(data.memoria) localStorage.setItem('jarvis_memoria_v3', JSON.stringify(data.memoria));
                if(data.gastos) localStorage.setItem('jarvis_gastos', JSON.stringify(data.gastos));
                exibirRespostaJarvis("✅ Backup importado. Recarregue a página.");
                setTimeout(()=>location.reload(),2000);
            };
            input.click();
            return;
        }
        if (cmd === 'tema azul') { document.body.classList.remove('light-mode','green-theme'); document.body.classList.add('blue-theme'); exibirRespostaJarvis("🎨 Tema azul aplicado."); return; }
        if (cmd === 'tema verde') { document.body.classList.remove('light-mode','blue-theme'); document.body.classList.add('green-theme'); exibirRespostaJarvis("🎨 Tema verde aplicado."); return; }
        if (cmd === 'tema padrão') { document.body.classList.remove('light-mode','blue-theme','green-theme'); document.body.classList.add('dark-mode'); exibirRespostaJarvis("🎨 Tema padrão restaurado."); return; }

        // ---- Fallback para comandos offline genéricos ----
        let respostaOffline = processarComandoOffline(texto);
        if (respostaOffline) { exibirRespostaJarvis(respostaOffline, true, true); return; }

        // ---- IA (último recurso) ----
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
    function abrirCameraOCR() {
        let input = document.createElement('input');
        input.type='file'; input.accept='image/*';
        input.onchange = async e => { if(e.target.files[0]) await realizarOCR(e.target.files[0]); };
        input.click();
    }
    async function abrirCameraQR() {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content"><h3>📱 Aponte para o QR Code</h3><video id="qrVideo" autoplay playsinline></video><br><button id="closeQRModal">Fechar</button></div>`;
        document.body.appendChild(modal);
        const videoElement = modal.querySelector('#qrVideo');
        let stream = null;
        try{
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            videoElement.srcObject = stream;
            await videoElement.play();
            const tick = () => {
                if(videoElement.readyState === videoElement.HAVE_ENOUGH_DATA){
                    canvas.width = videoElement.videoWidth;
                    canvas.height = videoElement.videoHeight;
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
        } catch(err){
            modal.innerHTML = `<div class="modal-content"><p>❌ Erro câmera: ${err.message}</p><button id="closeQRModal">Fechar</button></div>`;
            modal.querySelector('#closeQRModal').onclick = () => modal.remove();
        }
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

    // Sidebar
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const closeSidebar = document.getElementById('closeSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if(menuToggle && sidebar) menuToggle.addEventListener('click', ()=>{ sidebar.classList.add('open'); overlay.classList.add('active'); });
    if(closeSidebar && sidebar) closeSidebar.addEventListener('click', ()=>{ sidebar.classList.remove('open'); overlay.classList.remove('active'); });
    if(overlay) overlay.addEventListener('click', ()=>{ sidebar.classList.remove('open'); overlay.classList.remove('active'); });

    // Botões das abas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', ()=>{
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });

    // Botões específicos
    document.getElementById('exportDiarioBtn')?.addEventListener('click', ()=>inserirComando('exportar diario'));
    document.getElementById('exportFlashcardsBtn')?.addEventListener('click', ()=>inserirComando('exportar flashcards'));
    document.getElementById('exportGastosBtn')?.addEventListener('click', ()=>inserirComando('exportar tudo'));
    document.getElementById('salvarConversaBtn')?.addEventListener('click', salvarConversaPDF);
    document.getElementById('limparConversaBtn')?.addEventListener('click', ()=>{ if(confirm("Limpar conversa?")){ historicoConversa=[]; localStorage.removeItem('jarvis_historico'); location.reload(); } });
    document.getElementById('ocrImageBtn')?.addEventListener('click', abrirCameraOCR);
    document.getElementById('qrScanBtn')?.addEventListener('click', abrirCameraQR);
    document.getElementById('exportBackupBtn')?.addEventListener('click', ()=>inserirComando('exportar tudo'));
    document.getElementById('importBackupBtn')?.addEventListener('click', ()=>inserirComando('importar backup'));
    document.getElementById('clearAllDataBtn')?.addEventListener('click', ()=>{
        if(confirm("Isso apagará TODOS os dados (diário, flashcards, gastos, configurações). Continuar?")){
            localStorage.clear();
            location.reload();
        }
    });
    document.querySelectorAll('.theme-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
            let theme = btn.getAttribute('data-theme');
            if(theme==='dark'){ document.body.classList.remove('light-mode','blue-theme','green-theme'); document.body.classList.add('dark-mode'); }
            else if(theme==='light'){ document.body.classList.remove('dark-mode','blue-theme','green-theme'); document.body.classList.add('light-mode'); }
            else if(theme==='blue'){ document.body.classList.remove('light-mode','dark-mode','green-theme'); document.body.classList.add('blue-theme'); }
            else if(theme==='green'){ document.body.classList.remove('light-mode','dark-mode','blue-theme'); document.body.classList.add('green-theme'); }
        });
    });

    // Microfone
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

    // Carregar histórico
    let saved = localStorage.getItem('jarvis_historico');
    if(saved) try{ historicoConversa = JSON.parse(saved); } catch(e){}
    atualizarEstatisticas();
    // Preencher datalist com comandos
    let comandos = ["continue","leia","próxima página","criar pdf sobre","criar audio sobre","criar slides sobre","clima em","massa molar de","rode python:","rode js:","encurtar","converter","gerar senha","traduzir","adicionar gasto","resumo gastos","últimas notícias","horóscopo","tabuada do","imc","juros compostos","pomodoro","tela cheia","vibrar","modo avião","modo normal","gerar qr","resumir texto","citação","fato científico","email temporário","cronograma de estudos","força da senha","falar","humor hoje","combustível","converter tempo","media","nota","traduzir frase","palavra do dia","modo foco ativar","histórico de","exportar tudo","importar backup","tema azul","tema verde","tema padrão"];
    comandos.forEach(c=>{ let opt = document.createElement('option'); opt.value=c; commandsDatalist.appendChild(opt); });
    exibirRespostaJarvis("✅ JARVIS 4.0 com nova interface e mais de 80 comandos integrados! Use as abas para navegar.", false);
});
