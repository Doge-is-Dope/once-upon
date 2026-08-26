import type { RoomAction, RoomState } from './contracts';

export const initialRoomState: RoomState = {
  bootstrap: null,
  connection: { status: 'connecting' },
  pendingAction: null,
  error: null,
};

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'bootstrapped':
      return { ...state, bootstrap: action.payload, connection: { status: 'connected' }, error: null };
    case 'snapshot': {
      if (!state.bootstrap) return state;
      if (action.payload.publicState.revision < state.bootstrap.publicState.revision) return state;
      return {
        ...state,
        bootstrap: {
          ...state.bootstrap,
          publicState: action.payload.publicState,
          selfState: action.payload.selfState === undefined
            ? state.bootstrap.selfState
            : action.payload.selfState,
        },
        error: null,
      };
    }
    case 'connection':
      return { ...state, connection: action.payload };
    case 'pending':
      return { ...state, pendingAction: action.payload };
    case 'error':
      return { ...state, error: action.payload, pendingAction: null };
    default:
      return state;
  }
}
