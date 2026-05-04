# AI Analysis Setup

## Overview

HowSus supports optional AI analysis using OpenAI or Google Gemini. The AI provides:
- A confidence score (0–100)
- Story validity assessment (likely_valid / uncertain / likely_false)
- A validity reason (1–2 sentences)
- A narrative summary (3–4 sentences)

## Setup

1. Click **"Add AI Key"** in the header
2. Paste your API key
3. Select the provider (or leave on "Auto" for automatic detection)
4. Click "Save" — the key is stored in browser session memory only

## Supported Providers

### OpenAI
- Key format: `sk-...`
- Default model: `gpt-4o-mini`
- [Get an API key](https://platform.openai.com/api-keys)

### Google Gemini
- Key format: `AIza...`
- Default model: `gemini-1.5-flash`
- [Get an API key](https://aistudio.google.com/app/apikey)

## Privacy

- Your API key is stored **only in browser session memory** — it's gone when you close the tab
- The key is **never** sent to HowSus servers (there are none)
- For URLs: the URL is sent to the AI
- For text: the first 600 characters are sent
- For images: only the file name is sent (not the image data)

## Custom Models

You can override the default model in the AI settings modal. Examples:
- OpenAI: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`
- Google: `gemini-1.0-pro`, `gemini-1.5-pro`

## Cost

AI analysis is billed to your account at the API provider's standard rates. `gpt-4o-mini` and `gemini-1.5-flash` are the most cost-effective options.
