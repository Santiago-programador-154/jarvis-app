// ---------- EXPORTAR DIÁRIO (TXT) ----------
if (cmd === 'exportar diario') {
    let db = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || { diario: [] };
    let conteudo = db.diario.join("\n");
    if (!conteudo) conteudo = "Diário vazio.";
    const blob = new Blob([conteudo], { type: "text/plain" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "diario_jarvis.txt";
    link.click();
    exibirRespostaJarvis("✅ Diário exportado como 'diario_jarvis.txt'");
    return;
}

// ---------- EXPORTAR FLASHCARDS (CSV) ----------
if (cmd === 'exportar flashcards') {
    let db = JSON.parse(localStorage.getItem('jarvis_memoria_v3')) || { flashcards: [] };
    let linhas = ["pergunta,resposta"];
    db.flashcards.forEach(card => {
        linhas.push(`"${card.q}","${card.r}"`);
    });
    const csv = linhas.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "flashcards_jarvis.csv";
    link.click();
    exibirRespostaJarvis("✅ Flashcards exportados como 'flashcards_jarvis.csv'");
    return;
}

// ---------- GERAR ÁUDIO (MP3) ----------
if (cmd.startsWith('criar audio sobre ')) {
    let tema = texto.replace(/criar audio sobre /i, "").trim();
    if (!tema) {
        exibirRespostaJarvis("Especifique um tema. Ex: 'criar audio sobre Revolução Francesa'");
        return;
    }
    exibirRespostaJarvis(`🎧 Gerando áudio sobre *${tema}*...`, false);
    // Pede para IA gerar o texto
    const promptIA = `Escreva um resumo curto (máximo 1500 caracteres) sobre: ${tema}.`;
    const respIA = await fetch(`${BACKEND_URL}api/comando`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historico: [{ role: "user", content: promptIA }] })
    });
    const dataIA = await respIA.json();
    const textoAudio = dataIA.resposta || "Conteúdo não gerado.";
    // Chama a rota de áudio
    const respAudio = await fetch(`${BACKEND_URL}api/gerar_audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoAudio })
    });
    if (respAudio.ok) {
        const blob = await respAudio.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "audio.mp3";
        a.click();
        exibirRespostaJarvis("✅ Áudio gerado! O download deve começar.");
    } else {
        exibirRespostaJarvis("❌ Erro ao gerar áudio.");
    }
    return;
}

// ---------- CRIAR SLIDES (PPTX) ----------
if (cmd.startsWith('criar slides sobre ')) {
    let tema = texto.replace(/criar slides sobre /i, "").trim();
    if (!tema) {
        exibirRespostaJarvis("Especifique um tema. Ex: 'criar slides sobre SGBD'");
        return;
    }
    exibirRespostaJarvis(`📊 Gerando slides sobre *${tema}*...`, false);
    const promptIA = `Crie um conteúdo estruturado (use <h1>, <h2>, <p>, <ul>) para uma apresentação de slides sobre: ${tema}. Máximo 5 tópicos.`;
    const respIA = await fetch(`${BACKEND_URL}api/comando`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historico: [{ role: "user", content: promptIA }] })
    });
    const dataIA = await respIA.json();
    const conteudo = dataIA.resposta || "Conteúdo não gerado.";
    const respSlides = await fetch(`${BACKEND_URL}api/gerar_slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: tema, conteudo: conteudo })
    });
    if (respSlides.ok) {
        const blob = await respSlides.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "slides.pptx";
        a.click();
        exibirRespostaJarvis("✅ Slides gerados! Download iniciado.");
    } else {
        exibirRespostaJarvis("❌ Erro ao gerar slides.");
    }
    return;
}

// ---------- CLIMA ----------
if (cmd.startsWith('clima em ')) {
    let cidade = texto.replace(/clima em /i, "").trim();
    if (!cidade) {
        exibirRespostaJarvis("Informe a cidade. Ex: 'clima em São Paulo'");
        return;
    }
    exibirRespostaJarvis(`🌡️ Consultando clima em ${cidade}...`, false);
    const resp = await fetch(`${BACKEND_URL}api/clima`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cidade: cidade })
    });
    const data = await resp.json();
    exibirRespostaJarvis(data.resposta);
    return;
}

// ---------- MASSA MOLAR ----------
if (cmd.startsWith('massa molar de ')) {
    let formula = texto.replace(/massa molar de /i, "").trim();
    if (!formula) {
        exibirRespostaJarvis("Informe a fórmula. Ex: 'massa molar de H2O'");
        return;
    }
    const resp = await fetch(`${BACKEND_URL}api/massa_molar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula: formula })
    });
    const data = await resp.json();
    exibirRespostaJarvis(data.resposta);
    return;
}

// ---------- EXECUTAR CÓDIGO ----------
if (cmd.startsWith('rode python:')) {
    let codigo = texto.replace(/rode python:/i, "").trim();
    if (!codigo) {
        exibirRespostaJarvis("Digite o código após 'rode python:'");
        return;
    }
    exibirRespostaJarvis("🐍 Executando código...", false);
    const resp = await fetch(`${BACKEND_URL}api/executar_codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linguagem: "python", codigo: codigo })
    });
    const data = await resp.json();
    exibirRespostaJarvis(data.resposta);
    return;
}
if (cmd.startsWith('rode js:')) {
    let codigo = texto.replace(/rode js:/i, "").trim();
    if (!codigo) return exibirRespostaJarvis("Código vazio.");
    const resp = await fetch(`${BACKEND_URL}api/executar_codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linguagem: "javascript", codigo: codigo })
    });
    const data = await resp.json();
    exibirRespostaJarvis(data.resposta);
    return;
}

// ---------- ENCURTAR LINK ----------
if (cmd.startsWith('encurtar ')) {
    let link = texto.replace(/encurtar /i, "").trim();
    if (!link) return exibirRespostaJarvis("Forneça o link.");
    const resp = await fetch(`${BACKEND_URL}api/encurtar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link })
    });
    const data = await resp.json();
    exibirRespostaJarvis(data.resposta);
    return;
}

// ---------- LER PDF EM VOZ ALTA (contínuo) ----------
if (cmd === 'ler tudo em voz alta' && estaLendoPdf && pdfDoc) {
    exibirRespostaJarvis("🔊 Iniciando leitura contínua em voz alta...", false);
    let pagina = pdfPaginaAtual;
    const falarPagina = async () => {
        if (pagina > pdfNumPaginas) {
            exibirRespostaJarvis("Leitura finalizada.");
            return;
        }
        const pg = await pdfDoc.getPage(pagina);
        const conteudo = await pg.getTextContent();
        const texto = conteudo.items.map(i => i.str).join(' ');
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'pt-BR';
        utterance.onend = () => {
            pagina++;
            falarPagina();
        };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        exibirRespostaJarvis(`📖 Lendo página ${pagina}...`, false);
    };
    falarPagina();
    return;
}

// ---------- LEMBRETE (notificação) ----------
if (cmd.startsWith('lembre-me de ')) {
    let resto = texto.replace(/lembre-me de /i, "").trim();
    let match = resto.match(/(.+?)\s+às\s+(\d{1,2}):(\d{2})/);
    if (match) {
        let tarefa = match[1];
        let hora = parseInt(match[2]);
        let minuto = parseInt(match[3]);
        let agora = new Date();
        let dataAlvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hora, minuto, 0);
        if (dataAlvo < agora) dataAlvo.setDate(dataAlvo.getDate() + 1);
        let ms = dataAlvo - agora;
        if (ms > 0) {
            setTimeout(() => {
                new Notification("🔔 JARVIS", { body: tarefa });
                exibirRespostaJarvis(`🔔 Lembrete: ${tarefa}`);
            }, ms);
            exibirRespostaJarvis(`✅ Lembrete criado para ${dataAlvo.toLocaleTimeString()}`);
        } else {
            exibirRespostaJarvis("Horário inválido.");
        }
    } else {
        exibirRespostaJarvis("Use: lembre-me de [tarefa] às [hh:mm]");
    }
    return;
}
