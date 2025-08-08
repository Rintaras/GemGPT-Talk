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
let thinkingElement = null;
let themeTypingTimer = null;
let isThemeTyping = false;
let autoPauseTimer = null;
let lastActivityTime = Date.now();
const AUTO_PAUSE_DELAY = 30000;

function updateActivityTime() {
    lastActivityTime = Date.now();
    resetAutoPauseTimer();
}

function resetAutoPauseTimer() {
    if (autoPauseTimer) {
        clearTimeout(autoPauseTimer);
    }

    if (running && !isPaused) {
        autoPauseTimer = setTimeout(() => {
            if (running && !isPaused) {
                isPaused = true;
                appendMessage('system', '30秒間アクティビティがなかったため、会話を一時停止しました。コスト削減のため、新しいメッセージを送信するか「再開」ボタンを押してください。');
                updatePauseButton();
            }
        }, AUTO_PAUSE_DELAY);
    }
}

function appendMessage(role, content) {
    messages.push({ role, content, t: Date.now() });

    updateActivityTime();

    const div = document.createElement('div');
    div.className = `msg ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';

    if (role === 'user') {
        const img = document.createElement('img');
        img.src = 'https://kotonohaworks.com/free-icons/wp-content/uploads/kkrn_icon_user_1.png';
        img.alt = 'User';
        avatar.appendChild(img);
        contentDiv.textContent = content;
    } else if (role === 'chatgpt') {
        const img = document.createElement('img');
        img.src = 'https://chat-cpt-app.vercel.app/_next/image?url=https%3A%2F%2Fuploads-ssl.webflow.com%2F621396eaae0610d2e24c450e%2F63d01548c5b3156b13a40e1f_ChatGPT-Feature-1200x900.png&w=640&q=75';
        img.alt = 'ChatGPT';
        avatar.appendChild(img);
        const who = document.createElement('div');
        who.className = 'who';
        who.textContent = 'ChatGPT';
        contentDiv.appendChild(who);
        const text = document.createElement('div');
        text.textContent = content;
        contentDiv.appendChild(text);
    } else if (role === 'gemini') {
        const img = document.createElement('img');
        img.src = 'https://play-lh.googleusercontent.com/bTpNtZ6rYYX2SeI-wC4cnr7MJnOh2hjtgYu3UIrSxE09lM3GPl_Uhf9_Ih2Smje2bc0V=w240-h480-rw';
        img.alt = 'Gemini';
        avatar.appendChild(img);
        const who = document.createElement('div');
        who.className = 'who';
        who.textContent = 'Gemini';
        contentDiv.appendChild(who);
        const text = document.createElement('div');
        text.textContent = content;
        contentDiv.appendChild(text);
    } else if (role === 'system') {
        div.className = 'system-msg';
        div.textContent = content;
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
        return;
    }

    div.appendChild(avatar);
    div.appendChild(contentDiv);
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

function showThinking(speaker) {
    const div = document.createElement('div');
    div.className = `msg ${speaker}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';

    const img = document.createElement('img');
    if (speaker === 'chatgpt') {
        img.src = 'https://chat-cpt-app.vercel.app/_next/image?url=https%3A%2F%2Fuploads-ssl.webflow.com%2F621396eaae0610d2e24c450e%2F63d01548c5b3156b13a40e1f_ChatGPT-Feature-1200x900.png&w=640&q=75';
        img.alt = 'ChatGPT';
    } else {
        img.src = 'https://play-lh.googleusercontent.com/bTpNtZ6rYYX2SeI-wC4cnr7MJnOh2hjtgYu3UIrSxE09lM3GPl_Uhf9_Ih2Smje2bc0V=w240-h480-rw';
        img.alt = 'Gemini';
    }
    avatar.appendChild(img);

    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'thinking';

    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = speaker === 'chatgpt' ? 'ChatGPT' : 'Gemini';

    const dots = document.createElement('div');
    dots.className = 'dots';
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot';
        dots.appendChild(dot);
    }

    thinkingDiv.appendChild(who);
    thinkingDiv.appendChild(dots);

    div.appendChild(avatar);
    div.appendChild(thinkingDiv);
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;

    thinkingElement = div;
}

function hideThinking() {
    if (thinkingElement) {
        thinkingElement.remove();
        thinkingElement = null;
    }
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
    if (!running || busy || isUserTyping || isThemeTyping || isPaused) return;
    busy = true;
    const theme = themeEl.value.trim();
    const provider = nextSpeaker;

    await new Promise(resolve => setTimeout(resolve, 2000));

    showThinking(provider);

    try {
        const res = await window.api.askLLM({ provider, theme, history: messages });

        hideThinking();

        if (res.ok) {
            appendMessage(provider, res.text);
            lastSpeaker = provider;
            nextSpeaker = provider === 'chatgpt' ? 'gemini' : 'chatgpt';
        } else {
            appendMessage('system', `[${provider}] エラー: ${res.error}`);
            nextSpeaker = provider === 'chatgpt' ? 'gemini' : 'chatgpt';
        }
    } catch (e) {
        hideThinking();
        appendMessage('system', `実行時エラー: ${e?.message || e}`);
    } finally {
        busy = false;
        if (running && !isUserTyping && !isThemeTyping && !isPaused) {
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
        pauseBtn.style.display = 'inline-flex';
        updatePauseButton();
    }

    resetAutoPauseTimer();

    stepOnce();
}

function togglePause() {
    if (!running) return;

    isPaused = !isPaused;
    if (isPaused) {
        appendMessage('system', '会話を一時停止しました。');
        hideThinking();
        if (autoPauseTimer) {
            clearTimeout(autoPauseTimer);
            autoPauseTimer = null;
        }
    } else {
        appendMessage('system', '会話を再開しました。');
        if (lastSpeaker) {
            nextSpeaker = lastSpeaker === 'chatgpt' ? 'gemini' : 'chatgpt';
        }
        resetAutoPauseTimer();
        if (!busy && !isUserTyping && !isThemeTyping) {
            setTimeout(stepOnce, 300);
        }
    }
    updatePauseButton();
}

function updatePauseButton() {
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        if (isPaused) {
            pauseBtn.innerHTML = '<i data-lucide="play"></i>';
            pauseBtn.className = 'control-btn resume-btn';
        } else {
            pauseBtn.innerHTML = '<i data-lucide="pause"></i>';
            pauseBtn.className = 'control-btn pause-btn';
        }
        lucide.createIcons();
    }
}

function handleUserTyping() {
    isUserTyping = true;

    if (typingTimer) {
        clearTimeout(typingTimer);
    }

    typingTimer = setTimeout(() => {
        isUserTyping = false;
        if (running && !busy && !isThemeTyping && !isPaused) {
            setTimeout(stepOnce, 500);
        }
    }, 1000);
}

function handleUserInput() {
    const text = inputEl.value.trim();
    if (!text) return;

    updateActivityTime();

    appendMessage('user', text);
    inputEl.value = '';

    if (isPaused) {
        isPaused = false;
        updatePauseButton();
        appendMessage('system', '会話を再開しました。');
    }

    setTimeout(() => {
        if (running && !busy && !isThemeTyping) {
            stepOnce();
        }
    }, 5000);
}

function handleThemeTyping() {
    isThemeTyping = true;
    updateActivityTime();

    if (themeTypingTimer) {
        clearTimeout(themeTypingTimer);
    }

    themeTypingTimer = setTimeout(() => {
        isThemeTyping = false;
        if (running && !busy && !isUserTyping && !isPaused) {
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
        if (running && !busy && !isThemeTyping && !isPaused) {
            setTimeout(stepOnce, 300);
        }
    }
}

sendBtn.addEventListener('click', handleUserInput);

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        handleUserInput();
    }
});

inputEl.addEventListener('input', handleUserTyping);

inputEl.addEventListener('blur', resumeConversation);

inputEl.addEventListener('input', (e) => {
    if (e.target.value.trim() === '') {
        resumeConversation();
    }
});

themeEl.addEventListener('input', handleThemeTyping);

themeEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !running) {
        startConversation();
    }
});

const controlButtons = document.querySelector('.control-buttons');

const startBtn = document.createElement('button');
startBtn.className = 'control-btn start-btn';
startBtn.innerHTML = '<i data-lucide="play"></i>';
startBtn.addEventListener('click', startConversation);
controlButtons.appendChild(startBtn);

const pauseBtn = document.createElement('button');
pauseBtn.id = 'pauseBtn';
pauseBtn.className = 'control-btn pause-btn';
pauseBtn.innerHTML = '<i data-lucide="pause"></i>';
pauseBtn.addEventListener('click', togglePause);
pauseBtn.style.display = 'none';
controlButtons.appendChild(pauseBtn);

lucide.createIcons();

checkEnv();
appendMessage('system', 'テーマを入力して「会話開始」ボタンを押すか、テーマ入力後にEnterを押してください。会話中は「一時停止」ボタンで会話を制御できます。いつでも下部の入力欄から会話に参加できます。');