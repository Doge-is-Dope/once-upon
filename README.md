# Can You Be Me?

Can an AI Detective catch the Mirror?

Can You Be Me? is a live, three-screen party game for one Host Board and two phones. Both players answer privately. One later becomes the **Original** and the other the **Mirror**, who must predict the Original. A compatible AI client acts as the Detective through ten page-level WebMCP tools: it creates every live question, cites revealed evidence, places suspicions, handles the one shared Objection, and commits the final accusation.

## What is implemented

- Anonymous Supabase lobby, QR join, two unique seats, sticker identity, ready lock, and 8/15-second modes.
- Server-authoritative Learn, optional Contrast, traits, private roles, four Challenge rounds, blind Q3 Objection, accusation countdown, reveal, timeline, and achievement stickers.
- A versioned Demo Room fixture that skips live Learn generation but copies normal questions, options, revealed answer records, traits, and public evidence into a fresh game.
- Ten singleton imperative WebMCP tools with checkpoint/revision control, canonical-payload idempotency, structured errors, evidence validation, and cancellable 20-second durable waits.
- Public and private projections kept separate; Realtime is an invalidation hint and every recovery path refetches durable state.
- Keyboard, phone, reduced-motion, focus, and live-region behavior.

## Local setup

Requirements: Node.js 22.13+, npm, a Supabase project, and a browser build that supports imperative WebMCP.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and provide the project URL and publishable key. Never put a service-role key in a browser environment variable.

3. In Supabase, enable Anonymous Auth. Link the CLI and apply the migration:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   The migration exposes only the `api` schema, creates a private Realtime channel policy, and revokes direct browser access to core tables. Confirm `api` is listed under API exposed schemas in the project settings.

4. Start the site:

   ```bash
   npm run dev
   ```

5. Open the Host Board in a compatible AI client or WebMCP testing browser. Scan the displayed QR code from two separate phones.

## Detective prompt

Paste this into the AI client conversation attached to the Host Board:

> You are the Detective for Can You Be Me? Call get_public_game_state first. Perform only the single eligible action for the active checkpoint. Generate English, playful, 13+ party-safe questions. Cite only eligible public evidence IDs. After every action, read the returned state or wait_for_public_event, and resume by calling get_public_game_state whenever interrupted. Never ask for a room ID.

## Verification

```bash
npm run verify
npm run test:e2e
```

Database and production verification require a linked Supabase project. See [docs/qa.md](docs/qa.md), [docs/security.md](docs/security.md), and [docs/webmcp.md](docs/webmcp.md).

## Current delivery status

The local source, UI, contracts, migration, and automated browser/unit test harness are present. A real Supabase project, WebMCP production gate, three full production games, public deployment, repository publication, video upload, and Devpost submission still require authenticated external services and recorded evidence; this README does not claim those gates have passed.

## License

MIT — see [LICENSE](LICENSE).
