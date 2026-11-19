import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '2mb' }));

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403') || lower.includes('401')) {
    return {
      status: 403,
      message: 'Gemini API key is missing or invalid. Please check your GEMINI_API_KEY in the Settings > Secrets panel.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 429,
      message: 'Gemini API rate limit or quota exceeded. Please wait a moment and try again, or verify your billing quota in Settings > Secrets.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 502,
      message: 'The configured AI model was not found or is currently unavailable.',
    };
  }
  return {
    status: 500,
    message: `Unable to generate AI insights right now: ${raw}`,
  };
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      const isTransient = msg.includes('429') || msg.includes('503') || msg.includes('500') || msg.includes('unavailable');
      if (!isTransient || attempt === retries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

app.post('/api/insights', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured. Add your key in the Settings > Secrets panel to enable AI-generated insights.',
    });
    return;
  }

  const { datasetName, statisticalProfile, activeFiltersSummary } = req.body ?? {};
  if (!statisticalProfile || typeof statisticalProfile !== 'object') {
    res.status(400).json({ error: 'Invalid request: statisticalProfile is required.' });
    return;
  }

  try {
    const prompt = [
      `Dataset name: ${typeof datasetName === 'string' ? datasetName : 'Uploaded CSV'}`,
      `Active filters: ${typeof activeFiltersSummary === 'string' && activeFiltersSummary ? activeFiltersSummary : 'None (full dataset)'}`,
      '',
      'Verified statistical profile computed directly from the active rows:',
      JSON.stringify(statisticalProfile, null, 2),
      '',
      'Generate 4 to 6 high-value, plain-English insights based strictly on the numbers above.',
      'Rules:',
      '1. Write for beginners and non-technical decision-makers in clear, concrete language.',
      '2. Every claim MUST cite exact numbers, percentages, dates, or counts from the statistical profile.',
      '3. Never fabricate metrics, extrapolations, or hidden causes.',
      '4. Never confuse correlation or observed differences with causation.',
      '5. If data has missing values, small sample size, or short timeframe, note that in the caveat.',
    ].join('\n');

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are a careful, transparent senior data analyst explaining dataset findings to non-technical users. Ground every statement in the exact pre-computed statistics provided. Distinguish observed association from causation.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: {
                type: Type.STRING,
                description: 'A 2 to 3 sentence plain-language summary of the most important findings in the current view, citing exact figures.',
              },
              insights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: {
                      type: Type.STRING,
                      description: 'Short, clear headline summarizing the finding.',
                    },
                    category: {
                      type: Type.STRING,
                      description: 'One of: Trend, Concentration, Outlier, Relationship, Data Quality.',
                    },
                    explanation: {
                      type: Type.STRING,
                      description: 'Simple, jargon-free explanation of what the pattern shows and why it matters for decisions.',
                    },
                    evidence: {
                      type: Type.STRING,
                      description: 'Exact calculated numbers, counts, averages, or percentages supporting this finding.',
                    },
                    caveat: {
                      type: Type.STRING,
                      description: 'Honest limitation or correlation-vs-causation note.',
                    },
                  },
                  required: ['title', 'category', 'explanation', 'evidence', 'caveat'],
                },
              },
              suggestedQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Three practical follow-up questions a user could ask about this dataset.',
              },
            },
            required: ['executiveSummary', 'insights', 'suggestedQuestions'],
          },
        },
      })
    );

    const text = (response.text ?? '').trim();
    if (!text) {
      res.status(502).json({ error: 'The AI model returned an empty response. Please try again.' });
      return;
    }

    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err) {
    const mapped = mapGeminiError(err);
    res.status(mapped.status).json({ error: mapped.message });
  }
});

app.post('/api/ask', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured. Add your key in the Settings > Secrets panel to ask AI questions.',
    });
    return;
  }

  const { question, datasetName, statisticalProfile, activeFiltersSummary } = req.body ?? {};
  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'Please enter a question to ask about the dataset.' });
    return;
  }
  if (!statisticalProfile || typeof statisticalProfile !== 'object') {
    res.status(400).json({ error: 'Dataset statistical profile is missing.' });
    return;
  }

  try {
    const prompt = [
      `Dataset: ${typeof datasetName === 'string' ? datasetName : 'Uploaded CSV'}`,
      `Active filters: ${typeof activeFiltersSummary === 'string' && activeFiltersSummary ? activeFiltersSummary : 'None (full dataset)'}`,
      `User question: ${question.trim()}`,
      '',
      'Verified statistical profile computed from the currently filtered rows:',
      JSON.stringify(statisticalProfile, null, 2),
      '',
      'Answer the question accurately in plain language using ONLY facts supported by the statistical profile.',
      'If the statistical profile does not contain enough detail to answer part of the question (for example, a specific row-level interaction not aggregated here), explicitly explain what can be answered from the metrics and what limitation remains.',
      'Never invent numbers or assume causation from correlation.',
    ].join('\n');

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are a rigorous data analyst answering a non-technical user question. Base every quantitative claim strictly on the supplied JSON metrics. Never fabricate values or imply causation without controlled evidence.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: {
                type: Type.STRING,
                description: 'Clear, direct plain-English answer to the user question.',
              },
              evidencePoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 to 4 concrete numerical evidence points from the statistical profile.',
              },
              limitationNote: {
                type: Type.STRING,
                description: 'Brief note on scope, missing data, correlation vs causation, or if filters are active.',
              },
            },
            required: ['answer', 'evidencePoints', 'limitationNote'],
          },
        },
      })
    );

    const text = (response.text ?? '').trim();
    if (!text) {
      res.status(502).json({ error: 'The AI model returned an empty response.' });
      return;
    }
    res.json(JSON.parse(text));
  } catch (err) {
    const mapped = mapGeminiError(err);
    res.status(mapped.status).json({ error: mapped.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClearSight Analytics server running at http://localhost:${PORT}`);
  });
}

startServer();
