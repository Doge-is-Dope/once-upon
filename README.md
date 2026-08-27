# Can You Be Me?

Two friends team up to fool an AI Detective. One secretly becomes the **Mirror** and tries to answer like the other. Can the AI tell who is copying whom?

[Play the game](https://can-you-be-me.clement-liang.chatgpt.site)

## Play

Bring two players, two phones, and a shared screen with an AI client that can use WebMCP. The phones can use regular browsers.

1. Open the game with your AI client and say **“Let’s play.”** The AI opens a room and shows a QR code.
2. Scan it on both phones, choose stickers, and tap **I’m ready**. Answer five questions honestly, then check your secret roles.
3. Across four rounds, the **Original** answers as themselves while the **Mirror** predicts their answers. If the Detective accuses the Original, both players win. If it catches the Mirror, the AI wins.

Through WebMCP, the AI writes the questions, follows revealed answers, and makes its accusation. Private roles and answers stay hidden until their reveal.

You can also choose **Start a game** yourself, then ask the AI to play.

## Run locally

Requires Node.js, pnpm, and your own Supabase project. See [package.json](package.json) for supported versions.

1. Install dependencies and copy the environment template:

   ```bash
   pnpm install --frozen-lockfile
   cp .env.example .env.local
   ```

   Fill in your project's URL and **publishable key**. Never use a secret or service-role key in browser variables.

2. Enable [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous) in Supabase, then apply migrations to your development project:

   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref YOUR_PROJECT_REF
   pnpm exec supabase db push
   ```

   Add `api` to the project's [exposed schemas](https://supabase.com/docs/guides/api/using-custom-schemas). Keep `private` unexposed; the migrations already configure permissions.

3. Start the app:

   ```bash
   pnpm run dev
   ```

   Open the URL printed in the terminal. For a game on physical phones, use an HTTPS deployment all devices can reach; `localhost` QR links only work on the host computer.

## Checks and contributing

```bash
pnpm run verify
pnpm exec playwright install chromium webkit # First-time browser setup
pnpm run test:e2e
```

`verify` runs lint, unit tests, and a production build. Browser tests cover the shared screen and phone UI.

See [architecture](docs/architecture.md), [WebMCP tools](docs/webmcp.md), [security](docs/security.md), and [QA](docs/qa.md) for implementation details and remaining manual checks.

## License

[MIT](LICENSE).
