/** The chord that ends keyboard capture. It is matched on physical keys and never reaches the remote desktop. */
export const CAPTURE_EXIT_CHORD = { ctrlKey: true, altKey: true, shiftKey: true, metaKey: false, code: 'KeyK' } as const;
export const CAPTURE_EXIT_LABEL = 'Ctrl+Alt+Shift+K';

interface KeyboardLock {
  lock(keyCodes?: string[]): Promise<void>;
  unlock(): void;
}

type ChordEvent = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;

export function isCaptureExitChord(event: ChordEvent): boolean {
  return event.code === CAPTURE_EXIT_CHORD.code
    && event.ctrlKey === CAPTURE_EXIT_CHORD.ctrlKey
    && event.altKey === CAPTURE_EXIT_CHORD.altKey
    && event.shiftKey === CAPTURE_EXIT_CHORD.shiftKey
    && event.metaKey === CAPTURE_EXIT_CHORD.metaKey;
}

function keyboardLock(): KeyboardLock | null {
  const keyboard = (globalThis as any).navigator?.keyboard;
  return typeof keyboard?.lock === 'function' && typeof keyboard?.unlock === 'function' ? keyboard : null;
}

/**
 * Keyboard capture sends browser shortcuts such as Ctrl+W, Ctrl+T, and Alt+Tab to the remote desktop. It relies on
 * the Keyboard Lock API, which only Chromium-based browsers ship and which only holds while the page is fullscreen.
 * Holding Esc for about two seconds always ends it; the browser enforces that and the page cannot turn it off.
 */
export class KeyboardCapture {
  active = false;

  constructor(private readonly onChange: (active: boolean) => void) {}

  async start(): Promise<void> {
    if (this.active) return;
    const lock = keyboardLock();
    if (!lock) throw new Error('Keyboard capture needs a Chromium-based browser');
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    try {
      await lock.lock();
    } catch (error) {
      if (document.fullscreenElement) await document.exitFullscreen();
      throw error;
    }
    if (!document.fullscreenElement) {
      lock.unlock();
      throw new Error('The page left fullscreen before the keyboard was locked');
    }
    this.setActive(true);
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    keyboardLock()?.unlock();
    this.setActive(false);
    if (document.fullscreenElement) await document.exitFullscreen();
  }

  /** Ends capture when the page leaves fullscreen another way, such as the browser's hold-Esc exit. */
  syncFullscreen(): void {
    if (!this.active || document.fullscreenElement) return;
    keyboardLock()?.unlock();
    this.setActive(false);
  }

  private setActive(active: boolean): void {
    this.active = active;
    this.onChange(active);
  }
}
