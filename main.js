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

    const baseGuidelines = [
        'あなたは自然な会話の参加者です。',
        '常に現在のテーマに沿って会話を続けてください。',
        'テーマが途中で変わったら、流れを壊さず自然に話題を切り替えてください。',
        '返答は簡潔に（1-2文程度）。',
        '他の参加者の発言を引用したり、名前を呼んだりしないでください。',
        '自分の意見や考えを直接述べてください。',
        '会話の流れを自然に続けてください。',
        '同じ話題を繰り返さず、新しい視点や関連する話題を提供してください。',
        '話題を広げ、多角的な観点からテーマを深掘りしてください。',
        '前の発言と重複しない新しい情報や観点を述べてください。',
    ].join('\n');

    const speakerSpecificGuidelines = speaker === 'chatgpt' ? [
        'あなたはChatGPTとして話してください。',
        'Geminiの発言を引用したり、Geminiの名前を呼んだりしないでください。',
        '自分の意見を直接述べてください。',
        '「Gemini:」や「Geminiが言ったように」などの表現は使わないでください。',
        '新しい視点や関連する話題を積極的に提供してください。',
        '話題を広げ、多角的な観点からテーマを深掘りしてください。',
    ].join('\n') : [
        'あなたはGeminiとして話してください。',
        'ChatGPTの発言を引用したり、ChatGPTの名前を呼んだりしないでください。',
        '自分の意見を直接述べてください。',
        '「ChatGPT:」や「ChatGPTが言ったように」などの表現は使わないでください。',
        '新しい視点や関連する話題を積極的に提供してください。',
        '話題を広げ、多角的な観点からテーマを深掘りしてください。',
    ].join('\n');

    const recentHistory = (history || [])
        .filter(m => m && (m.role === 'user' || m.role === 'chatgpt' || m.role === 'gemini'))
        .slice(-6) // 履歴を短くして重複を避ける
        .map(m => {
            const who = m.role === 'user' ? 'ユーザー' : (m.role === 'chatgpt' ? 'ChatGPT' : 'Gemini');
            return `${who}: ${m.content}`;
        })
        .join('\n');

    // 最近の話題を分析して重複を避ける
    const recentTopics = (history || [])
        .filter(m => m && (m.role === 'user' || m.role === 'chatgpt' || m.role === 'gemini'))
        .slice(-4)
        .map(m => m.content)
        .join(' ');

    return [
        themeLine,
        '',
        '＜基本ルール＞',
        baseGuidelines,
        '',
        '＜あなたの役割＞',
        speakerSpecificGuidelines,
        '',
        '＜最近の会話＞',
        recentHistory,
        '',
        '＜注意事項＞',
        '最近の話題: ' + recentTopics,
        '上記の話題と重複しない新しい視点や関連する話題を提供してください。',
        '',
        '＜あなたの次の発言（新しい視点や関連する話題を提供してください）＞'
    ].join('\n');
}

async function askChatGPT({ theme, history }) {
    if (!openai) {
        throw new Error('OPENAI_API_KEY が設定されていません (.env)。');
    }
    const prompt = buildPrompt({ theme, history, speaker: 'chatgpt' });
    const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            {
                role: 'system',
                content: 'あなたは自然な会話の参加者です。他の参加者の発言を引用したり、名前を呼んだりせず、自分の意見を直接述べてください。同じ話題を繰り返さず、新しい視点や関連する話題を提供してください。簡潔で自然な返答を心がけてください。'
            },
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

    // Gemini用の追加プロンプト
    const geminiPrompt = prompt + '\n\n重要: 他の参加者の発言を引用したり、名前を呼んだりせず、自分の意見を直接述べてください。同じ話題を繰り返さず、新しい視点や関連する話題を提供してください。';

    try {
        const result = await model.generateContent(geminiPrompt);
        const text = await result.response.text();
        return (text || '').trim();
    } catch (error) {
        if (error.message && error.message.includes('429')) {
            return '申し訳ございません。Geminiの利用制限に達しました。しばらく時間をおいてからお試しください。';
        }

        if (error.message && error.message.includes('quota')) {
            return 'Geminiの無料枠の制限に達しました。有料プランへのアップグレードをご検討ください。';
        }

        throw error;
    }
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