import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GameApp } from './game-app';

describe('GameApp landing', () => {
  beforeEach(() => window.history.replaceState({}, '', '/'));

  it('explains the three-screen game and exposes both starts', () => {
    render(<GameApp />);
    expect(screen.getByRole('heading', { name: /can you fool chatgpt/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Join on two phones' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Get secret roles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fool the Detective' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quick demo' })).toBeInTheDocument();
  });

  it('reports missing backend configuration without pretending to create a room', () => {
    render(<GameApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/needs its Supabase public environment values/i);
  });
});
