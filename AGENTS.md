# 映词 development

- This is a separate project. Do not modify FrameVault or copy its private data.
- Keep the default bind address at 127.0.0.1. This is a single-user local app, not a multi-user hosted service.
- Never commit .env, .local, API keys, user references, or exported conversations.
- Example mode is explicitly scripted. Never present it as actual model inference.
- Preserve locked fields on the server, then compose prompts from the validated fields.
- Keep provider calls on the server. Never send an API key to browser JavaScript.
- Before committing, run npm run check and npm test. Real-provider behavior needs separate live verification; a mocked provider is not proof of live model quality.
- Do not add scheduled maintenance. Work only when requested.
