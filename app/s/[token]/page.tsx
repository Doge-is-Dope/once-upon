import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { DEFAULT_EXPERIENCE_ID, getExperience } from '@/experiences/registry';
import { resolveBookCopy } from '@/lib/frames/book';
import { resolveRecordedEnding } from '@/lib/manuscript/prose';
import { readSharedStory } from '@/lib/share/repository';

export const dynamic = 'force-dynamic';

type SharedStoryRouteProps = {
  params: Promise<{ token: string }>;
};

// One D1 read serves both the metadata and the page for a request.
const loadSharedStory = cache((token: string) => readSharedStory(token));

export async function generateMetadata({
  params,
}: SharedStoryRouteProps): Promise<Metadata> {
  const { token } = await params;
  const story = await loadSharedStory(token);
  const title = 'A recovered record';
  const description = story
    ? `Read a recovered copy of ${story.title}.`
    : 'Read a recovered copy of a shared manuscript.';
  return {
    title,
    description,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
    openGraph: { title, description, images: [] },
    twitter: { card: 'summary', title, description, images: [] },
  };
}

export default async function SharedStoryPage({
  params,
}: SharedStoryRouteProps) {
  const { token } = await params;
  const story = await loadSharedStory(token);
  if (!story) notFound();
  const experience =
    getExperience(
      story.version === 2 && story.experienceId
        ? story.experienceId
        : DEFAULT_EXPERIENCE_ID,
    ) ?? getExperience(DEFAULT_EXPERIENCE_ID)!;
  const copy = resolveBookCopy(experience.frame);

  return (
    <main className="shared-story-shell">
      <article className="shared-manuscript">
        <header>
          <p className="title-kicker">A recovered record</p>
          <h1>{story.title}</h1>
          <p>
            This read-only copy is available until{' '}
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
        {story.version === 2 ? (
          <section aria-label="Completion" className="shared-completion">
            {(story.completionPassage.recordProse
              ? resolveRecordedEnding(
                  story.completionPassage.prose,
                  story.completionPassage.recordProse,
                )
              : story.completionPassage.prose
            ).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </section>
        ) : null}
        <footer className="shared-story-footer">
          <p>This copy is anonymous, unlisted, and temporary.</p>
          <Link href="/">{copy.shared.returnLabel}</Link>
        </footer>
      </article>
    </main>
  );
}
