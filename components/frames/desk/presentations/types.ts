import type { ReactElement } from 'react';
import type { ManuscriptEffect } from '@/lib/manuscript/read-model';

export interface DeskPresentation {
  /**
   * Default screen-reader line when an effect with this presentation lands
   * on the page. A story interaction's `announcement` overrides it.
   */
  announce: string;
  render(effect: ManuscriptEffect, fresh: boolean): ReactElement;
}
