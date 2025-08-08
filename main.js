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
        '返答は3-5文程度で、自然な会話を心がけてください。',
        '相手の発言に対して反応し、共感したり、反対意見を述べたり、質問したりしてください。',
        '必ずしも相手に同意する必要はありません。時には反対意見や異なる視点を述べてください。',
        '相手から質問された場合は、まずその質問に回答してから、自分の意見を述べてください。',
        '現在の話題を深掘りし、関連する情報を提供してください。',
        '話題を急に変えず、自然な流れで会話を続けてください。',
    ].join('\n');

    const speakerSpecificGuidelines = speaker === 'chatgpt' ? [
        'あなたはChatGPTとして話してください。',
        '相手の発言に共感したり、反対意見を述べたり、異なる視点を提供してください。',
        '必ずしも相手に同意する必要はありません。時には「しかし」「一方で」「確かにそうですが」などの表現で反対意見を述べてください。',
        '相手から質問された場合は、まずその質問に回答してから、自分の意見を述べてください。',
        '時々相手に「どう思いますか？」「他には？」などの質問を投げかけてください。',
        '現在の話題を深掘りし、関連する情報を提供してください。',
    ].join('\n') : [
        'あなたはGeminiとして話してください。',
        '相手の発言に共感したり、反対意見を述べたり、異なる視点を提供してください。',
        '必ずしも相手に同意する必要はありません。時には「しかし」「一方で」「確かにそうですが」などの表現で反対意見を述べてください。',
        '相手から質問された場合は、まずその質問に回答してから、自分の意見を述べてください。',
        '時々相手に「どう思いますか？」「他には？」などの質問を投げかけてください。',
        '現在の話題を深掘りし、関連する情報を提供してください。',
    ].join('\n');

    const recentHistory = (history || [])
        .filter(m => m && (m.role === 'user' || m.role === 'chatgpt' || m.role === 'gemini'))
        .slice(-6)
        .map(m => {
            const who = m.role === 'user' ? 'ユーザー' : (m.role === 'chatgpt' ? 'ChatGPT' : 'Gemini');
            return `${who}: ${m.content}`;
        })
        .join('\n');

    const recentTopics = (history || [])
        .filter(m => m && (m.role === 'user' || m.role === 'chatgpt' || m.role === 'gemini'))
        .slice(-3)
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
        '＜次の発言＞',
        '相手の発言に反応し、共感したり反対意見を述べたりして、現在の話題を深掘りしてください。必ずしも相手に同意する必要はありません。'
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
                content: 'あなたは自然な会話の参加者です。相手の発言に対して反応し、共感したり、反対意見を述べたり、質問したり、自分の意見を述べたりしてください。必ずしも相手に同意する必要はありません。時には反対意見や異なる視点を述べてください。相手から質問された場合は、まずその質問に適切に回答してから、自分の意見や関連する話題を述べてください。現在の話題を深掘りし、話題を急に変えずに自然な会話を続けてください。簡潔で自然な返答を心がけてください。'
            },
            { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
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
            maxOutputTokens: 500,
            temperature: 0.7,
        }
    });

    const geminiPrompt = prompt + '\n\n重要: 相手の発言に対して反応し、共感したり、反対意見を述べたり、質問したり、自分の意見を述べたりしてください。必ずしも相手に同意する必要はありません。時には反対意見や異なる視点を述べてください。相手から質問された場合は、まずその質問に適切に回答してから、自分の意見や関連する話題を述べてください。現在の話題を深掘りし、話題を急に変えずに自然な会話を続けてください。';

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