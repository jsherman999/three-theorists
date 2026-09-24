# Three Theorists

Ask one question about consciousness and hear it answered, in plain language, by three schools of thought that disagree about where it comes from. Then let them respond to each other.

| Theorist | School | In one line | Draws on |
| --- | --- | --- | --- |
| **The Body Theorist** | Body & Homeostasis | Consciousness begins with feeling alive. | Antonio Damasio, Anil Seth, Mark Solms |
| **The Substrate Theorist** | The Physical Substrate | It's what you're made of, not what you run. | Giulio Tononi, Christof Koch (IIT), John Searle |
| **The Loop Theorist** | Sustained Recurrent Dynamics | Awareness is an echo that keeps going. | Victor Lamme, Bernard Baars, Stanislas Dehaene |

Each theorist is an LLM given a detailed brief on its school: the core claims, the evidence it leans on, honest caveats, and a stock of everyday examples. It's told to lead with a direct answer, explain with short everyday examples, define any jargon on the spot, and admit when its view is contested. The theorists are AI models voicing each school, not the scientists themselves.

## Using it

1. Open the page and choose **Connect a model**.
2. Pick a provider (Anthropic, OpenAI, Google Gemini or OpenRouter), paste your API key, and load that provider's models. The dropdown lists every chat model your key can use. Claude Opus 5 is preselected on Anthropic.
3. Ask a question, or start with one of the suggestions.

Other features:

- **Who answers:** switch any theorist off for a question.
- **Length:** Quick, Standard or Deep dive.
- **Level:** Curious adult, Explain like I'm 10, or I've read a bit.
- **Let them respond to each other:** each theorist reads the others' answers and says where they agree and where they'd push back.
- **Hear their story:** one theorist tells how their school came about and what would change its mind.
- **Follow-ups:** each theorist remembers its own recent conversation, up to the last 8 exchanges.
- **Copy transcript** exports the conversation as Markdown.

## Keys and privacy

There is no server. The page is static files, and the browser calls the provider directly.

- Your key is sent only to the provider you chose, in that provider's auth header.
- By default the key is kept in session storage, so it's forgotten when the tab closes. **Remember the key on this device** moves it to local storage instead. **Forget this key** removes it.
- A Content Security Policy limits the page's network access to `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com` and `openrouter.ai`, plus Google Fonts. Every network call is in [`js/providers.js`](js/providers.js).
- Model output is HTML-escaped before a small Markdown renderer formats it.
- The conversation is saved in this browser's local storage so a reload doesn't lose it. **Start over** clears it.

## Provider notes

- **Anthropic** accepts browser calls when the request carries `anthropic-dangerous-direct-browser-access: true`. The app sends it. The name is a warning for apps that ship their own key; here each visitor brings their own.
- **OpenAI** answers a rejected key on its chat endpoint without CORS headers, so the browser only sees a network error. The app then checks the key against `/v1/models` to show the real reason. If OpenAI won't stream a model for an unverified organization, the app asks for the whole answer at once instead.
- **OpenRouter** free models often allow only one request at a time. Rate-limited or overloaded answers are retried twice automatically. If they still fail, switch two theorists off or pick a paid model.
- **Gemma** models on Gemini don't accept system instructions, so the brief is folded into the first message.

## Development

No build step and no dependencies.

```bash
python3 -m http.server 8424
```

Then open http://localhost:8424.

Tests use Node's built-in runner. Pass the files explicitly:

```bash
node --test tests/providers.test.mjs tests/theorists.test.mjs
```

| File | What it holds |
| --- | --- |
| `js/theorists.js` | The three briefs, system prompt, rebuttal prompt, and per-theorist history |
| `js/providers.js` | Providers, key storage, model lists, streaming (SSE) and error messages |
| `js/app.js` | UI state, rendering, settings dialog |
| `js/markdown.js` | Escaping Markdown renderer |
| `js/emblems.js` | The three animated emblems |

## Deploying to GitHub Pages

The site is served straight from the repository root. In the repository's **Settings → Pages**, choose **Deploy from a branch**, then `main` and `/ (root)`. The `.nojekyll` file stops Pages from processing the files. After changing CSS or JS, bump the `?v=` query strings in `index.html` so browsers fetch the new files.
