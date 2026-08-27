import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GameApp } from './game-app';

describe('GameApp landing', () => {
  beforeEach(() => window.history.replaceState({}, '', '/'));

  it('explains the complete game rules and exposes one clear start', () => {
    render(<GameApp />);
    expect(screen.getByRole('heading', { name: /can you fool the ai detective/i })).toBeInTheDocument();
    expect(screen.getByText(/two friends team up/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Start with honest answers' })).toBeInTheDocument();
    expect(screen.getByText(/both of you answer five questions honestly/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a game' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quick demo' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show step 2: Get secret roles/i }));
    expect(screen.getByText(/same team.*roles stay hidden/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show step 3: Answer for your role/i }));
    expect(screen.getByText(/Original answers as themselves.*Mirror predicts the Original/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show step 4: Object once/i }));
    expect(screen.getByText(/3 seconds to blindly use one shared Objection.*First tap spends it/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show step 5: Make the AI accuse/i }));
    expect(screen.getByText(/points at the Original, you both win.*catches the Mirror, the AI wins/i)).toBeInTheDocument();
  });

  it('reports missing backend configuration without pretending to create a room', () => {
    render(<GameApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/needs its Supabase public environment values/i);
  });

  it('keeps the selected rule visible until the player chooses another one', () => {
    render(<GameApp />);
    fireEvent.click(screen.getByRole('button', { name: /Show step 4: Object once/i }));
    expect(screen.getByRole('heading', { name: 'Object once, before you know' })).toBeInTheDocument();
  });
});
