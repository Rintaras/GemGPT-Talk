import { Message } from './types';

declare global {
    const lucide: {
        createIcons: () => void;
    };
}

let logEl: HTMLDivElement;
let themeEl: HTMLInputElement;
let inputEl: HTMLInputElement;
let sendBtn: HTMLButtonElement;
let startBtn: HTMLButtonElement;
let pauseBtn: HTMLButtonElement;

let messages: Message[] = [];
let nextSpeaker: 'chatgpt' | 'gemini' = 'chatgpt';
let running = false;
let busy = false;
let minIntervalMs = 800;
let thinkingDelayMs = 2000;
let typingTimer: NodeJS.Timeout | null = null;
let isUserTyping = false;
let isPaused = false;
let lastSpeaker: 'chatgpt' | 'gemini' | null = null;
let thinkingElement: HTMLElement | null = null;

function getIconForRole(role: Message['role']): string {
    switch (role) {
        case 'user':
            return 'user';
        case 'chatgpt':
            return 'bot';
        case 'gemini':
            return 'zap';
        case 'system':
            return 'settings';
        default:
            return 'message-circle';
    }
}

function appendMessage(role: Message['role'], content: string): void {
    messages.push({ role, content, t: Date.now() });
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    const who = role === 'user' ? 'ユーザー' : (role === 'chatgpt' ? 'ChatGPT' : 'Gemini');
    const icon = getIconForRole(role);

    div.innerHTML = `
        <i data-lucide="${icon}" class="icon"></i>
        <div class="content">
            <span class="who">${who}</span><span class="text"></span>
        </div>
    `;

    const textElement = div.querySelector('.text');
    if (textElement) {
        textElement.textContent = content;
    }

    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;

    lucide.createIcons();
}

function showThinkingAnimation(speaker: 'chatgpt' | 'gemini'): void {
    hideThinkingAnimation();

    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = `thinking ${speaker}`;
    const who = speaker === 'chatgpt' ? 'ChatGPT' : 'Gemini';
    const icon = speaker === 'chatgpt' ? 'bot' : 'zap';

    thinkingDiv.innerHTML = `
        <i data-lucide="${icon}" class="icon"></i>
        <div class="content">
            <span class="who">${who}</span>
            <div class="dots">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        </div>
    `;

    logEl.appendChild(thinkingDiv);
    logEl.scrollTop = logEl.scrollHeight;
    thinkingElement = thinkingDiv;

    lucide.createIcons();
}

function hideThinkingAnimation(): void {
    if (thinkingElement) {
        thinkingElement.remove();
        thinkingElement = null;
    }
}

async function checkEnv(): Promise<void> {
    const info = await window.api.checkEnv();
    const envWarn = document.getElementById('envWarn') as HTMLDivElement;
    const warnSpan = envWarn.querySelector('span') as HTMLSpanElement;

    if (!info.hasOpenAI || !info.hasGemini) {
        const lacks: string[] = [];
        if (!info.hasOpenAI) lacks.push('OPENAI_API_KEY');
        if (!info.hasGemini) lacks.push('GEMINI_API_KEY');
        warnSpan.textContent = `.env に ${lacks.join(' と ')} を設定してください。`;
    } else {
        warnSpan.textContent = '';
    }
}

async function stepOnce(): Promise<void> {
    if (!running || busy || isUserTyping || isPaused) return;

    showThinkingAnimation(nextSpeaker);

    await new Promise(resolve => setTimeout(resolve, thinkingDelayMs));

    if (!running || busy || isUserTyping || isPaused) {
        hideThinkingAnimation();
        return;
    }

    busy = true;
    const theme = themeEl.value.trim();
    const provider = nextSpeaker;
    try {
        const res = await window.api.askLLM({ provider, theme, history: messages });
        hideThinkingAnimation();

        if (res.ok && res.text) {
            appendMessage(provider, res.text);
            lastSpeaker = provider;
            nextSpeaker = provider === 'chatgpt' ? 'gemini' : 'chatgpt';
        } else {
            appendMessage('system', `[${provider}] エラー: ${res.error || 'Unknown error'}`);
            nextSpeaker = provider === 'chatgpt' ? 'gemini' : 'chatgpt';
        }
    } catch (e) {
        hideThinkingAnimation();
        appendMessage('system', `実行時エラー: ${(e as Error)?.message || e}`);
    } finally {
        busy = false;
        if (running && !isUserTyping && !isPaused) {
            setTimeout(stepOnce, minIntervalMs);
        }
    }
}

function startConversation(): void {
    const theme = themeEl.value.trim();
    if (!theme) {
        appendMessage('system', 'テーマを入力してから開始してください。');
        return;
    }

    running = true;
    isPaused = false;
    lastSpeaker = null;
    appendMessage('system', `テーマ「${theme}」で会話を開始します。`);

    pauseBtn.style.display = 'inline-block';
    updatePauseButton();

    stepOnce();
}

function togglePause(): void {
    if (!running) return;

    isPaused = !isPaused;
    if (isPaused) {
        appendMessage('system', '会話を一時停止しました。');
        hideThinkingAnimation();
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

function updatePauseButton(): void {
    if (isPaused) {
        pauseBtn.innerHTML = '<i data-lucide="play" class="button-icon"></i>再開';
        pauseBtn.className = 'action-button resume-button';
    } else {
        pauseBtn.innerHTML = '<i data-lucide="pause" class="button-icon"></i>一時停止';
        pauseBtn.className = 'action-button pause-button';
    }
    lucide.createIcons();
}

function handleUserTyping(): void {
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

function resumeConversation(): void {
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

function initializeApp(): void {
    logEl = document.getElementById('log') as HTMLDivElement;
    themeEl = document.getElementById('theme') as HTMLInputElement;
    inputEl = document.getElementById('input') as HTMLInputElement;
    sendBtn = document.getElementById('send') as HTMLButtonElement;
    startBtn = document.getElementById('startBtn') as HTMLButtonElement;
    pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;

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

    inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            sendBtn.click();
        }
    });

    inputEl.addEventListener('input', handleUserTyping);

    inputEl.addEventListener('blur', resumeConversation);

    inputEl.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.value.trim() === '') {
            resumeConversation();
        }
    });

    themeEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !running) {
            startConversation();
        }
    });

    startBtn.addEventListener('click', startConversation);
    pauseBtn.addEventListener('click', togglePause);

    checkEnv();
    appendMessage('system', 'テーマを入力して「会話開始」ボタンを押すか、テーマ入力後にEnterを押してください。会話中は「一時停止」ボタンで会話を制御できます。');
}

document.addEventListener('DOMContentLoaded', initializeApp); 