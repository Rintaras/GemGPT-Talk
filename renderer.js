const $ = (sel) => document.querySelector(sel);
const logEl = $('#log');
const themeEl = $('#theme');
const inputEl = $('#input');
const sendBtn = $('#send');

let messages = [];
let nextSpeaker = 'chatgpt';
let running = false;
let busy = false;
let minIntervalMs = 800;
let typingTimer = null;
let isUserTyping = false;
let isPaused = false;
let lastSpeaker = null;

function appendMessage(role, content) {
    messages.push({ role, content, t: Date.now() });
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    const who = role === 'user' ? 'ユーザー' : (role === 'chatgpt' ? 'ChatGPT' : 'Gemini');
    div.innerHTML = `<span class="who">${who}</span><span class="text"></span>`;
    div.querySelector('.text').textContent = content;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

async function checkEnv() {
    const info = await window.api.checkEnv();
    if (!info.hasOpenAI || !info.hasGemini) {
        const lacks = [];
        if (!info.hasOpenAI) lacks.push('OPENAI_API_KEY');
        if (!info.hasGemini) lacks.push('GEMINI_API_KEY');
        $('#envWarn').textContent = `.env に ${lacks.join(' と ')} を設定してください。`;
    } else {
        $('#envWarn').textContent = '';
    }
}

async function stepOnce() {
    if (!running || busy || isUserTyping || isPaused) return;
    busy = true;
    const theme = themeEl.value.trim();
    const provider = nextSpeaker;
    try {
        const res = await window.api.askLLM({ provider, theme, history: messages });
        if (res.ok) {
            appendMessage(provider, res.text);
            lastSpeaker = provider;
            nextSpeaker = provider === 'chatgpt' ? 'gemini' : 'chatgpt';
        } else {
            appendMessage('system', `[${provider}] エラー: ${res.error}`);
            nextSpeaker = provider === 'chatgpt' ? 'gemini' : 'chatgpt';
        }
    } catch (e) {
        appendMessage('system', `実行時エラー: ${e?.message || e}`);
    } finally {
        busy = false;
        if (running && !isUserTyping && !isPaused) {
            setTimeout(stepOnce, minIntervalMs);
        }
    }
}

function startConversation() {
    const theme = themeEl.value.trim();
    if (!theme) {
        appendMessage('system', 'テーマを入力してから開始してください。');
        return;
    }

    running = true;
    isPaused = false;
    lastSpeaker = null;
    appendMessage('system', `テーマ「${theme}」で会話を開始します。`);

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.style.display = 'inline-block';
        updatePauseButton();
    }

    stepOnce();
}

function togglePause() {
    if (!running) return;

    isPaused = !isPaused;
    if (isPaused) {
        appendMessage('system', '会話を一時停止しました。');
    } else {
        appendMessage('system', '会話を再開しました。');
        if (lastSpeaker) {
            nextSpeaker = lastSpeaker === 'chatgpt' ? 'gemini' : 'chatgpt';
        }
        if (!busy && !isUserTyping) {
            setTimeout(stepOnce, 300);
        }
    }
    updatePauseButton();
}

function updatePauseButton() {
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        if (isPaused) {
            pauseBtn.textContent = '再開';
            pauseBtn.style.background = '#2e7d32';
        } else {
            pauseBtn.textContent = '一時停止';
            pauseBtn.style.background = '#f57c00';
        }
    }
}

function handleUserTyping() {
    isUserTyping = true;

    if (typingTimer) {
        clearTimeout(typingTimer);
    }

    typingTimer = setTimeout(() => {
        isUserTyping = false;
        if (running && !busy && !isPaused) {
            setTimeout(stepOnce, 500);
        }
    }, 1000);
}

function resumeConversation() {
    if (isUserTyping) {
        isUserTyping = false;
        if (typingTimer) {
            clearTimeout(typingTimer);
            typingTimer = null;
        }
        if (running && !busy && !isPaused) {
            setTimeout(stepOnce, 300);
        }
    }
}

sendBtn.addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (!text) return;
    appendMessage('user', text);
    inputEl.value = '';
    setTimeout(() => {
        if (running && !busy && !isPaused) {
            stepOnce();
        }
    }, 300);
});

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        sendBtn.click();
    }
});

inputEl.addEventListener('input', handleUserTyping);

// 入力フィールドからフォーカスが外れた時に会話再開
inputEl.addEventListener('blur', resumeConversation);

// 入力フィールドが空になった時に会話再開
inputEl.addEventListener('input', (e) => {
    if (e.target.value.trim() === '') {
        resumeConversation();
    }
});

themeEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !running) {
        startConversation();
    }
});

const startBtn = document.createElement('button');
startBtn.textContent = '会話開始';
startBtn.style.cssText = 'margin-left: 8px; padding: 8px 12px; border: none; border-radius: 6px; background: #2e7d32; color: white; font-weight: 600; cursor: pointer;';
startBtn.addEventListener('click', startConversation);
themeEl.parentNode.appendChild(startBtn);

const pauseBtn = document.createElement('button');
pauseBtn.id = 'pauseBtn';
pauseBtn.textContent = '一時停止';
pauseBtn.style.cssText = 'margin-left: 8px; padding: 8px 12px; border: none; border-radius: 6px; background: #f57c00; color: white; font-weight: 600; cursor: pointer; display: none;';
pauseBtn.addEventListener('click', togglePause);
themeEl.parentNode.appendChild(pauseBtn);

checkEnv();
appendMessage('system', 'テーマを入力して「会話開始」ボタンを押すか、テーマ入力後にEnterを押してください。会話中は「一時停止」ボタンで会話を制御できます。');