const MAX_AI_RESPONSE_BYTES = 2 * 1024 * 1024;
const AI_REQUEST_TIMEOUT_MS = 120000;

function stripMarkdownFences(raw: string): string {
    if (typeof raw !== 'string') return raw;
    return raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
}

export interface UniversalAIConfig {
    apiKey: string;
    provider?: string;
    modelName?: string;
    baseUrl?: string;
    apiVersion?: string;
}

export interface VisionImage {
    mimeType: string;
    base64Data: string;
}

export class UniversalAIAdapter {
    apiKey: string;
    provider: string;
    modelName: string;
    baseUrl: string;
    apiVersion?: string;

    constructor(config: UniversalAIConfig) {
        if (!config.apiKey) throw new Error("API Key is required for BYOK Adapter");

        this.apiKey = config.apiKey;
        this.provider = (config.provider || 'openai').toLowerCase();
        
        // Set default models per provider if not specified
        if (config.modelName) {
            this.modelName = config.modelName;
        } else if (this.provider === 'google') {
            this.modelName = 'gemini-2.5-flash';
        } else if (this.provider === 'groq') {
            this.modelName = 'llama-3.2-90b-vision-preview';
        } else if (this.provider === 'anthropic') {
            this.modelName = 'claude-3-5-sonnet-20241022';
        } else {
            this.modelName = 'gpt-4o';
        }

        if (config.apiVersion) {
            this.apiVersion = config.apiVersion;
        }

        if (config.baseUrl) {
            this.baseUrl = config.baseUrl;
        } else {
            const urlMap: Record<string, string> = {
                openai:      'https://api.openai.com/v1/chat/completions',
                anthropic:   'https://api.anthropic.com/v1/messages',
                google:      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelName)}:generateContent`,
                cohere:      'https://api.cohere.ai/v2/chat',
                huggingface: `https://api-inference.huggingface.co/models/${this.modelName}`,
                xai:         'https://api.x.ai/v1/chat/completions',
                groq:        'https://api.groq.com/openai/v1/chat/completions',
                deepseek:    'https://api.deepseek.com/v1/chat/completions',
                mistral:     'https://api.mistral.ai/v1/chat/completions',
                perplexity:  'https://api.perplexity.ai/chat/completions',
                together:    'https://api.together.xyz/v1/chat/completions',
                openrouter:  'https://openrouter.ai/api/v1/chat/completions',
            };
            this.baseUrl = urlMap[this.provider] || urlMap['openai'];
        }
    }

    async _fetch(url: string, options: RequestInit) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            return response;
        } finally {
            clearTimeout(timeout);
        }
    }

    async chat(systemPrompt: string, userPrompt: string, images: VisionImage[] = []): Promise<string> {
        const openaiCompatible = [
            'openai', 'groq', 'deepseek', 'mistral', 'perplexity',
            'together', 'openrouter', 'ollama', 'local', 'xai'
        ];

        if (openaiCompatible.includes(this.provider)) {
            return this._chatOpenAICompatible(systemPrompt, userPrompt, images);
        } else if (this.provider === 'google') {
            return this._chatGoogle(systemPrompt, userPrompt, images);
        } else if (this.provider === 'anthropic') {
            return this._chatAnthropic(systemPrompt, userPrompt, images);
        } else {
            return this._chatOpenAICompatible(systemPrompt, userPrompt, images);
        }
    }

    async _chatOpenAICompatible(systemPrompt: string, userPrompt: string, images: VisionImage[]) {
        const headers: Record<string, string> = { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
        };

        const userContent: any[] = [{ type: "text", text: userPrompt }];
        for (const img of images) {
            userContent.push({
                type: "image_url",
                image_url: { url: `data:${img.mimeType};base64,${img.base64Data}` }
            });
        }

        const messages = [];
        if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
        messages.push({ role: "user", content: userContent });

        const payload: any = {
            model: this.modelName,
            messages,
            response_format: { type: "json_object" },
            temperature: 0.1
        };

        const response = await this._fetch(this.baseUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`${this.provider} API Error: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error('No extraction returned');
        
        return stripMarkdownFences(content);
    }

    async _chatGoogle(systemPrompt: string, userPrompt: string, images: VisionImage[]) {
        const modelsToTry = [this.modelName, 'gemini-2.5-flash', 'gemini-2.0-flash'];
        const uniqueModels = Array.from(new Set(modelsToTry));

        for (let i = 0; i < uniqueModels.length; i++) {
            const modelToTry = uniqueModels[i];
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToTry)}:generateContent`;
            
            const headers: Record<string, string> = { 
                "Content-Type": "application/json",
                "x-goog-api-key": this.apiKey
            };

            const userParts: any[] = [{ text: userPrompt }];
            for (const img of images) {
                userParts.push({
                    inlineData: { mimeType: img.mimeType, data: img.base64Data }
                });
            }

            const payload: any = {
                contents: [{ role: "user", parts: userParts }],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.1
                }
            };

            if (systemPrompt) {
                payload.systemInstruction = {
                    parts: [{ text: systemPrompt }]
                };
            }

            const response = await this._fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
            if (!response.ok) {
                const errBody = await response.text().catch(() => '');
                // Try fallback on 5xx or 404 (model not found)
                if ((response.status >= 500 || response.status === 404) && i < uniqueModels.length - 1) {
                    console.warn(`Google API Error with ${modelToTry}: ${response.status}. Trying fallback...`);
                    continue;
                }
                throw new Error(`Google API Error: ${response.status} - ${errBody}`);
            }

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (typeof text !== 'string') {
                if (i < uniqueModels.length - 1) continue;
                throw new Error('No extraction returned');
            }
            
            return stripMarkdownFences(text);
        }
        
        throw new Error('All fallback models failed');
    }

    async _chatAnthropic(systemPrompt: string, userPrompt: string, images: VisionImage[]) {
        const headers = {
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        };

        const userContent: any[] = [];
        for (const img of images) {
            userContent.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: img.mimeType,
                    data: img.base64Data
                }
            });
        }
        userContent.push({ type: "text", text: userPrompt });

        const payload: any = {
            model: this.modelName,
            max_tokens: 4096,
            messages: [{ role: "user", content: userContent }],
            temperature: 0.1
        };

        if (systemPrompt) payload.system = systemPrompt;

        const response = await this._fetch(this.baseUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`Anthropic API Error: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        const rawText = data?.content?.[0]?.text;
        if (typeof rawText !== 'string') throw new Error('No extraction returned');
        
        return stripMarkdownFences(rawText);
    }
}
