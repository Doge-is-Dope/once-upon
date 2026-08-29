import { ManuscriptErrorBoundary } from '@/components/error-boundary';
import { GameApp } from '@/components/game-app';

export default function Home() {
  return (
    <ManuscriptErrorBoundary>
      <GameApp />
    </ManuscriptErrorBoundary>
  );
}
