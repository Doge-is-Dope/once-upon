import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GameApp } from './game-app';

describe('GameApp landing', () => {
  beforeEach(() => window.history.replaceState({}, '', '/'));

  it('explains the three-screen game and exposes both starts', () => {
    render(<GameApp />);
    expect(screen.getByRole('heading', { name: /can chatgpt tell/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a room' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Demo Room' })).toBeInTheDocument();
  });

  it('reports missing backend configuration without pretending to create a room', () => {
    render(<GameApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Create a room' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/needs its Supabase public environment values/i);
  });
});
