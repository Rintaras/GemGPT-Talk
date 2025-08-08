require('dotenv/config');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const openaiApiKey = process.env.OPENAI_API_KEY || '';
const geminiApiKey = process.env.GEMINI_API_KEY || '';

const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

function buildPrompt({ theme, history, speaker }) {
    const themeLine = `現在のテーマ: ${theme || '（未設定）'}`;
    const guideline = [
        'あなたは対話参加者の一人です。',
        '常に現在のテーマに沿って自然に会話を続けてください。',
        'テーマが途中で変わったら、流れを壊さず自然に話題を切り替えてください。',
        '返答は簡潔に（1-2文程度）。',
    ].join('\n');

    const recentHistory = (history || [])
        .filter(m => m && (m.role === 'user' || m.role === 'chatgpt' || m.role === 'gemini'))
        .slice(-10)
        .map(m => {
            const who = m.role === 'user' ? 'ユーザー' : (m.role === 'chatgpt' ? 'ChatGPT' : 'Gemini');
            return `${who}: ${m.content}`;
        })
        .join('\n');

    const youAre = speaker === 'chatgpt' ? '（あなたはChatGPTとして話してください）' : '（あなたはGeminiとして話してください）';

    return [themeLine, guideline, youAre, '', '＜最近の会話＞', recentHistory, '', '＜あなたの次の発言＞'].join('\n');
}

async function askChatGPT({ theme, history }) {
    if (!openai) {
        throw new Error('OPENAI_API_KEY が設定されていません (.env)。');
    }
    const prompt = buildPrompt({ theme, history, speaker: 'chatgpt' });
    const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            { role: 'system', content: 'あなたは簡潔な会話パートナーです。' },
            { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 100,
    });
    return completion.choices?.[0]?.message?.content?.trim() || '';
}

async function askGemini({ theme, history }) {
    if (!genAI) {
        throw new Error('GEMINI_API_KEY が設定されていません (.env)。');
    }
    const prompt = buildPrompt({ theme, history, speaker: 'gemini' });

    const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.7,
        }
    });

    let lastError;
    for (let i = 0; i < 3; i++) {
        try {
            const result = await model.generateContent(prompt);
            const text = await result.response.text();
            return (text || '').trim();
        } catch (error) {
            lastError = error;
            if (i < 2) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    throw lastError;
}

function createWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('env:check', async () => {
    return {
        hasOpenAI: Boolean(openaiApiKey),
        hasGemini: Boolean(geminiApiKey),
    };
});

ipcMain.handle('llm:ask', async (_evt, { provider, theme, history }) => {
    try {
        if (provider === 'chatgpt') {
            const text = await askChatGPT({ theme, history });
            return { ok: true, text };
        }
        if (provider === 'gemini') {
            const text = await askGemini({ theme, history });
            return { ok: true, text };
        }
        return { ok: false, error: 'unknown provider' };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
});