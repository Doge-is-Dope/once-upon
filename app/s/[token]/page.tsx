import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readSharedStory } from '@/lib/share/repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'A shared manuscript',
  description: 'Read a completed story from The Last Manuscript.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  openGraph: {
    title: 'A shared manuscript',
    description: 'Read a completed story from The Last Manuscript.',
    images: [],
  },
  twitter: {
    card: 'summary',
    title: 'A shared manuscript',
    description: 'Read a completed story from The Last Manuscript.',
    images: [],
  },
};

export default async function SharedStoryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const story = await readSharedStory(token);
  if (!story) notFound();

  return (
    <main className="shared-story-shell">
      <article className="shared-manuscript">
        <header>
          <p className="title-kicker">A completed living manuscript</p>
          <h1>{story.title}</h1>
          <p>
            Read-only · Available until{' '}
            <time dateTime={story.expiresAt}>
              {new Intl.DateTimeFormat('en', {
                dateStyle: 'long',
                timeZone: 'UTC',
              }).format(new Date(story.expiresAt))}
            </time>
          </p>
        </header>
        {story.chapters.map((chapter, chapterIndex) => (
          <section
            className="shared-chapter"
            key={`${chapterIndex}-${chapter.title}`}
          >
            <p className="chapter-number">{chapter.label}</p>
            <h2>{chapter.title}</h2>
            {chapter.effect ? (
              <aside
                className={`shared-effect shared-effect-${chapter.effect.presentation}`}
              >
                <h3>{chapter.effect.title}</h3>
                {chapter.effect.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </aside>
            ) : null}
            {chapter.prose.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </section>
        ))}
        <footer className="shared-story-footer">
          <p>
            This public link is anonymous, unlisted, and expires after 30 days.
          </p>
          <Link href="/">Play from the first page</Link>
        </footer>
      </article>
    </main>
  );
}
